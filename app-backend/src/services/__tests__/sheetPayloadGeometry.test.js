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
import {
  sheetParcels,
  selectSheetFeatures,
  sheetMetadata,
  sheetOutsideFigure,
  sheetSheetInfo,
  closeLoRing,
} from '../sheetPayloadGeometry.js'

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

/**
 * A sheet is the single-sheet plan restricted to its own stands. These assert
 * that the restriction happens by SELECTING the plan's own features, which is
 * the only way a sheet keeps the computed areas, edges, closure data and
 * metadata the single-sheet pass renders. Rebuilding parcels from the payload
 * instead is what produced a blank schedule and a missing servitude statement.
 */
describe('selectSheetFeatures', () => {
  const planParcel = (stand, extra = {}) => ({
    type: 'Feature',
    properties: { stand, area_m2: 500, ...extra },
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 10], [10, 10], [0, 0]]] },
  })
  const plan = { type: 'FeatureCollection', features: [planParcel('1686'), planParcel('1687')] }

  test("keeps the plan's own features, not ones rebuilt from the payload", () => {
    const selected = selectSheetFeatures(plan, {
      ring: box(0, 0, 100, 100),
      stands: ['1686'],
      // A bare payload: name + ring only, no areas, no computed data.
      parcels: [{ name: '1686', ring: box(10, 10, 40, 40) }],
    })

    expect(selected.features).toHaveLength(1)
    // The very object the single-sheet pass rendered, computed data intact.
    expect(selected.features[0]).toBe(plan.features[0])
    expect(selected.features[0].properties.area_m2).toBe(500)
  })

  test('gives each sheet only its own stands', () => {
    const sheet1 = selectSheetFeatures(plan, { ring: box(0, 0, 50, 100), stands: ['1686'] })
    const sheet2 = selectSheetFeatures(plan, { ring: box(50, 0, 100, 100), stands: ['1687'] })

    expect(sheet1.features.map((f) => f.properties.stand)).toEqual(['1686'])
    expect(sheet2.features.map((f) => f.properties.stand)).toEqual(['1687'])
  })

  test('matches a stand the plan spells by designation', () => {
    // The payload names a stand `designation || stand`; the plan's own features
    // carry `stand`. If those differ, a stand-only match drops the parcel.
    const byDesignation = {
      type: 'FeatureCollection',
      features: [planParcel('1686', { designation: 'Remainder of 1686', area_m2: 900 })],
    }
    const selected = selectSheetFeatures(byDesignation, {
      ring: box(0, 0, 100, 100),
      stands: ['Remainder of 1686'],
    })
    expect(selected.features).toHaveLength(1)
    expect(selected.features[0].properties.area_m2).toBe(900)
  })

  test('falls back to the payload when the plan carries no such stand', () => {
    // A public place, or a stand the plan collection does not carry: the sheet
    // must still draw it rather than render a blank page.
    const selected = selectSheetFeatures(plan, {
      ring: box(0, 0, 100, 100),
      stands: ['1686', 'Public Place'],
      parcels: [
        { name: '1686', ring: box(10, 10, 40, 40), area_m2: 1 },
        { name: 'Public Place', ring: box(50, 50, 60, 60), area_m2: 2 },
      ],
    })
    // The plan supplied 1686; the payload supplied the rest. One of each, no
    // duplicate 1686.
    expect(selected.features.map((f) => f.properties.stand)).toEqual(['1686', 'Public Place'])
  })

  test('falls back to the payload when no whole-plan collection was supplied', () => {
    const selected = selectSheetFeatures(null, {
      ring: box(0, 0, 100, 100),
      stands: ['1686'],
      parcels: [{ name: '1686', ring: box(10, 10, 40, 40), area_m2: 7 }],
    })
    expect(selected.features).toHaveLength(1)
    expect(selected.features[0].properties.area_m2).toBe(7)
  })
})

describe('sheetMetadata adjoining subjects', () => {
  const plan = {
    adjoiningSubjects: [
      { subjectId: 'stand', annotations: [] },
      { subjectId: 'of#sheet1', sheetNumber: 1, annotations: [] },
      { subjectId: 'of#sheet2', sheetNumber: 2, annotations: [] },
    ],
  }
  test('a sheet gets its own figure\'s subject and the untagged-sheet ones, not another sheet\'s', () => {
    const ids = (n) => sheetMetadata(plan, { sheetNumber: n }).adjoiningSubjects.map((s) => s.subjectId)
    expect(ids(1)).toEqual(['stand', 'of#sheet1'])
    expect(ids(2)).toEqual(['stand', 'of#sheet2'])
  })
  test('does not mutate the shared metadata', () => {
    sheetMetadata(plan, { sheetNumber: 1 })
    expect(plan.adjoiningSubjects).toHaveLength(3)
  })
  test('metadata without adjoiningSubjects is untouched', () => {
    expect(sheetMetadata({}, { sheetNumber: 1 }).adjoiningSubjects).toBeUndefined()
  })
})

describe('sheetMetadata', () => {
  const plan = { servitudeStatement: { rows: [{ stands: '1686', width: 3 }] }, other: 'kept' }

  test("states the sheet's own servitude rows when it has them", () => {
    const merged = sheetMetadata(plan, { servitudeRows: [{ stands: '1687', width: 2 }] })
    expect(merged.servitudeStatement.rows).toEqual([{ stands: '1687', width: 2 }])
    expect(merged.other).toBe('kept')
  })

  test("does not erase the plan's statement when the payloads carry no rows at all", () => {
    // The regression: no rows meant `{ rows: [] }`, so a sheet stated NO
    // servitude at all even though the plan had them. Worse than dropping the
    // per-sheet override -- it destroyed the whole-plan statement. When NO sheet
    // has rows the payloads did not compute them, so the plan's statement stays.
    expect(sheetMetadata(plan, {}).servitudeStatement.rows).toHaveLength(1)
    expect(sheetMetadata(plan, { servitudeRows: [] }).servitudeStatement.rows).toHaveLength(1)
    const none = [{ servitudeRows: [] }, { servitudeRows: [] }]
    expect(sheetMetadata(plan, none[0], none).servitudeStatement.rows).toHaveLength(1)
  })

  test('a sheet with none of the servitude stands states none when another sheet has them', () => {
    // The table belongs only on the sheet holding the parcels it describes. Sheet 2
    // has no servitude stands; sheet 1 does. Sheet 2 must not print the plan's table.
    const sheet1 = { servitudeRows: [{ stands: '1686', boundary: 'A - B' }] }
    const sheet2 = { servitudeRows: [] }
    const all = [sheet1, sheet2]
    expect(sheetMetadata(plan, sheet1, all).servitudeStatement.rows).toEqual(sheet1.servitudeRows)
    expect(sheetMetadata(plan, sheet2, all).servitudeStatement.rows).toEqual([])
    expect(sheetMetadata(plan, sheet2, all).other).toBe('kept')
  })

  test('a sheet that did not carry the field keeps the plan statement even if others have rows', () => {
    const all = [{ servitudeRows: [{ stands: '1686', boundary: 'A - B' }] }, {}]
    expect(sheetMetadata(plan, all[1], all).servitudeStatement.rows).toHaveLength(1)
  })

  test('never mutates the shared plan metadata between sheets', () => {
    const rows = [{ stands: '1687', width: 2 }]
    sheetMetadata(plan, { servitudeRows: rows })
    // Sheet 2 must not see sheet 1's rows written into the shared object.
    expect(plan.servitudeStatement.rows).toEqual([{ stands: '1686', width: 3 }])
  })
})
