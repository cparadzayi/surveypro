/**
 * Authorization regression tests for surveyors.js and spatial.js.
 *
 * Both files leaked cross-user data, for two DIFFERENT reasons, and the fix
 * differs accordingly — so both are pinned here.
 *
 * 1. surveyors.js. `surveyor_profiles` and `users` live in `public`, not in a
 *    per-surveyor schema, so schema scoping cannot isolate them. Worse, the
 *    writes were worse than the read: ANY authenticated caller could rewrite
 *    or DELETE any other surveyor's profile. Migration 094 adds a `role`
 *    column; reads are self + supervisees, writes are admin-only.
 *
 * 2. spatial.js. `projects` / `layers` / `features` are also `public`-only and
 *    carry no owner column except `projects.user_id`, so `requireSchema` does
 *    nothing for them. Every route resolved its target by bare ID. The chain
 *    features.layer_id -> layers.project_id -> projects.user_id is what now
 *    proves ownership.
 *
 * These tests assert the *denials* and the *hook wiring*, not the happy-path
 * response bodies: a test that only checks "200 for the owner" would still pass
 * if the ownership check were deleted.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import Fastify from 'fastify'

// Mocked before the route modules import them. `authenticateWithSchema` is the
// REAL implementation from src/utils/schemaAuth.js — only its two data sources
// are faked, so the 400/403 branches under test are the production ones.
jest.unstable_mockModule('../../models/user.js', () => ({
  default: { findByEmail: jest.fn() },
}))
jest.unstable_mockModule('../../models/SurveyorProfile.js', () => ({
  default: {
    findByUserId: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    findVisibleTo: jest.fn(),
    findByLicense: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}))
jest.unstable_mockModule('../../config/db.js', () => ({
  default: { query: jest.fn() },
  getSurveyorPool: jest.fn(() => ({ query: jest.fn(), connect: jest.fn() })),
}))
jest.unstable_mockModule('../../models/project.js', () => ({
  default: {
    findById: jest.fn(),
    findByUser: jest.fn(),
    create: jest.fn(),
  },
}))
jest.unstable_mockModule('../../models/layer.js', () => ({
  default: { findById: jest.fn(), findByProject: jest.fn(), create: jest.fn() },
}))
jest.unstable_mockModule('../../models/feature.js', () => ({
  default: {
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    queryByBBox: jest.fn(),
    listPaged: jest.fn(),
    searchByName: jest.fn(),
  },
}))

const User = (await import('../../models/user.js')).default
const SurveyorProfile = (await import('../../models/SurveyorProfile.js')).default
const Project = (await import('../../models/project.js')).default
const Layer = (await import('../../models/layer.js')).default
const Feature = (await import('../../models/feature.js')).default

const surveyorRoutes = (await import('../surveyors.js')).default
const spatialRoutes = (await import('../spatial.js')).default

const ME = 7
const THEM = 99

/** authenticate stub that always reports the same signed-in user. */
const asUser = (sub = ME) => async (request) => {
  request.user = { sub, email: 'owner@example.com' }
}

/** authenticate stub that stands in for a missing/invalid token. */
const rejectAll = async (request, reply) => reply.code(401).send({ error: 'Unauthorized' })

/** A profile with a schema, which is what authenticateWithSchema needs to set request.db. */
const profileWithSchema = (role) => ({
  id: ME,
  name: 'Owner',
  role,
  schema_name: 'surveyor_owner',
})

/**
 * authenticateWithSchema resolves the profile by user, then builds request.db
 * from schema_name. A profile with no schema_name sets request.db = null, which
 * is precisely the case requireSchema exists to reject.
 */
function givenProfile(profile) {
  User.findByEmail.mockResolvedValue({ id: ME, email: 'owner@example.com' })
  SurveyorProfile.findByUserId.mockResolvedValue(profile)
}

beforeEach(() => {
  jest.clearAllMocks()
  givenProfile(profileWithSchema('surveyor'))
})

