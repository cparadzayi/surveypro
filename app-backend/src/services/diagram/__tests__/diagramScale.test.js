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
  test('honours an explicit 1:N request', () => {
    expect(pickDiagramScale(parcelExtent(squareStored), figure, '1:500')).toEqual({ denom: 500, label: '1:500' })
  })
  test('auto picks a denominator that fits the figure area', () => {
    const r = pickDiagramScale(parcelExtent(squareStored), figure, 'auto')
    expect(r.denom).toBeGreaterThanOrEqual(750)
    expect(r.label).toBe(`1:${r.denom}`)
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
