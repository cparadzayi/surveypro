import { describe, test, expect } from '@jest/globals';
import { planSheetLayout } from '../sheetLayoutPlanner.js';
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js';
import { sampleMaglasPlan } from './fixtures/sampleMaglasPlan.js';
import BLOCKS from '../../../../app-shared/block-definitions.js';
import { scaleBarMetrics } from '../pdfkitGeoPDF.js';

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} };
const fakeMeasure = (str, { size }) => String(str).length * size * 0.55;

// Synthetic mapBounds equivalent to the old 594x420mm ISO_A2 substitute —
// not tied to the real SI727_500x400 sheet (500x400mm); this fixture just
// needs a plausible drawing area, not the actual SI 727 dimensions.
const A2_MAP_BOUNDS = { x: 14, y: 14, width: 1684 - 28, height: 1190 - 28 };

function plan(fixture) {
  return planSheetLayout({
    metadata: fixture.metadata,
    parcels: fixture.parcels,
    outsideFigureData: fixture.outsideFigureData,
    beacons: fixture.beacons,
    mapBounds: A2_MAP_BOUNDS,
    mapFeatureBounds: { x: 100, y: 100, width: 500, height: 400, pdfPoints: [] },
    scale: fixture.scale,
    extent: { minX: 50000, maxX: 50100, minY: 2200000, maxY: 2200060 },
    tickMarkBounds: [],
    figureBounds: { x: 100, y: 100, width: 500, height: 400 },
    polyPts: [{ x: 100, y: 100 }, { x: 600, y: 100 }, { x: 600, y: 500 }, { x: 100, y: 500 }, { x: 100, y: 100 }],
    measureText: fakeMeasure,
    logger: fakeLogger,
  });
}

describe('planSheetLayout — output shape', () => {
  test('returns all required block slots for the minimal fixture', () => {
    const r = plan(sampleMinimalPlan);
    for (const key of ['titleBlock', 'scheduleOfAreas', 'outsideFigureData', 'beaconDescription',
                       'scaleBar', 'surveyStatement', 'northArrow', 'sgSignature']) {
      expect(r[key]).toBeDefined();
      expect(typeof r[key].x).toBe('number');
      expect(typeof r[key].y).toBe('number');
      expect(typeof r[key].width).toBe('number');
      expect(typeof r[key].height).toBe('number');
    }
  });

  test('title block has fixed width 650pt', () => {
    const r = plan(sampleMinimalPlan);
    expect(r.titleBlock.width).toBe(650);
  });

  // Regression guard: the planner must reserve the SAME dimensions the renderer
  // draws (BLOCKS.SURVEYOR_GENERAL_BOX). A hardcoded copy in the planner once
  // drifted (reserved 80pt while the box was drawn 110pt), so the S-G box
  // overflowed its slot into the bottom margin/footer. Sourcing from the shared
  // config keeps them locked together.
  test('sgSignature slot matches the drawn SURVEYOR_GENERAL_BOX dimensions', () => {
    const r = plan(sampleMinimalPlan);
    expect(r.sgSignature.height).toBe(BLOCKS.SURVEYOR_GENERAL_BOX.height);
    expect(r.sgSignature.width).toBe(BLOCKS.SURVEYOR_GENERAL_BOX.width);
  });

  // Same drift guard for the fixed-bbox North Arrow and the (height-only) Scale
  // Bar — the planner must reserve exactly what the shared config declares.
  test('northArrow slot matches the drawn NORTH_ARROW bounding box', () => {
    const r = plan(sampleMinimalPlan);
    expect(r.northArrow.width).toBe(BLOCKS.NORTH_ARROW.blockWidth);
    expect(r.northArrow.height).toBe(BLOCKS.NORTH_ARROW.blockHeight);
  });

  test('scaleBar reserved height matches SCALE_BAR.reservedHeight', () => {
    const r = plan(sampleMinimalPlan);
    expect(r.scaleBar.height).toBe(BLOCKS.SCALE_BAR.reservedHeight);
  });

  test('schedule of areas: single column for the 2-stand fixture', () => {
    const r = plan(sampleMinimalPlan);
    expect(r.scheduleOfAreas._schedNumCols ?? 1).toBe(1);
    expect(r.scheduleOfAreas.width).toBeCloseTo(260, 0);  // singleColumn total = 260pt
  });
});

