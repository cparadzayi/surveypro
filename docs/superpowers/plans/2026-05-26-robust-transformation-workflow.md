# Robust Transformation Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Beacon Comparison adjustment follow the robust 5-step workflow: Danish (Krarup) IRLS initial fit, flagging on robust residuals, clean-set OLS with parameter standard errors + redundancy numbers, and automated leave-one-out validation.

**Architecture:** All estimation lives in `surveyMath.js`: extend `helmertLS` to be weighted (returning parameter covariance + redundancy), add `danishFit` (robust IRLS), `looResiduals` + `paramStdErrors` helpers, and rework `iterativeAdjust` into the robust pipeline. Surface new statistics in the report and a new Reliability tab — no new inputs.

**Tech Stack:** plain-JS ES modules, jsPDF v3 + jspdf-autotable v5, Vue 3.

**Spec:** `docs/superpowers/specs/2026-05-26-robust-transformation-workflow-design.md`

**Testing note:** No frontend unit runner. `surveyMath.js` is import-free → verify pure functions with a throwaway Node script (copy to `/tmp/sm.mjs`, run assertions). Report/UI verified via `npm run build` + the Edge/Playwright harness with **explicit absolute paths** (node `/tmp` = `C:\tmp` ≠ git-bash `/tmp`) and a `vite preview` started **after** the build. Do NOT add Vitest.

**Conventions:** `x = [TY, TX, a, b]`; `scale=√(a²+b²)`, `rotation θ=atan2(b,a)`; centroid-reduced; South bearings. `critW` ∈ {1.960, 2.576, 3.291} doubles as the Danish cutoff `c`.

---

### Task 1: Weighted `helmertLS` (+ parameter covariance + redundancy)

**Files:** Modify `app-frontend/src/utils/surveyMath.js`

- [ ] **Step 1: Replace the ENTIRE `helmertLS` function** (from `export function helmertLS(points) {` through its closing `}` just before the `helmertApply` JSDoc) with:

```js
export function helmertLS(points, weights) {
  const n = points.length
  if (n < 3) throw new Error('Need at least 3 active beacons (minimum DOF = 2)')

  // Reduce to historical centroid for numerical stability.
  const yc = points.reduce((s, p) => s + p.yH, 0) / n
  const xc = points.reduce((s, p) => s + p.xH, 0) / n

  const A = [], l = []
  for (const p of points) {
    const yh = p.yH - yc, xh = p.xH - xc
    A.push([1, 0,  yh, -xh]);  l.push([p.yS - yc])
    A.push([0, 1,  xh,  yh]);  l.push([p.xS - xc])
  }

  const mObs = 2 * n
  // Per-observation weights (length 2n); default all 1 ⇒ ordinary least squares.
  const w = (weights && weights.length === mObs) ? weights : new Array(mObs).fill(1)

  // Weighted normal equations: N = AᵀWA,  rhs = AᵀWl.
  const At  = mat.T(A)                                          // 4×2n
  const AtW = At.map(row => row.map((val, k) => val * w[k]))    // Aᵀ·W
  const AtA = mat.mul(AtW, A)          // 4×4 normal matrix N
  const Atl = mat.mul(AtW, l)          // 4×1
  const Ni  = mat.inv(AtA)             // N⁻¹
  const x   = mat.mul(Ni, Atl).map(r => r[0])   // [TY, TX, a, b]

  const [TY, TX, a, b] = x

  const Ax = mat.mul(A, x.map(v => [v]))
  const v  = mat.sub(Ax, l).map(r => r[0])

  const DOF  = mObs - 4
  const vTv  = v.reduce((s, vi, i) => s + w[i] * vi * vi, 0)   // weighted vᵀWv
  const s0sq = DOF > 0 ? vTv / DOF : 0
  const s0   = Math.sqrt(Math.max(s0sq, 0))

  // Residual cofactor diagonal q_vv,i = 1/w_i − (A·N⁻¹·Aᵀ)_ii ; redundancy r_i = q_vv,i·w_i.
  const ANi  = mat.mul(A, Ni)
  const qvv  = A.map((rowA, i) =>
    Math.max(1 / w[i] - ANi[i].reduce((s, val, j) => s + val * rowA[j], 0), 1e-14))
  const redund = qvv.map((q, i) => q * w[i])

  // Parameter covariance  Cxx = σ̂₀² · N⁻¹  (4×4).
  const Cxx = Ni.map(row => row.map(val => s0sq * val))

  const scale  = Math.sqrt(a * a + b * b)
  const rotDeg = Math.atan2(b, a) * RAD
  const ppm    = (scale - 1) * 1e6

  const pp = points.map((p, i) => {
    const vY = v[2 * i], vX = v[2 * i + 1]
    const resDist = Math.sqrt(vY * vY + vX * vX)
    const resBrg  = bearingSouth(vY, vX)

    const qYY = qvv[2 * i], qXX = qvv[2 * i + 1]
    const wY  = s0 > 1e-12 ? Math.abs(vY) / (s0 * Math.sqrt(qYY)) : 0
    const wX  = s0 > 1e-12 ? Math.abs(vX) / (s0 * Math.sqrt(qXX)) : 0
    const wMax = Math.max(wY, wX)

    const dY = p.yS - p.yH
    const dX = p.xS - p.xH
    const rawDist = Math.sqrt(dY * dY + dX * dX)
    const rawBrg  = bearingSouth(dY, dX)

    return { ...p, vY, vX, resDist, resBrg, wY, wX, wMax, dY, dX, rawDist, rawBrg,
             rY: redund[2 * i], rX: redund[2 * i + 1] }
  })

  return {
    params: { TY, TX, a, b, scale, rotDeg, ppm, yc, xc },
    pp,
    stats: { n, DOF, vTv, s0, s0sq },
    Cxx,
  }
}
```

