/**
 * app-shared/figureSplit.js — the outside-figure split rule.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js figureSplit-shared
 */
import { describe, test, expect } from '@jest/globals'
import {
  projectOnSegment, segmentIntersection, pointInRing, resolveEndpoint,
  interiorStaysInside, standsCrossedBy,
} from '../../../../app-shared/figureSplit.js'

const P = (y, x) => ({ y, x })

describe('projectOnSegment', () => {
  test('drops a perpendicular onto the segment', () => {
    const r = projectOnSegment(P(0, 0), P(10, 0), P(4, 3))
    expect(r.point.y).toBeCloseTo(4, 9)
    expect(r.point.x).toBeCloseTo(0, 9)
    expect(r.t).toBeCloseTo(0.4, 9)
    expect(r.distance).toBeCloseTo(3, 9)
  })

  test('clamps past either end rather than running off the segment', () => {
    expect(projectOnSegment(P(0, 0), P(10, 0), P(-5, 0)).t).toBe(0)
    expect(projectOnSegment(P(0, 0), P(10, 0), P(99, 0)).t).toBe(1)
  })

  test('a zero-length segment reports its own endpoint', () => {
    const r = projectOnSegment(P(3, 3), P(3, 3), P(5, 3))
    expect(r.point).toEqual(P(3, 3))
    expect(r.distance).toBeCloseTo(2, 9)
  })
})

describe('segmentIntersection', () => {
  test('finds a proper crossing', () => {
    expect(segmentIntersection(P(0, 0), P(10, 10), P(0, 10), P(10, 0)))
      .toEqual({ y: 5, x: 5 })
  })

  test('parallel and collinear segments do not cross', () => {
    expect(segmentIntersection(P(0, 0), P(10, 0), P(0, 5), P(10, 5))).toBeNull()
    expect(segmentIntersection(P(0, 0), P(10, 0), P(5, 0), P(15, 0))).toBeNull()
  })

  test('contact at an endpoint counts, and is not treated as a miss', () => {
    // A T-junction: the second segment STARTS exactly on the midpoint of the
    // first. The bounds are inclusive on purpose -- see the note on
    // segmentIntersection. Do not "tighten" this to strict bounds: an interior
    // cut segment grazing the outside figure does so at a ring vertex more
    // often than anywhere else, and excluding endpoints returns null for BOTH
    // edges meeting there, so interiorStaysInside would accept a bad cut.
    const hit = segmentIntersection(P(0, 0), P(10, 0), P(5, 0), P(5, 10))
    expect(hit).not.toBeNull()
    expect(hit.y).toBeCloseTo(5, 9)
    expect(hit.x).toBeCloseTo(0, 9)
  })

  test('a touch exactly on a shared ring vertex is reported for both its edges', () => {
    // The case above, one step worse: the cut lands on the corner where two
    // ring edges meet. Both must report it, because the caller asks only
    // whether there was contact, never how many times.
    // The cut runs DIAGONALLY through the corner. It has to: a cut along the
    // line of either edge is collinear with it, which is the one case that
    // correctly returns null, and an earlier draft of this test got that wrong.
    const corner = P(10, 0)
    const edgeIn = [P(0, 0), corner]          // x = 0, y running 0 -> 10
    const edgeOut = [corner, P(10, 10)]       // y = 10, x running 0 -> 10
    const cut = [P(5, -5), P(15, 5)]          // through the corner at t = 0.5

    for (const [r1, r2] of [edgeIn, edgeOut]) {
      const hit = segmentIntersection(cut[0], cut[1], r1, r2)
      expect(hit).not.toBeNull()
      expect(hit.y).toBeCloseTo(corner.y, 9)
      expect(hit.x).toBeCloseTo(corner.x, 9)
    }
  })

  test('segments that stop short of each other do not cross', () => {
    expect(segmentIntersection(P(0, 0), P(4, 0), P(5, -5), P(5, 5))).toBeNull()
  })
})