describe('planSheetLayout — dense schedule fills the drawing height', () => {
  // Regression: the split schedule targeted 0.95 of the available height, which
  // left each sub-table 5% short. For 240 stands that dropped rows-per-table from
  // 126 to 119 and, after even distribution, to 80 — forcing THREE side-by-side
  // tables (composite 1296pt) instead of two (860pt). The 240-stand Maglas fixture
  // on SI727_1000x800 is the case that exposes it. Linking each sub-table's height
  // to the full drawing height keeps rows-per-table maximal, and fewer columns is
  // what keeps the composite from widening past the figure.
  const MAGLAS_MAP_BOUNDS = { x: 141.73, y: 141.73, width: 2267.72, height: 1984.25 };
  const MAGLAS_FIGURE = { x: 141.73, y: 413.66, width: 1889.76, height: 1587.4 };

  function planMaglas() {
    return planSheetLayout({
      metadata: sampleMaglasPlan.metadata,
      parcels: sampleMaglasPlan.parcels,
      outsideFigureData: sampleMaglasPlan.outsideFigureData,
      beacons: sampleMaglasPlan.beacons,
      mapBounds: MAGLAS_MAP_BOUNDS,
      mapFeatureBounds: { ...MAGLAS_FIGURE, pdfPoints: [] },
      scale: { value: 750, label: '1:750' },
      extent: { minX: 2200000, maxX: 2200420, minY: 50000, maxY: 50500 },
      tickMarkBounds: [],
      figureBounds: MAGLAS_FIGURE,
      polyPts: [
        { x: MAGLAS_FIGURE.x, y: MAGLAS_FIGURE.y },
        { x: MAGLAS_FIGURE.x + MAGLAS_FIGURE.width, y: MAGLAS_FIGURE.y },
        { x: MAGLAS_FIGURE.x + MAGLAS_FIGURE.width, y: MAGLAS_FIGURE.y + MAGLAS_FIGURE.height },
        { x: MAGLAS_FIGURE.x, y: MAGLAS_FIGURE.y + MAGLAS_FIGURE.height },
      ],
      // The renderer measures the real stand/deed text and passes the widths in;
      // 15cm total (SI 727). Mirrors the real-document path.
      scheduleColumnWidthsPt: [40, 45, 85.05, 85.05, 85.05, 85.05],
      measureText: fakeMeasure,
      logger: fakeLogger,
    });
  }

  test('240 stands split into 2 side-by-side tables, not 3', () => {
    const r = planMaglas();
    expect(r._schedNeedsSplit).toBe(true);
    expect(r._schedNumCols).toBe(2);
    expect(r._schedRowsPerCol).toBe(120);
    // Two 425.2pt tables + one 10pt gutter — the documented 860pt composite.
    expect(r.scheduleOfAreas.width).toBeCloseTo(860.4, 0);
  });

  test('each of the two tables fills the drawing height (120 rows)', () => {
    const r = planMaglas();
    const tables = r.scheduleOfAreas.placedTables;
    expect(tables).toHaveLength(2);
    expect(tables.map((t) => t.rowCount)).toEqual([120, 120]);
    // This is the composite of the RENDERED tables, so it uses the renderer's
    // chrome: titleSpacing(15) + headerHeight(25) + pad(10) = 50. Note the
    // planner sizes its own estimate with an extra 15pt title line (65) — a
    // long-standing 15pt-per-table over-reserve between planner and renderer.
    // Conservative, so it can't cause an overlap, but they are not the same
    // number and this assertion must track the one actually drawn.
    // Row height comes from config so a density change moves both together.
    const RENDER_CHROME = 15 + BLOCKS.SCHEDULE_OF_AREAS.singleColumn.headerHeight + 10;
    expect(r.scheduleOfAreas.height).toBeCloseTo(
      RENDER_CHROME + 120 * BLOCKS.SCHEDULE_OF_AREAS.singleColumn.rowHeight, 0);
  });
});

describe('planSheetLayout — scale validation', () => {
  test('throws when scale is missing value', () => {
    expect(() => planSheetLayout({
      metadata: {}, parcels: { features: [] }, outsideFigureData: { edges: [] },
      beacons: { features: [] }, mapBounds: A2_MAP_BOUNDS, mapFeatureBounds: null,
      scale: { label: '1:500' }, extent: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
      measureText: fakeMeasure, logger: fakeLogger,
    })).toThrow(/Scale parameter is required/);
  });
});

