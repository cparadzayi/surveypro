/**
 * Regression guard for the Fastify 5 "sync preHandler silently hangs the
 * request" defect, and for the deny behaviour it was masking.
 *
 * THE BUG. fastify/lib/hooks.js advances a hook chain only when the hook
 * returns a thenable:
 *
 *     const result = iterator(functions[i++], request, reply, next)
 *     if (result && typeof result.then === 'function') { result.then(...) }
 *
 * There is no else branch. A *synchronous* hook that falls off the end returns
 * undefined, so next() is never called and the request hangs: no error, no log
 * line, no server-side timeout, the client waits forever. A sync hook that
 * takes `done` as a third parameter is fine; ours did not have one.
 *
 * requireSchema and requireAdmin were both declared `(request, reply)`. They
 * are wired into the preHandler array of ~48 routes across
 * landParcels / coordinatePoints / csvImports / survey-projects / spatial and
 * others, so every request to those routes hung.
 *
 * WHY 1518 TESTS PASSED ANYWAY. Every prior test of these two hooks asserted a
 * DENY path (400 / 403), and a deny path calls reply.send() — which finishes
 * the response without ever needing next(). So the deny tests exercised a code
 * path that works, and the broken allow path had no coverage at all. That is
 * why the suite was fully green while GET /api/survey-projects,
 * GET /api/coordinate-points and GET /api/spatial/project-views never
 * responded against the live server.
 *
 * The lesson encoded below: assert the ALLOW path through the real hook, and
 * bound the wait, because a hang produces no failure message of its own.
 */

import { describe, test, expect, afterAll } from '@jest/globals'
import Fastify from 'fastify'

import { requireSchema, requireAdmin } from '../schemaAuth.js'
import { pool } from '../../config/db.js'

// Importing schemaAuth.js pulls in config/db.js, whose module-level startup
// probe opens a real pool and checks the database. Nothing here queries it, but
// the pool still holds an idle socket for idleTimeoutMillis (30s) after the last
// test, which makes Jest report "did not exit one second after the test run has
// completed" and force-kills the worker. Close it explicitly.
afterAll(async () => {
  await pool.end()
})

const ME = { sub: 3, email: 'cparadzayi@gmail.com' }
const SECRET = 'test-secret-that-is-long-enough-to-be-accepted-xx'

// Long enough to exceed a hung hook, short enough not to slow the suite.
const HANDSHAKE_MS = 4000

/**
 * Race a route call against a timeout.
 *
 * A hung chain resolves to nothing, so without this the test would sit until
 * Jest's own 5s limit and report a generic timeout that does not point at the
 * hook. This names the actual cause.
 */