describe('pointInRing', () => {
  const square = [P(0, 0), P(10, 0), P(10, 10), P(0, 10)]

  test('inside is inside, outside is outside', () => {
    expect(pointInRing(square, P(5, 5))).toBe(true)
    expect(pointInRing(square, P(15, 5))).toBe(false)
  })

  test('a point on the edge is not inside', () => {
    expect(pointInRing(square, P(0, 5))).toBe(false)
    expect(pointInRing(square, P(10, 10))).toBe(false)
  })
})

describe('resolveEndpoint', () => {
  const square = [P(0, 0), P(100, 0), P(100, 100), P(0, 100)]

  test('a click near a vertex snaps to that vertex', () => {
    const r = resolveEndpoint(square, P(100.04, 0.03))
    expect(r.kind).toBe('vertex')
    expect(r.index).toBe(1)
    expect(r.point).toEqual(P(100, 0))
  })

  test('a click near an edge lands exactly on that edge', () => {
    const r = resolveEndpoint(square, P(40, 0.07))
    expect(r.kind).toBe('edge')
    expect(r.index).toBe(0)          // the edge from vertex 0 to vertex 1
    expect(r.point).toEqual(P(40, 0))
  })

  test('the landed point is rounded to 2 dp, once, here', () => {
    const r = resolveEndpoint(square, P(33.333333, 0.004))
    expect(r.point).toEqual(P(33.33, 0))
  })

  test('a vertex exactly at the tolerance snaps; just inside it does not', () => {
    // Decision 12 says "within 0.10 m", which this reads as inclusive. Pinning
    // that on 0.10 itself is not possible in binary -- 0.1 * 0.1 square-rooted
    // is 0.10000000000000002, so the literal boundary is unrepresentable. A
    // 3-4-5 triangle gives a distance of exactly 5 in integer arithmetic, so
    // passing the tolerance explicitly tests `<=` against `<` with no slack.
    expect(resolveEndpoint(square, P(3, 4), 5).kind).toBe('vertex')
    expect(resolveEndpoint(square, P(3, 4), 5).index).toBe(0)

    const outside = resolveEndpoint(square, P(3, 4), 4.99)
    expect(outside.kind).toBe('edge')
    expect(outside.index).toBe(3)            // the edge from vertex 3 back to 0
    expect(outside.point).toEqual(P(0, 4))
  })

  test('a snapped vertex keeps its own coordinate, unrounded', () => {
    // Snapping REUSES an existing beacon; it does not create a point. Decision
    // 13's rounding is for points the cut invents. Rounding a surveyed vertex
    // here would state it to 2 dp in the part rings while the Coordinate List
    // states it to 3 -- the disagreement that rounding once exists to prevent.
    // Task 6 puts this very object into the part ring, so a rounded copy would
    // also sit beside the walk's unrounded original for the same beacon.
    const surveyed = [P(0, 0), P(100.004, 0.007), P(100, 100), P(0, 100)]
    const r = resolveEndpoint(surveyed, P(100.01, 0.01))

    expect(r.kind).toBe('vertex')
    expect(r.index).toBe(1)
    expect(r.point).toEqual(P(100.004, 0.007))
  })

  test('a click well inside still resolves to the nearest boundary', () => {
    // The tool should not let this happen, but the rule must be total.
    const r = resolveEndpoint(square, P(50, 20))
    expect(r.kind).toBe('edge')
    expect(r.point).toEqual(P(50, 0))
  })
})

