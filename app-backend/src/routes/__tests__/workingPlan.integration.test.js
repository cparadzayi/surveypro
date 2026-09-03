import { describe, test, expect } from '@jest/globals'
import Fastify from 'fastify'
import workingPlanRoutes from '../workingPlan.js'
import { brackenhurstSpec } from '../../services/workingPlan/__tests__/fixtures/brackenhurstSpec.js'

/**
 * The golden test (services/workingPlan/__tests__/workingPlan.golden.test.js)
 * and workingPlan.dxf.test.js next door both exercise a fully populated spec:
 * explicit scale, explicit compass labels, existing/roads/notes/inset all
 * present. The frontend adapter (workingPlanSpec.ts) never builds one of
 * those -- it always emits `scale: 'auto'`, `label: 'auto'` on every beacon,
 * and omits existing/roads/notes/inset outright. That is the ONE composition
 * that actually runs in production, and until this test nothing exercised it
 * against the real generator.
 *
 * Deliberately NOT mocking working-plan.js -- that is what workingPlan.dxf.test.js
 * is for (route contract: status codes, headers, bad-spec handling). Keeping
 * this in its own file makes it obvious this one must stay wired to the real
 * module; mixing the two invites someone to add a jest.unstable_mockModule
 * here that would silently gut it.
 */
function buildApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async () => {})
  app.register(workingPlanRoutes)
  return app
}

// Same real survey the golden fixture pins, reshaped the way the adapter
// actually builds it: scale/label left to 'auto', and no existing/roads/
// notes/inset -- the adapter has no source data for any of those.
const adapterShapedSpec = {
  scale: 'auto',
  beacons: brackenhurstSpec.beacons.map(({ name, X, Y, symbol }) => ({
    name, X, Y, symbol, label: 'auto',
  })),
  parcels: brackenhurstSpec.parcels,
  title: brackenhurstSpec.title,
  certificate: brackenhurstSpec.certificate,
  approvalBox: true,
}

describe('POST /working-plan/dxf — real generator, adapter-shaped spec', () => {
  test('draws the one composition production actually sends', async () => {
    const res = await buildApp().inject({ method: 'POST', url: '/dxf', payload: adapterShapedSpec })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/dxf')

    const scale = Number(res.headers['x-plan-scale'])
    expect(Number.isFinite(scale)).toBe(true)
    expect(scale).toBeGreaterThan(0)

    // The cheap general guard against the whole class of failure in finding 4:
    // a bad or incomplete spec can produce a "successful" DXF that is actually
    // full of NaN tokens rather than failing loudly.
    expect(res.rawPayload.toString()).not.toMatch(/NaN/)
  })
})
