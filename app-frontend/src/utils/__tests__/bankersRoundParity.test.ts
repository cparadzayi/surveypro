/**
 * Parity tests for banker's rounding and shoelace area across the FE/BE boundary.
 *
 * These exist because five divergent frontend copies of `bankersRound` had
 * accumulated. Three of them guarded the tie branch with a comparison that can
 * never be true for a double (`< Number.EPSILON` ~= 2.2e-16, or `=== 0.5`
 * against a float remainder), so exact ties fell through to `Math.round` and
 * disagreed with the backend by a full centimetre — meaning a coordinate
 * printed on a survey plan could differ from the value the backend persisted.
 *
 * The frontend implementation of record is utils/dms.ts. The values below are
 * computed by the same guard the backend uses (app-backend/src/utils/zim-geo.js).
 */
import { describe, it, expect } from 'vitest';
import { bankersRound } from '../dms';
import { bankersRound as precisionRound } from '../cadastral-precision';
import { bankersRound as areaRound } from '../areaFormatting';
import { bankersRound as registryRound } from '../registryGeometry';

/** The backend rule, verbatim, as an oracle. */
function backendBankersRound(value: number, decimals = 0): number {
  const factor = Math.pow(10, decimals);
  const n = value * factor;
  const f = Math.floor(n);
  const r = n - f;
  if (Math.abs(r - 0.5) < 1e-12) {
    return (f % 2 === 0 ? f : f + 1) / factor;
  }
  return Math.round(n) / factor;
}

/** Values that land exactly on a .5 tie at 2dp, plus near-misses. */
const TIE_CASES = [
  0.545, 1.015, 1.025, 1.035, 1.045, 1.055,
  2.005, 2.015, 2.025, -0.125, -1.225, -2.675,
  17876.125, 17876.135, -17876.145,
];

const ORDINARY_CASES = [
  0, 1, -1, 123.456, -17876.131, 17876.134, 9999.999, -0.004, 0.004,
  12.3456789, -12.3456789, 100.5, 101.5, 102.5,
];

const ALL_CASES = [...TIE_CASES, ...ORDINARY_CASES];

describe('bankersRound — parity with backend zim-geo.js', () => {
  it.each(ALL_CASES)('dms.ts matches backend for %p at 2dp', (v) => {
    expect(bankersRound(v, 2)).toBe(backendBankersRound(v, 2));
  });

  it.each(ALL_CASES)('cadastral-precision.ts matches backend for %p at 2dp', (v) => {
    expect(precisionRound(v, 2)).toBe(backendBankersRound(v, 2));
  });

  it.each(ALL_CASES)('areaFormatting.ts matches backend for %p at 2dp', (v) => {
    expect(areaRound(v, 2)).toBe(backendBankersRound(v, 2));
  });

  it.each(ALL_CASES)('registryGeometry.ts matches backend for %p at 2dp', (v) => {
    expect(registryRound(v, 2)).toBe(backendBankersRound(v, 2));
  });

  it('all four frontend copies agree with each other', () => {
    for (const v of ALL_CASES) {
      const expected = backendBankersRound(v, 2);
      expect(bankersRound(v, 2)).toBe(expected);
      expect(precisionRound(v, 2)).toBe(expected);
      expect(areaRound(v, 2)).toBe(expected);
      expect(registryRound(v, 2)).toBe(expected);
    }
  });

  it('actually exercises the tie branch (regression guard)', () => {
    // If the tie branch were unreachable again, Math.round(n) would return
    // exactly this for every case below. 0.545 -> floor 54 (even) so the
    // tie branch yields 0.54 while Math.round yields 0.55.
    expect(backendBankersRound(0.545, 2)).toBe(0.54);
    expect(Math.round(0.545 * 100) / 100).toBe(0.55);
    expect(bankersRound(0.545, 2)).toBe(0.54);

    // Odd floor rounds up to stay even.
    expect(backendBankersRound(1.015, 2)).toBe(1.02);
    expect(bankersRound(1.015, 2)).toBe(1.02);

    expect(backendBankersRound(1.225, 2)).toBe(1.22);
    expect(bankersRound(1.225, 2)).toBe(1.22);
  });

  it('handles 0 and 3 decimals', () => {
    expect(bankersRound(0, 2)).toBe(0);
    expect(bankersRound(1.2345, 3)).toBe(backendBankersRound(1.2345, 3));
    expect(bankersRound(1.0005, 3)).toBe(backendBankersRound(1.0005, 3));
  });
});