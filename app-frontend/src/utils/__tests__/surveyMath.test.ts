import { describe, it, expect } from 'vitest'
import { f3s } from '../surveyMath'

describe('f3s', () => {
  it('formats a positive number with an explicit + sign and 3 decimals', () => {
    expect(f3s(0.0495)).toBe('+0.050')
  })

  it('formats a negative number with a - sign and 3 decimals', () => {
    expect(f3s(-0.0014)).toBe('-0.001')
  })

  it('formats exactly zero with a + sign, matching the existing f4s convention', () => {
    expect(f3s(0)).toBe('+0.000')
  })

  it('returns an em dash for non-numbers, matching f3/f4/f4s', () => {
    expect(f3s(undefined as unknown as number)).toBe('—')
    expect(f3s(null as unknown as number)).toBe('—')
  })
})