describe('interiorStaysInside', () => {
  const square = [P(0, 0), P(100, 0), P(100, 100), P(0, 100)]

  test('a straight chord across the middle is fine', () => {
    expect(interiorStaysInside(square, [P(0, 50), P(100, 50)]).ok).toBe(true)
  })

  test('a bent cut following a road is fine', () => {
    const cut = [P(0, 50), P(40, 50), P(40, 70), P(100, 70)]
    expect(interiorStaysInside(square, cut).ok).toBe(true)
  })

  test('a cut that wanders outside is refused', () => {
    const cut = [P(0, 50), P(50, 150), P(100, 50)]
    const r = interiorStaysInside(square, cut)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('vertex-outside')
    expect(r.at).toEqual(P(50, 150))
  })

  // Every test above uses the convex square, and on a convex ring an interior
  // segment CANNOT reach the boundary: a chord between two strictly-interior
  // points stays strictly inside. So none of them reaches the 'edge-crosses'
  // branch -- the whole second loop can be deleted and they all still pass.
  // Verified by deleting it. These two use a ring with a notch in it, which is
  // what a real outside figure looks like where a road reserve bites into it.
  describe('on a ring with a notch, where an interior segment CAN reach an edge', () => {
    // A square with a slot cut down from the x = 100 side, between y = 40 and
    // y = 60, reaching x = 40. The slot is OUTSIDE the figure.
    const notched = [
      P(0, 0), P(100, 0), P(100, 100), P(60, 100),
      P(60, 40), P(40, 40), P(40, 100), P(0, 100),
    ]

    test('an interior segment crossing the notch is refused as edge-crosses', () => {
      // Both interior vertices sit in the body, clear of the slot's y band, so
      // the vertex loop passes them and only the middle SEGMENT offends: at
      // x = 60 it runs straight through the slot, cutting both its walls.
      const cut = [P(10, 0), P(10, 60), P(90, 60), P(90, 0)]

      expect(pointInRing(notched, P(10, 60))).toBe(true)
      expect(pointInRing(notched, P(90, 60))).toBe(true)

      const r = interiorStaysInside(notched, cut)
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('edge-crosses')
    })

    test('the same cut kept below the notch is fine', () => {
      // Identical shape, run at x = 20 instead of x = 60 -- under the slot's
      // floor, so it never meets a wall. This is what stops the test above from
      // merely proving that a notched ring refuses everything.
      const cut = [P(10, 0), P(10, 20), P(90, 20), P(90, 0)]

      expect(interiorStaysInside(notched, cut)).toEqual({ ok: true })
    })
  })

  test('a cut that leaves and re-enters is refused even with both ends on the ring', () => {
    // Four crossings, not two: it would cut the figure into three parts.
    const cut = [P(0, 50), P(50, -10), P(100, 50)]
    expect(interiorStaysInside(square, cut).ok).toBe(false)
  })
})

