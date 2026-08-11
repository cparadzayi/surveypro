import { describe, test, expect } from '@jest/globals'
import { generateGeoPDF } from '../pdfkitGeoPDF.js'
import { sampleDevelopedLargeStandsPlan } from './fixtures/sampleDevelopedLargeStandsPlan.js'
import { sampleUndevelopedSmallStandsPlan } from './fixtures/sampleUndevelopedSmallStandsPlan.js'

describe('PDF township scale mandate (area-majority based)', () => {
  const logger = { info: () => {}, warn: () => {}, error: () => {} }

  test(
    'general-developed plan with majority >200m2 stands is no longer forced to 1:500 and needs no tiling',
    async () => {
      const result = await generateGeoPDF(sampleDevelopedLargeStandsPlan, logger)
      expect(result.scale).not.toBe('1:500')
      expect(result.tileGrid).toBeFalsy()
      expect(result.warnings.scheduleOfAreasOverlapsPolygon).toBeFalsy()
    },
    30000
  )

  test('general-undeveloped plan with majority <=200m2 stands is now forced to exactly 1:500', async () => {
    const result = await generateGeoPDF(sampleUndevelopedSmallStandsPlan, logger)
    expect(result.scale).toBe('1:500')
  })
})