describe('planSheetLayout — measureText injection', () => {
  test('uses the injected measurer for OFD col1 sizing', () => {
    let measureCalls = 0;
    const countingMeasure = (str, { size }) => { measureCalls++; return String(str).length * size * 0.55; };
    planSheetLayout({
      metadata: sampleMinimalPlan.metadata,
      parcels: sampleMinimalPlan.parcels,
      outsideFigureData: sampleMinimalPlan.outsideFigureData,
      beacons: sampleMinimalPlan.beacons,
      mapBounds: A2_MAP_BOUNDS,
      mapFeatureBounds: { x: 100, y: 100, width: 500, height: 400, pdfPoints: [] },
      scale: sampleMinimalPlan.scale,
      extent: { minX: 50000, maxX: 50100, minY: 2200000, maxY: 2200060 },
      polyPts: [{ x: 100, y: 100 }, { x: 600, y: 100 }, { x: 600, y: 500 }, { x: 100, y: 500 }, { x: 100, y: 100 }],
      measureText: countingMeasure,
      logger: fakeLogger,
    });
    // Minimal fixture has 4 OFD edges; OFD col1 measurement is the only injected call site.
    expect(measureCalls).toBeGreaterThanOrEqual(4);
  });
});

describe('planSheetLayout — endorsement slot', () => {
  test('returns endorsement slot at right-margin position', () => {
    const r = plan(sampleMinimalPlan);
    expect(r.endorsement).toBeDefined();
    // Per drawEndorsementBlock: top-left = (mapBounds.x + mapBounds.width, mapBounds.y),
    // width = 150mm in PDF points (150 * 2.835), height = 150 PDF points.
    expect(r.endorsement.x).toBeCloseTo(A2_MAP_BOUNDS.x + A2_MAP_BOUNDS.width, 0);
    expect(r.endorsement.y).toBeCloseTo(A2_MAP_BOUNDS.y, 0);
    expect(r.endorsement.width).toBeCloseTo(150 * 2.835, 1);
    expect(r.endorsement.height).toBeCloseTo(150, 0);
  });
});

describe('planSheetLayout — scheduleColumnWidthsPt override', () => {
  test('uses caller-provided widths when scheduleColumnWidthsPt is set', () => {
    // Wide widths: 50, 80, 60, 60, 50, 70 sum = 370 pt
    const customWidths = [50, 80, 60, 60, 50, 70];
    const r = planSheetLayout({
      metadata: sampleMinimalPlan.metadata,
      parcels: sampleMinimalPlan.parcels,
      outsideFigureData: sampleMinimalPlan.outsideFigureData,
      beacons: sampleMinimalPlan.beacons,
      mapBounds: A2_MAP_BOUNDS,
      mapFeatureBounds: { x: 100, y: 100, width: 500, height: 400, pdfPoints: [] },
      scale: sampleMinimalPlan.scale,
      extent: { minX: 50000, maxX: 50100, minY: 2200000, maxY: 2200060 },
      polyPts: [{ x: 100, y: 100 }, { x: 600, y: 100 }, { x: 600, y: 500 }, { x: 100, y: 500 }, { x: 100, y: 100 }],
      measureText: fakeMeasure,
      logger: fakeLogger,
      scheduleColumnWidthsPt: customWidths,
    });
    expect(r.scheduleOfAreas.width).toBeCloseTo(370, 0);
  });

  test('falls back to static widths (260 pt) when scheduleColumnWidthsPt is omitted', () => {
    const r = plan(sampleMinimalPlan);
    expect(r.scheduleOfAreas.width).toBeCloseTo(260, 0);
  });
});

