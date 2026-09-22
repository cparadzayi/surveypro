import { describe, it, expect } from 'vitest'
import {
  distanceToleranceM, directionToleranceArcsec, SI727_CLASS,
  edgeCompliance, beaconSeverity, severityVerdict, SI727_SEVERITY_FACTOR,
  coordinateComparison, edgeVerdictPoints,
  classifyDuplicateGroup, resolveDuplicateGroups,
} from '../si727'
import { SAMPLE_DATA } from '../surveyMath'

/**
 * Pins the tolerance constants to the Second Schedule of the Land Survey (General)
 * Regulations, 1979 (S.I. 727 of 1979), pp. 3299-3300 — the paragraphs that govern
 * accepting a previous survey's co-ordinates, which is what a found-beacon comparison is:
 *
 *   para 7(5)  Limits of Error — distances
 *              (a) class B  0,04 sqrt(0,075f + 0,000 15f^2) metres
 *              (b) class C  0,06 sqrt(0,075f + 0,000 15f^2) metres
 *   para 8     Acceptance of co-ordinates i.t.o. subsection (2) of section 15 — directions
 *              (a) class B  15 000/(S+300) seconds
 *              (b) class C  45 000/(S+300) seconds
 *
 * (Corrected 2026-09-21: the distance limit is K√(0.075f+0.00015f²) with K = 0,04/0,06 —
 * the 0.075 coefficient prescribed by the Second Schedule. Earlier builds carried 0,01/0,02
 * with a 0.075 coefficient, a misreading of para 7(1) co-ordinate acceptance. Deliberately NOT
 * para 7(2) (0,01/0,015), which limits the angle subtended at a beacon — a different test we do
 * not implement.)
 */

/** The Schedule's kernel, written out independently of the implementation. */
const kernel = (f: number) => Math.sqrt(0.075 * f + 0.00015 * f * f)

describe('distanceToleranceM — Second Schedule para 7(5) Limits of Error', () => {
  it.each([50, 100, 250, 500, 1000])('class B is 0,04 x sqrt(0,075f + 0,000 15f^2) at f=%dm', (f) => {
    expect(distanceToleranceM(f, 'B')).toBeCloseTo(0.04 * kernel(f), 12)
  })

  it.each([50, 100, 250, 500, 1000])('class C is 0,06 x sqrt(0,075f + 0,000 15f^2) at f=%dm', (f) => {
    expect(distanceToleranceM(f, 'C')).toBeCloseTo(0.06 * kernel(f), 12)
  })

  it('gives class C exactly 1.5 × class B, per paras 7(5)(a) and 7(5)(b)', () => {
    expect(distanceToleranceM(250, 'C')).toBeCloseTo(1.5 * distanceToleranceM(250, 'B'), 12)
  })

  it('defaults an unknown class to the stricter class B limit', () => {
    expect(distanceToleranceM(250, 'A' as 'B')).toBeCloseTo(distanceToleranceM(250, 'B'), 12)
  })

  it('returns 0 for a degenerate (zero or negative) line length', () => {
    expect(distanceToleranceM(0, 'B')).toBe(0)
    expect(distanceToleranceM(-5, 'B')).toBe(0)
  })
})

describe('directionToleranceArcsec — Second Schedule para 8', () => {
  it.each([50, 100, 250, 500, 1000])('class B is 15 000/(S+300) seconds at S=%dm', (S) => {
    expect(directionToleranceArcsec(S, 'B')).toBeCloseTo(15000 / (S + 300), 12)
  })

  it.each([50, 100, 250, 500, 1000])('class C is 45 000/(S+300) seconds at S=%dm', (S) => {
    expect(directionToleranceArcsec(S, 'C')).toBeCloseTo(45000 / (S + 300), 12)
  })

  it('caps a zero-length ray at K/300 rather than dividing by zero', () => {
    expect(directionToleranceArcsec(0, 'B')).toBeCloseTo(50, 12)
  })
})

/** Minimal hand-computable rows; only the fields beaconSeverity reads are present. */
const row = (from: string, to: string, dRatio: number, dirRatio: number) => ({
  from, to,
  dDiff: dRatio * 0.1, dAllow: 0.1,
  dirDiffSec: dirRatio * 60, dirAllowSec: 60,
})

