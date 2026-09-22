/**
 * The field book cover names the assistant and the instruments, so the project
 * API must carry them. Validation runs before preHandler in Fastify's lifecycle,
 * so these assertions exercise the compiled schema without auth or a database.
 */

import { describe, test, expect } from '@jest/globals'
import SurveyProject from '../../models/SurveyProject.js'

describe('survey project cover fields', () => {
  test('update writes the four cover columns rather than skipping them', () => {
    // allowedColumns is the whitelist update() filters against; a column missing
    // from it is silently dropped with a console warning, which is how a field can
    // appear to save and not persist.
    const source = SurveyProject.update.toString()

    expect(source).toContain('assisted_by')
    expect(source).toContain('instrument_description')
    expect(source).toContain('instrument_base_serial')
    expect(source).toContain('instrument_rover_serial')
  })

  test('update guards the SET list against the live table, so an unapplied migration cannot 500', () => {
    // surveyor schemas lag the migration list on machines where e.g. 089 is
    // unapplied; emitting SET for a column the table lacks is a Postgres 42703
    // that surfaced as "Failed to update survey project" (500). update() must
    // introspect information_schema for the schema-scoped connection and drop
    // such columns, keeping the whitelist forward-looking for when the migration
    // is applied.
    const source = SurveyProject.update.toString()

    expect(source).toContain('information_schema.columns')
    expect(source).toContain("current_schema()")
    expect(source).toContain('existingColumns.has(snakeKey)')
    expect(source).toContain('migration unapplied')
  })
})
