/**
 * app-shared/sheetDerivation.js -- what each sheet states about itself.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js sheetDerivation-shared
 */
import { describe, test, expect } from '@jest/globals'
import { centroid, orderSheets, assignStands, vertexLetter, letterPart, figureLabel, otherSheetsPhrase, standRange } from '../../../../app-shared/sheetDerivation.js'

const P = (y, x) => ({ y, x })
/** An open box from (y0,x0) to (y1,x1), in ring order. */
const box = (y0, x0, y1, x1) => [P(y0, x0), P(y1, x0), P(y1, x1), P(y0, x1)]

describe('centroid', () => {
  test('finds the middle of a square', () => {
    const c = centroid(box(0, 0, 100, 100))
    expect(c.y).toBeCloseTo(50, 9)
    expect(c.x).toBeCloseTo(50, 9)
  })

  test('keeps easting and southing apart', () => {
    // Both other fixtures are diagonally symmetric, so a centroid that
    // accumulated the easting terms into the southing accumulator and vice versa
    // would pass them unchanged. This rectangle is wider than it is tall, so the
    // two coordinates cannot be swapped without the test noticing -- and Task 2
    // consumes centroid, so a silent axis swap here would travel.
    const wide = box(0, 0, 100, 20)
    const c = centroid(wide)
    expect(c.y).toBeCloseTo(50, 9)
    expect(c.x).toBeCloseTo(10, 9)
  })

  test('is area-weighted, not the mean of the vertices', () => {
    // An L-shape. The vertex mean and the area centroid differ, and only the
    // area centroid is inside the figure.
    const L = [P(0, 0), P(90, 0), P(90, 30), P(30, 30), P(30, 90), P(0, 90)]
    const c = centroid(L)
    const vertexMeanY = (0 + 90 + 90 + 30 + 30 + 0) / 6
    expect(c.y).not.toBeCloseTo(vertexMeanY, 3)
  })
})

describe('orderSheets', () => {
  test('a single part is sheet 1', () => {
    expect(orderSheets([box(0, 0, 100, 100)])).toEqual([1])
  })

  test('runs north to south', () => {
    // x is southing, so the smaller x is further north.
    const north = box(0, 0, 100, 50)
    const south = box(0, 50, 100, 100)
    expect(orderSheets([south, north])).toEqual([2, 1])
  })

  test('runs west to east when two parts share a southing', () => {
    // Equal centroid southings, so the secondary key decides; y is easting, so
    // the smaller y is west.
    const west = box(0, 0, 50, 100)
    const east = box(50, 0, 100, 100)
    expect(orderSheets([east, west])).toEqual([2, 1])
  })

  test('reads a grid row by row: north row west to east, then south row', () => {
    // Two rows of two, handed over scrambled. This is the test a plain
    // lexicographic sort fails.
    const nw = box(0, 0, 50, 50)
    const ne = box(50, 0, 100, 50)
    const sw = box(0, 50, 50, 100)
    const se = box(50, 50, 100, 100)
    expect(orderSheets([se, nw, sw, ne])).toEqual([4, 1, 3, 2])
  })

  test('every part gets exactly one number, and they are 1..n', () => {
    const parts = [box(0, 0, 40, 40), box(40, 0, 80, 40), box(0, 40, 40, 80)]
    const order = orderSheets(parts)
    expect([...order].sort()).toEqual([1, 2, 3])
  })

  test('the part whose middle lies further north comes first, even if it is east', () => {
    // This test was the other way round while orderSheets grouped parts into
    // bands of overlapping southing range. That rule chained two disjoint rows
    // into one band whenever a part spanned both, and interleaved them, so it
    // was replaced by the two-key centroid sort Decision 10 actually describes.
    // Under it, southing is the PRIMARY key: east's middle is 30 m further north
    // than west's, so east is sheet 1. A part whose middle lies further north is
    // further north.
    const west = box(0, 0, 50, 80)    // centroid (25, 40)
    const east = box(50, 0, 100, 20)  // centroid (75, 10)

    expect(orderSheets([west, east])).toEqual([2, 1])
  })

  test('a part spanning two rows never interleaves them', () => {
    // The defect that retired the banding rule. `bridge` spans the whole
    // southing extent, and the two rows it spans do not overlap each other at
    // all -- yet banding chained them and numbered the plan north-west,
    // SOUTH-west, north-east, south-east. Ordinary geometry: one wide part
    // beside two stacked narrower ones.
    const west1 = box(0, 0, 20, 20)
    const east1 = box(30, 0, 50, 20)
    const west2 = box(0, 80, 20, 100)
    const east2 = box(30, 80, 50, 100)
    const bridge = box(0, 60, 100, 80)
    const parts = [west1, east1, west2, east2, bridge]

    const order = orderSheets(parts)
    // The sequence must run monotonically north to south: no sheet may sit
    // further north than the sheet before it.
    const southings = order
      .map((sheet, i) => ({ sheet, x: centroid(parts[i]).x }))
      .sort((a, b) => a.sheet - b.sheet)
      .map((s) => s.x)

    expect(southings).toEqual([...southings].sort((a, b) => a - b))
  })
})

