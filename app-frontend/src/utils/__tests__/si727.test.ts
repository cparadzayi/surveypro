import { describe, it, expect } from 'vitest'
import {
  distanceToleranceM, directionToleranceArcsec, SI727_CLASS,
  edgeCompliance,
  coordinateComparison,
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

/**
 * The edge check judges each line by Second Schedule para 7(5) alone. Directions and the swing are kept for
 * information: SI 727 sets no direction limit for a comparison (para 8 is a setting-out test), and the old
 * 2.45 x sigma0 angular limit was not in the regulations.
 */
describe('edgeCompliance — every line by para 7(5); directions for information', () => {
  // A clean regular octagon, R = 1000 m, historical and survey coincident.
  const RING = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * 2 * Math.PI
    return { y: 50050 + 1000 * Math.cos(a), x: 2200550 + 1000 * Math.sin(a) }
  }).map((p, i) => ({ id: i + 1, name: `R${i + 1}`, yH: p.y, xH: p.x, yS: p.y, xS: p.x }))

  it('passes a network swung 180 seconds as a whole, and reports the swing', () => {
    const TH = 0.000872664626 // 180″
    const cy = 50050, cx = 2200550
    const rotated = RING.map(p => {
      const yS = cy + (p.yH - cy) * Math.cos(TH) - (p.xH - cx) * Math.sin(TH)
      const xS = cx + (p.yH - cy) * Math.sin(TH) + (p.xH - cx) * Math.cos(TH)
      return { ...p, yS, xS }
    })
    const { rows, summary } = edgeCompliance(rotated, 'B')
    expect(Math.abs(summary.networkSwingSec)).toBeCloseTo(180, 6)
    expect(Math.max(...rows.map(r => Math.abs(r.swingResidSec)))).toBeLessThan(1e-6)
    expect(rows.every(r => r.pass && r.distOk)).toBe(true)
    expect(summary.distPass).toBe(rows.length)
  })

  it('decides a line by its distance alone, however large its swing', () => {
    // One beacon slid 0.05 m ALONG a 1000 m line: the distance changes 0.05 m (within class B), the
    // short lines to it swing, and nothing may fail for that swing.
    const pts = RING.map((p, i) => (i === 0 ? { ...p, yS: p.yS + 0.05 } : p))
    const { rows } = edgeCompliance(pts, 'B')
    for (const r of rows) {
      expect(r.pass).toBe(r.distOk)
      expect('dirOk' in r).toBe(false)
      expect('dirAllowSec' in r).toBe(false)
    }
  })

  it('uses K = 0,01 / 0,04 / 0,06 for class A / B / C on the shorter distance', () => {
    const k = (f: number) => Math.sqrt(0.075 * f + 0.00015 * f * f)
    const pts = [
      { name: 'P', yH: 0, xH: 0, yS: 0, xS: 0 },
      { name: 'Q', yH: 0, xH: 1000, yS: 0, xS: 1000.5 },
    ]
    expect(edgeCompliance(pts as any, 'A').rows[0].dAllow).toBeCloseTo(0.01 * k(1000), 12)
    expect(edgeCompliance(pts as any, 'B').rows[0].dAllow).toBeCloseTo(0.04 * k(1000), 12)
    expect(edgeCompliance(pts as any, 'C').rows[0].dAllow).toBeCloseTo(0.06 * k(1000), 12)
  })

  it('pins the network swing to the well-determined rays — SAMPLE_DATA blunder cannot pull it', () => {
    const { summary } = edgeCompliance(SAMPLE_DATA as any, 'B')
    expect(Math.abs(summary.networkSwingSec)).toBeLessThan(2)
  })
})

/**
 * A surveyor's class B comparison of six beacons (23 Nov 2026). Printed before: 1 of 15 lines "within the
 * limits", because 14 failed a direction limit SI 727 does not state, and n rejected by a severity cut.
 * By para 7(5): four lines fail, n is set aside (o-n and n-1B), and 40-FS2 and 1A-1B each fail alone.
 */
