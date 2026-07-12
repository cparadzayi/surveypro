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

  describe('skip-to-next-free (existence check)', () => {
    it('returns the plain +1 when it is not already taken', () => {
      expect(nextDesignation('STAND 314', ['STAND 314'])).toBe('STAND 315')
    })

    it('skips forward past taken numbers to the next free one', () => {
      const existing = ['STAND 314', 'STAND 315', 'STAND 316']
      expect(nextDesignation('STAND 314', existing)).toBe('STAND 317')
    })

    it('compares case- and whitespace-insensitively', () => {
      const existing = ['stand 315', '  STAND 316 ']
      expect(nextDesignation('STAND 314', existing)).toBe('STAND 317')
    })

    it('skips taken numbers while preserving suffix and padding', () => {
      expect(nextDesignation('Erf 007', ['Erf 008', 'Erf 009'])).toBe('Erf 010')
      expect(nextDesignation('LOT 2283A', ['LOT 2284A'])).toBe('LOT 2285A')
    })

    it('ignores an empty existing list', () => {
      expect(nextDesignation('STAND 314', [])).toBe('STAND 315')
    })

    it('still returns empty when the input has no digits', () => {
      expect(nextDesignation('Remainder', ['Remainder'])).toBe('')
    })
  })
})
