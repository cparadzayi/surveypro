// @vitest-environment happy-dom
/**
 * The register layer on the surveyor's map: it is added under the survey's own layers and hidden until asked for, the outlines are placed with the
 * survey's own Lo transformation (so a council-surveyed stand lines up with the surveyor's work), and what the surveyor chose is remembered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

vi.mock('../../services/api', () => ({ default: { post: vi.fn() } }))

import api from '../../services/api'
import { useContextStore } from '../../services/registerContext'
import { useRegisterContext, toMapFeature, toFeatureCollection, QUALITY_COLOUR } from '../useRegisterContext'

const LO = (w: number, s: number, n = 30) => [[w, s], [w + n, s], [w + n, s + n], [w, s + n], [w, s]]
const feat = (quality: string, stand: string, w: number): any => ({
  type: 'Feature' as const, geometry: { type: 'Polygon', coordinates: [LO(w, 2151377)] },
  properties: { parcel_id: `P-${stand}`, stand_no: stand, township_code: 'T', kind: 'stand', status: 'current', quality, origin: 'custodian', sg_ref: quality === 'approved' ? 'GP 1' : null, survey_class: null, basis: 'general_plan', area_m2: 900, farm_ref: null, council: null, indicative_m: quality === 'indicative' ? 20 : null },
})
const context = (features: any[]) => ({ authority: 'VUNGU', as_of: '2026-10-10T08:00:00Z', lo_zone: 29, srid: 922029, truncated: false, count: features.length, features })

function fakeMap() {
  const sources: Record<string, any> = {}; const layers: any[] = []; const vis: Record<string, string> = {}; const handlers: Record<string, Function> = {}
  return {
    sources, layers, vis, handlers,
    addSource: vi.fn((id: string) => { sources[id] = { data: null, setData(d: any) { this.data = d } } }),
    getSource: (id: string) => sources[id],
    addLayer: vi.fn((l: any) => { layers.push(l); vis[l.id] = l.layout?.visibility }),
    getLayer: (id: string) => layers.find((l) => l.id === id),
    setLayoutProperty: (id: string, _k: string, v: string) => { vis[id] = v },
    on: (ev: string, id: string, fn: Function) => { handlers[`${ev}:${id}`] = fn },
    getCanvas: () => ({ style: {} as any }),
  }
}

beforeEach(() => {
  useContextStore({ get: async () => undefined, put: async () => {} })
  ;(api.post as any).mockReset()
  localStorage.clear()
})

describe('placing the outlines', () => {
  it('a Lo outline becomes longitude and latitude near Gweru, by the survey\'s own transformation', () => {
    const f: any = toMapFeature(feat('approved', '1', -84035), 29)
    const [lng, lat] = f.geometry.coordinates[0][0]
    expect(lng).toBeGreaterThan(29); expect(lng).toBeLessThan(31)
    expect(lat).toBeLessThan(-18); expect(lat).toBeGreaterThan(-21)
    expect(f.geometry.coordinates[0]).toHaveLength(5)
    expect(f.properties.summary).toBe('Stand 1, T: approved (GP 1)')
  })
  it('only polygons are drawn', () => {
    expect(toMapFeature({ ...feat('approved', '1', 0), geometry: { type: 'Point', coordinates: [0, 0] } }, 29)).toBeNull()
    expect(toFeatureCollection(context([feat('approved', '1', -84035), { ...feat('approved', '2', 0), geometry: { type: 'LineString', coordinates: [] } }])).features).toHaveLength(1)
  })
  it('a multipolygon keeps all its parts', () => {
    const f: any = toMapFeature({ ...feat('indicative', 'F1', 0), geometry: { type: 'MultiPolygon', coordinates: [[LO(-84035, 2151377)], [LO(-84000, 2151377)]] } }, 29)
    expect(f.geometry.coordinates).toHaveLength(2)
  })
})

describe('the layer on the map', () => {
  it('is added, empty and hidden, with three different outlines for three different degrees of trust', () => {
    const map = fakeMap()
    const c = useRegisterContext(() => map, ref(7))
    c.attach(); c.attach()                                              // once, however often it is asked
    expect(map.addSource).toHaveBeenCalledTimes(1)
    expect(map.layers.map((l) => l.id)).toEqual(['register-context-fill', 'register-context-approved', 'register-context-council', 'register-context-indicative'])
    expect(Object.values(map.vis).every((v) => v === 'none')).toBe(true)
    expect(map.layers.find((l) => l.id === 'register-context-council').paint['line-dasharray']).toEqual([3, 2])
    expect(map.layers.find((l) => l.id === 'register-context-indicative').paint['line-dasharray']).toEqual([0.6, 2])
    expect(map.layers.find((l) => l.id === 'register-context-approved').paint['line-color']).toBe(QUALITY_COLOUR.approved)
    expect(c.enabled.value).toBe(false)
    expect(api.post).not.toHaveBeenCalled()                             // nothing is asked for until the surveyor wants it
  })

  it('switching it on fetches, draws, and counts what is there by how far to trust it', async () => {
    ;(api.post as any).mockResolvedValue({ data: { data: context([feat('approved', '1', -84035), feat('council_survey', '2', -84000), feat('indicative', 'F1', -83900)]) } })
    const map = fakeMap()
    const c = useRegisterContext(() => map, ref(7))
    c.attach()
    await c.toggle()
    expect(c.enabled.value).toBe(true)
    expect(c.counts.value).toEqual({ approved: 1, council_survey: 1, indicative: 1 })
    expect(map.sources['register-context'].data.features).toHaveLength(3)
    expect(Object.values(map.vis).every((v) => v === 'visible')).toBe(true)
    await c.toggle()
    expect(map.sources['register-context'].data.features).toHaveLength(0)
    expect(Object.values(map.vis).every((v) => v === 'none')).toBe(true)
  })

  it('remembers, per project, that the surveyor wanted it on, and shows it again when the map is next opened', async () => {
    ;(api.post as any).mockResolvedValue({ data: { data: context([feat('approved', '1', -84035)]) } })
    const first = useRegisterContext(() => fakeMap(), ref(7)); first.attach(); await first.toggle()
    const map = fakeMap()
    const again = useRegisterContext(() => map, ref(7)); again.attach()
    await vi.waitFor(() => expect(map.sources['register-context'].data.features).toHaveLength(1))
    expect(again.enabled.value).toBe(true)
    const other = useRegisterContext(() => fakeMap(), ref(8)); other.attach()
    expect(other.enabled.value).toBe(false)
  })

  it('says why when the register cannot show this project, and draws nothing', async () => {
    ;(api.post as any).mockRejectedValue({ response: { status: 422, data: { error: 'no_location', message: 'There is nothing to place yet. Import the survey points first, or open the job from the council.' } } })
    const map = fakeMap()
    const c = useRegisterContext(() => map, ref(7)); c.attach()
    await c.toggle()
    expect(c.error.value).toMatch(/nothing to place yet/)
    expect(map.sources['register-context'].data.features).toHaveLength(0)
  })

  it('with no signal and no copy it says that, in words', async () => {
    ;(api.post as any).mockRejectedValue(new Error('Network Error'))
    const c = useRegisterContext(() => fakeMap(), ref(7)); c.attach()
    await c.toggle()
    expect(c.error.value).toMatch(/could not be reached/)
  })

  it('a hover shows what the outline is and how far to trust it', () => {
    const map = fakeMap(); const shown: string[] = []
    class Popup { setLngLat() { return this } setText(t: string) { shown.push(t); return this } addTo() { return this } remove() { return this } }
    useRegisterContext(() => map, ref(7), { Popup: Popup as any }).attach()
    map.handlers['mousemove:register-context-fill']({ features: [{ properties: { summary: 'Farm 7: indicative, may be 25 m out: do not set out from it' } }], lngLat: { lng: 29, lat: -19 } })
    expect(shown).toEqual(['Farm 7: indicative, may be 25 m out: do not set out from it'])
  })

  it('does nothing, and does not fail, before the map exists or without a project', async () => {
    const c = useRegisterContext(() => null, ref(null))
    expect(() => c.attach()).not.toThrow()
    await c.refresh(); await c.toggle()
    expect(api.post).not.toHaveBeenCalled()
  })
})
