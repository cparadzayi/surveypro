import { describe, test, expect } from '@jest/globals'
import { generateGeoPDF } from '../pdfkitGeoPDF.js'
import { sampleDevelopedLargeStandsPlan } from './fixtures/sampleDevelopedLargeStandsPlan.js'
import { sampleUndevelopedSmallStandsPlan } from './fixtures/sampleUndevelopedSmallStandsPlan.js'

describe('PDF township scale mandate (area-majority based)', () => {
  const logger = { info: () => {}, warn: () => {}, error: () => {} }

  test(
    'general-developed plan with majority >200m2 stands is no longer forced to 1:500 and needs no ' +
      'tiling, but the schedule of areas still overlaps the figure — documented, accepted ' +
      'limitation under the real (smaller) SI 727 paper sizes (same root cause as ' +
      'pdfkitGeoPDF.scheduleNoOverlap.test.js); see ' +
      'docs/superpowers/specs/2026-08-11-block-placement-real-paper-robustness-design.md',
    async () => {
      // Intentionally brittle: this fixture's actual geometry is this test's real
      // reproduction of the known limitation. If block-definitions.js or the fixture
      // changes, this test breaking is expected — verify the new behavior reflects
      // genuine non-clearance (not a regression in the escalation logic itself) before
      // updating the expectation.
      const result = await generateGeoPDF(sampleDevelopedLargeStandsPlan, logger)
      expect(result.scale).not.toBe('1:500')
      expect(result.tileGrid).toBeFalsy()
      expect(result.warnings.scheduleOfAreasOverlapsPolygon).toBeDefined()
    },
    30000
  )

  test('general-undeveloped plan with majority <=200m2 stands is now forced to exactly 1:500', async () => {
    const result = await generateGeoPDF(sampleUndevelopedSmallStandsPlan, logger)
    expect(result.scale).toBe('1:500')
  })
})
