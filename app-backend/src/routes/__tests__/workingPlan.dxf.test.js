import { describe, test, expect, jest } from '@jest/globals'
import Fastify from 'fastify'

// The module itself is covered by its own golden test; this suite is about the
// route's contract -- status codes, headers, and how it reports a bad spec.
const mockGenerateWorkingPlan = jest.fn(() => ({
  dxf: '0\nSECTION\n0\nEOF\n',
  scale: 2000,
  gridInterval: { e: 50, n: 50 },
  gridTicks: 12,
  areas: { 405: 4321.5 },
}))

jest.unstable_mockModule('../../services/workingPlan/working-plan.js', () => ({
  generateWorkingPlan: mockGenerateWorkingPlan,
}))

const { default: workingPlanRoutes } = await import('../workingPlan.js')

function buildApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async () => {})
  app.register(workingPlanRoutes)
  return app
}

const validSpec = {
  scale: 'auto',
  beacons: [{ name: 'SD4', X: 2144027.08, Y: -85673.91, symbol: 'peg', label: 'auto' }],
  parcels: [{ label: '405', ring: ['SD4', 'SD5', 'SD6'] }],
  title: ['Survey of', 'Stand 405'],
}

describe('POST /working-plan/dxf', () => {
  test('returns the DXF body as application/dxf', async () => {
    mockGenerateWorkingPlan.mockClear()
    const res = await buildApp().inject({ method: 'POST', url: '/dxf', payload: validSpec })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/dxf')
    expect(res.rawPayload.toString()).toBe('0\nSECTION\n0\nEOF\n')
    expect(mockGenerateWorkingPlan).toHaveBeenCalledTimes(1)
  })

  test('reports the scale, grid and areas it drew at, on headers', async () => {
    // The caller needs these to label the plan and to cross-check areas; they
    // cannot be read back out of the DXF body without parsing it.
    const res = await buildApp().inject({ method: 'POST', url: '/dxf', payload: validSpec })
    expect(res.headers['x-plan-scale']).toBe('2000')
    expect(JSON.parse(res.headers['x-plan-grid'])).toEqual({ e: 50, n: 50 })
    expect(JSON.parse(res.headers['x-plan-areas'])).toEqual({ 405: 4321.5 })
  })

  test('rejects a spec with no beacons or parcels as 400, not 500', async () => {
    const res = await buildApp().inject({ method: 'POST', url: '/dxf', payload: { title: ['x'] } })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/beacons/)
  })

  // The route is the trust boundary -- another caller can post a spec directly,
  // bypassing the frontend adapter's own guards. Each of these reproduces a
  // real failure a reviewer found by running the actual generator: an empty
  // beacons/parcels array otherwise renders a 200 full of NaN tokens, a short
  // ring crashes reading a property of undefined, a missing title crashes the
  // same way, and an unrecognised symbol draws a block reference to `undefined`.
  test('rejects an empty beacons array as 400 instead of a 200 full of NaN', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: '/dxf', payload: { ...validSpec, beacons: [] },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/beacons/)
  })

  test('rejects an empty parcels array as 400 instead of a 200 full of NaN', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: '/dxf', payload: { ...validSpec, parcels: [] },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/parcels/)
  })

  test('rejects a parcel ring under 3 names as 400 instead of a crash', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: '/dxf', payload: { ...validSpec, parcels: [{ label: 'x', ring: [] }] },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/ring/)
  })

  test('rejects a ring containing an empty name as 400', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/dxf',
      payload: { ...validSpec, parcels: [{ label: '405', ring: ['SD4', '', 'SD6'] }] },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/ring/)
  })

  test('rejects a spec with no title as 400 instead of a crash reading "slice" of undefined', async () => {
    const { title, ...withoutTitle } = validSpec
    const res = await buildApp().inject({ method: 'POST', url: '/dxf', payload: withoutTitle })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/title/)
  })

  test('rejects an invalid beacon symbol as 400 instead of a 200 with an undefined block reference', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/dxf',
      payload: { ...validSpec, beacons: [{ name: 'SD4', X: 1, Y: 2, symbol: 'beacon', label: 'auto' }] },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/symbol/)
  })

  test('turns an unknown beacon into a 400 that still names the beacon', async () => {
    // A ring naming a beacon that is not in the list is the surveyor's data
    // problem, and they can only fix it if the name survives to the UI.
    mockGenerateWorkingPlan.mockImplementationOnce(() => {
      throw new Error('generateWorkingPlan: unknown beacon "SD9"')
    })
    const res = await buildApp().inject({ method: 'POST', url: '/dxf', payload: validSpec })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('SD9')
  })

  test('any other generator failure is a 500', async () => {
    mockGenerateWorkingPlan.mockImplementationOnce(() => { throw new Error('boom') })
    const res = await buildApp().inject({ method: 'POST', url: '/dxf', payload: validSpec })
    expect(res.statusCode).toBe(500)
  })

  test('coerces a non-Error throw instead of sending message: undefined', async () => {
    // error.message is undefined when a non-Error is thrown, which would also
    // silently miss the /unknown beacon/ regex above.
    mockGenerateWorkingPlan.mockImplementationOnce(() => { throw 'a plain string failure' })
    const res = await buildApp().inject({ method: 'POST', url: '/dxf', payload: validSpec })
    expect(res.statusCode).toBe(500)
    expect(res.json().message).toBe('a plain string failure')
  })
})
