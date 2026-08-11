import { describe, test, expect } from '@jest/globals';
import {
  SHEET_ORDER,
  MAX_SHEET_UP_ATTEMPTS,
  nextSheetUp,
} from '../../../../app-shared/sheetEscalation.js';

describe('sheetEscalation constants', () => {
  test('SHEET_ORDER is the canonical A2→A1→A0 ladder', () => {
    expect(SHEET_ORDER).toEqual(['SI727_500x400', 'SI727_800x500', 'SI727_1000x800']);
  });

  test('MAX_SHEET_UP_ATTEMPTS allows climbing the full ladder once', () => {
    expect(MAX_SHEET_UP_ATTEMPTS).toBe(2);
  });
});

describe('nextSheetUp', () => {
  test('A2 → A1', () => {
    expect(nextSheetUp('SI727_500x400')).toBe('SI727_800x500');
  });

  test('A1 → A0', () => {
    expect(nextSheetUp('SI727_800x500')).toBe('SI727_1000x800');
  });

  test('A0 → null (already at top of ladder)', () => {
    expect(nextSheetUp('SI727_1000x800')).toBeNull();
  });

  test('unknown sheet → null', () => {
    expect(nextSheetUp('ISO_A3')).toBeNull();
    expect(nextSheetUp(undefined)).toBeNull();
    expect(nextSheetUp(null)).toBeNull();
  });
});
