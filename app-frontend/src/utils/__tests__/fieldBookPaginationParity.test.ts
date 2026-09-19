/**
 * createFieldBookLookup paginated at 20 points per page while every other
 * derivation used 27, so it mis-cited every point past the 20th. It is reachable
 * only from the deprecated generateComprehensiveDocument, which is why nobody
 * noticed. This pins it to the shared module.
 */

import { describe, it, expect } from 'vitest';
import { PageAllocationService } from '../../services/pageAllocation';
import { paginateFieldBook } from '../fieldBookPagination';

describe('pageAllocation field book lookup', () => {
  it('agrees with the shared module past the 20th point', () => {
    const observations = Array.from({ length: 30 }, (_, i) => ({ pointId: `P${i + 1}` }));

    const lookup = new PageAllocationService().createFieldBookLookup(observations);
    const expected = paginateFieldBook(
      observations.map(o => ({ id: o.pointId })),
      { hasCalibration: false, hasCover: false },
    ).pointPageMap;

    expect(lookup.P21).toBe('E1'); // was "E2" under the 20-per-page bug
    expect(lookup).toEqual(expected);
  });
});
