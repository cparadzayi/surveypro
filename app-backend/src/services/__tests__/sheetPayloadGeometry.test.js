/**
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js sheetPayloadGeometry
 *
 * sheetPayloadGeometry is the translation both renderers call in, and it had no
 * test of its own. That is how a whole schedule of areas went blank without
 * anything going red: the failure was not in the renderer (it reads
 * `parcel.properties.area_m2` correctly) and not in buildSheetPayloads (its
 * test asserts the area travels), but in a call site that handed the payload
 * name + ring and nothing else. The contract that broke is the one asserted
 * here -- a payload parcel's own fields reach the GeoJSON properties.
 */
import { describe, test, expect } from '@jest/globals'
import { sheetParcels, sheetOutsideFigure, sheetSheetInfo, closeLoRing } from '../sheetPayloadGeometry.js'

const P = (y, x) => ({ y, x })
const box = (y0, x0, y1, x1) => [P(y0, x0), P(y1, x0), P(y1, x1), P(y0, x1)]

describe('sheetParcels', () => {
  test("carries the payload parcel's own fields into properties", () => {
    const fc = sheetParcels({
      ring: box(0, 0, 100, 100),
      stands: ['1686'],
      parcels: [{
        name: '1686',
        ring: box(10, 10, 40, 40),
        stand: '1686',
        area_m2: 1234.56,
        area_ha: '0.1235',
        description: 'Residential',
        id: 42,
      }],
    })

    expect(fc.features).toHaveLength(1)
    const props = fc.features[0].properties
    // The schedule of areas draws this column, and it was blank because the
    // field never arrived.
    expect(props.area_m2).toBe(1234.56)
    expect(props.area_ha).toBe('0.1235')
    expect(props.description).toBe('Residential')
    expect(props.id).toBe(42)
    // `name` is the payload's stand label; it wins the stand column.
    expect(props.stand).toBe('1686')
  })

  test('uses each parcel own ring as its geometry, not the sheet ring', () => {
    const fc = sheetParcels({
      ring: box(0, 0, 100, 100),
      parcels: [{ name: '1686', ring: box(10, 10, 40, 40) }],
    })
    // GeoJSON is [y, x] and closed.
    expect(fc.features[0].geometry.coordinates[0][0]).toEqual([10, 10])
    expect(fc.features[0].geometry.coordinates[0].at(-1)).toEqual([10, 10])
  })

  test('falls back to stand names when a payload carries no parcels', () => {
    const fc = sheetParcels({ ring: box(0, 0, 100, 100), stands: ['1', '2'] })
    expect(fc.features.map((f) => f.properties.stand)).toEqual(['1', '2'])
  })

  test('an empty stands list yields an empty collection, not a crash', () => {
    expect(sheetParcels({ ring: box(0, 0, 100, 100), stands: [] }).features).toEqual([])
  })
})

describe('closeLoRing', () => {
  test('closes an open ring and leaves a closed one alone', () => {
    expect(closeLoRing([P(0, 0), P(0, 10), P(10, 10)])).toHaveLength(4)
    const closed = [P(0, 0), P(0, 10), P(10, 10), P(0, 0)]
    expect(closeLoRing(closed)).toHaveLength(4)
  })
})

describe('sheetOutsideFigure', () => {
  test("is one unlabelled feature on the sheet's own ring", () => {
    const fc = sheetOutsideFigure({ ring: box(0, 0, 100, 50) })
    expect(fc.features).toHaveLength(1)
    // No properties: a divided part has its own beacon sequence, so the title
    // block must not be handed the whole plan's.
    expect(fc.features[0].properties).toEqual({})
  })
})

describe('sheetSheetInfo', () => {
  test('passes the payload own numbering through unchanged', () => {
    const info = sheetSheetInfo({
      sheetNumber: 2, totalSheets: 3, figureLabel: 'Outside Figure Sheet 2',
      otherSheets: 'Sheets 1 and 3', standRange: '1–9', totalStandCount: 9,
    })
    expect(info.sheetNumber).toBe(2)
    expect(info.totalSheets).toBe(3)
  })
})
