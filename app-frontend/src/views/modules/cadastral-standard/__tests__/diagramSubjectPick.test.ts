import { pickDiagramSubjectId } from '../diagramSubjectPick'

const parcels = [
  { id: 'OF', area_m2: 100000 },
  { id: '302', area_m2: 5000 },
  { id: '303', area_m2: 4000 },
]

describe('pickDiagramSubjectId', () => {
  it('ignores the Outside Figure even when it is the topmost hit', () => {
    // OF painted on top of stand 302 at the click point.
    const hits = ['parcel-OF-fill', 'parcel-302-fill']
    expect(pickDiagramSubjectId(hits, parcels, 'OF')).toBe('302')
  })

  it('picks the smallest-area stand when real parcels overlap (not just the topmost)', () => {
    // 302 is topmost but larger; 303 is smaller and should win.
    const hits = ['parcel-302-fill', 'parcel-303-fill']
    expect(pickDiagramSubjectId(hits, parcels, 'OF')).toBe('303')
  })

  it('returns null when only the Outside Figure is under the cursor', () => {
    expect(pickDiagramSubjectId(['parcel-OF-fill'], parcels, 'OF')).toBeNull()
  })

  it('returns null when there are no hits', () => {
    expect(pickDiagramSubjectId([], parcels, 'OF')).toBeNull()
  })

  it('parses parcel ids that contain dashes', () => {
    const withDashId = [{ id: 'a-b-c', area_m2: 10 }]
    expect(pickDiagramSubjectId(['parcel-a-b-c-fill'], withDashId, 'OF')).toBe('a-b-c')
  })

  it('matches numeric ids and preserves the original id type', () => {
    const numeric = [{ id: 302, area_m2: 5000 }, { id: 303, area_m2: 4000 }]
    expect(pickDiagramSubjectId(['parcel-303-fill'], numeric, null)).toBe(303)
  })
})