describe('beaconSeverity', () => {
  it('scores a line by the worse of its two Schedule ratios', () => {
    // One line, A-B: distance at 0.5x tolerance, direction at 2.0x -> severity 2.0 for both ends.
    const sev = beaconSeverity([row('A', 'B', 0.5, 2.0)])
    expect(sev.get('A')).toBeCloseTo(2.0, 12)
    expect(sev.get('B')).toBeCloseTo(2.0, 12)
  })

  it("averages a beacon's severity across every line it sits on", () => {
    // B sits on both lines (3.0 and 1.0) -> 2.0; A only on the first, C only on the second.
    const sev = beaconSeverity([row('A', 'B', 3.0, 0), row('B', 'C', 1.0, 0)])
    expect(sev.get('B')).toBeCloseTo(2.0, 12)
    expect(sev.get('A')).toBeCloseTo(3.0, 12)
    expect(sev.get('C')).toBeCloseTo(1.0, 12)
  })

  it('uses the absolute difference, so sign never cancels severity out', () => {
    const sev = beaconSeverity([row('A', 'B', -3.0, 0), row('B', 'C', 3.0, 0)])
    expect(sev.get('B')).toBeCloseTo(3.0, 12)
  })

  it('returns an empty map for no rows', () => {
    expect(beaconSeverity([]).size).toBe(0)
  })
})

describe('severityVerdict', () => {
  /** n beacons in a ring, all at the same severity, so none is an outlier. */
  const ring = (sevs: number[]) =>
    sevs.map((s, i) => row(`P${i}`, `P${(i + 1) % sevs.length}`, s, 0))

  it('rejects nobody when every beacon breaches the limit equally', () => {
    // All severity 5.0: badly out, but no beacon stands apart from its own network.
    expect(severityVerdict(ring([5, 5, 5, 5, 5, 5])).rejected).toEqual([])
  })

  it('rejects nobody when the network is clean, however uneven', () => {
    // P0 is far above the median but still inside tolerance -- the absolute floor holds.
    const rows = [row('P0', 'P1', 0.9, 0), row('P1', 'P2', 0.1, 0), row('P2', 'P3', 0.1, 0),
      row('P3', 'P0', 0.1, 0)]
    const v = severityVerdict(rows)
    expect(v.rejected).toEqual([])
    expect(v.cut).toBeLessThan(0.9)   // it cleared the relative cut, and was spared by the floor
  })

  it('rejects a beacon that is both an outlier and over the limit', () => {
    const rows = [row('BAD', 'P1', 8, 0), row('P1', 'P2', 1, 0), row('P2', 'P3', 1, 0),
      row('P3', 'P4', 1, 0), row('P4', 'BAD', 8, 0)]
    expect(severityVerdict(rows).rejected).toEqual(['BAD'])
  })

  it('orders rejections worst-first', () => {
    const rows = [row('WORST', 'MID', 20, 0), row('MID', 'P2', 9, 0), row('P2', 'P3', 0.2, 0),
      row('P3', 'P4', 0.2, 0), row('P4', 'P5', 0.2, 0), row('P5', 'WORST', 20, 0)]
    const rejected = severityVerdict(rows).rejected
    expect(rejected[0]).toBe('WORST')
    expect(rejected).toContain('MID')
  })

  it('never rejects so many that fewer than three beacons survive', () => {
    // Four beacons, three of them wildly out -- only the worst two may go.
    const rows = [row('A', 'B', 30, 0), row('B', 'C', 20, 0), row('C', 'D', 0.1, 0),
      row('D', 'A', 25, 0)]
    const v = severityVerdict(rows)
    expect(v.rejected.length).toBeLessThanOrEqual(1)
    expect(4 - v.rejected.length).toBeGreaterThanOrEqual(3)
  })

  it('reports the median and cut it used, so the report can state them', () => {
    const v = severityVerdict(ring([2, 2, 2, 2]))
    expect(v.median).toBeCloseTo(2, 12)
    expect(v.cut).toBeCloseTo(SI727_SEVERITY_FACTOR * 2, 12)
  })

  it('rejects nobody when there are no rows to judge', () => {
    expect(severityVerdict([]).rejected).toEqual([])
  })
})