describe('assignStands', () => {
  const west = box(0, 0, 50, 100)
  const east = box(50, 0, 100, 100)
  const parts = [west, east]
  const stand = (name, y0, x0, y1, x1, extra = {}) =>
    ({ name, ring: box(y0, x0, y1, x1), ...extra })

  test('puts each stand on the part that holds it', () => {
    const r = assignStands(parts, [
      stand('1686', 10, 10, 20, 20),
      stand('1687', 60, 10, 70, 20),
    ])
    expect(r).toEqual({ ok: true, bySheet: [['1686'], ['1687']] })
  })

  test('keeps the order the stands were given', () => {
    const r = assignStands(parts, [
      stand('1687', 30, 10, 40, 20),
      stand('1686', 10, 10, 20, 20),
    ])
    expect(r.bySheet[0]).toEqual(['1687', '1686'])
  })

  test('refuses a stand no part holds, naming it', () => {
    const r = assignStands(parts, [stand('9999', 200, 200, 210, 210)])
    expect(r).toEqual({ ok: false, error: 'stand-off-plan', stands: ['9999'] })
  })

  test('refuses a stand two parts hold, naming it', () => {
    // A stand spanning the cut. standsCrossedBy refuses such a cut, so reaching
    // this means an earlier rule failed -- which is why it is caught rather than
    // resolved by picking a side.
    const r = assignStands(parts, [stand('1690', 40, 10, 60, 20)])
    expect(r).toEqual({ ok: false, error: 'stand-straddles-sheets', stands: ['1690'] })
  })

  test('names every unplaceable stand, not just the first', () => {
    const r = assignStands(parts, [
      stand('9998', 200, 200, 210, 210),
      stand('1686', 10, 10, 20, 20),
      stand('9999', 300, 300, 310, 310),
    ])
    expect(r.ok).toBe(false)
    expect(r.stands).toEqual(['9998', '9999'])
  })

  test('a digitised road spanning the cut is exempt, not a straddle', () => {
    // The case the whole sub-project exists for: the cut runs DOWN a road, so the
    // road spans both sheets by design. figureSplit's standsCrossedBy exempts a
    // public place unconditionally; this function used to exempt one only when its
    // ring was ABSENT, so the moment roads were digitised the two rules
    // contradicted each other -- the split was accepted and then the road it ran
    // along was refused as straddling.
    const road = { name: 'Road', isPublicPlace: true, ring: box(48, 10, 52, 90) }

    expect(assignStands(parts, [road])).toEqual({ ok: true, bySheet: [[], []] })
  })

  test('a public place carries no schedule row, so it is not in bySheet', () => {
    // The Seventh Schedule sentence describes public places collectively, not one
    // row each, so a road must not appear among a sheet's stands.
    const road = { name: 'Road', isPublicPlace: true, ring: box(10, 10, 20, 20) }
    const r = assignStands(parts, [stand('1686', 30, 10, 40, 20), road])

    expect(r.ok).toBe(true)
    expect(r.bySheet.flat()).toEqual(['1686'])
  })

  test('a stand covering a whole part, but reaching past it, belongs to that part', () => {
    // It has no vertex strictly inside the part and shares three boundary lines
    // with it, so a vertex-and-centroid test found nothing and refused it as
    // missing from the plan -- a valid survey rejected. The part's own centroid
    // lying inside the stand is what catches containment.
    const covering = { name: 'COVER', ring: box(0, -400, 50, 100) }

    expect(assignStands(parts, [covering])).toEqual({ ok: true, bySheet: [['COVER'], []] })
  })

  test('two stands abutting the cut from opposite sides are not straddles', () => {
    // The normal cadastral case, since a cut follows the road reserve between
    // stands: their boundaries lie exactly ON the cut. Counting a shared boundary
    // as shared area refuses both -- which is every real split.
    const west = stand('W', 40, 10, 50, 20)
    const east = stand('E', 50, 10, 60, 20)

    expect(assignStands(parts, [west, east]))
      .toEqual({ ok: true, bySheet: [['W'], ['E']] })
  })

  test('a mixed refusal reports the more serious kind, whichever came first', () => {
    // A straddling stand is lodged twice with its area counted twice; an off-plan
    // stand is merely absent. Reporting by the first offender told a surveyor to
    // hunt for missing geometry when the real fault was a cut needing to move.
    const offPlan = stand('OFF', 500, 500, 510, 510)
    const straddler = stand('STRAD', 40, 10, 60, 20)

    for (const order of [[offPlan, straddler], [straddler, offPlan]]) {
      const r = assignStands(parts, order)
      expect(r.error).toBe('stand-straddles-sheets')
      expect([...r.stands].sort()).toEqual(['OFF', 'STRAD'])
    }
  })

  test('an unplaceable public place is skipped, not refused', () => {
    // Roads are not digitised yet -- the same reason Decision 7 exempts them
    // from the straddle rule. Refusing would block every split in a township.
    const r = assignStands(parts, [
      stand('1686', 10, 10, 20, 20),
      { name: 'Road', isPublicPlace: true },
    ])
    expect(r).toEqual({ ok: true, bySheet: [['1686'], []] })
  })

  test('a non-public stand with no usable ring is still refused', () => {
    const r = assignStands(parts, [{ name: 'NoRing' }])
    expect(r).toEqual({ ok: false, error: 'stand-off-plan', stands: ['NoRing'] })
  })
})

