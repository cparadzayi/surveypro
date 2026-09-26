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
  it('marks a "-"-provenance point not-applicable in both cells, page or no page', () => {
    // The row deliberately CARRIES a field book page ('E2', from the factory).
    // The F. B cell used to read "-" only because nothing had filled that field
    // in upstream, so a row that does carry one is what proves the helper
    // decides for itself: a position never visited has no field book entry
    // whatever the row says.
    expect(fpAndFieldBookCells(point({ status: '-', description: '' })))
      .toEqual({ fp: '-', fb: '-' });
    expect(fpAndFieldBookCells(point({ status: '-', description: '', fieldBookPage: '' })))
      .toEqual({ fp: '-', fb: '-' });
  });

  it('reads the provenance rather than the raw status text', () => {
    // 'RM/-' is a reference mark that was defined, not found or placed. The
    // old substring(0, 1) formula would have printed "R" in a column whose
    // legend defines only F and P. Every kind can be stated alongside a
    // provenance, so every kind can be stated alongside this one -- each would
    // have printed its own first letter there.
    for (const status of ['RM/-', 'WS/-', 'WSU/-', 'TRIG/-', 'OCP/-', '-/WS']) {
      expect(fpAndFieldBookCells(point({ status, description: '' })), status)
        .toEqual({ fp: '-', fb: '-' });
    }
  });

  it('lets a real provenance win over a dash on the other side of the slash', () => {
    // 'P/-' contradicts itself. parseBeaconStatus takes the first readable
    // provenance, so P stands -- the mark was placed, and the F/P column must
    // say so rather than dashing out a claim the surveyor actually made.
    expect(fpAndFieldBookCells(point({ status: 'P/-' })))
      .toEqual({ fp: 'P', fb: 'E2' });
    expect(fpAndFieldBookCells(point({ status: 'FN/-' })))
      .toEqual({ fp: 'F', fb: 'E2' });
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
