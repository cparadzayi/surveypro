import { describe, it, expect } from 'vitest';
import { validateAndParseCSV } from '../cadastral-csv';

/**
 * A spreadsheet leaves rows of bare separators below the data (",,,,,,"). They used to import as
 * nameless points at Y=0, X=0: the Maglas-sized failure was a Gweru survey whose map opened 1.2 degrees
 * north, centred between the real points and a point on the Lo origin.
 */
const csv = (rows: string[]) => ['Point,Y,X,Status,Description,Date', ...rows].join(String.fromCharCode(10));

describe('empty CSV rows', () => {
  it('are not points', () => {
    const result = validateAndParseCSV(csv([
      '86B,-85728.708,2143972.144,F,12mm iron peg in concrete,1/07/2026',
      '86C,-85633.04,2144068.004,F,12mm iron peg in concrete,1/07/2026',
      ',,,,,',
      ',,,,,',
      ' , , , , , ',
    ]), 29);

    expect(result.summary.totalPoints).toBe(2);
    expect(result.preview.map((p: any) => p.id)).toEqual(['86B', '86C']);
    expect(result.preview.some((p: any) => p.original.y === 0 && p.original.x === 0)).toBe(false);
  });

  it('are reported, once, so the surveyor knows they were left out', () => {
    const result = validateAndParseCSV(csv([
      '86B,-85728.708,2143972.144,F,iron peg,1/07/2026',
      ',,,,,',
      ',,,,,',
    ]), 29);
    const warning = result.warnings.find((w: any) => /empty row/.test(w.message));
    expect(warning?.message).toBe('2 empty rows ignored');
  });

  it('leave a file without them exactly as it was', () => {
    const result = validateAndParseCSV(csv(['86B,-85728.708,2143972.144,F,iron peg,1/07/2026']), 29);
    expect(result.summary.totalPoints).toBe(1);
    expect(result.warnings.some((w: any) => /empty row/.test(w.message))).toBe(false);
  });
});
