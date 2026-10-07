/**
 * POST /csv-imports tracking behaviour.
 *
 * Migration 092 made (project_id, csv_hash) UNIQUE per surveyor schema, yet the
 * route deliberately supports re-importing the same CSV for corrections ("Allow
 * re-import ... This is intentional"). Before this fix the handler SELECTed,
 * saw the existing row, then INSERTed anyway and 500'd on the unique index —
 * "Failed to load resource: 500" in every tenant project with a re-import.
 *
 * The documented contract is preserved by returning the existing tracking row
 * (reused: true) instead of re-inserting. These tests pin that behaviour without
 * standing up auth or a database: the schema hooks are swapped for no-ops and
 * `request.db` is set to the fake connection.
 *
 * Note `request.db`, not `fastify.pg`. The handler used to read
 * `request.db || fastify.pg`, and that fallback is exactly what this suite used to
 * rely on -- a caller with no schema context silently continued on the shared
 * pool. The fallback is gone (see the Authorization model section in CLAUDE.md),
 * so the fake is now injected where production sets it: on the request, and
 * `fastify.pg` is a deliberately DIFFERENT object that throws if reached. That
 * turns a regression back to the fallback into a test failure rather than a
 * silent pass, because both names used to point at the same mock.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import Fastify from 'fastify'

const fakeDb = {
  query: jest.fn(),
}

// Both hooks are stubbed to pass, and the fake sets request.db the way
// authenticateWithSchema does in production. requireSchema must be re-exported
// even though it does nothing here: unstable_mockModule replaces the module
// wholesale, so omitting a name the route imports makes its
// `import { requireSchema }` fail to link.
//
// Deliberately NOT spreading the real module: importing it pulls in
// config/db.js's live pg.Pool, which keeps the event loop busy and made every
// inject here hit jest's 5s timeout. requireSchema's fail-closed behaviour is
// pinned against the real implementation in authorization.scoping.test.js, which
// stubs the data sources instead of this module.
jest.unstable_mockModule('../../utils/schemaAuth.js', () => ({
  authenticateWithSchema: async (request) => {
    request.db = fakeDb
    request.surveyorSchema = 'surveyor_test'
  },
  requireSchema: async () => {}
}))

const { default: csvImportRoutes } = await import('../csvImports.js')

function buildApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async () => {})
  // A distinct object from fakeDb, deliberately. If a handler ever regresses to
  // the `request.db || fastify.pg` fallback, it will reach THIS one and the
  // fakeDb.query assertions will fail -- rather than silently passing because
  // both names happened to point at the same mock.
  app.decorate('pg', {
    query: jest.fn(() => {
      throw new Error('handler fell back to the global pool instead of request.db')
    })
  })
  app.register(csvImportRoutes)
  return app
}

const payload = { project_id: 20, csv_content: 'name,y,x\nA,1,2', filename: 'brackenhurst.csv', point_count: 3 }

describe('POST /csv-imports', () => {
  beforeEach(() => {
    fakeDb.query.mockReset()
  })

  test('reuses the existing tracking row when the same CSV is re-imported (no unique-index 500)', async () => {
    fakeDb.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM project_csv_imports')) {
        return { rows: [{ id: 42, project_id: 20, csv_hash: 'abc', point_count: 3 }] }
      }
      throw new Error('INSERT must not be reached for a duplicate csv_hash')
    })

    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/csv-imports', payload })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ data: { id: 42 }, reused: true })
    expect(fakeDb.query).toHaveBeenCalledTimes(1)

    await app.close()
  })

  test('creates a fresh tracking row for a genuinely new CSV', async () => {
    fakeDb.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM project_csv_imports')) return { rows: [] }
      if (sql.includes('INSERT INTO project_csv_imports')) {
        return { rows: [{ id: 43, project_id: 20, csv_hash: 'xyz', point_count: 3 }] }
      }
      throw new Error('unexpected query')
    })

    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/csv-imports', payload })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ data: { id: 43 } })
    expect(res.json().reused).toBeUndefined()

    await app.close()
  })

  test('validates required fields before touching the database', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/csv-imports', payload: { project_id: 20, filename: 'x.csv' } })

    expect(res.statusCode).toBe(400)
    expect(fakeDb.query).not.toHaveBeenCalled()

    await app.close()
  })
})

/**
 * `imported_by` and the read-side display name.
 *
 * Both defects were invisible while this route was unreachable. GET
 * /csv-imports/:id sat behind the sync-hook hang described in CLAUDE.md, so its
 * query had never been executed by a request; and POST recorded a NULL
 * importer, which nothing asserted.
 *
 * - The read query selected `u.username`, but `public.users` has no such
 *   column (it has `email`), so the route raised 42703 on every call. The alias
 *   `imported_by_username` is kept because services/csvImports.ts declares it.
 * - POST read `request.user?.id`, but the JWT payload is `{ sub, email }` --
 *   there is no `id` claim, so every import was stored with a NULL importer.
 */