- [ ] **Step 2: Verify under Node (expect all PASS)**

```bash
cd /c/surveypro-may-2026/SurveyPro-nov-alpha
cp app-frontend/src/utils/surveyMath.js /tmp/sm.mjs
cat > /tmp/c1.mjs <<'EOF'
import { helmertLS, SAMPLE_DATA } from './sm.mjs'
const ok=(c,m)=>console.log((c?'PASS':'FAIL')+' '+m)
const pts = SAMPLE_DATA.filter(p=>p.name!=='BM 004')   // a consistent set
const r = helmertLS(pts)
ok(typeof r.Cxx?.[0]?.[0] === 'number' && r.Cxx.length===4, 'returns Cxx 4x4')
ok(r.pp.every(p=>'rY' in p && 'rX' in p), 'pp has redundancy rY/rX')
const sumR = r.pp.reduce((s,p)=>s+p.rY+p.rX,0)
ok(Math.abs(sumR - r.stats.DOF) < 1e-6, `Sum r == DOF (${sumR.toFixed(4)} vs ${r.stats.DOF})`)
const w1 = helmertLS(pts, new Array(2*pts.length).fill(1))
ok(Math.abs(w1.params.TY-r.params.TY)<1e-12 && Math.abs(w1.stats.s0-r.stats.s0)<1e-12, 'weights=1 == default OLS')
const w = new Array(2*pts.length).fill(1); w[0]=0.0
const wr = helmertLS(pts, w)
ok(Math.abs(wr.params.TY-r.params.TY)>1e-9 || Math.abs(wr.params.TX-r.params.TX)>1e-9, 'down-weighting shifts the fit')
EOF
node /tmp/c1.mjs
```
Expected: every line `PASS`.

- [ ] **Step 3: Commit**

```bash
git add app-frontend/src/utils/surveyMath.js
git commit -m "feat(lite): weighted helmertLS with parameter covariance + redundancy

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: `danishFit` — robust IRLS pre-fit

**Files:** Modify `app-frontend/src/utils/surveyMath.js`

- [ ] **Step 1: Add `danishFit` immediately AFTER the `helmertApply` function** (and before `chi2Percentile`):

```js
/**
 * Danish (Krarup) robust pre-fit: iteratively-reweighted LS that down-weights
 * observations whose σ̂₀-standardised residual exceeds cutoff c, so gross blunders
 * do not bias the parameters. c defaults to 2.576 (≈99%); pass critW to match the
 * W-test confidence. Weights are recomputed from the current residual each iteration.
 * @returns {{ params, pp, sigma0, weights, iterations, log }}
 */
