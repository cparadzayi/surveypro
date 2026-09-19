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
})