describe('POST /csv-imports: importer identity comes from the JWT sub claim', () => {
  beforeEach(() => {
    fakeDb.query.mockReset()
  })

  /**
   * Same app as buildApp(), but with the authenticated principal on the
   * request. The production `app.authenticate` verifies the JWT and leaves the
   * decoded payload — { sub, email } — as request.user.
   */
  function buildAppAs(user) {
    const app = Fastify({ logger: false })
    app.decorate('authenticate', async (request) => {
      request.user = user
    })
    app.decorate('pg', {
      query: jest.fn(() => {
        throw new Error('handler fell back to the global pool instead of request.db')
      })
    })
    app.register(csvImportRoutes)
    return app
  }

  /** Returns the value bound to the imported_by column of the INSERT. */
  function captureImportedBy() {
    let bound
    fakeDb.query.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM project_csv_imports')) return { rows: [] }
      if (sql.includes('INSERT INTO project_csv_imports')) {
        // project_id, csv_hash, point_count, filename, imported_by, crs, metadata
        bound = params[4]
        return { rows: [{ id: 44, project_id: 20, imported_by: bound }] }
      }
      throw new Error('unexpected query')
    })
    return () => bound
  }

  test('uses request.user.sub, the claim the JWT actually carries', async () => {
    const read = captureImportedBy()
    const app = buildAppAs({ sub: 7, email: 'surveyor@example.com' })

    const res = await app.inject({ method: 'POST', url: '/csv-imports', payload })

    expect(res.statusCode).toBe(200)
    expect(read()).toBe(7)

    await app.close()
  })

  test('falls back to request.user.id when there is no sub claim', async () => {
    const read = captureImportedBy()
    const app = buildAppAs({ id: 9, email: 'legacy@example.com' })

    const res = await app.inject({ method: 'POST', url: '/csv-imports', payload })

    expect(res.statusCode).toBe(200)
    expect(read()).toBe(9)

    await app.close()
  })

  test('records null rather than undefined when the principal carries no id', async () => {
    const read = captureImportedBy()
    const app = buildAppAs({ email: 'noid@example.com' })

    const res = await app.inject({ method: 'POST', url: '/csv-imports', payload })

    expect(res.statusCode).toBe(200)
    expect(read()).toBeNull()

    await app.close()
  })
})

describe('GET /csv-imports/:id: the display name column exists', () => {
  beforeEach(() => {
    fakeDb.query.mockReset()
  })

  test('selects u.email, not the non-existent u.username', async () => {
    let sql = null
    fakeDb.query.mockImplementation(async (text) => {
      sql = text
      return { rows: [{ id: 42, imported_by_username: 'surveyor@example.com' }] }
    })

    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/csv-imports/42' })

    expect(res.statusCode).toBe(200)
    expect(sql).toContain('u.email AS imported_by_username')
    // `public.users` columns: id, email, password_hash, user_type, is_active,
    // last_login, created_at, updated_at. There is no `username`.
    expect(sql).not.toMatch(/\bu\.username\b/)
    // The alias is in the GROUP BY too; a mismatch there is a second 42803.
    expect(sql).toMatch(/GROUP BY i\.id, u\.email/)

    await app.close()
  })
})