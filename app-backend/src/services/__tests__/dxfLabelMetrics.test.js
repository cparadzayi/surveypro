import { describe, test, expect } from '@jest/globals'
import { groundToPt, inkCentre, ringSegments, summariseDxfLabels } from '../dxfLabelMetrics.js'

// Two 20 x 20 m stands side by side, in DXF ground metres (y up).
const sq = (x0, y0, s = 20) => [{ x: x0, y: y0 }, { x: x0 + s, y: y0 }, { x: x0 + s, y: y0 + s }, { x: x0, y: y0 + s }]
const parcels = [{ stand: '1', ring: sq(0, 0) }, { stand: '2', ring: sq(20, 0) }]
const base = { scaleDenominator: 500, beaconRadius: 0.5, parcels, figure: [...sq(0, 0, 0).slice(0, 0), { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }] }

// a 1.2 x 3 m ink box with its baseline-left corner at (x, y)
const letter = (o) => ({ name: '1A', text: 'A', inside: true, standKey: '1', width: 1.2, capHeight: 3, rot: 0, beacon: { x: 0, y: 0 }, onFigure: false, ...o })

describe('geometry helpers', () => {
  test('ground metres to points: 1 m at 1:1000 is 1 mm of paper', () => {
    expect(groundToPt(1, 1000)).toBeCloseTo(72 / 25.4, 6)
    expect(groundToPt(3.5, 500)).toBeCloseTo(7 * 72 / 25.4, 6)
  })

  test('the ink centre of an unturned label is half a box up and along from its baseline-left point', () => {
    expect(inkCentre({ x: 10, y: 5, width: 2, capHeight: 4, rot: 0 })).toEqual({ x: 11, y: 7 })
  })

  test('turned a quarter-turn counter-clockwise, the box stands on its end and the centre moves with it', () => {
    const c = inkCentre({ x: 10, y: 5, width: 2, capHeight: 4, rot: 90 })
    expect(c.x).toBeCloseTo(8, 9) // up the page, to the LEFT of the insertion point
    expect(c.y).toBeCloseTo(6, 9)
  })

  test('ringSegments closes the ring', () => {
    expect(ringSegments(sq(0, 0))).toHaveLength(4)
  })
})

describe('summariseDxfLabels', () => {
  const run = (labels, extra = {}) => summariseDxfLabels({ ...base, labels, ...extra })

  test('a letter wholly inside its own stand, clear of every line, breaks nothing', () => {
    const s = run([letter({ x: 5, y: 5 })])
    expect(s.lettersOverLines).toEqual([])
    expect(s.lettersNotInOwnStand).toEqual([])
    expect(s.lettersInForeignStand).toEqual([])
  })

  test('a letter whose box crosses a boundary line is counted, even when its centre is inside', () => {
    const s = run([letter({ x: 19, y: 5 })]) // box 19..20.2 straddles x = 20; its centre (19.6) is still in stand 1
    expect(s.lettersOverLines).toEqual(['1A'])
    expect(s.lettersNotInOwnStand).toEqual([])
  })

  test('a letter whose centre is in a stand that is not its own is in a foreign stand', () => {
    const s = run([letter({ x: 25, y: 5 })])
    expect(s.lettersNotInOwnStand).toEqual(['1A'])
    expect(s.lettersInForeignStand).toEqual(['1A'])
  })

  test('a beacon name beside a figure corner is fine outside the figure and counted when over it', () => {
    const outside = { name: 'M1', text: 'M1', inside: false, standKey: null, width: 2, capHeight: 3, rot: 0, onFigure: true, beacon: { x: 0, y: 0 } }
    expect(run([{ ...outside, x: -4, y: -4 }]).figureNamesOverFigure).toEqual([])
    expect(run([{ ...outside, x: -1, y: 1 }]).figureNamesOverFigure).toEqual(['M1']) // box -1..1 crosses the figure edge x = 0
  })

  test('reports the smallest letter in points and how far letters sit from their beacons', () => {
    const s = run([letter({ x: 5, y: 5, capHeight: 3.5 }), letter({ name: '1B', x: 8, y: 8, capHeight: 3.5, beacon: { x: 0, y: 0 } })])
    expect(s.minLetterCapPt).toBeCloseTo(7 * 72 / 25.4, 6)
    expect(s.lettersMaxDist).toBeGreaterThan(5)
    expect(s.letterCount).toBe(2)
  })

  test('no letters: nothing to report, and no throw', () => {
    const s = run([])
    expect(s.letterCount).toBe(0)
    expect(s.minLetterCapPt).toBe(Infinity)
  })
})
