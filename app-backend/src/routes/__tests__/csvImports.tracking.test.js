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
 * standing up auth or a database: `authenticateWithSchema` is swapped for a
 * no-op and the route's `fastify.pg` is the fake connection.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import Fastify from 'fastify'

const fakeDb = {
  query: jest.fn(),
}

jest.unstable_mockModule('../../utils/schemaAuth.js', () => ({ authenticateWithSchema: async (request, reply) => {} }))

const { default: csvImportRoutes } = await import('../csvImports.js')

function buildApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async () => {})
  app.decorate('pg', fakeDb)
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