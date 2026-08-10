import { describe, test, expect } from '@jest/globals'
import { generateDXF } from '../dxfGenerator.js'
import { sampleDevelopedLargeStandsPlan } from './fixtures/sampleDevelopedLargeStandsPlan.js'
import { sampleUndevelopedSmallStandsPlan } from './fixtures/sampleUndevelopedSmallStandsPlan.js'

describe('DXF township scale mandate (area-majority based)', () => {
  const logger = { info: () => {}, warn: () => {}, error: () => {} }

  test('general-developed plan with majority >200m2 stands is no longer forced to 1:500', () => {
    const { buffer } = generateDXF(sampleDevelopedLargeStandsPlan, logger)
    const text = buffer.toString('utf8')
    expect(text).not.toContain('SCALE 1:500')
  })

  test('general-undeveloped plan with majority <=200m2 stands is now forced to exactly 1:500', () => {
    const { buffer } = generateDXF(sampleUndevelopedSmallStandsPlan, logger)
    const text = buffer.toString('utf8')
    expect(text).toContain('SCALE 1:500')
  })
})
