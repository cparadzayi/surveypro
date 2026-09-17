/**
 * Schema guards for the coordinate-points routes.
 *
 * 1. Ajv strict mode. The normalize-names body declared `id: { type: ['integer',
 *    'string'] }`, a union type. Fastify's Ajv runs strict mode at 'log', so this
 *    only ever surfaced as a startup warning:
 *      strict mode: use allowUnionTypes to allow union type keyword at
 *      "#/properties/renames/items/properties/id"
 *    Booting with strict: true turns that warning into a compile error, so this
 *    test fails if any schema in the file regresses to a strict-mode violation.
 *
 * 2. The id contract itself. `id` must keep accepting a non-numeric string:
 *    beaconRepairFlow.ts builds each entry as `id: p.id ?? p.name`, so a point
 *    with no database id rides under its beacon NAME (e.g. "2474A"). Narrowing
 *    the schema to integer would 400 exactly those repairs. Validation runs
 *    before preHandler in Fastify's lifecycle, so these assertions exercise the
 *    compiled schema without standing up auth or a database.
 */

import { describe, test, expect } from '@jest/globals'
import Fastify from 'fastify'
import coordinatePointRoutes from '../coordinatePoints.js'

function buildStrictApp() {
  const app = Fastify({ ajv: { customOptions: { strict: true } } })
  // Registration-time dependency only: the route file reads app.authenticate
  // when it builds each preHandler array.
  app.decorate('authenticate', async () => {})
  return app
}

async function postRenames(app, renames) {
  return app.inject({
    method: 'POST',
    url: '/coordinate-points/normalize-names',
    payload: { project_id: '1', renames },
  })
}

describe('coordinate-points route schemas', () => {
  test('every schema compiles under Ajv strict mode', async () => {
    const app = buildStrictApp()
    await app.register(coordinatePointRoutes)
    await expect(app.ready()).resolves.toBeDefined()
    await app.close()
  })

  test('normalize-names accepts an integer id and a non-numeric beacon-name id', async () => {
    const app = buildStrictApp()
    await app.register(coordinatePointRoutes)
    await app.ready()

    const integerId = await postRenames(app, [{ id: 7, from: '2474a', to: '2474A' }])
    expect(integerId.statusCode).not.toBe(400)

    // The `p.id ?? p.name` fallback: not coercible to a number.
    const nameId = await postRenames(app, [{ id: '2474A', from: '2474a', to: '2474A' }])
    expect(nameId.statusCode).not.toBe(400)

    await app.close()
  })

  test('normalize-names still rejects a rename missing a required field', async () => {
    const app = buildStrictApp()
    await app.register(coordinatePointRoutes)
    await app.ready()

    const res = await postRenames(app, [{ id: 7, from: '2474a' }])
    expect(res.statusCode).toBe(400)

    await app.close()
  })
})