describe('planSheetLayout — closed-polygon validation guard', () => {
  test('an open polygon is auto-closed before placement validation', () => {
    // Square polygon WITHOUT explicit closing vertex.
    const openSquare = [
      { x: 100, y: 100 }, { x: 500, y: 100 },
      { x: 500, y: 400 }, { x: 100, y: 400 },
    ];
    const closedSquare = [...openSquare, { x: 100, y: 100 }];

    const baseArgs = {
      metadata: sampleMinimalPlan.metadata,
      parcels: sampleMinimalPlan.parcels,
      outsideFigureData: sampleMinimalPlan.outsideFigureData,
      beacons: sampleMinimalPlan.beacons,
      mapBounds: A2_MAP_BOUNDS,
      scale: sampleMinimalPlan.scale,
      extent: { minX: 50000, maxX: 50100, minY: 2200000, maxY: 2200060 },
      measureText: fakeMeasure,
      logger: fakeLogger,
    };

    const rOpen = planSheetLayout({
      ...baseArgs,
      mapFeatureBounds: { x: 100, y: 100, width: 400, height: 300, pdfPoints: openSquare },
      polyPts: openSquare,
    });
    const rClosed = planSheetLayout({
      ...baseArgs,
      mapFeatureBounds: { x: 100, y: 100, width: 400, height: 300, pdfPoints: closedSquare },
      polyPts: closedSquare,
    });

    // Both inputs must produce identical placements — guard auto-closes the polygon
    // so edge-walk validation sees the same shape either way.
    expect(rOpen.titleBlock.x).toBeCloseTo(rClosed.titleBlock.x, 1);
    expect(rOpen.titleBlock.y).toBeCloseTo(rClosed.titleBlock.y, 1);
  });
});

describe('planSheetLayout — dense schedule fills both gutters, ideal columns first', () => {
  // Real geometry from the reported Maglas plan (general-developed-STANDS_1686-…),
  // captured from an instrumented generateGeoPDF run on SI727_1000x800 at 1:1250:
  //   mapBounds (142,142) 2268×1984pt   — the 800×700mm drawing band
  //   figure    (709,731) 1134×952pt    — centred, leaving two ~567pt gutters
  // One schedule column measures 425.2pt, so each gutter takes exactly ONE
  // column across. Before this change the splitter built a single contiguous
  // 2×120-row composite 860pt wide, which fits NEITHER gutter — the search
  // found 0 candidates and the schedule was dropped top-left, over the figure.
  const MAP_BOUNDS = { x: 141.73, y: 141.73, width: 2267.72, height: 1984.25 };
  const FIGURE     = { x: 708.66, y: 731.14, width: 1133.86, height: 952.44 };
  const BAND_H     = MAP_BOUNDS.height - 28;      // 14pt inset top and bottom
  const HEIGHT_CAP = BAND_H * 0.95;               // never a full-height wall
  const RING = [
    { x: FIGURE.x, y: FIGURE.y },
    { x: FIGURE.x + FIGURE.width, y: FIGURE.y },
    { x: FIGURE.x + FIGURE.width, y: FIGURE.y + FIGURE.height },
    { x: FIGURE.x, y: FIGURE.y + FIGURE.height },
  ];

  // Planning Maglas is expensive (240 stands through the full placement
  // search), so plan ONCE and assert against the single result.
  let tables;
  beforeAll(() => {
    const r = planSheetLayout({
      metadata: sampleMaglasPlan.metadata,
      parcels: sampleMaglasPlan.parcels,
      outsideFigureData: sampleMaglasPlan.outsideFigureData,
      beacons: sampleMaglasPlan.beacons,
      mapBounds: MAP_BOUNDS,
      mapFeatureBounds: { ...FIGURE, pdfPoints: [...RING, RING[0]] },
      scale: { value: 1250, label: '1:1250' },
      extent: { minX: 2200000, maxX: 2200420, minY: 50000, maxY: 50500 },
      tickMarkBounds: [],
      figureBounds: FIGURE,
      polyPts: RING,
      scheduleColumnWidthsPt: [40, 45, 85.05, 85.05, 85.05, 85.05],
      measureText: fakeMeasure,
      logger: fakeLogger,
    });
    tables = r.scheduleOfAreas.placedTables;
  }, 300000);

  test('no table exceeds 95% of the drawing band', () => {
    expect(Array.isArray(tables)).toBe(true);
    for (const t of tables) expect(t.height).toBeLessThanOrEqual(HEIGHT_CAP);
  });

  test('two ideal full columns carry the bulk, one per gutter', () => {
    // The two tallest tables are the ideal columns, equal height, one in each
    // side gutter. Smaller remainder tables may sit in the bands above or below
    // the figure — that extra whitespace is what lets a dense schedule seat at
    // all when a left-aligned figure leaves only one usable gutter.
    const byHeight = [...tables].sort((a, b) => b.height - a.height);
    const [tallA, tallB] = byHeight;

    expect(tallA.height).toBeCloseTo(tallB.height, 0);
    const isLeft  = (t) => t.x + t.width <= FIGURE.x + 1;
    const isRight = (t) => t.x >= FIGURE.x + FIGURE.width - 1;
    expect([isLeft(tallA), isLeft(tallB)].filter(Boolean)).toHaveLength(1);
    expect([isRight(tallA), isRight(tallB)].filter(Boolean)).toHaveLength(1);
  });

  test('every one of the 240 stands is still seated', () => {
    const seated = tables.reduce((s, t) => s + (t.rowCount ?? 0), 0);
    expect(seated).toBe(240);
  });

  test('no table overlaps the figure', () => {
    const hits = tables.filter((t) =>
      t.x < FIGURE.x + FIGURE.width && t.x + t.width > FIGURE.x &&
      t.y < FIGURE.y + FIGURE.height && t.y + t.height > FIGURE.y);
    expect(hits).toEqual([]);
  });
});

