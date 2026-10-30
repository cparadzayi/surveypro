import { describe, test, expect } from '@jest/globals'
import { insetTagCandidates, insetTagCandidatesEager } from '../insetTagCandidates.js'

/**
 * The lazy generator must hand back exactly the sequence the eager one builds and sorts: the same
 * candidates, field for field, in the same order, ties included. A different order would move tags on
 * a legal plan, so this compares the whole sequence, not a sample, on clusters of every shape the
 * renderer produces (one beacon to dozens, shared corners, one size or four, with and without
 * extra road directions whose turn cost makes ties between streams likely).
 */
const NEAR_GAPS = [1.5, 3, 5, 8, 12, 18, 26]
const FAR_GAPS = [...NEAR_GAPS, 36, 50, 70]
const FONTS = [8, 7, 6.5, 6]

function scenario(seed, { anchors, gaps, fonts, align, extra, ref }) {
  let t = seed
  const rnd = () => ((t = (t * 1664525 + 1013904223) % 4294967296) / 4294967296)
  const pts = Array.from({ length: anchors }, () => ({ pos: { x: Math.round(rnd() * 300) / 2, y: Math.round(rnd() * 200) / 2 } }))
  if (anchors > 3) pts[1] = { pos: { ...pts[0].pos } }   // a shared corner: the same position twice
  const extraAngles = [...new Set(extra.map((a) => Math.round(a * 10) / 10))].filter((a) => a !== align)
  const rots = [...new Set([align, ...extraAngles, align + 8, align - 8, 0, 15, -15, 30, -30, 45, -45])]
  const turnCost = (rot) => {
    if (rot === align) return 0
    if (extraAngles.includes(rot)) return 3
    return Math.abs(rot - align) < 9 ? 2 : 10 + Math.abs(rot - align) * 0.1
  }
  return {
    fonts, gaps, ref: ref ?? fonts[0], anchors: pts, rots, alongRots: [...new Set([align, ...extraAngles])],
    widthAt: (fs) => 5.1 * fs * 0.55 + 20,           // a stand-in for doc.widthOfString("Inset 3a")
    beaconRadius: 2.15, turnCost, fontCostPt: 8,
  }
}

const CASES = [
  ['one beacon, near gaps, four sizes', { anchors: 1, gaps: NEAR_GAPS, fonts: FONTS, align: 0, extra: [] }],
  ['three beacons, far gaps', { anchors: 3, gaps: FAR_GAPS, fonts: FONTS, align: 12.5, extra: [] }],
  ['eight beacons with a shared corner, two extra road directions', { anchors: 8, gaps: NEAR_GAPS, fonts: FONTS, align: -20, extra: [40, -75.5] }],
  ['a road-sized single font with that font as the reference', { anchors: 6, gaps: NEAR_GAPS, fonts: [7.5], align: 5, extra: [], ref: 7.5 }],
  ['a road font smaller than the ordinary reference', { anchors: 6, gaps: NEAR_GAPS, fonts: [6], align: 0, extra: [90], ref: 6 }],
  ['twelve beacons, far gaps, extra directions that tie on cost', { anchors: 12, gaps: FAR_GAPS, fonts: FONTS, align: 0, extra: [30, -30, 60] }],
]

describe('insetTagCandidates (lazy) equals insetTagCandidatesEager', () => {
  test.each(CASES)('%s', (_name, c) => {
    const o = scenario(7, c)
    const eager = insetTagCandidatesEager(o)
    const lazy = [...insetTagCandidates(o)]
    expect(lazy.length).toBe(eager.length)
    // the whole sequence, field for field
    for (let i = 0; i < eager.length; i++) {
      if (JSON.stringify(lazy[i]) !== JSON.stringify(eager[i])) {
        throw new Error(`candidate ${i} differs:\n lazy  ${JSON.stringify(lazy[i])}\n eager ${JSON.stringify(eager[i])}`)
      }
    }
    expect(eager.length).toBeGreaterThan(100)
  })

  test('different seeds, the same answer', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const o = scenario(seed, { anchors: 5, gaps: NEAR_GAPS, fonts: FONTS, align: seed * 7 - 20, extra: [seed * 11] })
      const eager = insetTagCandidatesEager(o)
      const lazy = [...insetTagCandidates(o)]
      expect(lazy.map((c) => JSON.stringify(c))).toEqual(eager.map((c) => JSON.stringify(c)))
    }
  })

  test('it can be walked more than once, each time from the start', () => {
    const o = scenario(9, { anchors: 4, gaps: NEAR_GAPS, fonts: FONTS, align: 0, extra: [] })
    const seq = insetTagCandidates(o)
    const first = []
    for (const c of seq) { first.push(c); if (first.length === 50) break }
    const again = []
    for (const c of seq) { again.push(c); if (again.length === 50) break }
    expect(again).toEqual(first)
  })

  test('stopping early builds only the candidates asked for, not the millions behind them', () => {
    const o = scenario(3, { anchors: 30, gaps: FAR_GAPS, fonts: FONTS, align: 0, extra: [25, -40] })
    // Count how often a candidate is built: building one reads its beacon's position.
    let reads = 0
    const counted = { ...o, anchors: o.anchors.map((m) => ({ get pos() { reads++; return m.pos } })) }
    let n = 0
    for (const c of insetTagCandidates(counted)) { void c; if (++n === 200) break }
    expect(n).toBe(200)
    expect(reads).toBeLessThan(2000)
    reads = 0
    insetTagCandidatesEager(counted)
    expect(reads).toBeGreaterThan(100000)   // the eager list builds them all
  })

  test('no beacons, no candidates', () => {
    const o = scenario(1, { anchors: 0, gaps: NEAR_GAPS, fonts: FONTS, align: 0, extra: [] })
    expect([...insetTagCandidates(o)]).toEqual([])
    expect(insetTagCandidatesEager(o)).toEqual([])
  })
})
