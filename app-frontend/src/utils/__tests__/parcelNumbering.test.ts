/**
 * Tests for nextDesignation — auto-incrementing parcel designations.
 */

import { describe, it, expect } from 'vitest'
import { nextDesignation } from '../parcelNumbering'

describe('nextDesignation', () => {
  it('increments a prefixed designation, keeping the prefix', () => {
    expect(nextDesignation('STAND 314')).toBe('STAND 315')
  })

  it('increments a plain number', () => {
    expect(nextDesignation('314')).toBe('315')
  })

  it('increments the digit run and keeps a trailing alpha suffix', () => {
    expect(nextDesignation('LOT 2283A')).toBe('LOT 2284A')
  })

  it('preserves zero-padding width', () => {
    expect(nextDesignation('Erf 007')).toBe('Erf 008')
  })

  it('grows past the padding width when needed', () => {
    expect(nextDesignation('099')).toBe('100')
  })

  it('increments only the last run of digits', () => {
    expect(nextDesignation('12-34')).toBe('12-35')
  })

  it('rolls a 9 correctly', () => {
    expect(nextDesignation('STAND 319')).toBe('STAND 320')
  })

  it('returns empty string when there are no digits', () => {
    expect(nextDesignation('Remainder')).toBe('')
    expect(nextDesignation('Outside Figure')).toBe('')
  })

  it('returns empty string for empty or nullish input', () => {
    expect(nextDesignation('')).toBe('')
    // @ts-expect-error — guarding runtime nullish
    expect(nextDesignation(undefined)).toBe('')
    // @ts-expect-error — guarding runtime nullish
    expect(nextDesignation(null)).toBe('')
  })
})
