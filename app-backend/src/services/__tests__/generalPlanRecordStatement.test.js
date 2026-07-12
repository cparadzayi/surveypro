import { describe, test, expect } from '@jest/globals'
import { generateDXF } from '../dxfGenerator.js'
import { GENERAL_PLAN_RECORD_STATEMENT } from '../../utils/si727Constants.js'
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js'

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
const NEEDLE = 'SURVEY RECORD NUMBER'

describe('General Plan survey-record-number footer (DXF)', () => {
  test('the constant carries the required statement + a fill-in blank', () => {
    expect(GENERAL_PLAN_RECORD_STATEMENT).toContain(
      'THE CO-ORDINATES OF ALL POINTS DEPICTED ON THIS GENERAL PLAN ARE FILED IN SURVEY RECORD NUMBER'
    )
    expect(GENERAL_PLAN_RECORD_STATEMENT.endsWith(' ')).toBe(true) // trailing blank to write the number
  })

  test('renders on a general-developed plan', () => {
    const { buffer } = generateDXF({ ...sampleMinimalPlan, planType: 'general-developed' }, fakeLogger)
    const dxf = buffer.toString()
    expect(dxf).toContain(NEEDLE)
    // Bottom-margin footer fields
    expect(dxf).toContain('COMPILATION')
    expect(dxf).toContain('S.R.')
    expect(dxf).toContain('B...')
  })

  test('renders on a general-undeveloped plan', () => {
    const { buffer } = generateDXF({ ...sampleMinimalPlan, planType: 'general-undeveloped' }, fakeLogger)
    expect(buffer.toString()).toContain(NEEDLE)
  })

  test('absent when the plan type is not a general plan', () => {
    const { buffer } = generateDXF({ ...sampleMinimalPlan, planType: 'diagram' }, fakeLogger)
    const dxf = buffer.toString()
    expect(dxf).not.toContain(NEEDLE)
    expect(dxf).not.toContain('COMPILATION')
  })
})