/**
 * The rule has to hold on real networks, not just constructed ones, and it must not
 * depend on which class the surveyor declared — the ranking is class-invariant even
 * though the raw ratios are not.
 */
describe('severityVerdict on real networks', () => {
  // The survey drawn in the SG reference comparison sketch (D:\para2026\comparisonsketch.dxf).
  // The examining surveyor rejected exactly RM10, 148a and 152c.
  const MIDLANDS = [
    ['RM7', -1454.419, 1979603.687, -1454.271, 1979603.84],
    ['RM10', -1418.232, 1979452.159, -1418.023, 1979452.106],
    ['RM11', -1413.868, 1979434.153, -1413.644, 1979434.231],
    ['148b', -1398.696, 1979357.577, -1398.445, 1979357.715],
    ['148a', -1349.695, 1979369.27, -1349.255, 1979369.541],
    ['152a', -1153.691, 1979416.045, -1153.42, 1979416.191],
    ['152c', -1221.475, 1979483.059, -1221.336, 1979483.421],
    ['151c', -1270.476, 1979471.365, -1270.304, 1979471.604],
  ].map(([name, yH, xH, yS, xS], i) => ({ id: i + 1, name, yH, xH, yS, xS })) as any[]

  it.each(['B', 'C'])('matches the reference surveyor on the Midlands network (class %s)', (cls) => {
    const { rows } = edgeCompliance(MIDLANDS, cls)
    expect(severityVerdict(rows).rejected.sort()).toEqual(['148a', '152c', 'RM10'])
  })

  /**
   * BM 004 carries a ~0.248 m planted southing blunder. The swing principle judges it against
   * the class positional limit expressed as an angle: class B posLimit ≈ 0.17 m so the blunder
   * is 1.45x the budget and its long-ray swing residuals breach it; class C posLimit ≈ 0.26 m,
   * so 0.248 m is WITHIN the class C budget and class C correctly adopts the beacon.
   */
  it('isolates the planted blunder in SAMPLE_DATA under class B (it breaches the class positional limit)', () => {
    const { rows } = edgeCompliance(SAMPLE_DATA as any, 'B')
    expect(severityVerdict(rows).rejected).toEqual(['BM 004'])
  })

  it('adopts the planted blunder under class C (0.248 m sits inside the class C limit ≈ 0.26 m)', () => {
    const { rows, summary } = edgeCompliance(SAMPLE_DATA as any, 'C')
    expect(summary.posLimit).toBeGreaterThan(0.24)
    expect(severityVerdict(rows).rejected).toEqual([])
  })

  /**
   * Declaring class C instead of B divides the distance ratio by 2 but the direction
   * ratio by 3, so which term wins `max()` can flip and the tail of the ranking DOES
   * reorder (here RM7 and 152a swap). What must hold — and what the verdict rests on —
   * is that the worst beacons, the only ones the cut can reach, rank the same either way.
   */
  it('ranks the worst beacons identically whichever class is declared', () => {
    const order = (cls: string) =>
      [...beaconSeverity(edgeCompliance(MIDLANDS, cls).rows).entries()]
        .sort((a, b) => b[1] - a[1]).map(([name]) => name)
    expect(order('B').slice(0, 5)).toEqual(order('C').slice(0, 5))
  })

  it('reaches the same verdict whichever class is declared', () => {
    const verdict = (cls: string) => severityVerdict(edgeCompliance(MIDLANDS, cls).rows).rejected
    expect(verdict('B')).toEqual(verdict('C'))
  })
})

/**
 * Direction compliance is the old-days swing principle: each line swings by (Survey − Hist),
 * the NETWORK swing ω̂ is the length-weighted median of the swings, and a line is judged on
 * its swing RESIDUAL — not the raw difference, and not the para 8 K/(S+300) setting-out rule.
 */
