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
  parcels: [{ label: '405', ring: ['SD4'] }],
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
})
