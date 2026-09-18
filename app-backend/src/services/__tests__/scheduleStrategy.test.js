// app-backend/src/services/__tests__/scheduleStrategy.test.js
import { describe, test, expect } from '@jest/globals';
import { measureFigureWhitespace } from '../scheduleStrategy.js';
import { chooseScheduleStrategy } from '../scheduleStrategy.js';
import { shouldAdoptResplit } from '../scheduleStrategy.js';

describe('shouldAdoptResplit', () => {
  // A 10x10 figure polygon at the origin (min-corner rect convention: tables
  // are {x, y, width, height} with (x, y) = lower-left, matching what the DXF
  // schedule emitter returns for placedTables).
  const figure = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 },
  ];
  // A table well clear of the figure (to its right).
  const clearTable = { x: 20, y: 0, width: 5, height: 5 };
  // A table sitting on top of the figure.
  const overlapTable = { x: 2, y: 2, width: 4, height: 4 };

  test('adopts the re-split when it loses no stands and overlaps nothing', () => {
    expect(shouldAdoptResplit({
      resplitTables: [clearTable, { x: 26, y: 0, width: 5, height: 5 }],
      missingStandCount: 0,
      figurePolygon: figure,
    })).toBe(true);
  });

  test('rejects the re-split when it would drop stands (data loss is never acceptable)', () => {
    expect(shouldAdoptResplit({
      resplitTables: [clearTable],
      missingStandCount: 12,   // 12 stands could not be placed
      figurePolygon: figure,
    })).toBe(false);
  });

  test('rejects the re-split when any table still overlaps the figure', () => {
    expect(shouldAdoptResplit({
      resplitTables: [clearTable, overlapTable],
      missingStandCount: 0,
      figurePolygon: figure,
    })).toBe(false);
  });

  test('rejects when no figure polygon is available to verify against', () => {
    expect(shouldAdoptResplit({
      resplitTables: [clearTable],
      missingStandCount: 0,
      figurePolygon: [],
    })).toBe(false);
  });

  test('rejects when a re-split table overlaps a sibling block (e.g. the SG box)', () => {
    // The re-split avoids the figure but lands on another bottom-zone block.
    const sgBox = { x: 22, y: 2, width: 6, height: 4 };  // overlaps clearTable (x:20..25)
    expect(shouldAdoptResplit({
      resplitTables: [clearTable],
      missingStandCount: 0,
      figurePolygon: figure,
      obstacles: [sgBox],
    })).toBe(false);
  });

  test('adopts when figure-clear AND clear of all sibling obstacles', () => {
    const sgBox = { x: 40, y: 0, width: 6, height: 4 };  // far from clearTable
    expect(shouldAdoptResplit({
      resplitTables: [clearTable],
      missingStandCount: 0,
      figurePolygon: figure,
      obstacles: [sgBox],
    })).toBe(true);
  });
});

describe('measureFigureWhitespace', () => {
  // contentArea is the usable drawing area in paper-mm: {x,y,w,h} with y UP.
  // figureBBox is the oriented figure bounding box in the same frame.
  const content = { x: 0, y: 0, w: 1000, h: 700 };

  test('figure centred horizontally → equal left and right strips', () => {
    const fig = { x: 350, y: 100, w: 300, h: 500 };
    const s = measureFigureWhitespace({ figureBBox: fig, contentArea: content });
    expect(s.left.w).toBeCloseTo(350, 5);
    expect(s.right.w).toBeCloseTo(350, 5);   // 1000 - (350+300)
    expect(s.left.h).toBeCloseTo(700, 5);    // side strips span full content height
    expect(s.right.x).toBeCloseTo(650, 5);
  });

  test('top and bottom strips are the height above/below the figure', () => {
    const fig = { x: 350, y: 100, w: 300, h: 500 };
    const s = measureFigureWhitespace({ figureBBox: fig, contentArea: content });
    expect(s.bottom.h).toBeCloseTo(100, 5);  // y 0..100
    expect(s.top.h).toBeCloseTo(100, 5);     // y 600..700
  });

  test('figure flush to the left edge → zero-width left strip, wide right strip', () => {
    const fig = { x: 0, y: 100, w: 300, h: 500 };
    const s = measureFigureWhitespace({ figureBBox: fig, contentArea: content });
    expect(s.left.w).toBeCloseTo(0, 5);
    expect(s.right.w).toBeCloseTo(700, 5);
  });

  test('reserved fixed-block bboxes shrink the overlapping strip', () => {
    const fig = { x: 350, y: 100, w: 300, h: 500 };
    // A title strip occupying the top 80mm of the RIGHT strip.
    const s = measureFigureWhitespace({
      figureBBox: fig, contentArea: content,
      fixedBlocks: [{ x: 650, y: 620, w: 350, h: 80 }],
    });
    expect(s.right.h).toBeCloseTo(620, 5); // 700 - 80 reserved at top
  });
});

