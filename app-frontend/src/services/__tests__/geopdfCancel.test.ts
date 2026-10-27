import { describe, it, expect, vi, beforeEach } from 'vitest'

const post = vi.fn()
vi.mock('../api', () => ({ default: { post: (...args: any[]) => post(...args) } }))

const { generateVectorGeoPDF, generateDXF } = await import('../geopdf')

const request: any = { parcels: { type: 'FeatureCollection', features: [] }, beacons: { type: 'FeatureCollection', features: [] }, projection: 'EPSG:22291' }
const pdfResponse = () => ({ data: new Blob(['%PDF-1.7 x']), headers: {} })

describe('cancelling plan generation', () => {
  beforeEach(() => { post.mockReset() })

  it('hands the abort signal to the PDF request', async () => {
    post.mockResolvedValue(pdfResponse())
    const ctl = new AbortController()
    await generateVectorGeoPDF(request, { signal: ctl.signal })
    expect(post.mock.calls[0][2].signal).toBe(ctl.signal)
  })

  it('hands it to the DXF/GeoPackage request too', async () => {
    post.mockResolvedValue({ data: new Blob(['0']), headers: {} })
    const ctl = new AbortController()
    await generateDXF(request, { includeGpkg: false, signal: ctl.signal })
    expect(post.mock.calls[0][2].signal).toBe(ctl.signal)
  })

  it('still works with no signal, as every older caller does', async () => {
    post.mockResolvedValue(pdfResponse())
    await generateVectorGeoPDF(request)
    expect(post.mock.calls[0][2].signal).toBeUndefined()
  })

  it('lets a cancelled request reject so the caller can tell it from a failure', async () => {
    const cancelled = Object.assign(new Error('canceled'), { code: 'ERR_CANCELED', name: 'CanceledError' })
    post.mockRejectedValue(cancelled)
    await expect(generateVectorGeoPDF(request, { signal: new AbortController().signal })).rejects.toBe(cancelled)
  })
})