describe('standsCrossedBy', () => {
  const box = (y0, x0, y1, x1) => [P(y0, x0), P(y1, x0), P(y1, x1), P(y0, x1)]
  const stands = [
    { name: '1686', ring: box(0, 0, 10, 10) },
    { name: '1687', ring: box(20, 0, 30, 10) },
    { name: 'Road', ring: box(10, 0, 20, 10), isPublicPlace: true },
  ]

  test('a cut down the road slices nothing', () => {
    expect(standsCrossedBy([P(0, 15), P(40, 15)], stands)).toEqual([])
  })

  test('a cut through a stand names it', () => {
    expect(standsCrossedBy([P(5, -5), P(5, 15)], stands)).toEqual(['1686'])
  })

  test('a cut through several names them all, in order', () => {
    expect(standsCrossedBy([P(-5, 5), P(40, 5)], stands)).toEqual(['1686', '1687'])
  })

  test('the road it runs through is never named, exempt by rule', () => {
    const through = standsCrossedBy([P(12, -5), P(18, 15)], stands)
    expect(through).not.toContain('Road')
  })

  test('a cut lying wholly inside one stand still names it', () => {
    expect(standsCrossedBy([P(2, 2), P(8, 8)], stands)).toEqual(['1686'])
  })

  // Defect A: the test above proves nothing -- `not.toContain` is satisfied by
  // an empty array, so it never shows the exemption doing any work. This pair
  // isolates the isPublicPlace flag as the ONLY variable between two calls of
  // the same cut against the same stand geometry. Only the exemption can
  // explain a different outcome between them.
  test('exemption actually does something: only the isPublicPlace flag changes the outcome', () => {
    const cut = [P(12, -5), P(18, 15)]
    const others = [
      { name: '1686', ring: box(0, 0, 10, 10) },
      { name: '1687', ring: box(20, 0, 30, 10) },
    ]
    const roadExempt = { name: 'Road', ring: box(10, 0, 20, 10), isPublicPlace: true }
    const roadNotExempt = { name: 'Road', ring: box(10, 0, 20, 10) }

    expect(standsCrossedBy(cut, [...others, roadExempt])).not.toContain('Road')
    expect(standsCrossedBy(cut, [...others, roadNotExempt])).toContain('Road')
  })

  // Defect B: 'a cut down the road slices nothing' above runs at x = 15, but
  // every stand's box spans only x 0..10 -- that cut sits outside all of them
  // and tests nothing about roads. This cut runs genuinely ALONG the road's
  // interior: Road's box is box(10, 0, 20, 10), i.e. y 10..20, x 0..10.
  // P(12, 2) -> P(18, 8) keeps y in (10, 20) and x in (0, 10) throughout, so
  // it is strictly inside Road and nowhere near 1686 (y 0..10) or 1687
  // (y 20..30) -- only the exemption keeps the result empty.
  test('a cut running along the interior of the road slices nothing', () => {
    expect(standsCrossedBy([P(12, 2), P(18, 8)], stands)).toEqual([])
  })

  test('names them in the order the stands were given, not the order the cut meets them', () => {
    // The fixture is already sorted low-y to high-y, and every other test runs
    // the cut the same way, so encounter order and input order agree and a
    // mutant that sorted by position along the cut would pass unnoticed. This
    // one runs the cut BACKWARDS, high-y to low-y, so it meets 1687 first.
    expect(standsCrossedBy([P(40, 5), P(-5, 5)], stands)).toEqual(['1686', '1687'])
  })

  test('a stand whose ring cannot be read is named, not quietly passed over', () => {
    // This rule exists to refuse. "We could not check this stand" must not come
    // back looking like "we checked it and it is clear", so an unusable ring is
    // named and the split is refused until the data is fixed.
    const clear = [P(0, 15), P(40, 15)]          // misses every real stand

    expect(standsCrossedBy(clear, [{ name: 'NoRing' }])).toEqual(['NoRing'])
    expect(standsCrossedBy(clear, [{ name: 'NullRing', ring: null }])).toEqual(['NullRing'])
    expect(standsCrossedBy(clear, [{ name: 'TwoPoints', ring: [P(0, 0), P(1, 1)] }]))
      .toEqual(['TwoPoints'])
  })

  test('only a real boolean exempts a stand, so a stringy flag cannot fail open', () => {
    // A CSV import that yields "false" would be truthy and would have exempted
    // a genuine stand -- a sliced stand reaching the Surveyor-General with no
    // warning. The strict check fails closed instead.
    const through = [P(12, -5), P(18, 15)]
    const road = (flag) => [{ name: 'Road', ring: box(10, 0, 20, 10), isPublicPlace: flag }]

    expect(standsCrossedBy(through, road(true))).toEqual([])
    expect(standsCrossedBy(through, road('false'))).toEqual(['Road'])
    expect(standsCrossedBy(through, road(1))).toEqual(['Road'])
  })

  test('a stand merely enclosed by a loop in the cut is NOT named, on purpose', () => {
    // A review read this as a detection gap. It is not one. The stand sits
    // wholly inside the loop, so it lands wholly in one part and is not sliced
    // -- naming it would refuse a split that slices nothing. Such a cut is
    // invalid for a different reason (it self-intersects, which splitFigure's
    // ring walk cannot represent), and that is not this rule's business.
    //
    // Do not "fix" this by winding-number testing the loop. The two checks are
    // exhaustive for a path ENTERING a stand: a connected path cannot reach an
    // interior without crossing the boundary.
    const loop = [P(0, 50), P(50, 0), P(100, 50), P(50, 100), P(0, 50)]
    const enclosed = [{ name: 'Enclosed', ring: box(45, 45, 55, 55) }]

    // Prove the fixture is what it claims before asserting on it: the stand's
    // centre really is inside the loop, so this is a genuine enclosure and not
    // a cut that simply misses the stand somewhere else on the sheet.
    expect(pointInRing(loop.slice(0, 4), P(50, 50))).toBe(true)

    expect(standsCrossedBy(loop, enclosed)).toEqual([])
  })
})