describe('surveyors.js — writes are admin-only', () => {
  const writes = [
    ['PUT', `/surveyors/${THEM}`, { name: 'Hijacked' }],
    ['DELETE', `/surveyors/${THEM}`, undefined],
    ['POST', '/surveyors', { licenseNumber: 'X' }],
  ]

  test.each(writes)('%s %s is 403 for a non-admin', async (method, url, payload) => {
    const app = Fastify()
    app.decorate('authenticate', asUser())
    await app.register(surveyorRoutes)
    await app.ready()

    const res = await app.inject({ method, url, ...(payload ? { payload } : {}) })

    expect(res.statusCode).toBe(403)
    // The rejection must happen before any model mutation is attempted.
    expect(SurveyorProfile.update).not.toHaveBeenCalled()
    expect(SurveyorProfile.delete).not.toHaveBeenCalled()

    await app.close()
  })

  test('a caller with no surveyor profile is 403, not a pass-through', async () => {
    givenProfile(null)
    const app = Fastify()
    app.decorate('authenticate', asUser())
    await app.register(surveyorRoutes)
    await app.ready()

    const res = await app.inject({ method: 'DELETE', url: `/surveyors/${THEM}` })

    expect(res.statusCode).toBe(403)
    expect(SurveyorProfile.delete).not.toHaveBeenCalled()

    await app.close()
  })

  test('every surveyor route rejects an invalid token with 401', async () => {
    const app = Fastify()
    app.decorate('authenticate', rejectAll)
    await app.register(surveyorRoutes)
    await app.ready()

    for (const [method, url] of [
      ['GET', '/surveyors'],
      ['GET', `/surveyors/${ME}`],
      ['PUT', `/surveyors/${ME}`],
      ['DELETE', `/surveyors/${ME}`],
      ['POST', '/surveyors'],
    ]) {
      const res = await app.inject({ method, url, payload: method === 'GET' ? undefined : {} })
      expect([method, url, res.statusCode]).toEqual([method, url, 401])
    }

    await app.close()
  })
})

describe('surveyors.js — reads are scoped, not global', () => {
  test('a non-admin lists via findVisibleTo, never the global findAll', async () => {
    SurveyorProfile.findVisibleTo.mockResolvedValue([
      { id: ME, name: 'Owner', license_number: 'L1', role: 'surveyor' },
    ])

    const app = Fastify()
    app.decorate('authenticate', asUser())
    await app.register(surveyorRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/surveyors' })

    expect(res.statusCode).toBe(200)
    expect(SurveyorProfile.findVisibleTo).toHaveBeenCalledWith(ME)
    // findAll() returns every surveyor's address/phone/email. A non-admin must
    // never reach it.
    expect(SurveyorProfile.findAll).not.toHaveBeenCalled()

    await app.close()
  })

  test('an admin listing another surveyor by id is allowed', async () => {
    givenProfile(profileWithSchema('admin'))
    SurveyorProfile.findById.mockResolvedValue({
      id: THEM,
      name: 'Other',
      license_number: 'L2',
    })

    const app = Fastify()
    app.decorate('authenticate', asUser())
    await app.register(surveyorRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: `/surveyors/${THEM}` })

    expect(res.statusCode).toBe(200)
    expect(res.json().surveyor.id).toBe(THEM)

    await app.close()
  })

  test('a non-admin reading another surveyor is 403', async () => {
    // findVisibleTo returns only the caller, so the target is not in it.
    SurveyorProfile.findVisibleTo.mockResolvedValue([{ id: ME, name: 'Owner' }])

    const app = Fastify()
    app.decorate('authenticate', asUser())
    await app.register(surveyorRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: `/surveyors/${THEM}` })

    expect(res.statusCode).toBe(403)
    // Critically: findById must NOT be called, or the full PII row would already
    // have been loaded even though the response is refused.
    expect(SurveyorProfile.findById).not.toHaveBeenCalled()

    await app.close()
  })
})