describe('edgeCompliance — swing-principle directions', () => {
  // A clean regular octagon, R = 1000 m, historical and survey coincident. Rotating the
  // whole survey network about its centroid multiplies every line's bearing by exactly the
  // rotation — the archetypal uniform network swing.
  const RING = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * 2 * Math.PI
    return { y: 50050 + 1000 * Math.cos(a), x: 2200550 + 1000 * Math.sin(a) }
  }).map((p, i) => ({ id: i + 1, name: `R${i + 1}`, yH: p.y, xH: p.x, yS: p.y, xS: p.x }))

  it('judges direction on the swing residual, not the raw difference', () => {
    const rawLarge = { from: 'A', to: 'B', dDiff: 0, dAllow: 0.05, dirDiffSec: 1800, swingResidSec: 0, dirAllowSec: 60 }
    const noResidual = { from: 'A', to: 'B', dDiff: 0, dAllow: 0.05, dirDiffSec: 1800, dirAllowSec: 60 }
    expect(beaconSeverity([rawLarge]).get('A')).toBe(0)
    expect(beaconSeverity([noResidual]).get('A')).toBe(30)
  })

  it('removes a uniform 180″ network swing before judging directions, and flags it as a warning', () => {
    const TH = 0.000872664626 // 180″ ≈ 0.05°
    const cy = 50050, cx = 2200550
    const rotated = RING.map(p => {
      const yS = cy + (p.yH - cy) * Math.cos(TH) - (p.xH - cx) * Math.sin(TH)
      const xS = cx + (p.yH - cy) * Math.sin(TH) + (p.xH - cx) * Math.cos(TH)
      return { ...p, yS, xS }
    })
    const { rows, summary } = edgeCompliance(rotated, 'B')
    expect(Math.abs(summary.networkSwingSec)).toBeCloseTo(180, 6)
    expect(summary.networkSwingWarn).toBe(true)
    expect(Math.max(...rows.map(r => Math.abs(r.swingResidSec)))).toBeLessThan(1e-6)
    expect(Math.abs(rows[0].dirDiffSec)).toBeCloseTo(180, 6)
    expect(rows.every(r => r.pass)).toBe(true)
    expect(severityVerdict(rows).rejected).toEqual([])
  })

  it('keeps the exact 1.5x class ratio in the angular direction tolerance', () => {
    const b = edgeCompliance(RING, 'B').rows[0].dirAllowSec
    const c = edgeCompliance(RING, 'C').rows[0].dirAllowSec
    expect(c).toBeCloseTo(1.5 * b, 9)
  })

  it('pins the network swing to the well-determined rays — SAMPLE_DATA blunder cannot pull it', () => {
    const { summary } = edgeCompliance(SAMPLE_DATA as any, 'B')
    // BM 004's pairwise swings reach ~100° but the well-determined majority of the
    // weight sits near 0, so the weighted-median consensus ω̂ stays sub-arcsecond.
    expect(Math.abs(summary.networkSwingSec)).toBeLessThan(2)
  })
})

describe('SI727_CLASS', () => {
  it('carries only the two classes the Schedule defines for paras 7 and 8', () => {
    expect(Object.keys(SI727_CLASS).sort()).toEqual(['B', 'C'])
  })

  it('holds the Schedule constants verbatim', () => {
    expect(SI727_CLASS.B).toEqual({ distFactor: 0.04, dirK: 15000 })
    expect(SI727_CLASS.C).toEqual({ distFactor: 0.06, dirK: 45000 })
  })
})

describe('classifyDuplicateGroup — bnr-part8 duplicate-beacon adjudication (re-exported from app-shared)', () => {
  it.each(['B', 'C'] as const)('averages exactly-coincident and sub-tolerance rows; flags anything past the repeat neighbourhood (class %s)', (cls) => {
    // Repeat window: only separations with tolerance >= separation classify as repeats —
    // for para 7(5) that is sep <= ~0.13 mm (B) / ~0.28 mm (C). distanceToleranceM returns
    // 0 for f<=0, so a 0 m spread is always a repeat; a 1 mm spread is already a conflict.
    const exact = classifyDuplicateGroup([{ y: 100, x: 200 }, { y: 100, x: 200 }], cls)
    expect(exact.kind).toBe('repeat')

    const apart = classifyDuplicateGroup([{ y: 100, x: 200 }, { y: 100, x: 200.001 }], cls)
    expect(apart.kind).toBe('conflict')
  })

  it('handles a single observation as a no-op', () => {
    expect(classifyDuplicateGroup([{ y: 100, x: 200 }], 'B').kind).toBe('single')
  })
})