export function danishFit(points, c = 2.576, maxIter = 10) {
  const mObs = 2 * points.length
  let weights = new Array(mObs).fill(1)
  let fit, iterations = 0
  const log = []
  for (let k = 1; k <= maxIter; k++) {
    iterations = k
    fit = helmertLS(points, weights)
    const s0 = fit.stats.s0
    const next = weights.slice()
    let maxDelta = 0
    fit.pp.forEach((p, i) => {
      const uY = s0 > 1e-12 ? Math.abs(p.vY) / s0 : 0
      const uX = s0 > 1e-12 ? Math.abs(p.vX) / s0 : 0
      const wY = uY <= c ? 1 : Math.exp(-((uY / c) ** 2))
      const wX = uX <= c ? 1 : Math.exp(-((uX / c) ** 2))
      maxDelta = Math.max(maxDelta, Math.abs(wY - next[2 * i]), Math.abs(wX - next[2 * i + 1]))
      next[2 * i] = wY; next[2 * i + 1] = wX
    })
    log.push({ iter: k, s0, maxWeightChange: maxDelta })
    weights = next
    if (maxDelta < 1e-3) break
  }
  fit = helmertLS(points, weights)   // final robust fit with converged weights
  return { params: fit.params, pp: fit.pp, sigma0: fit.stats.s0, weights, iterations, log }
}
```

- [ ] **Step 2: Verify under Node (expect all PASS)**

```bash
cd /c/surveypro-may-2026/SurveyPro-nov-alpha
cp app-frontend/src/utils/surveyMath.js /tmp/sm.mjs
cat > /tmp/c2.mjs <<'EOF'
import { danishFit, helmertLS, SAMPLE_DATA } from './sm.mjs'
const ok=(c,m)=>console.log((c?'PASS':'FAIL')+' '+m)
// clean set (drop the known blunders) → robust fit should leave all weights ~1
const clean = SAMPLE_DATA.filter(p=>!['BM 001','BM 004'].includes(p.name))
const rc = danishFit(clean, 2.576)
ok(rc.weights.every(w=>w>0.99), 'no-outlier set keeps all weights ~1')
// plant a gross blunder on a point and confirm it is down-weighted to ~0
const withBlunder = clean.map(p=>({...p}))
withBlunder[0] = {...withBlunder[0], xS: withBlunder[0].xS + 0.5}   // +0.5 m southing blunder
const rb = danishFit(withBlunder, 2.576)
ok(rb.weights[1] < 0.2, `blunder observation down-weighted (wX=${rb.weights[1].toFixed(3)})`)
// robust params are close to the clean fit (not dragged by the blunder)
const pClean = helmertLS(clean).params
ok(Math.abs(rb.params.TX - pClean.TX) < 0.02, `robust TX unbiased vs clean (${rb.params.TX.toFixed(4)} vs ${pClean.TX.toFixed(4)})`)
// an OLS fit on the blunder set IS dragged (control: robust beats OLS)
const pOls = helmertLS(withBlunder).params
ok(Math.abs(pOls.TX - pClean.TX) > Math.abs(rb.params.TX - pClean.TX), 'robust closer to clean than OLS')
EOF
node /tmp/c2.mjs
```
Expected: every line `PASS`.

- [ ] **Step 3: Commit**

```bash
git add app-frontend/src/utils/surveyMath.js
git commit -m "feat(lite): Danish (Krarup) robust IRLS pre-fit (danishFit)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: `looResiduals` + `paramStdErrors` helpers

**Files:** Modify `app-frontend/src/utils/surveyMath.js`

- [ ] **Step 1: Add both helpers immediately AFTER `danishFit`:**

```js
/**
 * Leave-one-out cross-validation: for each point, re-fit on the others and predict
 * it, giving an independent (out-of-sample) residual. Needs >= 4 points (so >= 3 remain).
 * @returns {{ rows:[{id,name,looY,looX,looDist}], rmsLoo, maxLoo, note? }}
 */
export function looResiduals(points) {
  if (points.length < 4)
    return { rows: [], rmsLoo: null, maxLoo: null, note: 'too few points for LOO (need >= 4)' }
  const rows = []
  for (let i = 0; i < points.length; i++) {
    const subset = points.filter((_, j) => j !== i)
    let p
    try { p = helmertLS(subset).params } catch (e) { continue }
    const { yT, xT } = helmertApply(p, points[i].yH, points[i].xH)
    const looY = yT - points[i].yS, looX = xT - points[i].xS
    rows.push({ id: points[i].id, name: points[i].name, looY, looX,
                looDist: Math.sqrt(looY * looY + looX * looX) })
  }
  const d = rows.map(r => r.looDist)
  return {
    rows,
    rmsLoo: d.length ? Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length) : null,
    maxLoo: d.length ? Math.max(...d) : null,
  }
}

/**
 * Standard errors of the transformation parameters from the covariance Cxx (=σ̂₀²·N⁻¹).
 * scale & rotation are error-propagated from the (a,b) covariance block.
 * @returns {{ TY, TX, scale, ppm, rotSec }}  (metres, metres, ratio, ppm, arc-seconds)
 */
export function paramStdErrors(params, Cxx) {
  const { a, b } = params
  const s2 = a * a + b * b
  const Caa = Cxx[2][2], Cbb = Cxx[3][3], Cab = Cxx[2][3]
  const sScale  = Math.sqrt(Math.max((a * a * Caa + b * b * Cbb + 2 * a * b * Cab) / s2, 0))
  const sThetaR = Math.sqrt(Math.max((b * b * Caa + a * a * Cbb - 2 * a * b * Cab) / (s2 * s2), 0))
  return {
    TY: Math.sqrt(Math.max(Cxx[0][0], 0)),
    TX: Math.sqrt(Math.max(Cxx[1][1], 0)),
    scale: sScale,
    ppm: sScale * 1e6,
    rotSec: sThetaR * 206265,
  }
}
```

- [ ] **Step 2: Verify under Node (expect all PASS)**

