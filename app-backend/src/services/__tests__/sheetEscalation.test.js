import { describe, test, expect } from '@jest/globals';
import {
  SHEET_ORDER,
  MAX_SHEET_UP_ATTEMPTS,
  nextSheetUp,
} from '../../../../app-shared/sheetEscalation.js';

describe('sheetEscalation constants', () => {
  test('SHEET_ORDER is the canonical A2→A1→A0 ladder', () => {
    expect(SHEET_ORDER).toEqual(['ISO_A2', 'ISO_A1', 'ISO_A0']);
  });

  test('MAX_SHEET_UP_ATTEMPTS allows climbing the full ladder once', () => {
    expect(MAX_SHEET_UP_ATTEMPTS).toBe(2);
  });
});

describe('nextSheetUp', () => {
  test('A2 → A1', () => {
    expect(nextSheetUp('ISO_A2')).toBe('ISO_A1');
  });

  test('A1 → A0', () => {
    expect(nextSheetUp('ISO_A1')).toBe('ISO_A0');
  });

  test('A0 → null (already at top of ladder)', () => {
    expect(nextSheetUp('ISO_A0')).toBeNull();
  });

  test('unknown sheet → null', () => {
    expect(nextSheetUp('ISO_A3')).toBeNull();
    expect(nextSheetUp(undefined)).toBeNull();
    expect(nextSheetUp(null)).toBeNull();
  });
});
