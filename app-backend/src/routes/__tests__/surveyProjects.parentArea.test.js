/**
 * Project Setup's "Original Area of Parent Property (m²)" was typed into the
 * form and then silently lost: there was no parent_area column, no emit from
 * the form, no field in the workflow update, and no entry in the model's
 * allowedColumns (which drops unknown keys with a console warning). Pin both
 * ends of the handoff we can exercise without a Vue mount.
 */

import { describe, test, expect } from '@jest/globals'
import SurveyProject from '../../models/SurveyProject.js'

/** A client just real enough for update(): introspect, UPDATE, COMMIT, release. */
const fakeDb = (columns) => {
  const calls = []
  const client = {
    query: async (sql, params) => {
      calls.push({
        sql: String(sql).replace(/\s+/g, ' ').trim(),
        params,
      })
      if (sql.includes('information_schema.columns')) {
        return { rows: columns.map(column_name => ({ column_name })) }
      }
      if (sql.includes('UPDATE survey_projects')) {
        return { rows: [{ id: 7, parent_area: params?.[0] ?? null }] }
      }
      return { rows: [] }
    },
    release: () => {},
  }
  return { db: { connect: async () => client }, calls }
}

describe('project setup: parent area reaches the project record', () => {
  test('update writes parentArea to the parent_area column', async () => {
    const { db, calls } = fakeDb(['parent_area'])

    const project = await SurveyProject.update(db, 7, { parentArea: 1234.5 })

    const update = calls.find(c => c.sql.startsWith('UPDATE survey_projects') && c.sql.includes('SET'))
    expect(update).toBeDefined()
    expect(update.sql).toContain('parent_area = $1')
    expect(update.params[0]).toBe(1234.5)
    expect(project.parent_area).toBe(1234.5)
  })

  test('a schema without migration 110 skips the column instead of 500-ing', async () => {
    const { db, calls } = fakeDb(['name'])

    const project = await SurveyProject.update(db, 7, { parentArea: 1234.5 })

    const update = calls.find(c => c.sql.startsWith('UPDATE survey_projects') && c.sql.includes('SET'))
    expect(update).toBeUndefined()
    expect(project).toBeNull()
  })
})