describe('resolveDuplicateGroups — shared bnr-part8 escape logic (re-exported from app-shared)', () => {
  it('keeps the first observation canonical and escapes the rest as _dupl/_dupl2', () => {
    const { points, conflicts } = resolveDuplicateGroups([
      ['5000A', [{ name: '5000A', y: 0, x: 0 }, { name: '5000A', y: 5, x: 0 }]],
    ], { surveyClass: 'B' })

    expect(points.map(p => p.name)).toEqual(['5000A', '5000A_dupl'])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].extras[0].distance).toBeCloseTo(5, 10)
  })

  it('escalates past names already claimed by matched imports', () => {
    const { points } = resolveDuplicateGroups([
      ['A3', [{ name: 'A3', y: 0, x: 0 }, { name: 'A3', y: 0, x: 3 }]],
    ], { surveyClass: 'B', takenNames: new Set(['A3', 'A3_dupl']) })

    expect(points[1].name).toBe('A3_dupl2')
  })
})

/**
 * coordinateComparison — the three-way comparison selector's "Comparison of co-ordinates
 * vide 67(5)". A pure position schedule with no Helmert and no W-test. Each beacon is
 * scored by its consistency measure s = Δ/posLimit against the class positional limit
 * 2.45·σ₀ (the ≈95% 2-D circular confidence from suggestedSigma0), then rejected by the
 * same two-gate verdict as the Second Schedule edge test: stand apart from the network
 * (s > 1.25 × median s) AND breach the class limit (s > 1). A uniform shift/degradation
 * flags nobody but sets verdict.networkWide.
 */
describe('coordinateComparison — SI 727 §67(5) co-ordinate comparison', () => {
  it('accepts beacons whose displacement is within 2.45·σ₀ of the class limit and rejects the rest', () => {
    // SAMPLE_DATA: BM 004 carries a ~0.248 m planted southing blunder; every other
    // beacon is within ~2 cm. L (median pairwise) = 500 m ⇒ posLimit ≈ 0.17 m on class
    // B, so exactly BM 004 (s ≈ 1.45) rejects. Old comment "0.055 m" predates the
    // para 7(5) Limits of Error correction (0.01→0.04).
    const { pts, posLimit, sigma0 } = coordinateComparison(SAMPLE_DATA, 'B')
    expect(sigma0).toBeGreaterThan(0)
    expect(posLimit).toBeCloseTo(2.45 * sigma0, 10)
    expect(pts.filter(p => p.finalStatus === 'ACCEPT').length).toBe(SAMPLE_DATA.length - 1)
    const rej = pts.filter(p => p.finalStatus === 'REJECT')
    expect(rej.map(p => p.name)).toEqual(['BM 004'])
    expect(rej.every(p => p.rejSource === 'coords')).toBe(true)
  })

  it('records per-beacon raw differences dY/dX and the displacement size', () => {
    const { pts } = coordinateComparison(SAMPLE_DATA, 'B')
    const bm = pts.find(p => p.name === 'BM 001')!
    expect(bm.dY).toBeCloseTo(SAMPLE_DATA[0].yS - SAMPLE_DATA[0].yH, 10)
    expect(bm.dX).toBeCloseTo(SAMPLE_DATA[0].xS - SAMPLE_DATA[0].xH, 10)
    expect(bm.rawDist).toBeCloseTo(Math.hypot(bm.dY, bm.dX), 10)
    expect(typeof bm.rawBrg).toBe('number')
  })

  it('adopts every beacon when no displacement breaches the limit', () => {
    const tiny = SAMPLE_DATA.slice(0, 4).map(p => ({ ...p, yS: p.yH + 0.001, xS: p.xH - 0.001 }))
    const { pts } = coordinateComparison(tiny, 'B')
    expect(pts.every(p => p.finalStatus === 'ACCEPT')).toBe(true)
  })

  /** Clean ring, residuals ~5–8 mm ⇒ s ≈ 0.08–0.13, class B limit ≈ 0.06 m (para 7(5): L=100 m). */
  const cleanRing = [
    { name: 'A', yH: 50000, xH: 2200500, yS: 50000.005, xS: 2200500.004 },
    { name: 'B', yH: 50100, xH: 2200500, yS: 50100.000, xS: 2200500.006 },
    { name: 'C', yH: 50100, xH: 2200600, yS: 50100.008, xS: 2200600.002 },
    { name: 'D', yH: 50000, xH: 2200600, yS: 50000.003, xS: 2200600.003 },
    { name: 'E', yH: 50050, xH: 2200550, yS: 50050.001, xS: 2200550.005 },
    { name: 'F', yH: 50050, xH: 2200600, yS: 50050.006, xS: 2200600.001 },
  ]

  it('rejects a displaced beacon only when it stands apart from the network AND breaches the limit', () => {
    const moved = cleanRing.map(p => p.name === 'B'
      ? { ...p, yS: p.yS + 0.10, xS: p.xS + 0.08 }   // ≈128 mm extra on B
      : p)
    const { pts, verdict } = coordinateComparison(moved, 'B')
    const rej = pts.filter(p => p.finalStatus === 'REJECT')
    expect(rej.map(p => p.name)).toEqual(['B'])
    expect(rej.every(p => p.rejSource === 'coords')).toBe(true)
    expect(pts.filter(p => p.finalStatus === 'ACCEPT').length).toBe(5)
    expect(verdict.networkWide).toBe(false)
    expect(verdict.rejected).toEqual(['B'])
    expect(verdict.severity.get('B')).toBeGreaterThan(verdict.cut)
    expect(verdict.severity.get('B')).toBeGreaterThan(1)
    // The clean beacons sit below the absolute floor even when above the relative cut.
    for (const p of pts.filter(p => p.name !== 'B')) {
      expect(p.severity).toBeLessThanOrEqual(1)
      expect(p.finalStatus).toBe('ACCEPT')
    }
  })

  it('flags a uniform shift as network-wide rather than rejecting every beacon', () => {
    const shifted = cleanRing.map(p => ({ ...p, yS: p.yH - 0.20, xS: p.xH + 0.25 }))   // ≈320 mm common shift
    const { pts, verdict } = coordinateComparison(shifted as any, 'B')
    expect(pts.every(p => p.finalStatus === 'ACCEPT')).toBe(true)
    expect(verdict.rejected).toEqual([])
    expect(verdict.networkWide).toBe(true)
    expect(verdict.median).toBeGreaterThanOrEqual(1)
    expect(pts.every(p => p.severity > 1)).toBe(true)
  })

  it('reports the consistency median, cut and worst-first order for the report', () => {
    const { verdict } = coordinateComparison(cleanRing as any, 'B')
    expect(verdict.rejected).toEqual([])
    expect(verdict.median).toBeGreaterThan(0)
    expect(verdict.cut).toBeCloseTo(SI727_SEVERITY_FACTOR * verdict.median, 12)
    expect(verdict.severity.size).toBe(cleanRing.length)
  })
})