```bash
cd /c/surveypro-may-2026/SurveyPro-nov-alpha
cp app-frontend/src/utils/surveyMath.js /tmp/sm.mjs
cat > /tmp/c3.mjs <<'EOF'
import { looResiduals, paramStdErrors, helmertLS, SAMPLE_DATA } from './sm.mjs'
const ok=(c,m)=>console.log((c?'PASS':'FAIL')+' '+m)
const clean = SAMPLE_DATA.filter(p=>!['BM 001','BM 004'].includes(p.name))
const loo = looResiduals(clean)
ok(loo.rows.length === clean.length, `LOO row per point (${loo.rows.length})`)
const fit = helmertLS(clean)
// each LOO residual >= the in-sample residual for the same point (out-of-sample is larger)
const inSample = {}; fit.pp.forEach(p=>{inSample[p.name]=p.resDist})
ok(loo.rows.every(r => r.looDist >= inSample[r.name] - 1e-9), 'LOO dist >= in-sample resid')
ok(loo.rmsLoo > 0 && loo.maxLoo >= loo.rmsLoo, `rmsLoo=${loo.rmsLoo.toExponential(2)} maxLoo=${loo.maxLoo.toExponential(2)}`)
ok(looResiduals(clean.slice(0,3)).note?.includes('too few'), '<4 points -> note')
// parameter SEs positive and finite
const se = paramStdErrors(fit.params, fit.Cxx)
ok(['TY','TX','scale','ppm','rotSec'].every(k=>Number.isFinite(se[k]) && se[k]>=0), `SEs finite & >=0 (TY=${se.TY.toExponential(2)} rotSec=${se.rotSec.toFixed(2)})`)
EOF
node /tmp/c3.mjs
```
Expected: every line `PASS`.

- [ ] **Step 3: Commit**

```bash
git add app-frontend/src/utils/surveyMath.js
git commit -m "feat(lite): LOO cross-validation + parameter standard-error helpers

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Rework `iterativeAdjust` into the robust pipeline

**Files:** Modify `app-frontend/src/utils/surveyMath.js`

- [ ] **Step 1: Replace the ENTIRE `iterativeAdjust` function** (from `export function iterativeAdjust(inputPoints, critW, sig0) {` through its closing `}`) with:

```js
export function iterativeAdjust(inputPoints, critW, sig0) {
  let pts = inputPoints.map(p => ({ ...p, rejIter: null, rejSource: null }))
  const log = []          // W-test backstop log
  const danishLog = []

  // ── Step 1: Danish robust pre-fit on ALL points ──
  let rob
  try { rob = danishFit(pts, critW) } catch (e) { return { error: e.message, pts, log, danishLog } }
  danishLog.push(...rob.log)

  // ── Step 2: flag outliers on the σ̂₀-standardised ROBUST residuals ──
  const robS0 = rob.sigma0
  rob.pp.forEach((p, i) => {
    pts[i].danishWeight = { wY: rob.weights[2 * i], wX: rob.weights[2 * i + 1] }
    const uY = robS0 > 1e-12 ? Math.abs(p.vY) / robS0 : 0
    const uX = robS0 > 1e-12 ? Math.abs(p.vX) / robS0 : 0
    if (Math.max(uY, uX) > critW) { pts[i].rejIter = 0; pts[i].rejSource = 'danish' }
  })

  // ── Steps 3–4: final OLS on survivors + rigorous W-test backstop ──
  for (let iter = 1; iter <= 25; iter++) {
    const active = pts.filter(p => p.rejIter === null)
    if (active.length < 3)
      return { error: 'Too few active points remaining for adjustment', pts, log, danishLog }

    let adj
    try { adj = helmertLS(active) } catch (e) { return { error: e.message, pts, log, danishLog } }

    const chi2  = adj.stats.vTv / (sig0 * sig0)
    const chi2L = adj.stats.DOF > 0 ? chi2Percentile(0.025, adj.stats.DOF) : 0
    const chi2U = adj.stats.DOF > 0 ? chi2Percentile(0.975, adj.stats.DOF) : 1e9
    log.push({ iter, n: active.length, s0: adj.stats.s0, chi2, chi2L, chi2U })

    const worst = adj.pp.reduce((a, b) => a.wMax > b.wMax ? a : b)
    if (worst.wMax <= critW) {
      const sm = {}
      adj.pp.forEach(r => { sm[r.id] = r })
      const P  = adj.params
      const se = paramStdErrors(P, adj.Cxx)
      pts = pts.map(p => {
        const base = (p.rejIter === null)
          ? { ...p, ...sm[p.id], finalStatus: 'ACCEPT' }
          : { ...p, dY: p.yS - p.yH, dX: p.xS - p.xH,
              rawDist: Math.sqrt((p.yS - p.yH) ** 2 + (p.xS - p.xH) ** 2),
              rawBrg: bearingSouth(p.yS - p.yH, p.xS - p.xH), finalStatus: 'REJECT' }
        const { yT, xT } = helmertApply(P, p.yH, p.xH)
        const tvY = yT - p.yS, tvX = xT - p.xS
        return { ...base, yT, xT, tvY, tvX,
                 tResid: Math.sqrt(tvY * tvY + tvX * tvX), tBrg: bearingSouth(tvY, tvX) }
      })
      const loo = looResiduals(pts.filter(p => p.finalStatus === 'ACCEPT'))
      return {
        adj: { ...adj, params: { ...P, se }, stats: { ...adj.stats, chi2, chi2L, chi2U, sig0 } },
        pts, log, danishLog, loo, converged: true,
      }
    }

    const wi = pts.findIndex(p => p.id === worst.id)
    pts[wi] = { ...pts[wi], rejIter: iter, rejSource: 'wtest' }
  }

  return { error: 'Did not converge within 25 iterations', pts, log, danishLog }
}
```

- [ ] **Step 2: Verify under Node (expect all PASS)**

```bash
cd /c/surveypro-may-2026/SurveyPro-nov-alpha
cp app-frontend/src/utils/surveyMath.js /tmp/sm.mjs
cat > /tmp/c4.mjs <<'EOF'
import { iterativeAdjust, SAMPLE_DATA } from './sm.mjs'
const ok=(c,m)=>console.log((c?'PASS':'FAIL')+' '+m)
const r = iterativeAdjust(SAMPLE_DATA.map(p=>({...p})), 2.576, 0.017)
ok(r.converged === true, 'converges')
const rej = r.pts.filter(p=>p.finalStatus==='REJECT').map(p=>p.name).sort()
ok(rej.includes('BM 004'), 'BM 004 rejected (gross blunder) => ['+rej.join(',')+']')
ok(r.pts.every(p=>p.danishWeight && 'wY' in p.danishWeight), 'every point has danishWeight')
ok(r.adj.params.se && Number.isFinite(r.adj.params.se.TY) && Number.isFinite(r.adj.params.se.rotSec), 'param SEs present')
ok(r.loo && r.loo.rmsLoo > 0, `LOO present rmsLoo=${r.loo.rmsLoo?.toExponential(2)}`)
const acc = r.pts.filter(p=>p.finalStatus==='ACCEPT')
ok(acc.every(p=>'rY' in p && 'rX' in p), 'accepted pts carry redundancy rY/rX')
ok(Array.isArray(r.danishLog) && r.danishLog.length>=1, 'danishLog present')
EOF
node /tmp/c4.mjs
```
Expected: every line `PASS`.

- [ ] **Step 3: Build (store imports unchanged; confirms the module compiles in the app graph)**

Run: `npm --prefix app-frontend run build 2>&1 | grep -iE 'error|✓ built' | head`
Expected: `✓ built`, no error lines.

- [ ] **Step 4: Commit**

```bash
git add app-frontend/src/utils/surveyMath.js
git commit -m "feat(lite): robust adjustment pipeline (Danish fit -> flag -> OLS + SE/redundancy/LOO)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Report — parameter SEs + Reliability & Validation section

