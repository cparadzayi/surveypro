import { buildPlanPayload, beaconsForParcel, composePlanBaseName, validateGenerateRequest, type PlanPayloadContext } from '../planPayload'

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

describe('buildPlanPayload — diagram carries all parcels + subjectParcelId', () => {
  it('does NOT filter parcels/beacons and records subjectParcelId in metadata', () => {
    const p = buildPlanPayload(ctx({ planType: 'diagram', subjectParcelId: 'A' }))
    expect(p.parcels.features.map(f => f.properties!.id)).toEqual(['A', 'B'])
    expect(p.beacons.features).toHaveLength(3)
    expect((p.metadata as any).subjectParcelId).toBe('A')
  })

  it('still records subjectParcelId even if it is not among the parcels', () => {
    const p = buildPlanPayload(ctx({ planType: 'diagram', subjectParcelId: 'Z' }))
    expect(p.parcels.features).toHaveLength(2)
    expect((p.metadata as any).subjectParcelId).toBe('Z')
  })

  it('whole-set plan types are unaffected and set no subjectParcelId', () => {
    const p = buildPlanPayload(ctx({ planType: 'general-undeveloped' }))
    expect(p.parcels.features).toHaveLength(2)
    expect((p.metadata as any).subjectParcelId).toBeUndefined()
  })
})

describe('composePlanBaseName', () => {
  it('uses the designation when present and sanitises it', () => {
    expect(composePlanBaseName('diagram', 'Stand 302', 7)).toBe('diagram-Stand_302')
  })
  it('falls back to projectId when designation is blank', () => {
    expect(composePlanBaseName('working-plan', '   ', 7)).toBe('working-plan-7')
  })
})


describe('validateGenerateRequest', () => {
  const whole = { subjectMode: 'whole-set' as const }
  const single = { subjectMode: 'single-parcel' as const }

  it('rejects when no format is chosen', () => {
    expect(validateGenerateRequest(whole, null, 5, { pdf: false, dxf: false }).ok).toBe(false)
  })
  it('rejects single-parcel mode with no subject', () => {
    const r = validateGenerateRequest(single, null, 5, { pdf: true, dxf: true })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/click a parcel/i)
  })
  it('accepts single-parcel mode with a subject', () => {
    expect(validateGenerateRequest(single, 'A', 5, { pdf: true, dxf: false }).ok).toBe(true)
  })
  it('rejects whole-set mode with zero parcels', () => {
    expect(validateGenerateRequest(whole, null, 0, { pdf: true, dxf: true }).ok).toBe(false)
  })
  it('accepts whole-set mode with parcels', () => {
    expect(validateGenerateRequest(whole, null, 3, { pdf: true, dxf: false }).ok).toBe(true)
  })
})
