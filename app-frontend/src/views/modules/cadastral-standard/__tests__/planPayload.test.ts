import { buildPlanPayload, beaconsForParcel, composePlanBaseName, bundlePlanDocuments, type PlanPayloadContext } from '../planPayload'

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

describe('composePlanBaseName', () => {
  it('uses the designation when present and sanitises it', () => {
    expect(composePlanBaseName('diagram', 'Stand 302', 7, 123)).toBe('diagram-Stand_302-123')
  })
  it('falls back to projectId when designation is blank', () => {
    expect(composePlanBaseName('working-plan', '   ', 7, 123)).toBe('working-plan-7-123')
  })
})

describe('bundlePlanDocuments', () => {
  const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
  const dxf = new Blob(['0\nSECTION'], { type: 'application/dxf' })

  it('returns the single file directly when only one format is present', async () => {
    const r = await bundlePlanDocuments({ pdf }, 'diagram-302-1')
    expect(r.filename).toBe('diagram-302-1.pdf')
    expect(r.blob).toBe(pdf)
  })

  it('names a lone dxf with the .dxf extension', async () => {
    const r = await bundlePlanDocuments({ dxf }, 'diagram-302-1')
    expect(r.filename).toBe('diagram-302-1.dxf')
    expect(r.blob).toBe(dxf)
  })

  it('names a lone summary with the -summary.pdf suffix', async () => {
    const summary = new Blob(['%PDF-1.4 summary'], { type: 'application/pdf' })
    const r = await bundlePlanDocuments({ summary }, 'general-undeveloped-Stand_85-1')
    expect(r.filename).toBe('general-undeveloped-Stand_85-1-summary.pdf')
    expect(r.blob).toBe(summary)
  })

  it('zips when both formats are present', async () => {
    const r = await bundlePlanDocuments({ pdf, dxf }, 'diagram-302-1')
    expect(r.filename).toBe('diagram-302-1.zip')
    expect(r.blob.size).toBeGreaterThan(0)
  })

  it('throws when nothing is supplied', async () => {
    await expect(bundlePlanDocuments({}, 'x')).rejects.toThrow(/No documents/)
  })
})
