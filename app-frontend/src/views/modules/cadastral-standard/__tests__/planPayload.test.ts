import { buildPlanPayload, beaconsForParcel, type PlanPayloadContext } from '../planPayload'

const parcelA: GeoJSON.Feature = {
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]] },
  properties: { id: 'A', stand: '301' },
}
const parcelB: GeoJSON.Feature = {
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[20, 20], [20, 30], [30, 30], [30, 20], [20, 20]]] },
  properties: { id: 'B', stand: '302' },
}
const beacons: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'A1' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [10, 10] }, properties: { name: 'A2' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [20, 20] }, properties: { name: 'B1' } },
  ],
}

function ctx(over: Partial<PlanPayloadContext>): PlanPayloadContext {
  return {
    planType: 'general-undeveloped',
    subjectParcelId: null,
    parcels: { type: 'FeatureCollection', features: [parcelA, parcelB] },
    beacons,
    beaconLabels: [{ text: 'A', parcelId: 'A' }, { text: 'B', parcelId: 'B' }],
    projection: 'EPSG:22291',
    metadata: { title: 'T' },
    orientation: 'landscape',
    outsideFigureData: null,
    beaconGroups: [],
    ...over,
  }
}

describe('beaconsForParcel', () => {
  it('keeps only beacons on the parcel ring', () => {
    const fc = beaconsForParcel(beacons, parcelA)
    expect(fc.features.map(f => f.properties!.name)).toEqual(['A1', 'A2'])
  })
})

describe('buildPlanPayload — whole-set', () => {
  it('passes every parcel/beacon/label through unchanged', () => {
    const p = buildPlanPayload(ctx({ planType: 'general-undeveloped' }))
    expect(p.parcels.features).toHaveLength(2)
    expect(p.beacons.features).toHaveLength(3)
    expect(p.beaconLabels).toHaveLength(2)
    expect(p.planType).toBe('general-undeveloped')
    expect(p.renderEngine).toBe('pdfkit')
  })
})

describe('buildPlanPayload — single-parcel (diagram)', () => {
  it('filters parcels, beacons, and labels to the subject', () => {
    const p = buildPlanPayload(ctx({ planType: 'diagram', subjectParcelId: 'A' }))
    expect(p.parcels.features.map(f => f.properties!.id)).toEqual(['A'])
    expect(p.beacons.features.map(f => f.properties!.name)).toEqual(['A1', 'A2'])
    expect(p.beaconLabels).toEqual([{ text: 'A', parcelId: 'A' }])
  })

  it('returns empty sets when the subject id is not found', () => {
    const p = buildPlanPayload(ctx({ planType: 'diagram', subjectParcelId: 'Z' }))
    expect(p.parcels.features).toHaveLength(0)
    expect(p.beacons.features).toHaveLength(0)
  })

  it('does NOT filter when subjectParcelId is null even in diagram mode', () => {
    const p = buildPlanPayload(ctx({ planType: 'diagram', subjectParcelId: null }))
    expect(p.parcels.features).toHaveLength(2)
  })
})