/**
 * edgeVerdictPoints — the same selector's "Edge compliance with the SI 727 classes".
 * Bundles a Second Schedule severity verdict into per-beacon status shaped like
 * iterativeAdjust rejects (rejSource 'si727'), independent of any adjustment.
 */
describe('edgeVerdictPoints — Second Schedule severity-verdict status', () => {
  it('marks the verdict-rejected beacons REJECT / rejSource si727 and the rest ACCEPT', () => {
    const edges = edgeCompliance(SAMPLE_DATA, 'B')
    const verdict = severityVerdict(edges.rows)
    const pts = edgeVerdictPoints(SAMPLE_DATA, edges, verdict)
    expect(verdict.rejected.length).toBeGreaterThan(0)
    expect(pts.filter(p => p.finalStatus === 'REJECT').map(p => p.name)).toEqual(verdict.rejected)
    expect(pts.filter(p => p.finalStatus === 'ACCEPT').map(p => p.name)).toEqual(
      SAMPLE_DATA.map(p => p.name).filter(n => !verdict.rejected.includes(n)),
    )
    expect(pts.filter(p => p.finalStatus === 'REJECT').every(p => p.rejSource === 'si727')).toBe(true)
    expect(pts.every(p => typeof p.rawDist === 'number' && typeof p.rawBrg === 'number')).toBe(true)
  })

  it('accepts everything for an empty verdict', () => {
    const edges = { rows: [], summary: null as any }
    const pts = edgeVerdictPoints(SAMPLE_DATA, edges, { rejected: [] })
    expect(pts.every(p => p.finalStatus === 'ACCEPT')).toBe(true)
  })
})
