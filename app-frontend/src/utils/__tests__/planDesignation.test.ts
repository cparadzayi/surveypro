import { describe, it, expect } from 'vitest';
import {
  formatStandRanges, extractTownship, buildPlanDesignation,
  normalizeDesignation, designationPhrase, surveyOfTitle, townshipPhrase, fullDesignationPhrase,
} from '../planDesignation';

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

describe('townshipPhrase', () => {
  it('strips only the stand ranges, keeping the full township phrase', () => {
    expect(townshipPhrase('STANDS 271-339, 346-349 MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A'))
      .toBe('MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A');
  });
  it('handles a single stand', () => {
    expect(townshipPhrase('Stands 1620 Maglas Township')).toBe('Maglas Township');
  });
  it('returns the input unchanged when there is no stands prefix', () => {
    expect(townshipPhrase('MAGLAS TOWNSHIP OF SHABANI MINE')).toBe('MAGLAS TOWNSHIP OF SHABANI MINE');
  });
  it('returns empty string for empty input', () => {
    expect(townshipPhrase('')).toBe('');
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
  it('keeps the parent-property clause so the letter states the full designation', () => {
    expect(buildPlanDesignation(
      ['271','272','288','289','290'],
      'Stands 271-290 Maglas Township of Shabani Mine Surface Rights A',
    )).toBe('STANDS 271 - 272, 288 - 290 MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A');
  });
  it('returns empty string when there is nothing to describe', () => {
    expect(buildPlanDesignation([], '')).toBe('');
  });
});

describe('normalizeDesignation', () => {
  it('trims and collapses stray whitespace', () => {
    expect(normalizeDesignation('  Stands   207 - 270  Maglas  Township  '))
      .toBe('Stands 207 - 270 Maglas Township');
  });
  it('returns empty string for empty input', () => {
    expect(normalizeDesignation('')).toBe('');
    expect(normalizeDesignation('   ')).toBe('');
  });
});

describe('designationPhrase', () => {
  it('rebuilds from the stand ranges when the sheet stands are known, in caps', () => {
    expect(designationPhrase('Stands 207-270 Maglas Township', ['207','208','209']))
      .toBe('STANDS 207 - 209 MAGLAS TOWNSHIP');
  });
  it('drops a trailing " of ..." clause when rebuilding', () => {
    expect(designationPhrase('Stands 207-270 Maglas Township of Lot 3 of Subdivision B', ['207','208','209']))
      .toBe('STANDS 207 - 209 MAGLAS TOWNSHIP');
  });
  it('omits township when it cannot be extracted', () => {
    expect(designationPhrase('', ['5','6'])).toBe('STANDS 5 - 6');
  });
  it('uses the authored surveyOf when no stands are given', () => {
    expect(designationPhrase('Stands 207 - 270 Maglas Township of Lot 3', [])).toBe('STANDS 207 - 270 MAGLAS TOWNSHIP OF LOT 3');
    expect(designationPhrase('Stands 207-270 Maglas Township')).toBe('STANDS 207-270 MAGLAS TOWNSHIP');
  });
  it('returns empty string for empty input', () => {
    expect(designationPhrase('', [])).toBe('');
  });
});

describe('fullDesignationPhrase', () => {
  it('rebuilds from the stand ranges keeping the " of ..." clause, in caps', () => {
    expect(fullDesignationPhrase('Stands 207-270 Maglas Township of Shabani Mine Surface Rights A', ['207','208','209']))
      .toBe('STANDS 207 - 209 MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A');
  });
  it('states the full designation the way the cover letter does', () => {
    expect(fullDesignationPhrase('STANDS 271-339, 346-349 MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A', ['271','272','288','289','290']))
      .toBe('STANDS 271 - 272, 288 - 290 MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A');
  });
  it('omits township when it cannot be extracted', () => {
    expect(fullDesignationPhrase('', ['5','6'])).toBe('STANDS 5 - 6');
  });
  it('uses the authored surveyOf when no stands are given', () => {
    expect(fullDesignationPhrase('Stands 207 - 270 Maglas Township of Lot 3', [])).toBe('STANDS 207 - 270 MAGLAS TOWNSHIP OF LOT 3');
  });
  it('returns empty string for empty input', () => {
    expect(fullDesignationPhrase('', [])).toBe('');
  });
});

describe('surveyOfTitle', () => {
  it('builds the certificate title in caps form', () => {
    expect(surveyOfTitle('Stands 207-270 Maglas Township', ['207','208','209']))
      .toBe('SURVEY OF STANDS 207 - 209 MAGLAS TOWNSHIP');
  });
  it('keeps the full township name including the " of ..." clause', () => {
    expect(surveyOfTitle('STANDS 271-339, 346-349 MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A', ['271','272','273']))
      .toBe('SURVEY OF STANDS 271 - 273 MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A');
  });
  it('falls back to the township when there is no surveyOf', () => {
    expect(surveyOfTitle('', ['1620'])).toBe('SURVEY OF STANDS 1620');
  });
  it('returns empty string when there is nothing to describe', () => {
    expect(surveyOfTitle('', [])).toBe('');
  });
});
