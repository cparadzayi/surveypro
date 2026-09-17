// Regression: the PDF figure box and the shared planner search polygon must be
// sized with the SAME horizontal alignment, so the accurate figure polygon used
// by the escalation gate coincides with the engine's candidate-search polygon.
//
// Root cause this pins (see 2026-08-11 real-paper-robustness design notes):
// the previous inline sizing block used `hSlack > 40 ? 'left' : 'center'`, while
// buildPlannerObstacles centered its search polygon. Left-aligning a figure that
// leaves a wide horizontal strip dragged the drawn figure ~hSlack/2 left of the
// centered search polygon. The engine parked surveyStatement in that phantom
// whitespace (clear of the centered polygon but INSIDE the real drawn figure)
// and the gate flagged a false MANDATORY collision, stepping the scale up
// (Maglas declared 1:750 emitted at 1:1000).
//
// If one side is ever realigned without the other, the coincidence tests fail:
// the drawn figure's x-start sits ~hSlack/2 away from the search polygon.
//
// Dense general plans: when the centered side column cannot hold one contiguous
// Schedule of Areas table (sideCol < scheduleWidth + 40pt), chooseFigureAlignX
// selects 'left' and BOTH the figure box and the search polygon flush to the
// drawing-area left edge — the schedule then gets the entire right-hand column
// instead of two half-width strips neither can hold.

import { describe, test, expect } from '@jest/globals';
import { sizeFigureBox, transformCoords, calculateMapBounds } from '../pdfkitGeoPDF/geometry.js';
import { buildPlannerObstacles, chooseFigureAlignX } from '../polygonForPlanner.js';
import { sampleMaglasPlan } from './fixtures/sampleMaglasPlan.js';

const MM_TO_PT = 72 / 25.4;

// Maglas fixture: outside figure A(50000,2200000) B(50500,2200000)
// C(50500,2200420) D(50000,2200420) → 500m × 420m rectangle; parcel bbox matches.
const ofRing = sampleMaglasPlan.outsideFigureData.coordinates.map(c => [c.y, c.x]);
const outsideFigure = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ofRing] } }],
};

const extentFromParcels = () => {
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (const p of sampleMaglasPlan.parcels.features) {
    for (const v of p.geometry.coordinates[0]) {
      const y = v[0]; const x = v[1];
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
    }
  }
  return { minY, maxY, minX, maxX };
};

const calculatedExtent = extentFromParcels();

// The 1:750 / SI727_1000x800 combination from the Maglas regression: the figure
// (500m wide) leaves a wide horizontal strip on the 1000mm-wide sheet, which is
// exactly the case the old `hSlack > 40 ? 'left'` rule got wrong.
const S = 750;
const page = calculateMapBounds(1000 * MM_TO_PT, 800 * MM_TO_PT);
const mapBounds = page.main;

// The sizing block receives the figure box after the title-band inset; the
// horizontal alignment result is band-independent (band only shifts y/height).
const postBand = { ...mapBounds };

const drawnMinXFor = (figBox) =>
  Math.min(...ofRing.map(([y, x]) => transformCoords(y, x, calculatedExtent, figBox).x));

