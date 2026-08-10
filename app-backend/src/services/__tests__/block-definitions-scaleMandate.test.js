import { describe, test, expect } from '@jest/globals'
import { resolveTownshipScaleMandate } from '../../../../app-shared/block-definitions.js'

function stand(areaM2, overrides = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
    properties: { stand: '1', area_m2: areaM2, ...overrides },
  }
}

describe('resolveTownshipScaleMandate', () => {
  test('majority of stands <=200m2 -> mandatory500 true', () => {
    const parcels = { features: [stand(150), stand(180), stand(500)] }
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(true)
  })

  test('majority of stands >200m2 -> mandatory500 false', () => {
    const parcels = { features: [stand(500), stand(600), stand(150)] }
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(false)
  })

  test('exact tie resolves to mandatory500 true', () => {
    const parcels = { features: [stand(150), stand(500)] }
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(true)
  })

  test('a stand exactly at the threshold counts as <=200m2', () => {
    const parcels = { features: [stand(200), stand(500)] }
    // one at-or-below (200), one above (500) -> tie -> mandatory
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(true)
  })

  test('Outside Figure parcels are excluded from the count', () => {
    const parcels = {
      features: [
        stand(999999, { isOutsideFigure: true }),
        stand(500),
        stand(600),
        stand(700),
      ],
    }
    // Without exclusion the huge Outside Figure area wouldn't change the
    // count either way here, but its presence must not throw or be counted
    // as a 4th "large" stand skewing an otherwise-3-stand majority.
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(false)
  })

  test('Outside Figure detected via metadata.isOutsideFigure', () => {
    const parcels = {
      features: [
        stand(50, { metadata: { isOutsideFigure: true } }),
        stand(500),
      ],
    }
    // Only the 500m2 stand counts -> no majority <=200 -> false
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(false)
  })

  test('Outside Figure detected via stand name text', () => {
    const parcels = {
      features: [
        stand(50, { stand: 'Outside Figure' }),
        stand(500),
      ],
    }
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(false)
  })

  test('missing area_m2 falls back to shoelace area from geometry', () => {
    // A 10m x 10m square (100m2, <=200) with no area_m2 property at all.
    const noAreaStand = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
      properties: { stand: '1' },
    }
    const largeStand = stand(500)
    const parcels = { features: [noAreaStand, largeStand] }
    // tie (100<=200, 500>200) -> mandatory true
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(true)
  })

  test('zero-area_m2 also falls back to shoelace (not treated as a valid 0)', () => {
    const zeroAreaStand = stand(0)
    // Same 10x10 geometry as `stand()` -> shoelace area is 100m2 (<=200)
    const parcels = { features: [zeroAreaStand] }
    expect(resolveTownshipScaleMandate(parcels).mandatory500).toBe(true)
  })

  test('no stands at all resolves to mandatory500 true (conservative default)', () => {
    expect(resolveTownshipScaleMandate({ features: [] }).mandatory500).toBe(true)
    expect(resolveTownshipScaleMandate(undefined).mandatory500).toBe(true)
  })

  test('custom thresholdM2 is respected', () => {
    const parcels = { features: [stand(300), stand(400)] }
    expect(resolveTownshipScaleMandate(parcels, 200).mandatory500).toBe(false)
    expect(resolveTownshipScaleMandate(parcels, 500).mandatory500).toBe(true)
  })
})