describe('chooseScheduleStrategy', () => {
  const colW = 95;     // one schedule column-group width (mm)
  const rowH = 4;      // mm per row
  const headerH = 19;  // SCHEDULE_HEADER_HEIGHT_MM
  const tall = (w) => ({ x: 0, y: 0, w, h: 600 });   // tall side strip
  const flat = (h) => ({ x: 0, y: 0, w: 400, h });    // wide top/bottom strip

  test('both side strips usable → BALANCE, figure centred, two regions', () => {
    const d = chooseScheduleStrategy({
      strips: { left: tall(100), right: tall(100), top: flat(10), bottom: flat(10) },
      colW, rowH, headerH,
    });
    expect(d.mode).toBe('balance');
    expect(d.figureAlign).toBe('center');
    expect(d.regions).toHaveLength(2);
  });

  test('only one side strip usable → POOL on the wider side, figure pushed away', () => {
    const d = chooseScheduleStrategy({
      strips: { left: tall(30), right: tall(100), top: flat(10), bottom: flat(10) },
      colW, rowH, headerH,
    });
    expect(d.mode).toBe('pool');
    expect(d.regions).toHaveLength(1);
    expect(d.figureAlign).toBe('left'); // pool right ⇒ push figure left
  });

  test('no usable side strip but a tall top/bottom strip → FLAT', () => {
    const d = chooseScheduleStrategy({
      strips: { left: tall(10), right: tall(10), top: flat(120), bottom: flat(10) },
      colW, rowH, headerH,
    });
    expect(d.mode).toBe('flat');
  });

  test('nothing fits → ESCALATE', () => {
    const d = chooseScheduleStrategy({
      strips: { left: tall(10), right: tall(10), top: flat(10), bottom: flat(10) },
      colW, rowH, headerH,
    });
    expect(d.mode).toBe('escalate');
  });
});

import { balanceScheduleTables } from '../scheduleStrategy.js';

describe('balanceScheduleTables', () => {
  // figure centred at x=500; content [0,1000]. Two tables pooled on the right.
  const t = (x, y) => ({ x, y, width: 100, height: 200 });

  test('two pooled tables → second mirrors to the opposite strip, top-aligned', () => {
    const tables = [t(700, 800), t(700, 560)]; // both right of centre, stacked
    const out = balanceScheduleTables(tables, 500, 0, 1000);
    expect(out[0]).toEqual(t(700, 800));        // first kept
    // second mirrored: x = 2*500 - 700 - 100 = 200; y top-aligned to tables[0].y
    expect(out[1].x).toBe(200);
    expect(out[1].y).toBe(800);
  });

  test('returns input unchanged when the mirror would fall outside the content', () => {
    const tables = [t(700, 800), t(950, 560)]; // mirror of 950 → -50, outside [0,1000]
    const out = balanceScheduleTables(tables, 500, 0, 1000);
    expect(out).toBe(tables);
  });

  test('single table → unchanged', () => {
    const tables = [t(700, 800)];
    expect(balanceScheduleTables(tables, 500, 0, 1000)).toBe(tables);
  });

  test('skips the mirror when it would overlap an obstacle (no component overlap)', () => {
    const tables = [t(700, 800), t(700, 560)];
    // Mirror destination is x∈[200,300], y∈[600,800]; this obstacle covers it.
    const obstacle = { x: 150, y: 820, width: 200, height: 260 };
    const out = balanceScheduleTables(tables, 500, 0, 1000, [obstacle]);
    expect(out).toBe(tables);          // collision → not moved → original reference
  });

  test('still mirrors when obstacles are clear of the destination strip', () => {
    const tables = [t(700, 800), t(700, 560)];
    const obstacle = { x: 800, y: 900, width: 100, height: 200 }; // far right, no overlap
    const out = balanceScheduleTables(tables, 500, 0, 1000, [obstacle]);
    expect(out[1].x).toBe(200);        // mirror still applied
    expect(out[1].y).toBe(800);
  });
});

import { subdivideStripsForCap } from '../scheduleStrategy.js';
import { planScheduleSplit } from '../../../../app-shared/block-definitions.js';

