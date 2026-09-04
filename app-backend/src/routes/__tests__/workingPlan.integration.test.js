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

/**
 * Cross-layer guard. The frontend adapter (workingPlanSpec.ts) emits SI 727
 * Fifth Schedule sign names; this route is the trust boundary that validates
 * them. The two lists are in different packages and cannot import each other,
 * so nothing but a test keeps them in step.
 *
 * They were briefly out of step: the route accepted only peg/rm/trig while the
 * adapter had moved to the full schedule, which would have rejected every plan
 * with a 400. Every per-layer suite still passed, because each tested its own
 * side and the fixture only used the old three.
 */
describe('the route accepts every sign the adapter can emit', () => {
  const ADAPTER_SYMBOLS = [
    'placed', 'peg', 'found', 'foundNotAdopted',
    'rm', 'ws', 'wsu', 'trig', 'ocp',
  ]

  test.each(ADAPTER_SYMBOLS)('symbol "%s" renders rather than 400s', async (symbol) => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/dxf',
      payload: {
        scale: 'auto',
        beacons: [
          { name: 'A', X: 2144027.08, Y: -85673.91, symbol, label: 'auto' },
          { name: 'B', X: 2144063.20, Y: -85710.12, symbol, label: 'auto' },
          { name: 'C', X: 2144076.45, Y: -85723.41, symbol, label: 'auto' },
        ],
        parcels: [{ label: '404', ring: ['A', 'B', 'C'] }],
        title: ['Survey of', 'Stand 404'],
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.rawPayload.toString()).not.toMatch(/NaN/)
  })
})