**Files:** Modify `app-frontend/src/utils/beaconAdjustmentReport.js`

- [ ] **Step 1: Add SEs to the Transformation & Statistics rows.** In `addTransformStats`, the body array currently has these rows. Replace the four parameter rows (Translation dY, Translation dX, Scale factor, Scale (ppm), Rotation) with versions that append the standard error from `p.se` (guard when absent):

Find the `body: [` array inside `addTransformStats` and replace its first five rows:
```js
        ['Translation dY (Westing, @ centroid)', f4(p.TY) + ' m'],
        ['Translation dX (Southing, @ centroid)', f4(p.TX) + ' m'],
        ['Scale factor', p.scale.toFixed(8)],
        ['Scale (ppm)', p.ppm.toFixed(2) + ' ppm'],
        ['Rotation (theta)', formatDMS(p.rotDeg) + '  (' + p.rotDeg.toFixed(6) + '°)'],
```
with:
```js
        ['Translation dY (Westing, @ centroid)', f4(p.TY) + ' m' + (p.se ? '  ± ' + f4(p.se.TY) : '')],
        ['Translation dX (Southing, @ centroid)', f4(p.TX) + ' m' + (p.se ? '  ± ' + f4(p.se.TX) : '')],
        ['Scale factor', p.scale.toFixed(8) + (p.se ? '  ± ' + p.se.scale.toExponential(2) : '')],
        ['Scale (ppm)', p.ppm.toFixed(2) + ' ppm' + (p.se ? '  ± ' + p.se.ppm.toFixed(2) : '')],
        ['Rotation (theta)', formatDMS(p.rotDeg) + (p.se ? '  ± ' + p.se.rotSec.toFixed(1) + ' sec' : '')],
```

- [ ] **Step 2: Add the `addReliabilityValidation` method** immediately AFTER `addTransformationResiduals` and BEFORE `addEdgeCompliance`:

