/**
 * Tests for nextDesignation — auto-incrementing parcel designations.
 */

import { describe, it, expect } from 'vitest'
import { nextDesignation, suggestNextDesignation } from '../parcelNumbering'

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

  describe('suggestNextDesignation (highest-numbered stand)', () => {
    it('bases the guess on the highest number, not list order', () => {
      // Outside Figure is last in the list but must not seed the guess.
      const existing = ['314', '315', '325', '326', 'OUTSIDE FIGURE MAG1 SH2']
      expect(suggestNextDesignation(existing)).toBe('327')
    })

    it('ignores the Outside Figure even when it is the only entry with a suffix number', () => {
      expect(suggestNextDesignation(['OUTSIDE FIGURE MAG1 SH2'])).toBe('')
    })

    it('preserves the format of the highest-numbered parcel', () => {
      expect(suggestNextDesignation(['STAND 271', 'STAND 349'])).toBe('STAND 350')
    })

    it('skips a taken number when stepping forward', () => {
      // Max is 325; 326 already exists, so it must skip to 327.
      expect(suggestNextDesignation(['324', '325', '326'])).toBe('327')
    })

    it('returns empty for an empty list or a list with no numbered parcels', () => {
      expect(suggestNextDesignation([])).toBe('')
      expect(suggestNextDesignation(['Remainder', 'OUTSIDE FIGURE X'])).toBe('')
    })
  })
})
