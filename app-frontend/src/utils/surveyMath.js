// ─────────────────────────────────────────────────────────────────────────────
// surveyMath.js
// Pure-JS utilities for the beacon comparison / least-squares adjustment page.
// No Vue/Pinia imports — safe to unit-test in isolation with Vitest or Jest.
//
// COORDINATE CONVENTION (matches app-backend/src/utils/zim-geo.js & SI 727):
//   Cape Lo / Gauss Lo, P(Y, X):
//     Y = Westing  (increases west)
//     X = Southing (increases south)
//   Bearings are SOUTH-ORIENTED, whole-circle [0,360):
//     0° = South (+X),  90° = West (+Y),  180° = North,  270° = East
//     β = normalizeBearingSouth( atan2(ΔY, ΔX) )
// ─────────────────────────────────────────────────────────────────────────────

const RAD = 180 / Math.PI

/** South-oriented whole-circle bearing, normalised to [0, 360). */
export function normalizeBearingSouth(deg) {
  return ((deg % 360) + 360) % 360
}

/** South-oriented bearing (deg) from a (ΔY westing, ΔX southing) vector. */
export function bearingSouth(dY, dX) {
  return normalizeBearingSouth(Math.atan2(dY, dX) * RAD)
}

// ── MATRIX OPERATIONS ────────────────────────────────────────────────────────
export const mat = {
  /** Matrix multiplication */
  mul(A, B) {
    const r = A.length, p = B.length, c = B[0].length
    const C = Array.from({ length: r }, () => new Array(c).fill(0))
    for (let i = 0; i < r; i++)
      for (let k = 0; k < p; k++) {
        if (!A[i][k]) continue
        for (let j = 0; j < c; j++) C[i][j] += A[i][k] * B[k][j]
      }
    return C
  },

  /** Transpose */
  T: (A) => A[0].map((_, j) => A.map(r => r[j])),

  /** Element-wise subtraction */
  sub: (A, B) => A.map((r, i) => r.map((v, j) => v - B[i][j])),

  /** Gauss-Jordan matrix inverse (any square matrix) */
  inv(A) {
    const n = A.length
    const m = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => +(i === j))])
    for (let c = 0; c < n; c++) {
      let mx = c
      for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[mx][c])) mx = r
      ;[m[c], m[mx]] = [m[mx], m[c]]
      const p = m[c][c]
      if (Math.abs(p) < 1e-14)
        throw new Error('Singular matrix — check for duplicate or collinear points')
      m[c] = m[c].map(v => v / p)
      for (let r = 0; r < n; r++) {
        if (r === c) continue
        const f = m[r][c]
        m[r] = m[r].map((v, j) => v - f * m[c][j])
      }
    }
    return m.map(r => r.slice(n))
  },
}