describe('vertexLetter', () => {
  test('runs A to Z', () => {
    expect(vertexLetter(0)).toBe('A')
    expect(vertexLetter(25)).toBe('Z')
  })

  test('continues past Z instead of running into punctuation', () => {
    // String.fromCharCode(65 + 26) is '[', which is what the old fallback did.
    expect(vertexLetter(26)).toBe('AA')
    expect(vertexLetter(27)).toBe('AB')
    expect(vertexLetter(51)).toBe('AZ')
    expect(vertexLetter(52)).toBe('BA')
  })
})

describe('letterPart', () => {
  test('letters one part from A, by position', () => {
    expect(letterPart(box(0, 0, 10, 10))).toEqual(['A', 'B', 'C', 'D'])
  })

  test('letters each part from A independently, and touches no point', () => {
    // Spec Part 4: the SAME physical point carries a different letter on each
    // sheet. Both parts here hold the object `shared`.
    const shared = P(50, 0)
    const partA = [P(0, 0), shared, P(50, 100), P(0, 100)]
    const partB = [shared, P(100, 0), P(100, 100), P(50, 100)]

    expect(letterPart(partA)[1]).toBe('B')
    expect(letterPart(partB)[0]).toBe('A')
    // The point itself is untouched -- no letter written anywhere on it.
    expect(Object.keys(shared).sort()).toEqual(['x', 'y'])
  })
})

describe('figureLabel', () => {
  test('a single-sheet plan keeps the plain name', () => {
    expect(figureLabel(1, 1)).toBe('Outside Figure')
  })

  test('a multi-part plan names its sheet', () => {
    expect(figureLabel(2, 3)).toBe('Outside Figure Sheet 2')
  })

  test('both forms still satisfy the outside-figure predicate', () => {
    // parcelValidation.ts and designationParcels.ts recognise an outside figure
    // by that substring alone, so neither form changes a recognition rule.
    for (const label of [figureLabel(1, 1), figureLabel(2, 3)]) {
      expect(label.toLowerCase().includes('outside figure')).toBe(true)
    }
  })
})

describe('otherSheetsPhrase', () => {
  test('a single-sheet plan has no others', () => {
    expect(otherSheetsPhrase(1, 1)).toBe('')
  })

  test('names the one other sheet', () => {
    expect(otherSheetsPhrase(1, 2)).toBe('Sheet 2')
  })

  test('joins two others with "and"', () => {
    expect(otherSheetsPhrase(2, 3)).toBe('Sheets 1 and 3')
  })

  test('commas the rest and "and"s the last', () => {
    expect(otherSheetsPhrase(3, 5)).toBe('Sheets 1, 2, 4 and 5')
  })
})

describe('standRange', () => {
  test('states the numeric extremes', () => {
    expect(standRange(['1690', '1686', '1699'])).toBe('1686 to 1699')
  })

  test('a single stand is not a range', () => {
    expect(standRange(['1686'])).toBe('1686')
  })

  test('sorts as numbers, not as text', () => {
    // A string sort puts 1720 before 87, and 100 before 99.
    expect(standRange(['87', '1720', '100'])).toBe('87 to 1720')
  })

  test('one stand named twice is not a range', () => {
    // Used to read "1686 to 1686". A duplicate should not appear in a schedule at
    // all, but a sentence on a lodged plan should not be the thing that says so.
    expect(standRange(['1686', '1686'])).toBe('1686')
    expect(standRange(['1690', '1686', '1690'])).toBe('1686 to 1690')
  })

  test('a lettered stand ranges on its number', () => {
    expect(standRange(['2833A', '2469'])).toBe('2469 to 2833A')
  })
})
