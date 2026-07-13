import { describe, it, expect } from 'vitest';
import { formatStandRanges, extractTownship, buildPlanDesignation } from '../planDesignation';

describe('formatStandRanges', () => {
  it('compresses consecutive runs and keeps gaps as separate ranges', () => {
    const stands = ['207','208','209','340','341'];
    expect(formatStandRanges(stands)).toBe('207 - 209, 340 - 341');
  });
  it('renders a single stand without a dash', () => {
    expect(formatStandRanges(['12'])).toBe('12');
  });
  it('sorts numerics ascending and appends non-numeric names', () => {
    expect(formatStandRanges(['3','1','2','ALPHA'])).toBe('1 - 3, ALPHA');
  });
  it('returns empty string for no input', () => {
    expect(formatStandRanges([])).toBe('');
  });
});

describe('extractTownship', () => {
  it('strips a leading Stands N-M prefix', () => {
    expect(extractTownship('Stands 207-270 Maglas Township')).toBe('Maglas Township');
  });
  it('strips a trailing " of ..." clause', () => {
    expect(extractTownship('Stands 1-3 Maglas Township of Lot 3 of Subdivision B')).toBe('Maglas Township');
  });
  it('returns empty string for empty input', () => {
    expect(extractTownship('')).toBe('');
  });
});

describe('buildPlanDesignation', () => {
  it('builds the full uppercased plan wording', () => {
    const stands = ['207','208','209','270','340','341','342','343','344','345'];
    // note: 210..269 omitted for brevity; ranges reflect the given list
    expect(buildPlanDesignation(['207','208','209'], 'Stands 207-209 Maglas Township'))
      .toBe('STANDS 207 - 209 MAGLAS TOWNSHIP');
  });
  it('omits township when it cannot be extracted', () => {
    expect(buildPlanDesignation(['5','6'], '')).toBe('STANDS 5 - 6');
  });
  it('returns empty string when there is nothing to describe', () => {
    expect(buildPlanDesignation([], '')).toBe('');
  });
});