// ── HELMERT 4-PARAMETER LEAST SQUARES  (Cape Lo P(Y,X)) ──────────────────────
// Model:  Y_survey = TY + a·Y_hist − b·X_hist + vY
//         X_survey = TX + b·Y_hist + a·X_hist + vX
// Unknowns: x = [TY, TX, a, b]ᵀ
//   scale = √(a²+b²) ,  rotation θ = atan2(b, a)  (Y→X sense, +ve toward south)
//
// Coordinates are reduced to the historical centroid before forming the normal
// equations — essential for Cape Lo southings (~2.2 M), which would otherwise
// produce an ill-conditioned normal matrix (entries ~X² ≈ 5×10¹²) and corrupt
// the millimetre-level residuals the W-test depends on. Residuals, scale,
// rotation and W-statistics are invariant to this shift; the reported
// translation (TY, TX) is therefore the datum shift AT THE NETWORK CENTROID.
//
// @param {Array<{id, name, yH, xH, yS, xS}>} points  Active beacons only.
// @returns {{ params, pp, stats }}
export function helmertLS(points) {
  const n = points.length
  if (n < 3) throw new Error('Need at least 3 active beacons (minimum DOF = 2)')

  // Reduce to historical centroid for numerical stability.
  const yc = points.reduce((s, p) => s + p.yH, 0) / n
  const xc = points.reduce((s, p) => s + p.xH, 0) / n

  // Build design matrix A (2n×4) and observation vector l (2n×1) on reduced coords.
  const A = [], l = []
  for (const p of points) {
    const yh = p.yH - yc, xh = p.xH - xc
    A.push([1, 0,  yh, -xh]);  l.push([p.yS - yc])
    A.push([0, 1,  xh,  yh]);  l.push([p.xS - xc])
  }

  const At  = mat.T(A)
  const AtA = mat.mul(At, A)          // 4×4 normal matrix N
  const Atl = mat.mul(At, l)          // 4×1
  const Ni  = mat.inv(AtA)            // N⁻¹
  const x   = mat.mul(Ni, Atl).map(r => r[0])   // solution [TY, TX, a, b]

  const [TY, TX, a, b] = x

  // Residuals: v = A·x̂ − l
  const Ax = mat.mul(A, x.map(v => [v]))
  const v  = mat.sub(Ax, l).map(r => r[0])

  const DOF  = 2 * n - 4
  const vTv  = v.reduce((s, vi) => s + vi * vi, 0)
  const s0sq = DOF > 0 ? vTv / DOF : 0
  const s0   = Math.sqrt(Math.max(s0sq, 0))

  // Diagonal of Qvv = I − A·N⁻¹·Aᵀ  (cofactor matrix of residuals, for W-test)
  const ANi    = mat.mul(A, Ni)
  const diagQvv = A.map((rowA, i) => 1 - ANi[i].reduce((s, v, j) => s + v * rowA[j], 0))

  const scale  = Math.sqrt(a * a + b * b)
  const rotDeg = Math.atan2(b, a) * RAD
  const ppm    = (scale - 1) * 1e6

  // Per-point statistics
  const pp = points.map((p, i) => {
    const vY = v[2 * i], vX = v[2 * i + 1]
    const resDist = Math.sqrt(vY * vY + vX * vX)
    const resBrg  = bearingSouth(vY, vX)

    const qYY  = Math.max(diagQvv[2 * i],     1e-14)
    const qXX  = Math.max(diagQvv[2 * i + 1], 1e-14)

    // Baarda W-test:  w = |v_i| / (s₀ · √Qvv_ii)
    const wY   = s0 > 1e-12 ? Math.abs(vY) / (s0 * Math.sqrt(qYY)) : 0
    const wX   = s0 > 1e-12 ? Math.abs(vX) / (s0 * Math.sqrt(qXX)) : 0
    const wMax = Math.max(wY, wX)

    // Raw (pre-transformation) coordinate difference
    const dY      = p.yS - p.yH
    const dX      = p.xS - p.xH
    const rawDist = Math.sqrt(dY * dY + dX * dX)
    const rawBrg  = bearingSouth(dY, dX)

    return { ...p, vY, vX, resDist, resBrg, wY, wX, wMax, dY, dX, rawDist, rawBrg }
  })

  return {
    params: { TY, TX, a, b, scale, rotDeg, ppm, yc, xc },
    pp,
    stats: { n, DOF, vTv, s0, s0sq },
  }
}

// ── CHI-SQUARE PERCENTILE ─────────────────────────────────────────────────────
// Wilson-Hilferty normal approximation to χ²(r) percentile.
export function chi2Percentile(p, r) {
  const u = p < 0.5 ? p : 1 - p
  const t = Math.sqrt(-2 * Math.log(u))
  const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) /
    (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t)
  const zp = p < 0.5 ? -z : z
  const h  = 1 - 2 / (9 * r)
  const k  = Math.sqrt(2 / (9 * r))
  return Math.max(r * Math.pow(h + k * zp, 3), 0)
}

