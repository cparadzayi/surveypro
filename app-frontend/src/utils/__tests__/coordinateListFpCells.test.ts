/**
 * The F/P and F. B cells of the CO-ORDINATE LIST.
 *
 * These two cells answer one question -- was this position observed in the
 * field? -- and the column legend defines only two values for it, F and P. A
 * position that was never visited has neither, and no field book page records
 * an observation of it, so both cells carry the "-" not-applicable marker.
 *
 * A figure-split point (provenance "-") is exactly such a position: defined by
 * a click, with no mark in the ground. The spec requires the list to print its
 * F/P cell literally as "-".
 *
 * It did print that, but by accident: the renderer decided not-applicable from
 * `isCalculatedPoint`, a predicate matching the TEXT of the status and
 * description ("c", "calc", "calculated", "not beaconed"). A bare "-" matches
 * none of those, so the other arm ran and `'-'.toUpperCase().substring(0, 1)`
 * merely echoed the character back; the F. B cell likewise printed "-" only
 * because fieldBookPage had already been defaulted to "-" upstream. Two
 * formulas nobody knew were load-bearing were the only thing holding up a
 * value the spec mandates. These tests make the decision deliberate.
 */

import { describe, it, expect } from 'vitest';
import { fpAndFieldBookCells } from '../coordinate-list';

const point = (over: Record<string, unknown> = {}) => ({
  pointId: '87DNew',
  y: -85729.941,
  x: 2144164.762,
  status: 'P',
  description: '12mm iron peg in concrete',
  fieldBookPage: 'E2',
  calculationsPage: 101,
  ...over,
}) as any;

describe('fpAndFieldBookCells', () => {
  it('marks a "-"-provenance point not-applicable in both cells', () => {
    expect(fpAndFieldBookCells(point({ status: '-', description: '' })))
      .toEqual({ fp: '-', fb: '-' });
  });

  it('decides that itself, rather than inheriting an upstream default', () => {
    // The F. B cell used to read "-" only because nothing had filled
    // fieldBookPage in. Give the point a page and the answer must not change:
    // a position never visited has no field book entry whatever the row says.
    expect(fpAndFieldBookCells(point({ status: '-', description: '', fieldBookPage: 'E2' })))
      .toEqual({ fp: '-', fb: '-' });
  });

  it('reads the provenance rather than the raw status text', () => {
    // 'RM/-' is a reference mark that was defined, not found or placed. The
    // old substring(0, 1) formula would have printed "R" in a column whose
    // legend defines only F and P.
    expect(fpAndFieldBookCells(point({ status: 'RM/-', description: '' })))
      .toEqual({ fp: '-', fb: '-' });
  });

  it('still marks a calculated point not-applicable', () => {
    expect(fpAndFieldBookCells(point({ status: 'C', description: 'Not Beaconed' })))
      .toEqual({ fp: '-', fb: '-' });
    expect(fpAndFieldBookCells(point({ status: '', description: 'Not Beaconed' })))
      .toEqual({ fp: '-', fb: '-' });
  });

  it('leaves an observed point exactly as it rendered before', () => {
    expect(fpAndFieldBookCells(point({ status: 'P' })))
      .toEqual({ fp: 'P', fb: 'E2' });
    expect(fpAndFieldBookCells(point({ status: 'F' })))
      .toEqual({ fp: 'F', fb: 'E2' });
    // The cell has always been the first character, upper-cased.
    expect(fpAndFieldBookCells(point({ status: 'found' })))
      .toEqual({ fp: 'F', fb: 'E2' });
  });

  it('falls back to "-" for an observed point with no field book page', () => {
    expect(fpAndFieldBookCells(point({ status: 'P', fieldBookPage: '' })))
      .toEqual({ fp: 'P', fb: '-' });
  });
});