```js
  addReliabilityValidation(result) {
    const acc = result.pts.filter(p => p.finalStatus === 'ACCEPT')
    if (!acc.length) return
    const loo = result.loo || { rows: [], rmsLoo: null, maxLoo: null }
    const looById = {}
    loo.rows.forEach(r => { looById[r.id] = r })
    this.doc.addPage('a4', 'landscape')
    this.doc.setFontSize(11); this.doc.setFont('helvetica', 'bold')
    this.doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
    this.doc.text('Reliability & Validation', 14, 14)
    const body = acc.map(p => {
      const lr = looById[p.id]
      return [
        p.name,
        p.rY != null ? p.rY.toFixed(3) : '-',
        p.rX != null ? p.rX.toFixed(3) : '-',
        lr ? f4s(lr.looY) : '-',
        lr ? f4s(lr.looX) : '-',
        lr ? f4(lr.looDist) : '-',
      ]
    })
    autoTable(this.doc, {
      startY: 18, margin: { left: 14, right: 14 },
      head: [['Beacon', 'Redund rY', 'Redund rX', 'LOO dY (m)', 'LOO dX (m)', 'LOO dist (m)']],
      body,
      styles: { fontSize: 8, cellPadding: 1.2, halign: 'right' },
      columnStyles: { 0: { halign: 'left' } },
      headStyles: { fillColor: NAVY, halign: 'center', fontSize: 8 },
    })
    const s = result.adj.stats
    let y = this.doc.lastAutoTable.finalY + 6
    if (y + 4 * 4 > this.doc.internal.pageSize.getHeight() - 12) { this.doc.addPage('a4', 'landscape'); y = 16 }
    this.doc.setFontSize(8); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(90)
    const note = [
      `Redundancy numbers r (sum = DOF = ${s.DOF}): r -> 1 well controlled / independently checkable; r -> 0 poorly controlled.`,
      `LOO = leave-one-out cross-validation: each beacon predicted from a fit that excludes it (independent, out-of-sample).`,
      `RMS LOO = ${loo.rmsLoo != null ? loo.rmsLoo.toFixed(4) + ' m' : '-'} ;  max LOO = ${loo.maxLoo != null ? loo.maxLoo.toFixed(4) + ' m' : '-'} ` +
        `${loo.note ? '(' + loo.note + ')' : '— the external (independent) accuracy estimate.'}`,
    ]
    note.forEach((ln, i) => this.doc.text(ln, 14, y + i * 4))
  }
```

- [ ] **Step 3: Call it from `generate()`.** Find:
```js
    this.addTransformationResiduals(result)
    this.addEdgeCompliance(result)
```
Replace with:
```js
    this.addTransformationResiduals(result)
    this.addReliabilityValidation(result)
    this.addEdgeCompliance(result)
```

- [ ] **Step 4: Build + confirm via source-build PDF (no non-WinAnsi chars in new strings; section present)**

```bash
cd /c/surveypro-may-2026/SurveyPro-nov-alpha/app-frontend
npm run build 2>&1 | grep -iE 'error|✓ built' | head
cat > _r.mjs <<'EOF'
import { iterativeAdjust, SAMPLE_DATA } from './src/utils/surveyMath.js'
import { suggestedSigma0, edgeCompliance } from './src/utils/si727.js'
import { generateBeaconAdjustmentReport } from './src/utils/beaconAdjustmentReport.js'
const s0=suggestedSigma0(SAMPLE_DATA,'B')
const r=iterativeAdjust(SAMPLE_DATA.map(p=>({...p})),2.576,s0)
r.edges=edgeCompliance(r.pts.filter(p=>p.finalStatus==='ACCEPT'),'B'); r.surveyClass='B'
generateBeaconAdjustmentReport(r,{surveyorName:'X',plsNumber:'',location:'',priorSurvey:'REL',sigma0:s0,critW:2.576,date:'2026-05-26'})
EOF
./node_modules/.bin/esbuild _r.mjs --bundle --platform=node --format=esm --alias:@=C:/surveypro-may-2026/SurveyPro-nov-alpha/app-frontend/src --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" --outfile=_rb.mjs >/dev/null 2>&1
rm -f beacon-comparison-REL.pdf; node _rb.mjs >/dev/null 2>&1
/c/Users/mukan/AppData/Local/Programs/Python/Python313/python -c "
from pypdf import PdfReader
rd=PdfReader(r'C:\surveypro-may-2026\SurveyPro-nov-alpha\app-frontend\beacon-comparison-REL.pdf')
t=''.join((p.extract_text() or '') for p in rd.pages)
print('pages', len(rd.pages))
print('Reliability section:', 'Reliability & Validation' in t)
print('Redund col:', 'Redund' in t, '| LOO col:', 'LOO dist' in t)
"
rm -f _r.mjs _rb.mjs beacon-comparison-REL.pdf
```
Expected: `✓ built`; pages 6; `Reliability section: True`; both cols `True`.

- [ ] **Step 5: Commit**

```bash
cd /c/surveypro-may-2026/SurveyPro-nov-alpha
git add app-frontend/src/utils/beaconAdjustmentReport.js
git commit -m "feat(lite): report parameter SEs + Reliability & Validation (redundancy + LOO)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: CompareView — SEs in Statistics tab + Reliability tab

**Files:** Modify `app-frontend/src/views/modules/lite/compare/CompareView.vue`

- [ ] **Step 1: Append SEs to the on-screen `transformParams` computed.** Find the `transformParams` computed's returned array (rows like `{ label: 'Translation ΔY (Westing)', value: f4(p.TY) + ' m', note: ... }`). Replace its `value` expressions for the five parameter rows to append `± SE` when `p.se` exists. Specifically change the array to:
```js
  const p = result.value.adj.params
  const se = p.se
  return [
    { label: 'Translation ΔY (Westing)',  value: f4(p.TY) + ' m' + (se ? ' ± ' + f4(se.TY) : ''),  note: 'datum shift @ centroid' },
    { label: 'Translation ΔX (Southing)', value: f4(p.TX) + ' m' + (se ? ' ± ' + f4(se.TX) : ''),  note: 'datum shift @ centroid' },
    { label: 'Scale factor',               value: p.scale.toFixed(8) + (se ? ' ± ' + se.scale.toExponential(2) : ''), note: 'Ratio survey / historical' },
    { label: 'Scale (ppm)',                value: p.ppm.toFixed(2) + ' ppm' + (se ? ' ± ' + se.ppm.toFixed(2) : ''), note: '(scale − 1) × 10⁶' },
    { label: 'Rotation θ',                 value: formatDMS(p.rotDeg) + (se ? ' ± ' + se.rotSec.toFixed(1) + '″' : ''), note: p.rotDeg.toFixed(6) + '° (Y→X +)' },
    { label: 'Coefficient a',              value: p.a.toFixed(8), note: 'scale · cos θ' },
    { label: 'Coefficient b',              value: p.b.toFixed(8), note: 'scale · sin θ' },
  ]