// ── ITERATIVE DATA SNOOPING ───────────────────────────────────────────────────
// Rejects one beacon per iteration (the one with highest |W|) until all
// remaining beacons pass the W-test, then returns the final adjustment.
//
// @param {Array}  inputPoints  All beacons (active and to-be-tested).
// @param {number} critW        Critical W value (1.960 / 2.576 / 3.291).
// @param {number} sig0         A priori σ₀ in metres.
// @returns {{ adj, pts, log, converged } | { error, pts, log }}
export function iterativeAdjust(inputPoints, critW, sig0) {
  let pts = inputPoints.map(p => ({ ...p, rejIter: null }))
  const log = []

  for (let iter = 1; iter <= 25; iter++) {
    const active = pts.filter(p => p.rejIter === null)
    if (active.length < 3)
      return { error: 'Too few active points remaining for adjustment', pts, log }

    let adj
    try { adj = helmertLS(active) } catch (e) { return { error: e.message, pts, log } }

    const chi2  = adj.stats.vTv / (sig0 * sig0)
    const chi2L = adj.stats.DOF > 0 ? chi2Percentile(0.025, adj.stats.DOF) : 0
    const chi2U = adj.stats.DOF > 0 ? chi2Percentile(0.975, adj.stats.DOF) : 1e9
    log.push({ iter, n: active.length, s0: adj.stats.s0, chi2, chi2L, chi2U })

    // Check if all beacons pass
    const worst = adj.pp.reduce((a, b) => a.wMax > b.wMax ? a : b)
    if (worst.wMax <= critW) {
      // Annotate final statuses and merge per-point results back
      const sm = {}
      adj.pp.forEach(r => { sm[r.id] = r })
      pts = pts.map(p => {
        if (p.rejIter === null) {
          return { ...p, ...sm[p.id], finalStatus: 'ACCEPT' }
        }
        // Rejected beacon: it is excluded from the final fit, so residuals and
        // W-statistics are undefined — but its raw (pre-adjustment) coordinate
        // difference is still meaningful and is exactly why it was flagged.
        const dY = p.yS - p.yH
        const dX = p.xS - p.xH
        return {
          ...p,
          dY, dX,
          rawDist: Math.sqrt(dY * dY + dX * dX),
          rawBrg: bearingSouth(dY, dX),
          finalStatus: 'REJECT',
        }
      })
      return {
        adj: { ...adj, stats: { ...adj.stats, chi2, chi2L, chi2U, sig0 } },
        pts,
        log,
        converged: true,
      }
    }

    // Reject the beacon with the worst W statistic
    const wi = pts.findIndex(p => p.id === worst.id)
    pts[wi] = { ...pts[wi], rejIter: iter }
  }

  return { error: 'Did not converge within 25 iterations', pts, log }
}

// ── FORMATTING HELPERS ────────────────────────────────────────────────────────
export const f3  = v => (typeof v === 'number' ? v.toFixed(3) : '—')
export const f4  = v => (typeof v === 'number' ? v.toFixed(4) : '—')
export const f4s = v => (typeof v === 'number' ? (v >= 0 ? '+' : '') + v.toFixed(4) : '—')

export function formatDMS(dd) {
  if (typeof dd !== 'number') return '—'
  dd = ((dd % 360) + 360) % 360
  const d  = Math.floor(dd)
  const mf = (dd - d) * 60
  const m  = Math.floor(mf)
  const s  = ((mf - m) * 60).toFixed(1)
  return `${d}°${String(m).padStart(2, '0')}'${String(s).padStart(4, '0')}"`
}

// ── SAMPLE DATA  (Cape Lo P(Y,X) — realistic magnitudes) ──────────────────────
// Y = Westing (~50 k), X = Southing (~2.20 M).
// BM 004 carries an intentional ~0.25 m southing blunder and will be rejected.
export const SAMPLE_DATA = [
  { id: 1, name: 'BM 001', yH: 50000.000, xH: 2200000.000, yS: 50000.013, xS: 2199999.997 },
  { id: 2, name: 'BM 002', yH: 50500.000, xH: 2200000.000, yS: 50500.010, xS: 2200000.005 },
  { id: 3, name: 'BM 003', yH: 50500.000, xH: 2200500.000, yS: 50500.014, xS: 2200500.008 },
  { id: 4, name: 'BM 004', yH: 50000.000, xH: 2200500.000, yS: 49999.988, xS: 2200500.248 },
  { id: 5, name: 'BM 005', yH: 50250.000, xH: 2200250.000, yS: 50250.011, xS: 2200250.006 },
  { id: 6, name: 'BM 006', yH: 50750.000, xH: 2200250.000, yS: 50750.009, xS: 2200250.003 },
  { id: 7, name: 'BM 007', yH: 50250.000, xH: 2200750.000, yS: 50250.012, xS: 2200750.007 },
  { id: 8, name: 'BM 008', yH: 50750.000, xH: 2200750.000, yS: 50750.010, xS: 2200750.004 },
]
