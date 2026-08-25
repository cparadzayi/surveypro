import { describe, it, expect } from 'vitest'
import {
  distanceToleranceM, directionToleranceArcsec, SI727_CLASS,
  edgeCompliance, beaconSeverity, severityVerdict, SI727_SEVERITY_FACTOR,
} from '../si727'
import { SAMPLE_DATA } from '../surveyMath'

/**
 * Pins the tolerance constants to the Second Schedule of the Land Survey (General)
 * Regulations, 1979 (S.I. 727 of 1979), pp. 3299-3300 — the paragraphs that govern
 * accepting a previous survey's co-ordinates, which is what a found-beacon comparison is:
 *
 *   para 7(1)  Acceptance of co-ordinates i.t.o. subsection (1) of section 15 — distances
 *              (a) class B  0,01 sqrt(0,075f + 0,000 15f^2) metres
 *              (b) class C  0,02 sqrt(0,075f + 0,000 15f^2) metres
 *   para 8     Acceptance of co-ordinates i.t.o. subsection (2) of section 15 — directions
 *              (a) class B  15 000/(S+300) seconds
 *              (b) class C  45 000/(S+300) seconds
 *
 * Deliberately NOT para 5 ("Distances", 0,01/0,04/0,06), which limits a ground distance
 * against the co-ordinates of the SAME survey, nor para 7(2) (0,01/0,015), which limits
 * the angle subtended at a beacon — a different test we do not implement.
 */

/** The Schedule's kernel, written out independently of the implementation. */
const kernel = (f: number) => Math.sqrt(0.075 * f + 0.00015 * f * f)

describe('distanceToleranceM — Second Schedule para 7(1)', () => {
  it.each([50, 100, 250, 500, 1000])('class B is 0,01 x sqrt(0,075f + 0,000 15f^2) at f=%dm', (f) => {
    expect(distanceToleranceM(f, 'B')).toBeCloseTo(0.01 * kernel(f), 12)
  })

  it.each([50, 100, 250, 500, 1000])('class C is 0,02 x sqrt(0,075f + 0,000 15f^2) at f=%dm', (f) => {
    expect(distanceToleranceM(f, 'C')).toBeCloseTo(0.02 * kernel(f), 12)
  })

  it('gives class C exactly twice class B, per paras 7(1)(a) and 7(1)(b)', () => {
    expect(distanceToleranceM(250, 'C')).toBeCloseTo(2 * distanceToleranceM(250, 'B'), 12)
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

  it.each(['B', 'C'])('isolates the planted blunder in SAMPLE_DATA (class %s)', (cls) => {
    const { rows } = edgeCompliance(SAMPLE_DATA as any, cls)
    expect(severityVerdict(rows).rejected).toEqual(['BM 004'])
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

describe('SI727_CLASS', () => {
  it('carries only the two classes the Schedule defines for paras 7 and 8', () => {
    expect(Object.keys(SI727_CLASS).sort()).toEqual(['B', 'C'])
  })

  it('holds the Schedule constants verbatim', () => {
    expect(SI727_CLASS.B).toEqual({ distFactor: 0.01, dirK: 15000 })
    expect(SI727_CLASS.C).toEqual({ distFactor: 0.02, dirK: 45000 })
  })
})
