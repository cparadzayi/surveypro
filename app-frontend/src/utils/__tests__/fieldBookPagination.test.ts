/**
 * Field book pagination — the single source of every E-number.
 *
 * The site calibration is the evidence the GNSS work was tied to the local grid,
 * so it opens the book at E1 and the observed points follow. A survey with no
 * calibration has no such page, and its points start at E1 instead. The cover is
 * a title page: it is physically first and carries no number at all, so adding it
 * must never move a point.
 */

import { describe, it, expect } from 'vitest';
import { paginateFieldBook, FIELD_BOOK_POINTS_PER_PAGE } from '../fieldBookPagination';

const points = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `P${i + 1}` }));

const noCover = { hasCover: false };

describe('paginateFieldBook', () => {
  it('fits exactly 27 points on a page', () => {
    expect(FIELD_BOOK_POINTS_PER_PAGE).toBe(27);
  });

  describe('without a site calibration', () => {
    it('starts the points at E1', () => {
      const { pointPageMap, calibrationPage } = paginateFieldBook(
        points(1), { hasCalibration: false, ...noCover },
      );

      expect(pointPageMap.P1).toBe('E1');
      expect(calibrationPage).toBeNull();
    });

    it('keeps a full page of points on E1', () => {
      const { pointPageMap, ePageCount } = paginateFieldBook(
        points(27), { hasCalibration: false, ...noCover },
      );

      expect(pointPageMap.P27).toBe('E1');
      expect(ePageCount).toBe(1);
    });

    it('spills the 28th point onto E2', () => {
      const { pointPageMap, ePageCount } = paginateFieldBook(
        points(28), { hasCalibration: false, ...noCover },
      );

      expect(pointPageMap.P27).toBe('E1');
      expect(pointPageMap.P28).toBe('E2');
      expect(ePageCount).toBe(2);
    });
  });

  describe('with a site calibration', () => {
    it('gives the calibration E1 and starts the points at E2', () => {
      const { pointPageMap, calibrationPage } = paginateFieldBook(
        points(1), { hasCalibration: true, ...noCover },
      );

      expect(calibrationPage).toBe('E1');
      expect(pointPageMap.P1).toBe('E2');
    });

    it('spills the 28th point onto E3, one further than without', () => {
      const { pointPageMap, ePageCount } = paginateFieldBook(
        points(28), { hasCalibration: true, ...noCover },
      );

      expect(pointPageMap.P27).toBe('E2');
      expect(pointPageMap.P28).toBe('E3');
      expect(ePageCount).toBe(3);
    });
  });

  describe('the cover', () => {
    it('adds a physical page without moving any point', () => {
      const withoutCover = paginateFieldBook(points(30), { hasCalibration: true, hasCover: false });
      const withCover = paginateFieldBook(points(30), { hasCalibration: true, hasCover: true });

      expect(withCover.pointPageMap).toEqual(withoutCover.pointPageMap);
      expect(withCover.calibrationPage).toBe(withoutCover.calibrationPage);
      expect(withCover.ePageCount).toBe(withoutCover.ePageCount);
      expect(withCover.physicalPageCount).toBe(withoutCover.physicalPageCount + 1);
    });
  });

  describe('an empty survey', () => {
    it('reports no pages rather than inventing one', () => {
      const result = paginateFieldBook([], { hasCalibration: false, hasCover: false });

      expect(result.pointPageMap).toEqual({});
      expect(result.ePageCount).toBe(0);
      expect(result.physicalPageCount).toBe(0);
    });

    it('still numbers a calibration that exists without points', () => {
      const result = paginateFieldBook([], { hasCalibration: true, hasCover: true });

      expect(result.calibrationPage).toBe('E1');
      expect(result.ePageCount).toBe(1);
      expect(result.physicalPageCount).toBe(2);
    });
  });
});