describe('subdivideStripsForCap — ideal full columns first, subdivision only for the remainder', () => {
  // The Maglas general plan on SI727_1000x800, in planner points. Drawing band
  // is 700mm (1984pt) less the 14pt top/bottom inset = 1956pt. The figure is
  // centred, leaving two ~567pt side strips; ONE schedule column is 425.2pt, so
  // each strip takes exactly one column across.
  const BAND_H = 1956.25;
  const COL_W  = 425.2;
  const strips = [
    { x: 141.7,  y: 141.7, w: 567, h: BAND_H },   // left gutter
    { x: 1842.5, y: 141.7, w: 567, h: BAND_H },   // right gutter
  ];
  // SI 727 practice: a table may not exceed 95% of the band.
  const CAP = BAND_H * 0.95;
  const HEADER = 65;   // title 15 + spacing 15 + header 25 + pad 10
  const ROW    = 15;

  test('the first slot in a strip is the tallest whole-row table the cap allows', () => {
    const slots = subdivideStripsForCap({ strips, maxTableHeight: CAP, tableWidth: COL_W });

    // cap 1858.4 → floor((1858.4 - 65) / 15) = 119 rows → 65 + 1785 = 1850pt.
    // Quantising DOWN to whole rows matters: reserving the full 1858.4 would
    // waste 8pt and cost the leftover slot its second row.
    expect(slots[0].height).toBeCloseTo(1850, 0);
    expect(slots[0].height).toBeLessThanOrEqual(CAP);
    // A slot is exactly one column wide, not the whole strip — the leftover
    // width is what lets a wide strip carry a second column.
    expect(slots[0].width).toBeCloseTo(COL_W, 0);
  });

  test('a strip wide enough for two columns yields two, side by side', () => {
    // The real Maglas sheet: a LEFT-aligned figure pools all the slack into one
    // 893pt right-hand strip, which takes two 425.2pt columns (870pt with the
    // 10pt gutter). Treating that strip as a single column wasted half of it —
    // 121 of 266 stands seated instead of 242.
    const wide = [{ x: 1516, y: 141.7, w: 893, h: BAND_H }];
    const slots = subdivideStripsForCap({ strips: wide, maxTableHeight: CAP, tableWidth: COL_W });

    const xs = [...new Set(slots.map((s) => Math.round(s.x)))].sort((a, b) => a - b);
    expect(xs).toHaveLength(2);
    expect(xs[1] - xs[0]).toBeCloseTo(COL_W + 10, 0);
    // Two columns, each tiled into its ideal table plus a remainder.
    expect(slots).toHaveLength(4);
  });

  test('one column is taken from every strip before a second from any', () => {
    // Keeps the balanced look: fill each whitespace region once, then come back
    // for second columns, rather than stacking both columns in the first strip.
    const twoWide = [
      { x: 0,    y: 0, w: 893, h: BAND_H },
      { x: 2000, y: 0, w: 893, h: BAND_H },
    ];
    const slots = subdivideStripsForCap({ strips: twoWide, maxTableHeight: CAP, tableWidth: COL_W });
    const ideal = slots.filter((s) => s.height > 1000).map((s) => Math.round(s.x));

    // First column of strip A, first of strip B, then the second columns.
    expect(ideal).toEqual([0, 2000, 435, 2435]);
  });

  test('the space left below the ideal column becomes a smaller remainder slot', () => {
    const slots = subdivideStripsForCap({ strips, maxTableHeight: CAP, tableWidth: COL_W });

    // 1956.25 - 1850 - 10 spacing = 96.25pt → floor((96.25 - 65) / 15) = 2 rows.
    const leftStripSlots = slots.filter((s) => s.x === 141.7);
    expect(leftStripSlots).toHaveLength(2);
    expect(leftStripSlots[1].height).toBeCloseTo(95, 0);
    expect(leftStripSlots[1].y).toBeCloseTo(141.7 + 1850 + 10, 0);
  });

  test('a strip already within the cap stays one slot — no gratuitous subdivision', () => {
    const short = [{ x: 0, y: 0, w: 600, h: 900 }];
    const slots = subdivideStripsForCap({ strips: short, maxTableHeight: 1858, tableWidth: COL_W });

    expect(slots).toHaveLength(1);
    // Quantised to whole rows: floor((900 - 65) / 15) = 55 → 65 + 825 = 890.
    expect(slots[0].height).toBeCloseTo(890, 0);
  });

  test('a strip narrower than one column yields no slots', () => {
    const narrow = [{ x: 0, y: 0, w: 200, h: 1956 }];
    expect(subdivideStripsForCap({ strips: narrow, maxTableHeight: CAP, tableWidth: COL_W })).toEqual([]);
  });

  test('Maglas seats all 240 stands as two ideal columns plus one small remainder', () => {
    const slots = subdivideStripsForCap({ strips, maxTableHeight: CAP, tableWidth: COL_W });
    const { plan, residualRows } = planScheduleSplit({
      totalRows: 240, availableGaps: slots, tableWidth: COL_W,
      headerHeight: HEADER, rowHeight: ROW,
      // A remainder table is a continuation by construction, so it is allowed
      // to be shorter than the 3-row minimum a standalone table must meet.
      minRowsPerTable: 1,
    });

    expect(residualRows).toBe(0);
    // Two full-height columns carry the bulk; only the 2 that do not fit spill
    // into the subdivided leftover. NOT four equal 60-row tables.
    expect(plan.map((p) => p.rowCount)).toEqual([119, 119, 2]);
  });
});
