import { describe, it, expect } from 'vitest';
import {
  ROW_HEIGHT_MM,
  DETAIL_LINE_HEIGHT_MM,
  RESERVED_CLOSING_MM,
  rowBlockHeight,
  rowNeedsPageBreak,
} from '../letterRowLayout';

const A4_HEIGHT_MM = 297;

describe('rowBlockHeight', () => {
  it('is one row height when there are no detail lines', () => {
    expect(rowBlockHeight(0)).toBe(ROW_HEIGHT_MM);
  });

  it('adds one detail line height per detail line', () => {
    expect(rowBlockHeight(2)).toBe(ROW_HEIGHT_MM + 2 * DETAIL_LINE_HEIGHT_MM);
  });
});

describe('rowNeedsPageBreak', () => {
  it('does not break near the top of the page', () => {
    expect(rowNeedsPageBreak(60, rowBlockHeight(2), A4_HEIGHT_MM)).toBe(false);
  });

  it('breaks when the row would encroach on the reserved closing block', () => {
    // A row starting this low cannot fit and still leave room for "Yours Faithfully"
    // plus the signature — which is exactly how the signature used to fall off the page.
    const y = A4_HEIGHT_MM - RESERVED_CLOSING_MM - 1;
    expect(rowNeedsPageBreak(y, rowBlockHeight(2), A4_HEIGHT_MM)).toBe(true);
  });

  it('respects the reserved closing block, not just the paper edge', () => {
    // Comfortably above the paper edge, yet still inside the reserved band.
    const y = A4_HEIGHT_MM - RESERVED_CLOSING_MM + 2;
    expect(y).toBeLessThan(A4_HEIGHT_MM);
    expect(rowNeedsPageBreak(y, ROW_HEIGHT_MM, A4_HEIGHT_MM)).toBe(true);
  });

  it('accepts an explicit reserved height', () => {
    expect(rowNeedsPageBreak(200, ROW_HEIGHT_MM, A4_HEIGHT_MM, 0)).toBe(false);
    expect(rowNeedsPageBreak(200, ROW_HEIGHT_MM, A4_HEIGHT_MM, 120)).toBe(true);
  });

  it('a taller block breaks sooner than a shorter one at the same position', () => {
    const y = A4_HEIGHT_MM - RESERVED_CLOSING_MM - 10;
    expect(rowNeedsPageBreak(y, ROW_HEIGHT_MM, A4_HEIGHT_MM)).toBe(false);
    expect(rowNeedsPageBreak(y, rowBlockHeight(2), A4_HEIGHT_MM)).toBe(true);
  });
});
