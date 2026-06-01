/**
 * Layer 2 structural integration tests for dxfGenerator.
 * Asserts section integrity, layer presence, entity counts per layer,
 * orientation invariant, and UCS presence — without snapshotting full output.
 */
import { describe, test, expect, beforeAll } from '@jest/globals'
import { generateDXF } from '../dxfGenerator.js'
import { countLayerOnTable, entityCount, parseFirstEntityOf } from './dxfParse.js'
import { sampleFixture } from './fixtures/sampleDxfPlan.js'

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }

describe('dxfGenerator integration — sample fixture', () => {
  let dxf, warnings
  beforeAll(() => {
    const r = generateDXF(sampleFixture, fakeLogger)
    dxf = r.buffer.toString()
    warnings = r.warnings
  })

  test('overall section integrity (HEADER … ENTITIES … EOF)', () => {
    expect(dxf).toMatch(/\bSECTION\b[\s\S]*?\bHEADER\b/)
    expect(dxf).toMatch(/\bSECTION\b[\s\S]*?\bENTITIES\b/)
    expect(dxf).toMatch(/\bEOF\b\s*$/)
  })

  test('all 13 required layers are declared exactly once', () => {
    const required = [
      'OUTSIDE_FIGURE', 'OUTSIDE_FIGURE_LABELS', 'PARCELS', 'BEACONS', 'BEACON_LABELS',
      'DISTANCES', 'DIRECTIONS', 'STAND_NUMBERS', 'TITLE_BLOCK',
      'NORTH_ARROW', 'SCALE_BAR', 'GRID', 'MARGIN_GUIDES',
    ]
    for (const l of required) {
      expect(countLayerOnTable(dxf, l)).toBe(1)
    }
  })

  test('emits 4 vertex coord TEXT entities on OUTSIDE_FIGURE_LABELS', () => {
    expect(entityCount(dxf, 'TEXT', 'OUTSIDE_FIGURE_LABELS')).toBe(4)
  })

  test('emits 4 tick LINE entities on OUTSIDE_FIGURE_LABELS', () => {
    expect(entityCount(dxf, 'LINE', 'OUTSIDE_FIGURE_LABELS')).toBe(4)
  })

  test('vertex labels contain the Cape Lo coordinates from the fixture', () => {
    for (const v of sampleFixture.outsideFigureData.edges) {
      expect(dxf).toMatch(new RegExp(`Y=${Math.round(v.y)}.*?X=${Math.round(v.x)}`))
    }
  })

  test('every beacon has a label on BEACON_LABELS sourced from properties.pointId', () => {
    // The fixture's beacons use properties.pointId ('A', 'B', …) — the only ID
    // field most production GeoJSON sources populate. The generator must read
    // from pointId (with name / beacon_name as fallbacks) so labels actually
    // appear next to each beacon symbol.
    expect(entityCount(dxf, 'TEXT', 'BEACON_LABELS'))
      .toBe(sampleFixture.beacons.features.length)
    for (const b of sampleFixture.beacons.features) {
      expect(dxf).toMatch(new RegExp(`\\b8\\s*\\n\\s*BEACON_LABELS\\b[\\s\\S]*?\\b1\\s*\\n\\s*${b.properties.pointId}\\b`))
    }
  })

  test('edge labels render distance and direction on DISTANCES / DIRECTIONS even when props.edges is missing', () => {
    // The fixture's parcels carry only stand + area_m2; properties.edges is
    // intentionally omitted (most callers don't pre-compute it). The generator
    // must derive distances and South-oriented bearings from the polygon's
    // vertex pairs so the labels still appear.
    expect(entityCount(dxf, 'TEXT', 'DISTANCES')).toBeGreaterThan(0)
    expect(entityCount(dxf, 'TEXT', 'DIRECTIONS')).toBeGreaterThan(0)
  })

  test('entity counts on key layers match the fixture', () => {
    expect(entityCount(dxf, 'POLYLINE', 'PARCELS'))
      .toBe(sampleFixture.parcels.features.length)
    expect(entityCount(dxf, 'CIRCLE', 'BEACONS'))
      .toBe(sampleFixture.beacons.features.length)
    expect(entityCount(dxf, 'LINE', 'NORTH_ARROW')).toBeGreaterThanOrEqual(3)
    expect(entityCount(dxf, 'LINE', 'SCALE_BAR')).toBeGreaterThanOrEqual(7)
    expect(entityCount(dxf, 'LINE', 'GRID')).toBeGreaterThan(0)
    expect(entityCount(dxf, 'LINE', 'MARGIN_GUIDES')).toBeGreaterThanOrEqual(16)
    expect(entityCount(dxf, 'TEXT', 'TITLE_BLOCK')).toBeGreaterThanOrEqual(8)
  })

  test('orientation invariant — DXF X = Cape Lo Y, DXF Y = Cape Lo X', () => {
    const beacon = parseFirstEntityOf(dxf, 'CIRCLE', 'BEACONS')
    expect(beacon).not.toBeNull()
    expect(beacon.x).toBeCloseTo(sampleFixture.beacons.features[0].geometry.coordinates[0], 3)
    expect(beacon.y).toBeCloseTo(sampleFixture.beacons.features[0].geometry.coordinates[1], 3)
  })

  test('UCS table contains CAD_NORTH_UP entry', () => {
    expect(dxf).toMatch(/\bUCS\b[\s\S]{0,500}\bCAD_NORTH_UP\b/)
  })

  test('endorsement block, beacon descriptions, and prior diagrams all rendered', () => {
    expect(dxf).toMatch(/APPROVED FOR LODGEMENT/)
    expect(dxf).toMatch(/Dispensation Certificate/)
    expect(dxf).toMatch(/BEACON DESCRIPTIONS/)
    expect(dxf).toMatch(/Permanent concrete pillars/)
    expect(dxf).toMatch(/Diagram-GP No\. 4567/)
    expect(dxf).toMatch(/certify this plan correct/)
  })

  test('clean fixture produces zero warnings', () => {
    expect(warnings.count).toBe(0)
  })
})

describe('dxfGenerator integration — graceful degradation', () => {
  test('one bad beacon + one bad parcel ⇒ warnings.count === 2, no throw', () => {
    const bad = JSON.parse(JSON.stringify(sampleFixture))
    bad.beacons.features.push({
      type: 'Feature',
      geometry: { coordinates: [NaN, NaN] },
      properties: { pointId: 'BAD', type: 'placed' },
    })
    bad.parcels.features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[50000, 2200000], [50001, 2200000]]] },
      properties: { stand: 'BAD' },
    })
    const { buffer, warnings } = generateDXF(bad, fakeLogger)
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(warnings.count).toBe(2)
    expect(warnings.summary.beacons).toBe(1)
    expect(warnings.summary.parcels).toBe(1)
  })
})