describe('a class B comparison of six beacons, by para 7(5)', () => {
  const SIX = [
    ['40', -85263.68, 2140365.37, -85264.74, 2140365.5], ['FS2', -86750.13, 2141404.16, -86750.2, 2141403.6],
    ['o', -83030.13, 2145134.86, -83033.0, 2145135.85], ['n', -82439.83, 2143159.44, -82440.02, 2143157.2],
    ['1A', -84691.17, 2141734.59, -84691.54, 2141733.92], ['1B', -84723.77, 2142041.66, -84722.99, 2142040.63],
  ].map(([name, yH, xH, yS, xS]) => ({ name, yH, xH, yS, xS })) as any[]

  it('prints the para 7(5) class B limits worked by hand (40 - FS2: 1.0028 m; 1A - 1B: 0.2446 m)', () => {
    const rows = edgeCompliance(SIX, 'B').rows
    const line = (a: string, b: string) => rows.find(r => r.from === a && r.to === b)!
    expect(line('40', 'FS2').dAllow).toBeCloseTo(1.0028, 4)
    expect(line('1A', '1B').dAllow).toBeCloseTo(0.2446, 4)
    expect(rows.filter(r => !r.distOk).map(r => `${r.from}-${r.to}`)).toEqual(['40-FS2', 'o-n', 'n-1B', '1A-1B'])
  })

  it('sets aside n, accepts o, and leaves the ends of the two lone failing lines unresolved', () => {
    const c = coordinateComparison(SIX, 'B')
    const status = Object.fromEntries(c.pts.map((p: any) => [p.name, p.finalStatus]))
    expect(status).toEqual({ '40': 'UNRESOLVED', FS2: 'UNRESOLVED', o: 'ACCEPT', n: 'REJECT', '1A': 'UNRESOLVED', '1B': 'UNRESOLVED' })
    expect(c.verdict.unresolved).toEqual([{ from: '40', to: 'FS2' }, { from: '1A', to: '1B' }].map(l => expect.objectContaining(l)))
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
describe('coordinateComparison — SI 727 s.67(5), judged by Second Schedule para 7(5) on the lines', () => {
  it('passes the sample network: its 0.248 m planted blunder is inside para 7(5) on lines about 500 m long', () => {
    // The old rule (a 2.45 x sigma0 co-ordinate limit, not in SI 727) rejected BM 004. Para 7(5) allows
    // 0,04 x sqrt(0,075f + 0,000 15f^2), about 0.35 m at f = 500 m, so no line through it fails.
    const { pts, comparison67 } = coordinateComparison(SAMPLE_DATA, 'B')
    expect(comparison67.linesFailing).toBe(0)
    expect(pts.every(p => p.finalStatus === 'ACCEPT')).toBe(true)
  })

  it('records per-beacon raw differences dY/dX and the displacement size', () => {
    const { pts } = coordinateComparison(SAMPLE_DATA, 'B')
    const bm = pts.find(p => p.name === 'BM 001')!
    expect(bm.dY).toBeCloseTo(SAMPLE_DATA[0].yS - SAMPLE_DATA[0].yH, 10)
    expect(bm.dX).toBeCloseTo(SAMPLE_DATA[0].xS - SAMPLE_DATA[0].xH, 10)
    expect(bm.rawDist).toBeCloseTo(Math.hypot(bm.dY, bm.dX), 10)
    expect(typeof bm.rawBrg).toBe('number')
  })

  /** Clean ring, residuals ~5-8 mm; lines 50-141 m, para 7(5) class B allows 0.081-0.152 m. */
  const cleanRing = [
    { name: 'A', yH: 50000, xH: 2200500, yS: 50000.005, xS: 2200500.004 },
    { name: 'B', yH: 50100, xH: 2200500, yS: 50100.000, xS: 2200500.006 },
    { name: 'C', yH: 50100, xH: 2200600, yS: 50100.008, xS: 2200600.002 },
    { name: 'D', yH: 50000, xH: 2200600, yS: 50000.003, xS: 2200600.003 },
    { name: 'E', yH: 50050, xH: 2200550, yS: 50050.001, xS: 2200550.005 },
    { name: 'F', yH: 50050, xH: 2200600, yS: 50050.006, xS: 2200600.001 },
  ]

  it('sets aside a beacon whose lines fail para 7(5) while the lines among the others pass', () => {
    const moved = cleanRing.map(p => p.name === 'B' ? { ...p, yS: p.yS + 0.15, xS: p.xS + 0.12 } : p)
    const { pts, verdict, comparison67 } = coordinateComparison(moved, 'B')
    expect(verdict.rejected).toEqual(['B'])
    expect(pts.filter(p => p.finalStatus === 'REJECT').map(p => p.rejSource)).toEqual(['coords'])
    // every failing line runs to B
    expect(comparison67.lines.filter((l: any) => !l.pass).every((l: any) => l.from === 'B' || l.to === 'B')).toBe(true)
    expect(pts.find(p => p.name === 'B')!.failedLines).toBeGreaterThan(0)
  })

  it('adopts every beacon of a network shifted 0.32 m as a whole, and reports the shift', () => {
    const shifted = cleanRing.map(p => ({ ...p, yS: p.yH - 0.20, xS: p.xH + 0.25 }))
    const { pts, comparison67 } = coordinateComparison(shifted as any, 'B')
    expect(pts.every(p => p.finalStatus === 'ACCEPT')).toBe(true)
    expect(comparison67.linesFailing).toBe(0)
    expect(comparison67.shift.dY).toBeCloseTo(-0.20, 6)
    expect(comparison67.shift.dX).toBeCloseTo(0.25, 6)
    expect(pts.every(p => p.residual < 1e-6)).toBe(true)
  })

  it('adopts every beacon of a network swung 30 seconds as a whole, and reports the swing', () => {
    const a = 30 / 206264.806, cy = 50050, cx = 2200550
    const swung = cleanRing.map(p => {
      const y = p.yH - cy, x = p.xH - cx
      return { ...p, yS: cy + y * Math.cos(a) - x * Math.sin(a), xS: cx + y * Math.sin(a) + x * Math.cos(a) }
    })
    const { pts, comparison67 } = coordinateComparison(swung as any, 'B')
    expect(pts.every(p => p.finalStatus === 'ACCEPT')).toBe(true)
    expect(Math.abs(comparison67.swingSec)).toBeCloseTo(30, 3)
  })

  it('leaves a single failing line unresolved: the line alone does not show which end moved', () => {
    const pair = [
      { name: 'P', yH: 50000, xH: 2200000, yS: 50000, xS: 2200000 },
      { name: 'Q', yH: 50020, xH: 2200000, yS: 50020.2, xS: 2200000 },
      { name: 'R', yH: 51000, xH: 2201000, yS: 51000, xS: 2201000 },
      { name: 'S', yH: 51000, xH: 2199000, yS: 51000, xS: 2199000 },
    ]
    const { verdict, comparison67 } = coordinateComparison(pair as any, 'B')
    expect(comparison67.lines.filter((l: any) => !l.pass).map((l: any) => `${l.from}-${l.to}`)).toEqual(['P-Q'])
    expect(verdict.rejected).toEqual([])
    expect(verdict.unresolved).toEqual([{ from: 'P', to: 'Q' }])
    // the two ends are undecided, the rest accepted
    const byName = Object.fromEntries(coordinateComparison(pair as any, 'B').pts.map((p: any) => [p.name, p.finalStatus]))
    expect(byName).toEqual({ P: 'UNRESOLVED', Q: 'UNRESOLVED', R: 'ACCEPT', S: 'ACCEPT' })
  })

  it('marks every beacon UNRESOLVED, none ACCEPT, when the para 7(5) failures run through the network', () => {
    // Original data in a local system (report of 22 Nov 2026): every line fails, no beacon can be singled out,
    // and the schedule must not show them accepted ("Accepted: 4" contradicted "Referred").
    const local = [
      { name: '40', yH: 7047.618, xH: 3891.003, yS: -85264.744, xS: 2140365.502 },
      { name: 'FS2', yH: 8539.025, xH: 2859.112, yS: -86750.198, xS: 2141403.600 },
      { name: 'o', yH: 4800.250, xH: -923.416, yS: -83032.998, xS: 2145135.852 },
      { name: 'n', yH: 4203.845, xH: 1047.230, yS: -82440.018, xS: 2143157.201 },
    ]
    const { pts, comparison67 } = coordinateComparison(local as any, 'B')
    expect(comparison67.networkWide).toBe(true)
    expect(pts.map((p: any) => p.finalStatus)).toEqual(['UNRESOLVED', 'UNRESOLVED', 'UNRESOLVED', 'UNRESOLVED'])
  })
})