function withDeadline(promise, label) {
  let timer
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}: hook chain hung, handler never ran`)),
      HANDSHAKE_MS
    )
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

/** A reply double that records whether the hook short-circuited the chain. */
function replySpy() {
  const sent = {}
  const reply = {
    code(status) {
      sent.status = status
      return reply
    },
    send(payload) {
      sent.payload = payload
      return reply
    },
  }
  return { reply, sent }
}

/**
 * Mount a route whose preHandler chain ends in a real guard hook.
 *
 * `decorateContext` stands in for authenticateWithSchema: it performs the same
 * request decoration without touching Postgres. The guard under test is the
 * real one — mocking it would hide the very defect this file exists for.
 */
async function appWithGuard(guard, context, handler = async () => ({ ok: true })) {
  const app = Fastify({ logger: false })

  app.decorate('authenticate', async () => {})
  app.decorate('passThrough', async (request) => Object.assign(request, context))

  app.get(
    '/probe',
    { preHandler: [app.authenticate, app.passThrough, guard] },
    handler
  )

  await app.ready()
  return app
}

const TENANT = {
  surveyorSchema: 'surveyor_surveyor_cparadzayi',
  surveyorProfile: { id: 3, role: 'admin', schema_name: 'surveyor_surveyor_cparadzayi' },
  db: { tenant: true },
}

describe('allow path: a guard that passes must let the handler run', () => {
  test('requireSchema does not stall a request it permits', async () => {
    const app = await appWithGuard(requireSchema, TENANT)

    const res = await withDeadline(
      app.inject({ method: 'GET', url: '/probe' }),
      'requireSchema allow path'
    )

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })

    await app.close()
  })

  test('requireAdmin does not stall a request it permits', async () => {
    const app = await appWithGuard(requireAdmin, TENANT)

    const res = await withDeadline(
      app.inject({ method: 'GET', url: '/probe' }),
      'requireAdmin allow path'
    )

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })

    await app.close()
  })

  test('the real request decoration is visible to the handler', async () => {
    const app = await appWithGuard(
      requireSchema,
      TENANT,
      async (request) => ({ ok: true, schema: request.surveyorSchema })
    )

    const res = await withDeadline(
      app.inject({ method: 'GET', url: '/probe' }),
      'requireSchema decoration passthrough'
    )

    expect(res.json()).toEqual({
      ok: true,
      schema: 'surveyor_surveyor_cparadzayi',
    })

    await app.close()
  })
})

describe('deny path: guards still reject, unchanged', () => {
  test('requireSchema 400s when there is no schema context', async () => {
    const app = await appWithGuard(requireSchema, {
      surveyorSchema: null,
      surveyorProfile: null,
      db: null,
    })

    const res = await app.inject({ method: 'GET', url: '/probe' })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/schema context required/i)

    await app.close()
  })

  test('requireSchema 400s when surveyorSchema is set but db is not', async () => {
    // The half-populated case authenticateWithSchema can produce.
    const app = await appWithGuard(requireSchema, {
      surveyorSchema: 'public',
      surveyorProfile: { id: 3, role: 'admin' },
      db: null,
    })

    const res = await app.inject({ method: 'GET', url: '/probe' })

    expect(res.statusCode).toBe(400)

    await app.close()
  })

  test('requireAdmin 403s a non-admin role', async () => {
    const app = await appWithGuard(requireAdmin, {
      surveyorSchema: 'surveyor_surveyor_demo',
      surveyorProfile: { id: 1, role: 'surveyor' },
      db: { tenant: true },
    })

    const res = await app.inject({ method: 'GET', url: '/probe' })

    expect(res.statusCode).toBe(403)
    expect(res.json().error).toMatch(/forbidden/i)

    await app.close()
  })

  test('requireAdmin 403s a caller with no profile', async () => {
    const app = await appWithGuard(requireAdmin, {
      surveyorSchema: null,
      surveyorProfile: null,
      db: null,
    })

    const res = await app.inject({ method: 'GET', url: '/probe' })

    expect(res.statusCode).toBe(403)
    expect(res.json().error).toMatch(/no surveyor profile/i)

    await app.close()
  })
})

describe('hook shape: the sync-hook defect cannot come back silently', () => {
  // The functional tests above fail in ~4s with a clear message if a guard goes
  // sync again. These assert the shape directly so the failure is instant and
  // points at the declaration rather than at a timeout.
  test.each([
    ['requireSchema', requireSchema],
    ['requireAdmin', requireAdmin],
  ])('%s is an async function', (_name, hook) => {
    expect(hook.constructor.name).toBe('AsyncFunction')
  })

  test.each([
    ['requireSchema', requireSchema, TENANT],
    ['requireAdmin', requireAdmin, TENANT],
  ])('%s resolves rather than returning undefined on the allow path', async (_name, hook, ctx) => {
    // This is the precise condition Fastify's runner branches on. Returning
    // undefined here is what stalled every permitted request.
    const { reply, sent } = replySpy()
    const returned = hook({ ...ctx }, reply)

    expect(returned).toBeInstanceOf(Promise)
    await expect(returned).resolves.toBeUndefined()

    // It must also not have short-circuited: no reply.send() on the happy path.
    expect(sent.payload).toBeUndefined()
  })
})

describe('the Fastify behaviour this test depends on', () => {
  // If a Fastify upgrade ever makes sync hooks legal again, the tests above
  // start passing for the wrong reason. This pins the underlying contract so
  // that change is visible here rather than surprising.
  test('a sync preHandler returning undefined stalls the chain', async () => {
    const app = Fastify({ logger: false })

    let handlerRan = false
    app.get(
      '/sync-hook',
      { preHandler: function syncGuard(request, reply) { /* returns undefined */ } },
      async () => {
        handlerRan = true
        return { ok: true }
      }
    )
    await app.ready()

    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 1500)

    let error
    try {
      await app.inject({ method: 'GET', url: '/sync-hook', signal: ac.signal })
    } catch (e) {
      error = e
    } finally {
      clearTimeout(timer)
    }

    expect(handlerRan).toBe(false)
    expect(error).toBeDefined()

    await app.close()
  })

  test('an async preHandler returning undefined advances the chain', async () => {
    const app = Fastify({ logger: false })

    let handlerRan = false
    app.get(
      '/async-hook',
      { preHandler: async function asyncGuard() { /* resolves undefined */ } },
      async () => {
        handlerRan = true
        return { ok: true }
      }
    )
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/async-hook' })

    expect(handlerRan).toBe(true)
    expect(res.statusCode).toBe(200)

    await app.close()
  })
})
