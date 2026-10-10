/**
 * The register context kept for the map: a recent copy on the device is used without asking again, a refresh asks, a lost connection falls back to
 * whatever copy there is and says so, and a refusal from the register is an answer that is shown, not a lost connection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../api', () => ({ default: { post: vi.fn() } }))

import api from '../api'
import { loadContext, cachedContext, useContextStore, describeFeature, countByQuality, FRESH_MS, type ContextFeature, type RegisterContext } from '../registerContext'

const feature = (over: Partial<ContextFeature['properties']> = {}): ContextFeature => ({
  type: 'Feature', geometry: { type: 'Polygon', coordinates: [] },
  properties: { parcel_id: 'P-1', stand_no: '12', township_code: 'GWERU-A', kind: 'stand', status: 'current', quality: 'approved', origin: 'custodian', sg_ref: 'GP 123', survey_class: null, basis: 'general_plan', area_m2: 900, farm_ref: null, council: null, indicative_m: null, ...over },
})
const ctx = (n = 1, at = '2026-10-10T08:00:00Z'): RegisterContext => ({ authority: 'VUNGU', as_of: at, lo_zone: 29, srid: 922029, truncated: false, count: n, features: Array.from({ length: n }, () => feature()) })

const NOW = 1_800_000_000_000
let rows: Record<string, any>
beforeEach(() => {
  rows = {}
  useContextStore({ get: async (k) => rows[k], put: async (r) => { rows[r.key] = r } })
  ;(api.post as any).mockReset()
})

describe('loading the context', () => {
  it('asks the register the first time, and keeps a copy on the device', async () => {
    ;(api.post as any).mockResolvedValue({ data: { data: ctx(2) } })
    const r = await loadContext(7, { now: NOW })
    expect(api.post).toHaveBeenCalledWith('/survey-projects/7/context', {})
    expect(r).toMatchObject({ fromCache: false, offline: false })
    expect(r.context.count).toBe(2)
    expect((await cachedContext(7))?.savedAt).toBe(NOW)
  })

  it('uses a recent copy without asking again', async () => {
    ;(api.post as any).mockResolvedValue({ data: { data: ctx(2) } })
    await loadContext(7, { now: NOW })
    ;(api.post as any).mockClear()
    const r = await loadContext(7, { now: NOW + FRESH_MS - 1000 })
    expect(api.post).not.toHaveBeenCalled()
    expect(r).toMatchObject({ fromCache: true, offline: false })
  })

  it('asks again when the copy is old, or when a refresh is wanted', async () => {
    ;(api.post as any).mockResolvedValue({ data: { data: ctx(1) } })
    await loadContext(7, { now: NOW })
    ;(api.post as any).mockResolvedValue({ data: { data: ctx(3) } })
    expect((await loadContext(7, { now: NOW + FRESH_MS + 1000 })).context.count).toBe(3)
    ;(api.post as any).mockResolvedValue({ data: { data: ctx(4) } })
    expect((await loadContext(7, { now: NOW + FRESH_MS + 2000, refresh: true })).context.count).toBe(4)
  })

  it('with no signal it falls back to the copy it has, and says it is an offline copy', async () => {
    ;(api.post as any).mockResolvedValue({ data: { data: ctx(2) } })
    await loadContext(7, { now: NOW })
    ;(api.post as any).mockRejectedValue(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }))
    const r = await loadContext(7, { now: NOW + 5 * FRESH_MS })
    expect(r).toMatchObject({ fromCache: true, offline: true })
    expect(r.context.count).toBe(2)
  })

  it('with no signal and no copy there is nothing to show, and it says so by throwing', async () => {
    ;(api.post as any).mockRejectedValue(new Error('Network Error'))
    await expect(loadContext(7, { now: NOW })).rejects.toThrow('Network Error')
  })

  it('a refusal from the register is an answer, not a lost connection: it is thrown even when a copy exists', async () => {
    ;(api.post as any).mockResolvedValue({ data: { data: ctx(2) } })
    await loadContext(7, { now: NOW })
    const refusal = { response: { status: 403, data: { error: 'not_appointed', message: 'You are not appointed to that council today.' } } }
    ;(api.post as any).mockRejectedValue(refusal)
    await expect(loadContext(7, { now: NOW + 5 * FRESH_MS })).rejects.toBe(refusal)
  })

  it('each project has its own copy', async () => {
    ;(api.post as any).mockResolvedValue({ data: { data: ctx(2) } })
    await loadContext(7, { now: NOW })
    expect(await cachedContext(8)).toBeNull()
  })

  it('a device that cannot keep a copy still shows what it fetched', async () => {
    useContextStore({ get: async () => { throw new Error('storage disabled') }, put: async () => { throw new Error('storage disabled') } })
    ;(api.post as any).mockResolvedValue({ data: { data: ctx(2) } })
    expect((await loadContext(7, { now: NOW })).context.count).toBe(2)
  })

  it('passes the council when the project does not know its own', async () => {
    ;(api.post as any).mockResolvedValue({ data: { data: ctx(1) } })
    await loadContext(7, { now: NOW, authorityCode: 'VUNGU' })
    expect(api.post).toHaveBeenCalledWith('/survey-projects/7/context', { authority_code: 'VUNGU' })
  })
})

describe('saying what each outline is', () => {
  it('an indicative one says how far out it may be and not to set out from it', () => {
    expect(describeFeature(feature({ kind: 'farm', stand_no: null, farm_ref: 'Farm 7', quality: 'indicative', indicative_m: 24.6, sg_ref: null }).properties)).toBe('Farm 7: indicative, may be 25 m out: do not set out from it')
    expect(describeFeature(feature({ quality: 'indicative', indicative_m: null, sg_ref: null }).properties)).toMatch(/indicative: do not set out from it/)
  })
  it('an approved stand names its plan, a council survey names its class', () => {
    expect(describeFeature(feature().properties)).toBe('Stand 12, GWERU-A: approved (GP 123)')
    expect(describeFeature(feature({ quality: 'council_survey', sg_ref: null, survey_class: 'B', origin: 'authority' }).properties)).toBe('Stand 12, GWERU-A: council survey, class B, awaiting approval')
  })
  it('counts by how far to trust them', () => {
    expect(countByQuality([feature(), feature({ quality: 'indicative' }), feature({ quality: 'indicative' }), feature({ quality: 'council_survey' })])).toEqual({ approved: 1, council_survey: 1, indicative: 2 })
  })
})
