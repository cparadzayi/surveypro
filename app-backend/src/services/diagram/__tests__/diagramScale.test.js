import { describe, test, expect } from '@jest/globals'
import { parcelExtent, pickDiagramScale, makeTransform } from '../diagramScale.js'

const square = { geometry: { type: 'Polygon', coordinates: [[
  [0, 0], [0, 100], [100, 100], [100, 0], [0, 0],
]] } }
const figure = { x: 0, y: 0, width: 400, height: 400 } // pt

describe('parcelExtent', () => {
  test('computes bounds and metre spans', () => {
    const e = parcelExtent(square)
    expect(e).toMatchObject({ minY: 0, maxY: 100, minX: 0, maxX: 100, widthM: 100, heightM: 100 })
  })
})

describe('pickDiagramScale', () => {
  test('honours an explicit 1:N request', () => {
    expect(pickDiagramScale(parcelExtent(square), figure, '1:500')).toEqual({ denom: 500, label: '1:500' })
  })
  test('auto picks a denominator that fits the figure area', () => {
    const r = pickDiagramScale(parcelExtent(square), figure, 'auto')
    // 100 m at 1:500 → 0.2 m/pt-scale → 100/500*1000/25.4*72 ≈ 566 pt > 400, so 500 too big;
    // 1:750 → ~378 pt fits 400 → expect denom >= 750
    expect(r.denom).toBeGreaterThanOrEqual(750)
    expect(r.label).toBe(`1:${r.denom}`)
  })
})

describe('makeTransform', () => {
  test('maps extent corners inside the figure rect', () => {
    const e = parcelExtent(square)
    const r = pickDiagramScale(e, figure, 'auto')
    const tf = makeTransform(e, figure, r.denom)
    const p = tf([0, 0])
    expect(p.px).toBeGreaterThanOrEqual(figure.x)
    expect(p.px).toBeLessThanOrEqual(figure.x + figure.width)
    expect(p.py).toBeGreaterThanOrEqual(figure.y)
    expect(p.py).toBeLessThanOrEqual(figure.y + figure.height)
  })
})