```
(Keep the surrounding `if (!result.value?.adj?.params) return []` guard above it unchanged.)

- [ ] **Step 2: Add a 'reliability' tab to TABS.** Find `const TABS = [` and add as the last entry:
```js
  { id: 'reliability', label: 'Reliability' },
```

- [ ] **Step 3: Add the Reliability tab panel.** Immediately before the `</div><!-- /results -->` line (after the edge-compliance panel's closing `</div>`), insert:
```html
        <!-- ── RELIABILITY & VALIDATION TAB ───────────────────────────────── -->
        <div v-show="activeTab === 'reliability'" class="p-4">
          <div class="text-xs text-gray-500 mb-2">
            Redundancy numbers (Σ = DOF {{ result.adj.stats.DOF }}): r→1 well controlled, r→0 poorly controlled ·
            Leave-one-out validation —
            <b class="text-blue-700">RMS {{ result.loo && result.loo.rmsLoo != null ? result.loo.rmsLoo.toFixed(4) + ' m' : '—' }}</b>,
            max {{ result.loo && result.loo.maxLoo != null ? result.loo.maxLoo.toFixed(4) + ' m' : '—' }}
            {{ result.loo && result.loo.note ? '(' + result.loo.note + ')' : '' }}
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full text-xs border-collapse">
              <thead>
                <tr class="bg-gray-50 text-gray-600">
                  <th class="text-left px-2 py-1.5">Beacon</th>
                  <th class="text-right px-2 py-1.5">Redund rY</th>
                  <th class="text-right px-2 py-1.5">Redund rX</th>
                  <th class="text-right px-2 py-1.5">LOO ΔY (m)</th>
                  <th class="text-right px-2 py-1.5">LOO ΔX (m)</th>
                  <th class="text-right px-2 py-1.5">LOO dist (m)</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(p, idx) in result.pts.filter(b => b.finalStatus === 'ACCEPT')"
                  :key="p.id"
                  :class="idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'"
                  class="border-t border-gray-100"
                >
                  <td class="px-2 py-1.5 whitespace-nowrap">{{ p.name }}</td>
                  <td class="px-2 py-1.5 text-right">{{ p.rY != null ? p.rY.toFixed(3) : '—' }}</td>
                  <td class="px-2 py-1.5 text-right">{{ p.rX != null ? p.rX.toFixed(3) : '—' }}</td>
                  <td class="px-2 py-1.5 text-right">{{ looFor(p.id) ? f4s(looFor(p.id).looY) : '—' }}</td>
                  <td class="px-2 py-1.5 text-right">{{ looFor(p.id) ? f4s(looFor(p.id).looX) : '—' }}</td>
                  <td class="px-2 py-1.5 text-right font-medium text-blue-700">{{ looFor(p.id) ? f4(looFor(p.id).looDist) : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="text-[10px] text-gray-400 mt-2">
            LOO = leave-one-out cross-validation: each beacon predicted from a fit that excludes it — an independent,
            out-of-sample accuracy check (no held-out points needed).
          </p>
        </div>
```

- [ ] **Step 4: Add the `looFor` helper in `<script setup>`.** After the existing computed declarations (e.g. after `sigma0Note`), add:
```js
function looFor(id) {
  const rows = result.value?.loo?.rows
  return rows ? rows.find(r => r.id === id) : null
}
```

- [ ] **Step 5: Build**

Run: `npm --prefix app-frontend run build 2>&1 | grep -iE 'CompareView|error|✓ built' | head`
Expected: a `CompareView-*.js` chunk + `✓ built`, no error lines.

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/views/modules/lite/compare/CompareView.vue
git commit -m "feat(lite): show parameter SEs + Reliability tab (redundancy + LOO) on screen

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: GUI integration verification (Edge)

**Files:** Verify only. Uses an isolated Playwright install + system Edge.

- [ ] **Step 1:** Install the Playwright package in an isolated dir and start a FRESH preview after the build:
```bash
PWV="/c/Users/mukan/AppData/Local/Temp/pwv"; mkdir -p "$PWV"; cd "$PWV"; npm init -y >/dev/null 2>&1; npm i playwright 2>&1 | tail -1
cd /c/surveypro-may-2026/SurveyPro-nov-alpha; npm --prefix app-frontend run build 2>&1 | grep '✓ built'
for pt in 4173 4174 5173 5174; do pid=$(netstat -ano | grep ":$pt" | grep -i LISTENING | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //PID "$pid" //F >/dev/null 2>&1; done
```
Then start `npm --prefix app-frontend run preview` in the background; read its output for the PORT.

- [ ] **Step 2:** Drive Edge to compute, open the **Reliability** tab, screenshot, and generate the report — writing/reading ONE explicit absolute path:
```js
// C:/Users/mukan/AppData/Local/Temp/pwv/rel.mjs  (set BASE to the preview port)
import { chromium } from 'playwright'
const OUT='C:/Users/mukan/AppData/Local/Temp/pwv', BASE='http://localhost:4173'
const profile={id:1,email:'x@y.z',user_type:'registered_surveyor',created_at:'2026-01-01',profile:{id:1,name:'V',surveyor_type:'registered'}}
const b=await chromium.launch({channel:'msedge',headless:true})
const ctx=await b.newContext({acceptDownloads:true,viewport:{width:1400,height:900}})
await ctx.addInitScript(p=>{localStorage.setItem('token','t');localStorage.setItem('lastActivity',String(Date.now()));localStorage.setItem('userProfile',JSON.stringify(p))},profile)
const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message))
await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}))
await page.route('**/auth/me',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(profile)}))
await page.goto(BASE+'/modules/lite/compare',{waitUntil:'networkidle'})
await page.waitForSelector('text=Beacon Comparison',{timeout:15000})
await page.locator('button',{hasText:'Compute'}).click(); await page.waitForTimeout(600)
await page.locator('button',{hasText:'Reliability'}).click(); await page.waitForTimeout(300)
await page.screenshot({path:OUT+'/reliability-tab.png',fullPage:true})
const [dl]=await Promise.all([page.waitForEvent('download',{timeout:10000}),page.locator('button',{hasText:'Examination Report'}).click()])
await dl.saveAs(OUT+'/report.pdf')
console.log('PAGE_ERRORS:',errs.length?errs.join('|'):'NONE')
await b.close()
```
Run it, then confirm the PDF: `python -c "from pypdf import PdfReader; t=''.join((p.extract_text() or '') for p in PdfReader(r'C:\Users\mukan\AppData\Local\Temp\pwv\report.pdf').pages); print('Reliability section:', 'Reliability & Validation' in t)"`. Expected `PAGE_ERRORS: NONE` and `True`.

- [ ] **Step 3:** `Read` `C:\Users\mukan\AppData\Local\Temp\pwv\reliability-tab.png` — confirm the Reliability tab shows redundancy rY/rX + LOO columns and the RMS/max-LOO summary; also confirm the Statistics tab parameter values carry `± σ`.

- [ ] **Step 4:** Stop preview (`taskkill` the port PID) and remove `C:\Users\mukan\AppData\Local\Temp\pwv`.

---

## Self-Review

**1. Spec coverage**
- Danish IRLS pre-fit (Step 1) → Task 2 (`danishFit`), used in Task 4 pipeline. ✓
- Flagging on robust σ̂₀-standardised residuals, not cofactor W-test (re-promotion fix) → Task 4 Step 2 of pipeline. ✓
- Clean OLS + W-test backstop (Steps 3–4) → Task 4 loop. ✓
- Parameter SEs (ΔY, ΔX, scale, ppm, rotation via propagation) → Task 3 (`paramStdErrors`) + Task 4 (attached) + report Task 5 Step 1 + UI Task 6 Step 1. ✓
- Per-beacon redundancy numbers (Σ = DOF) → Task 1 (`rY/rX`) + report/UI Tasks 5–6. ✓
- Automated LOO (Step 5) → Task 3 (`looResiduals`) + Task 4 + report Task 5 + UI Task 6. ✓
- σ̂₀ + χ² retained → Task 4 (unchanged stats). ✓
- 2-D 4-parameter only; no new inputs → no input changes anywhere. ✓
- Verification (Node + build + Edge) → Tasks 1–4 Node, Task 5 build/source-PDF, Task 7 Edge. ✓

**2. Placeholder scan:** No TBD/TODO; every code step is complete; commands have expected output. ✓

**3. Type/name consistency:** `helmertLS(points, weights)` returns `{params, pp(+rY/rX), stats, Cxx}` — used consistently by `danishFit`, `looResiduals`, `iterativeAdjust`. `paramStdErrors(params, Cxx)` → `{TY,TX,scale,ppm,rotSec}` used in Task 4 (`P.se`), report (`p.se.*`), UI (`se.*`). `looResiduals` → `{rows:[{id,name,looY,looX,looDist}], rmsLoo, maxLoo, note?}` used in report (`looById`) and UI (`looFor`). `result.loo`, `result.danishLog`, per-point `rY/rX`, `danishWeight`, `finalStatus`, `yT/xT/tv*` consistent across Tasks 4–6. `helmertApply` (existing) reused by `looResiduals` and the pipeline. ✓
