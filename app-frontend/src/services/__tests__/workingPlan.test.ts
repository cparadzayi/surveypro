import { describe, it, expect, vi, beforeEach } from 'vitest'

const post = vi.fn()
vi.mock('../api', () => ({ default: { post: (...args: any[]) => post(...args) } }))

const { generateWorkingPlanDXF } = await import('../workingPlan')

const spec: any = { scale: 'auto', beacons: [], parcels: [], title: [] }

describe('generateWorkingPlanDXF', () => {
  beforeEach(() => post.mockReset())

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
})
