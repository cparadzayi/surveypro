/**
 * The Status column accepts a kind and a provenance together.
 *
 * "WS/P" is a working station that was placed; "WS/F" one recovered from an
 * earlier survey. The validator recognised only single codes, so every row a
 * surveyor coded that way was flagged "Unrecognized status code" -- warning
 * them off the one spelling that records both facts.
 *
 * The bare codes must keep validating exactly as they did, or every file
 * already in use starts complaining.
 */

import { describe, it, expect } from 'vitest';
import { validateCSVContent as validateCSV } from '../csvValidator';

const rows = (status: string) =>
  `Point,Y,X,Status,Description,Date\nST1,96649.178,2247915.001,${status},10mm iron peg (Station),1/10/2025`;

/** Status warnings raised for the single data row. */
const statusWarnings = (status: string): string[] => {
  const result: any = validateCSV(rows(status));
  return (result.warnings ?? [])
    .filter((w: any) => w.column === 'Status')
    .map((w: any) => w.error);
};

describe('the Status column', () => {
  it('accepts a compound status', () => {
    expect(statusWarnings('WS/P')).toEqual([]);
    expect(statusWarnings('WS/F')).toEqual([]);
    expect(statusWarnings('WSU/F')).toEqual([]);
    expect(statusWarnings('RM/P')).toEqual([]);
  });

  it('accepts it written the other way round', () => {
    expect(statusWarnings('P/WS')).toEqual([]);
  });

  it('still accepts every bare code it accepted before', () => {
    for (const code of ['F', 'FN', 'P', 'TRIG', 'RM', 'WS', 'WSU', 'OCP']) {
      expect(statusWarnings(code)).toEqual([]);
    }
  });

  it('still objects to a code it cannot read', () => {
    expect(statusWarnings('QQ')).toContain('Unrecognized status code');
  });

  it('objects when neither half of a compound can be read', () => {
    expect(statusWarnings('QQ/ZZ')).toContain('Unrecognized status code');
  });
});