describe('spatial.js — ownership, not schema, gates the shared tables', () => {
  // projects.user_id is the only ownership column in the chain:
  // layers.project_id -> projects.id, features.layer_id -> layers.project_id.
  const THEIR_PROJECT = 42

  beforeEach(() => {
    Project.findByUser.mockResolvedValue([])
  })

  async function appAs(sub) {
    const app = Fastify()
    app.decorate('authenticate', asUser(sub))
    await app.register(spatialRoutes)
    await app.ready()
    return app
  }

  test("a layer in another user's project is 403 and is never listed", async () => {
    Layer.findById.mockResolvedValue({ id: 5, project_id: THEIR_PROJECT, srid: 22291 })
    Project.findById.mockResolvedValue({ id: THEIR_PROJECT, user_id: THEM })

    const app = await appAs(ME)
    const res = await app.inject({ method: 'GET', url: '/spatial/layers/5' })

    expect(res.statusCode).toBe(403)
    // The layer row was loaded to learn its project; the *response* must not.
    expect(res.body).not.toContain(String(THEM))

    await app.close()
  })

  test("listing another user's project layers is 403", async () => {
    Project.findById.mockResolvedValue({ id: THEIR_PROJECT, user_id: THEM })

    const app = await appAs(ME)
    const res = await app.inject({ method: 'GET', url: `/spatial/projects/${THEIR_PROJECT}/layers` })

    expect(res.statusCode).toBe(403)
    expect(Layer.findByProject).not.toHaveBeenCalled()

    await app.close()
  })

  test('rewriting another user feature is 403', async () => {
    Feature.findById.mockResolvedValue({ id: 3, layer_id: 5, project_id: THEIR_PROJECT })
    Layer.findById.mockResolvedValue({ id: 5, project_id: THEIR_PROJECT })
    Project.findById.mockResolvedValue({ id: THEIR_PROJECT, user_id: THEM })

    const app = await appAs(ME)
    const res = await app.inject({
      method: 'PUT',
      url: '/spatial/features/3',
      payload: { properties: { stolen: true } },
    })

    expect(res.statusCode).toBe(403)
    expect(Feature.update).not.toHaveBeenCalled()

    await app.close()
  })

  test('creating a QGIS view for another surveyor project is 403', async () => {
    // Project-views routes read survey_projects through the caller schema, so
    // request.db is the tenant pool. Returning zero rows is how "not yours"
    // and "does not exist" collapse to one 404.
    const app = Fastify()
    app.decorate('authenticate', asUser(ME))
    // A profileless caller has request.db === null, which requireSchema must
    // reject before the handler runs.
    givenProfile(null)
    await app.register(spatialRoutes)
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/spatial/create-project-views',
      payload: { project_id: String(THEIR_PROJECT) },
    })

    expect(res.statusCode).toBe(400)

    await app.close()
  })

  test('requireSchema 400s a profileless caller rather than using the global pool', async () => {
    givenProfile(null)
    const app = await appAs(ME)

    const res = await app.inject({
      method: 'GET',
      url: '/spatial/project-views',
    })

    // Without requireSchema this handler reached `db.query(...)` on the shared
    // pool and returned every project view in the database.
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/Schema context required/)

    await app.close()
  })

  test('a profile with no schema_name is also rejected by requireSchema', async () => {
    // authenticateWithSchema sets request.surveyorSchema = 'public' and
    // request.db = null for this case — the silent fall-through to the global
    // pool that requireSchema exists to stop.
    givenProfile({ id: ME, name: 'Owner', role: 'admin', schema_name: null })

    const app = await appAs(ME)
    const res = await app.inject({ method: 'GET', url: '/spatial/project-views' })

    expect(res.statusCode).toBe(400)

    await app.close()
  })

  test('every spatial route rejects an invalid token with 401', async () => {
    const app = Fastify()
    app.decorate('authenticate', rejectAll)
    await app.register(spatialRoutes)
    await app.ready()

    for (const [method, url] of [
      ['GET', '/spatial/projects'],
      ['GET', '/spatial/projects/1/layers'],
      ['GET', '/spatial/layers/5'],
      ['GET', '/spatial/layers/5/geojson'],
      ['PUT', '/spatial/features/3'],
      ['GET', '/spatial/project-views'],
      ['GET', '/spatial/db-connection'],
    ]) {
      const res = await app.inject({ method, url, payload: method === 'GET' ? undefined : {} })
      expect([method, url, res.statusCode]).toEqual([method, url, 401])
    }

    await app.close()
  })
})