describe('planSheetLayout — figure extent comes from the polygon, not the mapFeatureBounds rect', () => {
  // The DXF generator calls this planner with mapFeatureBounds set to the WHOLE
  // content area (dxfGenerator.js:2167) and carries the real figure only in
  // pdfPoints. Taking the rect at face value makes the "figure" fill the sheet,
  // every whitespace strip collapses to nothing, and the schedule falls back to
  // the top-left corner — which is exactly how the DXF ended up drawing its
  // schedule over the figure while the PDF put it in the right-hand strip.
  //
  // Geometry below is the real Maglas export's DXF frame, from its own
  // [PLANNER-INPUT] log line: origin-based mapBounds, figure 0..1374.7 wide.
  const MAP = { x: 0, y: 0, width: 2267.7, height: 1984.3 };
  const FIG = { minX: 0, maxX: 1374.7, minY: 269.8, maxY: 1714.4 };
  const RING = [
    { x: FIG.minX, y: FIG.minY }, { x: FIG.maxX, y: FIG.minY },
    { x: FIG.maxX, y: FIG.maxY }, { x: FIG.minX, y: FIG.maxY },
  ];

  function planLikeDxf() {
    return planSheetLayout({
      metadata: sampleMaglasPlan.metadata,
      parcels: sampleMaglasPlan.parcels,
      outsideFigureData: sampleMaglasPlan.outsideFigureData,
      beacons: sampleMaglasPlan.beacons,
      mapBounds: MAP,
      // The DXF's shape: rect = whole content area, real figure only in pdfPoints.
      mapFeatureBounds: { ...MAP, pdfPoints: [...RING, RING[0]] },
      scale: { value: 750, label: '1:750' },
      extent: { minX: 2247788, maxX: 2248170, minY: 97093, maxY: 97457 },
      tickMarkBounds: [],
      polyPts: RING,
      scheduleColumnWidthsPt: [40, 45, 85.05, 85.05, 85.05, 85.05],
      measureText: fakeMeasure,
      logger: fakeLogger,
    });
  }

  test('the schedule seats in the strip beside the figure, not the top-left corner', () => {
    const tables = planLikeDxf().scheduleOfAreas.placedTables;

    expect(Array.isArray(tables)).toBe(true);
    expect(tables.length).toBeGreaterThan(0);
    // Every table must clear the figure horizontally — the right strip starts
    // past FIG.maxX. x:14 (the stacker fallback) fails this.
    for (const t of tables) expect(t.x).toBeGreaterThan(FIG.maxX);
  });

  test('every stand is still seated', () => {
    const tables = planLikeDxf().scheduleOfAreas.placedTables;
    expect(tables.reduce((s, t) => s + (t.rowCount ?? 0), 0)).toBe(240);
  });
});