describe('sizeFigureBox — figure box / search-polygon alignment agreement', () => {
  test('box is sized exactly to extent/S and defaults to aligned center', () => {
    const fig = sizeFigureBox({ figureBounds: postBand, optimalScaleValue: S, calculatedExtent });

    const figW = ((calculatedExtent.maxY - calculatedExtent.minY) / S) * 1000 * MM_TO_PT;
    const figH = ((calculatedExtent.maxX - calculatedExtent.minX) / S) * 1000 * MM_TO_PT;

    expect(fig.width).toBeCloseTo(figW, 2);
    expect(fig.height).toBeCloseTo(figH, 2);
    expect(fig.insetFactor).toBe(0);
    expect(fig.alignX).toBe('center');
    // The hSlack > 40 case is exactly where the bug bit (500m-wide figure on a
    // 1000mm sheet): with NO schedule constraint the default stays centered.
    expect(fig.hSlack).toBeGreaterThan(40);
    expect(fig.x).toBeCloseTo(mapBounds.x + Math.max(0, fig.hSlack) / 2, 6);
  });

  test('centered figure polygon coincides with the centered search polygon', () => {
    const fig = sizeFigureBox({ figureBounds: postBand, optimalScaleValue: S, calculatedExtent });
    const centeredBox = {
      x: fig.x, y: fig.y, width: fig.width, height: fig.height,
      insetFactor: 0, alignX: fig.alignX,
    };
    const drawnMinX = drawnMinXFor(centeredBox);

    const obstacles = buildPlannerObstacles({ outsideFigure, scaleDenom: S, mapBounds, closeRing: true });
    const searchMinX = Math.min(...obstacles.polyPts.map(p => p.x));

    // Coincide — otherwise surveyStatement lands in phantom whitespace.
    expect(drawnMinX).toBeCloseTo(searchMinX, 1);
  });

  test('left figure polygon coincides with the left search polygon (dense-GP path)', () => {
    const fig = sizeFigureBox({ figureBounds: postBand, optimalScaleValue: S, calculatedExtent, alignX: 'left' });
    const leftBox = {
      x: fig.x, y: fig.y, width: fig.width, height: fig.height,
      insetFactor: 0, alignX: fig.alignX,
    };
    expect(fig.x).toBeCloseTo(mapBounds.x, 6);

    const drawnMinX = drawnMinXFor(leftBox);
    const obstacles = buildPlannerObstacles({ outsideFigure, scaleDenom: S, mapBounds, closeRing: true, alignX: 'left' });
    const searchMinX = Math.min(...obstacles.polyPts.map(p => p.x));

    // Both moved together → still coincide (not the phantom-whitespace drift).
    expect(drawnMinX).toBeCloseTo(searchMinX, 1);
    // And they moved to the left edge, not halfway across.
    expect(searchMinX).toBeCloseTo(mapBounds.x, 1);
  });

  test('canary: left figure vs CENTERED search polygon MUST drift apart', () => {
    // The precise failure mode of the original bug — realigning one side without
    // the other. If this ever coincides, the alignment drift is no longer being
    // caught by the other tests.
    const fig = sizeFigureBox({ figureBounds: postBand, optimalScaleValue: S, calculatedExtent, alignX: 'left' });
    const leftBox = {
      x: fig.x, y: fig.y, width: fig.width, height: fig.height,
      insetFactor: 0, alignX: fig.alignX,
    };
    const drawnMinX = drawnMinXFor(leftBox);
    const centeredObstacles = buildPlannerObstacles({ outsideFigure, scaleDenom: S, mapBounds, closeRing: true });
    const centeredSearchMinX = Math.min(...centeredObstacles.polyPts.map(p => p.x));
    expect(Math.abs(drawnMinX - centeredSearchMinX)).toBeGreaterThan(10);
  });
});

describe('chooseFigureAlignX — shared alignment decision', () => {
  test('center when the centered side column fits the schedule (+ pad)', () => {
    const boundsW = 2268;      // 800mm drawing area
    const figW = 1134;         // 400mm figure
    expect(chooseFigureAlignX({ figureWidthPt: figW, mapBoundsWidthPt: boundsW, scheduleWidthPt: 425 }))
      .toBe('center');         // sideCol = (2268-1134)/2 = 567 ≥ 425 + 40
  });

  test('left when the centered side column cannot hold the schedule', () => {
    const boundsW = 2268;
    const figW = 1569;         // ≈553mm figure (project-19-like at 1:750)
    expect(chooseFigureAlignX({ figureWidthPt: figW, mapBoundsWidthPt: boundsW, scheduleWidthPt: 425 }))
      .toBe('left');           // sideCol = 349.5 < 425 + 40
  });

  test('center when no schedule width is known or widths are unusable', () => {
    expect(chooseFigureAlignX({ figureWidthPt: 100, mapBoundsWidthPt: 2268, scheduleWidthPt: null })).toBe('center');
    expect(chooseFigureAlignX({ figureWidthPt: 100, mapBoundsWidthPt: 2268, scheduleWidthPt: 0 })).toBe('center');
    expect(chooseFigureAlignX({ figureWidthPt: 0, mapBoundsWidthPt: 2268, scheduleWidthPt: 425 })).toBe('center');
    expect(chooseFigureAlignX({ figureWidthPt: 100, mapBoundsWidthPt: 0, scheduleWidthPt: 425 })).toBe('center');
  });

  test('center when there is no horizontal slack at all (alignment is irrelevant)', () => {
    expect(chooseFigureAlignX({ figureWidthPt: 2268, mapBoundsWidthPt: 2268, scheduleWidthPt: 425 })).toBe('center');
  });
});