/**
 * The F/P and F. B cells of the CO-ORDINATE LIST.
 *
 * F/P answers one question -- was this position observed in the field? -- and
 * the column legend defines only two values for it, F and P. A position never
 * visited has neither, so that cell carries the "-" not-applicable marker.
 *
 * F. B is different: it is a cross-reference, and a calculated point DOES have
 * a page to cite -- the E-page of the field book's CALCULATED POINTS block it
 * prints on. Only when the row carries no such page does that cell fall back
 * to "-" as well.
 *
 * A figure-split point (provenance "-") is a position with no book entry at
 * all: defined by a click, with no mark in the ground. The spec requires the
 * list to print its F/P cell literally as "-", and its F. B cell has nowhere
 * to point.
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

  it('marks a calculated point not-applicable in F/P but cites its block page in F. B', () => {
    // F/P: the legend defines only F and P, and nothing was found or placed --
    // but F. B is a cross-reference, and the row's fieldBookPage is the E-page
    // of the field book's CALCULATED POINTS block. Citing it is the whole point
    // of the block: the reader can turn to where the computed point prints.
    expect(fpAndFieldBookCells(point({ status: 'C', description: 'Not Beaconed' })))
      .toEqual({ fp: '-', fb: 'E2' });
    expect(fpAndFieldBookCells(point({ status: '', description: 'Not Beaconed' })))
      .toEqual({ fp: '-', fb: 'E2' });
    // No page to cite (nothing has paginated the field book for this row) --
    // and never one invented: "-" stays the fallback.
    expect(fpAndFieldBookCells(point({ status: 'C', description: 'Calculated', fieldBookPage: '' })))
      .toEqual({ fp: '-', fb: '-' });
    expect(fpAndFieldBookCells(point({ status: 'C', description: 'Calculated', fieldBookPage: '-' })))
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