describe('planSheetLayout — seated schedule stays inside the drawing area', () => {
  // The strips are cut against the figure INFLATED by a clearance, so the
  // top/bottom bands inherit the inflated x and can start outside the content
  // area — slots were emitted at x=-14 on an origin-based frame, i.e. in the
  // sheet margin. Clamping the strips to the content area is what keeps every
  // table on the drawing.
  const MAP = { x: 0, y: 0, width: 2267.7, height: 1984.3 };
  // Wide enough that the right strip holds only ONE column, so the remainder
  // has to spill into the top/bottom bands — the slots that inherit the
  // inflated figure's x and land in the margin.
  const FIG = { minX: 0, maxX: 1800, minY: 269.8, maxY: 1714.4 };
  const RING = [
    { x: FIG.minX, y: FIG.minY }, { x: FIG.maxX, y: FIG.minY },
    { x: FIG.maxX, y: FIG.maxY }, { x: FIG.minX, y: FIG.maxY },
  ];

  test('no seated table starts left of, or extends past, the drawing area', () => {
    const r = planSheetLayout({
      metadata: sampleMaglasPlan.metadata,
      parcels: sampleMaglasPlan.parcels,
      outsideFigureData: sampleMaglasPlan.outsideFigureData,
      beacons: sampleMaglasPlan.beacons,
      mapBounds: MAP,
      mapFeatureBounds: { ...MAP, pdfPoints: [...RING, RING[0]] },
      scale: { value: 1000, label: '1:1000' },
      extent: { minX: 2247788, maxX: 2248170, minY: 97093, maxY: 97457 },
      tickMarkBounds: [],
      polyPts: RING,
      scheduleColumnWidthsPt: [40, 45, 85.05, 85.05, 85.05, 85.05],
      measureText: fakeMeasure,
      logger: fakeLogger,
    });
    const tables = r.scheduleOfAreas.placedTables ?? [];
    expect(tables.length).toBeGreaterThan(0);
    for (const t of tables) {
      expect(t.x).toBeGreaterThanOrEqual(MAP.x);
      expect(t.x + t.width).toBeLessThanOrEqual(MAP.x + MAP.width);
      expect(t.y).toBeGreaterThanOrEqual(MAP.y);
      expect(t.y + t.height).toBeLessThanOrEqual(MAP.y + MAP.height);
    }
  });
});

// The scale bar and the north arrow are map furniture: a surveyor reads them
// together, and pinning the arrow in the top-right corner cost the schedule the
// top of a whole column (~85pt, about 5 rows). They are now one group, centred
// under the title band, so the corner is free and the pair cannot be separated.
describe('map furniture reads as one group under the title', () => {
  const GAP = 12
  const centreY = (b) => b.y + b.height / 2

  test('the arrow sits beside the scale bar, not in the top-right corner', () => {
    const r = plan(sampleMinimalPlan)
    expect(r.northArrow.x).toBeGreaterThan(r.scaleBar.x)
    expect(r.northArrow.x - (r.scaleBar.x + r.scaleBar.width)).toBeCloseTo(GAP, 1)
  })

  test('both sit on one centre line', () => {
    const r = plan(sampleMinimalPlan)
    expect(centreY(r.northArrow)).toBeCloseTo(centreY(r.scaleBar), 1)
  })

  test('the group is centred on the title block', () => {
    const r = plan(sampleMinimalPlan)
    const groupCentre = (r.scaleBar.x + r.northArrow.x + r.northArrow.width) / 2
    expect(groupCentre).toBeCloseTo(r.titleBlock.x + r.titleBlock.width / 2, 0)
  })

  test('the group sits below the title band, not over it', () => {
    const r = plan(sampleMinimalPlan)
    expect(r.scaleBar.y).toBeGreaterThanOrEqual(r.titleBlock.y + r.titleBlock.height)
  })

  test('the arrow no longer claims the top-right corner of the drawing', () => {
    const r = plan(sampleMinimalPlan)
    const cornerX = A2_MAP_BOUNDS.x + A2_MAP_BOUNDS.width - r.northArrow.width - 14
    expect(r.northArrow.x).not.toBeCloseTo(cornerX, 0)
  })
})

// The planner reserves the scale bar's slot; drawScaleBar draws it. They used to
// derive the width separately and disagreed four ways -- metres-per-point from the
// figure box instead of the stated scale, a 40pt target instead of 40mm, its own
// rounding instead of snapScaleBarSegment, and four segments instead of three.
// 241pt reserved against 389pt drawn. Harmless while the bar sat alone with space
// to its right; it put the north arrow on top of the bar once they became a group.
describe('the scale bar slot is the size of the bar that gets drawn', () => {
  const REF_WIDTH = 500;   // plan() passes figureBounds.width = 500

  test('the reserved width equals the drawn width', () => {
    const r = plan(sampleMinimalPlan);
    const drawn = scaleBarMetrics(sampleMinimalPlan.scale, REF_WIDTH).scaleBarWidth;
    expect(r.scaleBar.width).toBeCloseTo(drawn, 1);
  });

  test('the north arrow clears the bar that is actually drawn', () => {
    const r = plan(sampleMinimalPlan);
    const drawn = scaleBarMetrics(sampleMinimalPlan.scale, REF_WIDTH).scaleBarWidth;
    expect(r.northArrow.x).toBeGreaterThanOrEqual(r.scaleBar.x + drawn);
  });
});
