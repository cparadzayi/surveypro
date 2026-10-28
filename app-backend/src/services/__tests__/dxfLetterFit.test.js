import { describe, test, expect } from '@jest/globals'
import { fitDxfSuffixLetter, ptPerMetre } from '../dxfLetterFit.js'
import { inkCentre, ringSegments } from '../dxfLabelMetrics.js'
import { rotatedBoxClear } from '../pdfkitGeoPDF/beaconClusterInset.js'
import { isPointInPolygon } from '../dxfGeometry.js'

// All in DXF ground metres, y up, at 1:500. A 6.5 pt cap height is 1.15 m on the ground there.
const S = 500
const CAP = (6.5 * 25.4 / 72) * S / 1000
const R = 0.4

const square = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }]
const fit = (o) => fitDxfSuffixLetter({ text: 'A', capHeight: CAP, beaconRadius: R, scaleDenominator: S, ...o })

/** The fitted letter as the metrics module sees it: ink box centre, size, turn. */
const asLabel = (f, text = 'A') => ({ x: f.x, y: f.y, width: f.width, capHeight: f.capHeight, rot: f.rot, text })

describe('ptPerMetre', () => {
  test('1 m on the ground is 1000/S mm of paper', () => {
    expect(ptPerMetre(1000)).toBeCloseTo(72 / 25.4, 9)
    expect(ptPerMetre(500)).toBeCloseTo(2 * 72 / 25.4, 9)
  })
})

describe('fitDxfSuffixLetter', () => {
  test('at a corner the letter sits inside the stand, clear of both lines and of the beacon circle', () => {
    for (const beacon of [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }]) {
      const f = fit({ beaconPos: beacon, polygon: square })
      const c = inkCentre(asLabel(f))
      expect(isPointInPolygon(c, square)).toBe(true)
      expect(rotatedBoxClear(c.x, c.y, f.width, f.capHeight, f.rot, ringSegments(square), 0)).toBe(true)
      expect(Math.hypot(c.x - beacon.x, c.y - beacon.y)).toBeLessThan(5) // beside the beacon, not across the stand
      expect(f.fitted).toBe(true)
      expect(f.cramped).toBe(false)
    }
  })

  test('is deterministic, level in open ground, and full size', () => {
    const a = fit({ beaconPos: { x: 0, y: 0 }, polygon: square })
    expect(a).toEqual(fit({ beaconPos: { x: 0, y: 0 }, polygon: square }))
    expect(a.rot).toBe(0)
    expect(a.capHeight).toBeCloseTo(CAP, 6)
  })

  test('the insertion point is the ink box baseline-left corner (the DXF TEXT convention)', () => {
    const f = fit({ beaconPos: { x: 0, y: 0 }, polygon: square })
    // level: ink centre = insertion + (width/2, cap/2)
    const c = inkCentre(asLabel(f))
    expect(c.x).toBeCloseTo(f.x + f.width / 2, 9)
    expect(c.y).toBeCloseTo(f.y + f.capHeight / 2, 9)
  })

  test('a sliver of a stand makes the letter turn to lie along it, and the turn is the right way round', () => {
    // A strip 0.9 m wide running up and to the right at 45 degrees. Level, the 1.15 m letter cannot fit;
    // it has to be turned, and turned the way that clears BOTH long sides in the DXF's y-up frame.
    const w = 0.9, len = 14, a = Math.PI / 4
    const u = { x: Math.cos(a), y: Math.sin(a) }, n = { x: -Math.sin(a), y: Math.cos(a) }
    const strip = [
      { x: 0, y: 0 },
      { x: u.x * len, y: u.y * len },
      { x: u.x * len + n.x * w, y: u.y * len + n.y * w },
      { x: n.x * w, y: n.y * w },
    ]
    const f = fit({ beaconPos: strip[0], polygon: strip })
    expect(f.rot).not.toBe(0)
    const c = inkCentre(asLabel(f))
    // if the sign of the turn were wrong the box would cut across the strip's sides
    expect(rotatedBoxClear(c.x, c.y, f.width, f.capHeight, f.rot, ringSegments(strip), 0)).toBe(true)
    expect(isPointInPolygon(c, strip)).toBe(true)
  })

  test('letters already placed are avoided', () => {
    const first = fit({ beaconPos: { x: 0, y: 0 }, polygon: square })
    const box = { x: first.x - 0.1, y: first.y - 0.1, width: first.width + 0.2, height: first.capHeight + 0.2 }
    const overlaps = (r) => r.x < box.x + box.width && box.x < r.x + r.width && r.y < box.y + box.height && box.y < r.y + r.height
    const second = fit({ beaconPos: { x: 0, y: 0 }, polygon: square, collides: overlaps })
    const b = inkCentre(asLabel(second))
    const noOverlap = !(b.x - second.width / 2 < box.x + box.width && box.x < b.x + second.width / 2 && b.y - second.capHeight / 2 < box.y + box.height && box.y < b.y + second.capHeight / 2)
    expect(noOverlap).toBe(true)
  })

  test('a stand too small for the smallest letter still gets one, and says it is cramped', () => {
    const tiny = [{ x: 0, y: 0 }, { x: 0.8, y: 0 }, { x: 0.8, y: 0.8 }, { x: 0, y: 0.8 }]
    const f = fit({ beaconPos: { x: 0, y: 0 }, polygon: tiny })
    expect(f.cramped).toBe(true)
    expect(Number.isFinite(f.x) && Number.isFinite(f.y)).toBe(true)
  })

  test('works at other scales: the letter is the same size on paper', () => {
    const f1000 = fitDxfSuffixLetter({
      beaconPos: { x: 0, y: 0 }, polygon: square.map((p) => ({ x: p.x * 2, y: p.y * 2 })), text: 'A',
      capHeight: CAP * 2, beaconRadius: R * 2, scaleDenominator: 1000,
    })
    expect(f1000.capHeight).toBeCloseTo(CAP * 2, 6)
  })
})
