/**
 * useCadastralWorkflow's buildFieldBook() derived its own point-page map with a
 * hardcoded `pointsPerPage = 27` and no calibration offset, independent of
 * fieldBookPagination.ts. It writes that map straight into the shared
 * surveyLookup Pinia store (the same store calculations-part1.ts writes), where
 * it can be read by other documents (e.g. CoordinateListView) before anything
 * overwrites it. This pins its output to the shared module so the page size can
 * never drift between the two again.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useCadastralWorkflow } from '../../composables/useCadastralWorkflow';
import { useSurveyLookupStore } from '../../stores/surveyLookup';
import { paginateFieldBook } from '../fieldBookPagination';
import type { CadastralPoint } from '../../types/cadastral';

const points = (n: number): CadastralPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `P${i + 1}`,
    original: { y: 100 + i, x: 200 + i },
    fieldBook: { y: (100 + i).toFixed(3), x: (200 + i).toFixed(3) },
    coordinateList: { y: (100 + i).toFixed(2), x: (200 + i).toFixed(2) },
    status: 'P',
    description: 'Peg',
    surveyDate: new Date('2026-01-01'),
    includeInFieldBook: true,
    includeInCoordinateList: true,
  }));

describe('useCadastralWorkflow buildFieldBook — pagination parity', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('agrees with the shared module across the 27-point boundary (30 points)', () => {
    const { setImportedPoints, buildFieldBook, workflowState } = useCadastralWorkflow();
    const testPoints = points(30);

    setImportedPoints(testPoints);
    buildFieldBook();

    const lookupStore = useSurveyLookupStore();
    const expected = paginateFieldBook(
      testPoints.map((p) => ({ id: p.id })),
      { hasCalibration: false, hasCover: false },
    ).pointPageMap;

    // Past the 27th point, a page size that has drifted from the shared
    // module would disagree with paginateFieldBook.
    expect(lookupStore.fieldBookPageLookup).toEqual(expected);
    expect(lookupStore.fieldBookPageLookup.P27).toBe('E1');
    expect(lookupStore.fieldBookPageLookup.P28).toBe('E2');

    // The document's own points carry the same page numbers.
    expect(workflowState.documents.fieldBook?.points[27].pageNumber).toBe(2);

    // metadata.pageCount reaches the live field book PDF's cover page ("Page
    // Count: N") and the preview modal subtitle ("N pages") verbatim — it must
    // report the true number of E-pages, not an arbitrary +2 guess.
    const expectedPagination = paginateFieldBook(
      testPoints.map((p) => ({ id: p.id })),
      { hasCalibration: false, hasCover: false },
    );
    expect(workflowState.documents.fieldBook?.metadata.pageCount).toBe(expectedPagination.ePageCount);
  });
});
