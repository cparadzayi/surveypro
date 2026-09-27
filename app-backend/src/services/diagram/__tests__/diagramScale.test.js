import { describe, test, expect } from '@jest/globals'
import { parcelExtent, pickDiagramScale, makeTransform, beaconRadiusPt } from '../diagramScale.js'

// Realistic Cape Lo square stored as [Southing, Westing]; helpers normalize.
const squareStored = { geometry: { type: 'Polygon', coordinates: [[
  [2144000, 85000], [2144100, 85000], [2144100, 85100], [2144000, 85100], [2144000, 85000],
]] } }
const figure = { x: 0, y: 0, width: 400, height: 400 } // pt

describe('parcelExtent', () => {
  test('normalizes then computes bounds/spans as [Westing, Southing]', () => {
    const e = parcelExtent(squareStored)
    expect(e).toMatchObject({
      minY: 85000, maxY: 85100, minX: 2144000, maxX: 2144100, widthM: 100, heightM: 100,
    })
  })
})

describe('pickDiagramScale', () => {
  test('honours an explicit 1:N request that fits', () => {
    // 100 m at 1:1000 is 283 pt in a 400 pt box — a legal request, and the
    // surveyor gets exactly it.
    expect(pickDiagramScale(parcelExtent(squareStored), figure, '1:1000'))
      .toEqual({ denom: 1000, label: '1:1000' })
  })

  test('auto picks a denominator that fits the figure area', () => {
    const r = pickDiagramScale(parcelExtent(squareStored), figure, 'auto')
    expect(r.denom).toBeGreaterThanOrEqual(750)
    expect(r.label).toBe(`1:${r.denom}`)
  })

  // The original test here asserted that a 1:500 request was honoured verbatim.
  // 100 m at 1:500 is 567 pt drawn into a 400 pt box, and nothing in the diagram
  // path clips — so the drawing overran its box and printed over the scale bar,
  // which sits 6 pt under the box. That was the reported overlap, and this test
  // was pinning it in place as intended behaviour.
  test('escalates a request that does not fit, instead of overrunning the bar', () => {
    const r = pickDiagramScale(parcelExtent(squareStored), figure, '1:500')
    expect(r.denom).toBe(750)
    expect(r.escalatedFrom).toBe(500)
  })

  test('the escalated scale is the smallest rung that fits', () => {
    const e = parcelExtent(squareStored)
    const r = pickDiagramScale(e, figure, '1:500')
    const tf = makeTransform(e, figure, r.denom)
    expect(tf.overflows).toBe(false)
    // …and the next rung down would not have fitted, so it did not skip one.
    expect(makeTransform(e, figure, 600).drawW).toBeGreaterThan(figure.width)
  })

  test('escalation stops at the coarsest rung rather than leaving the sheet', () => {
    // 40 km is unplottable on a diagram; return the coarsest rung, not the
    // requested 1:500, which would run clean off the page.
    const huge = { widthM: 40000, heightM: 40000, minX: 0, maxX: 40000, minY: 0, maxY: 40000 }
    expect(pickDiagramScale(huge, figure, '1:500').denom).toBe(25000)
  })

  test('the figure never overruns the scale bar, whatever is requested', () => {
    // Brackenhurst as reported: 291 x 282 m at a requested 1:1000 on A4.
    const box = { x: 40, y: 300, width: 515, height: 380 }
    const barTop = box.y + box.height + 6
    const e = { widthM: 291, heightM: 282, minX: 0, maxX: 282, minY: 0, maxY: 291 }
    for (const req of ['1:500', '1:1000', '1:2000', undefined, 'auto']) {
      const { denom } = pickDiagramScale(e, box, req)
      const tf = makeTransform(e, box, denom)
      expect(tf.overflows).toBe(false)
      expect(tf.bottomPt).toBeLessThanOrEqual(barTop)
    }
  })
})

describe('beaconRadiusPt (page-relative, visible at print scale)', () => {
  test('stays within the diagram clamp [2.0, 3.5] pt across scales', () => {
    for (const denom of [100, 500, 5000, 50000, 1000000]) {
      const r = beaconRadiusPt(denom)
      expect(r).toBeGreaterThanOrEqual(2.0)
      expect(r).toBeLessThanOrEqual(3.5)
    }
  })
  test('grows weakly with the denominator (log-scaled)', () => {
    expect(beaconRadiusPt(5000)).toBeGreaterThanOrEqual(beaconRadiusPt(500))
  })
  test('tiny/invalid denominators floor at 2.0 pt', () => {
    expect(beaconRadiusPt(0)).toBeGreaterThanOrEqual(2.0)
    expect(beaconRadiusPt(1)).toBeGreaterThanOrEqual(2.0)
  })
})

describe('makeTransform (north-up, east-right)', () => {
  const e = parcelExtent(squareStored)
  const tf = makeTransform(e, figure, pickDiagramScale(e, figure, 'auto').denom)

  test('maps a point inside the figure rect (accepts stored [Southing,Westing])', () => {
    const p = tf([2144000, 85000]) // stored order; tf normalizes
    expect(p.px).toBeGreaterThanOrEqual(figure.x)
    expect(p.px).toBeLessThanOrEqual(figure.x + figure.width)
    expect(p.py).toBeGreaterThanOrEqual(figure.y)
    expect(p.py).toBeLessThanOrEqual(figure.y + figure.height)
  })

  test('east is to the right: a more-western point maps further left', () => {
    const west = tf([2144000, 85100]) // Westing 85100 (further west)
    const east = tf([2144000, 85000]) // Westing 85000 (further east)
    expect(west.px).toBeLessThan(east.px)
  })

  test('north is up: a more-northern point maps higher (smaller py)', () => {
    const north = tf([2144000, 85000]) // Southing 2144000 (further north)
    const south = tf([2144100, 85000]) // Southing 2144100 (further south)
    expect(north.py).toBeLessThan(south.py)
  })
})

describe('makeTransform reports the true extent of what it draws', () => {
  // The overrun was silent: the box does not clip, so nothing complained. These
  // are the numbers a caller needs to notice it, and the renderer logs a warning
  // off exactly them.
  test('a centred drawing reports its own box and its overflow flag', () => {
    const e = parcelExtent(squareStored)
    const over = makeTransform(e, { x: 0, y: 0, width: 100, height: 100 }, 500)
    expect(over.overflows).toBe(true)
    // Centred, so it overruns on BOTH sides — that is how it reached the bar.
    expect(over.topPt).toBeLessThan(0)
    expect(over.bottomPt).toBeGreaterThan(100)
  })

  test('a fitting drawing sits inside its box', () => {
    const e = parcelExtent(squareStored)
    const t = makeTransform(e, figure, 2000)
    expect(t.overflows).toBe(false)
    expect(t.topPt).toBeGreaterThanOrEqual(figure.y - 0.5)
    expect(t.bottomPt).toBeLessThanOrEqual(figure.y + figure.height + 0.5)
    expect(t.drawW).toBe(t.drawH)   // the fixture is a square
  })
})
