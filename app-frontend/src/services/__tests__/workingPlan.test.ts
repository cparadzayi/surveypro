import { describe, it, expect, vi, beforeEach } from 'vitest'

const post = vi.fn()
vi.mock('../api', () => ({ default: { post: (...args: any[]) => post(...args) } }))

const { generateWorkingPlanDXF } = await import('../workingPlan')

const spec: any = { scale: 'auto', beacons: [], parcels: [], title: [] }

describe('generateWorkingPlanDXF', () => {
  // Braces, not an implicit-return arrow: mockReset() returns the mock itself,
  // and vitest treats a function RETURNED from beforeEach as a teardown hook --
  // an implicit return here re-invokes `post` after every test. Harmless while
  // every test used mockResolvedValue; with mockRejectedValue below, that
  // teardown call creates a fresh unhandled rejection that gets misattributed
  // to the test as a failure.
  beforeEach(() => { post.mockReset() })

  it('posts the spec and returns the DXF blob', async () => {
    const blob = new Blob(['0\nSECTION\n'], { type: 'application/dxf' })
    post.mockResolvedValue({ data: blob, headers: {} })

    const result = await generateWorkingPlanDXF(spec)

    expect(post).toHaveBeenCalledWith('/working-plan/dxf', spec, expect.objectContaining({ responseType: 'blob' }))
    expect(result.blob).toBe(blob)
  })

  it('reads back the scale, grid and areas the sheet was drawn at', async () => {
    post.mockResolvedValue({
      data: new Blob(['x']),
      headers: {
        'x-plan-scale': '2000',
        'x-plan-grid': '{"e":50,"n":50}',
        'x-plan-areas': '{"405":4321.5}',
      },
    })

    const result = await generateWorkingPlanDXF(spec)

    expect(result.scale).toBe(2000)
    expect(result.gridInterval).toEqual({ e: 50, n: 50 })
    expect(result.areas).toEqual({ 405: 4321.5 })
  })

  it('survives missing or malformed headers rather than failing the whole plan', async () => {
    // The DXF is the deliverable; the headers are a convenience. A proxy that
    // strips them must not cost the surveyor their plan.
    post.mockResolvedValue({ data: new Blob(['x']), headers: { 'x-plan-areas': 'not json' } })

    const result = await generateWorkingPlanDXF(spec)

    expect(result.scale).toBeNull()
    expect(result.gridInterval).toBeNull()
    expect(result.areas).toBeNull()
  })

  it('decodes the backend message out of a 400 blob body so the surveyor sees the real error', async () => {
    // responseType: 'blob' applies to error responses too -- axios rejects with
    // a generic status-code message and leaves the real body as an unread Blob.
    const body = new Blob(
      [JSON.stringify({ error: 'Unknown beacon', message: 'generateWorkingPlan: unknown beacon "SD9"' })],
      { type: 'application/json' },
    )
    post.mockRejectedValue({ message: 'Request failed with status code 400', response: { status: 400, data: body } })

    await expect(generateWorkingPlanDXF(spec)).rejects.toThrow(/SD9/)
  })

  it('falls back to the original axios message when the error body is not JSON', async () => {
    // The decode itself must not throw and mask the failure with a parse error.
    const body = new Blob(['not json'], { type: 'text/plain' })
    post.mockRejectedValue({ message: 'Request failed with status code 500', response: { status: 500, data: body } })

    await expect(generateWorkingPlanDXF(spec)).rejects.toThrow('Request failed with status code 500')
  })
})
