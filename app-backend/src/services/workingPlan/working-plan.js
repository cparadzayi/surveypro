/**
 * working-plan.js — Survey Plan Generation: working plan sheet as DXF.
 *
 * Layout constants below are measured from a Surveyor-General-style working
 * plan (Stands 403-405 Brackenhurst Township, Gwelo District, 1:2000). They
 * are all expressed in MILLIMETRES ON PAPER, so the same sheet design holds at
 * any scale: a length on the ground is (mm * scale / 1000) metres.
 *
 * Coordinate convention (Zimbabwe Lo. systems):
 *     DXF easting  =  -Y(Lo.)     Y is positive west
 *     DXF northing =  -X(Lo.)     X is positive south
 * which gives a conventional north-up, east-right drawing.
 */

import { DxfDocument } from './dxf-r12.js';
// The SAME helpers the diagram, general-plan PDF and DXF renderers use, so an
// abutting neighbour is marked identically on every document. contiguousMarks'
// own docblock names that as its purpose; the working plan is the fourth
// consumer. Both are coordinate-space agnostic, so they work in ground units.
import { contiguousMarks, CONTIG_STUB_MM } from '../diagram/contiguousMarks.js';
import { edgeStrip } from '../diagram/edgeStrip.js';
import { SI727_SCALE_LADDER } from '../../../../app-shared/si727Scales.js';

/* ------------------------------------------------------------------ layout */

/**
 * The working plan's paper: ISO A4 landscape, in millimetres.
 *
 * One size, deliberately. A working plan is a field document and A4 is what a
 * surveyor carries and prints; when a figure will not fit, SI 727 Reg 32(2)
 * says the SCALE moves, not the paper. Reported in the result so a plot dialog
 * can set true size without the operator scaling by hand.
 */
export const SHEET = { width: 297, height: 210 };

export const LAYOUT = {
  border: { x0: 0.5, y0: 0.5, x1: 296.5, y1: 209.5 },

  // region the surveyed figure is centred in (mm from sheet top-left)
  panel: { x0: 6, y0: 6, x1: 152, y1: 172 },

  title: {
    cx: 175.93,
    // Shifted 6 mm down from the original 8.2/20.3/32.2/44.2. At 1.25x the
    // heading's glyphs reached 3.26 mm from the sheet edge, inside the margin a
    // printer can crop. They now start at 9.26 mm.
    baselines: [14.2, 26.3, 38.2, 50.2],   // up to four heading lines
    scaleBaseline: 60.1,
  },

  northArrow: {
    cx: 275.89, cy: 25.66,
    north: 18.6, south: 39.7, side: 8.0, diagonal: 5.0, halfWidth: 1.31,
    letters: { left: 'T', right: 'N', dxLeft: -4.0, dxRight: 1.2, baseline: 8.55 },
  },

  approval: {
    box: { x0: 228.13, y0: 73.83, x1: 291.89, y1: 107.36 },
    approvedBaseline: 78.76,
    leader1: { y: 90.78, x0: 238.1, x1: 281.4 },
    forBaseline: 95.60,
    dateBaseline: 104.35, dateX: 238.8,
    leader2: { y: 104.11, x0: 249.7, x1: 277.5 },
  },

  certificate: {
    line1: { x: 5.50, baseline: 181.08 },
    line2: { x: 19.94, baseline: 199.08 },
  },

  inset: {
    box: { x0: 162.9, y0: 109.69, x1: 291.97, y1: 196.13 },
    // The inset is a locality map in its own right and cannot be read without a
    // north point -- and it is the SHEET'S arrow, drawn small, not a second
    // symbol of its own. Everything comes from LAYOUT.northArrow times `scale`,
    // so retuning the meridian arrow retunes both. Top right, clear of the
    // "Inset (not to scale)" caption at the top left.
    north: { dxFromRight: 12.0, dyFromTop: 12.0, scale: 0.30, letterMm: 1.6 },
  },

  // Area statement: the free column between the scale line, the approval box
  // (x from 228.13) and the inset (y from 109.69).
  // Survey Record number: foot of the sheet, centred on the page. The strip
  // below 200 mm is clear right across -- the inset ends at 196.13 and the
  // certificate sits on the left at x 5.5/19.94.
  srNumber: { cx: 148.5, baseline: 205.0 },

  // cap heights, mm on paper
  text: {
    beacon: 2.05, grid: 2.05, parcel: 3.07, road: 3.07,
    title: 3.95, titleLeadFactor: 1.25, scale: 3.03, approval: 3.06, certificate: 2.99,
    insetTitle: 3.00, insetLabel: 2.05,
    // Neighbouring properties, roads and servitudes are all adjoining detail and
    // read as one family, at the same size as a beacon name. They were set at
    // parcel-label size (3.07), which made them louder than the stand numbers
    // they sit beside.
    adjoining: 2.05,
  },

  // SI 727 Fifth Schedule (Sections 37, 38, 64 and 68), Conventional Signs,
  // pp. 3306-3307. Every one of these is Black in the Working Plan column.
  symbol: {
    // A placed beacon is drawn at the found beacon's OUTER diameter, so the two
    // read at the same size and only their construction -- one circle against
    // two concentric -- tells them apart.
    placedDia: 2.498,       // beacon placed: open circle
    foundOuterDia: 2.498,   // beacon found and adopted: concentric circles
    foundInnerDia: 1.482,
    notAdoptedSlash: 3.30,  // beacon found and NOT adopted: the same, struck through
    refMarkDia: 2.498,      // reference mark: circle with a cross
    refMarkArm: 3.60,
    stationDia: 2.498,      // survey station marked: circle with a filled centre
    stationDotDia: 0.95,
    stationUnmarkedDia: 1.05, // survey station unmarked: a filled dot
    // An EQUILATERAL triangle whose inscribed circle is exactly the found
    // beacon's diameter. Two rules, and between them the numbers are forced:
    // height = base * sqrt(3)/2 makes it equilateral, and a side of 4.327 puts
    // the incircle at 2.498. Both are tests.
    //
    // It was 4.595/3.546: a base wider than its own sides (4.595 against 4.225),
    // which reads as a triangle bulging sideways rather than the Fifth
    // Schedule's sign. The clipping clearance follows automatically --
    // symbolClearance derives the triangle's reach from these two numbers.
    trigW: 4.327, trigH: 3.747, // trig beacon / official control point triangle
    gridArm: 8.008,         // full length of a grid cross arm
  },

  // grid-label offsets from the cross centre, mm
  gridLabel: { xDx: 4.45, xBaselineDy: 1.06, yDx: -1.02, yStartDy: 5.38 },

  // Shared with the diagram renderers -- see CONTIG_STUB_MM, which carries the
  // legibility arithmetic. Defined once so the four renderers cannot drift.
  contiguousStub: CONTIG_STUB_MM,

  lineweight: 18,           // 0.18 mm, matching the source plot
};

/** Source plot pattern: 4.92 pt on / 3.00 pt off; leader dots 1.32 pt @ 2.59 pt. */
const PT = 25.4 / 72;
export const LINETYPES = {
  PLANDASH: { on: 4.92 * PT, off: 3.00 * PT },
  PLANDOT: { on: 1.32 * PT, off: 1.27 * PT },
};

export const LAYERS = [
  // Every block's geometry is drawn on layer 0 so it takes the colour and
  // linetype of the layer it is INSERTed on. AutoCAD expects layer 0 to exist;
  // ours never declared it.
  ['0', 7, 'CONTINUOUS'],
  ['BOUNDARY-NEW', 1, 'CONTINUOUS'],
  ['BOUNDARY-EXIST', 3, 'PLANDASH'],
  // Dashed, the same PLANDASH as the remainder's own boundary: both mark land
  // that adjoins the survey rather than land being surveyed, so they read as
  // one family. A 6 mm stub carries about two dashes at this pattern.
  // This diverges from the diagram, which draws its abutment stubs solid.
  ['ADJOINING', 7, 'PLANDASH'],
  ['BEACONS', 2, 'CONTINUOUS'],
  ['BEACON-TEXT', 2, 'CONTINUOUS'],
  ['PARCEL-TEXT', 5, 'CONTINUOUS'],
  ['GRID', 8, 'CONTINUOUS'],
  ['GRID-TEXT', 8, 'CONTINUOUS'],
  ['ROAD-TEXT', 4, 'CONTINUOUS'],
  ['TITLE', 7, 'CONTINUOUS'],
  ['APPROVAL', 7, 'CONTINUOUS'],
  ['NORTH-ARROW', 7, 'CONTINUOUS'],
  ['SHEET-BORDER', 9, 'CONTINUOUS'],
  ['INSET', 9, 'CONTINUOUS'],
];

/**
 * SI 727 Reg 32(2)'s prescribed scales, from the shared table every other plan
 * type already resolves against.
 *
 * This was a hand-written subset -- 200, 250, 500, 1000, 1250, 2000, 2500,
 * 5000, 10000, 20000 -- missing 1:150, 1:300, 1:400, 1:600, 1:750, 1:1500,
 * 1:3000 and the rest, so a figure needing 1:1300 was drawn at 1:2000 when the
 * regulation offers 1:1500. Coarser than the law allows, from a list nobody
 * meant as law.
 */
const STANDARD_SCALES = SI727_SCALE_LADDER;
const GRID_INTERVALS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];

/**
 * How many coordinate ticks a sheet must carry.
 *
 * A grid is a FRAMEWORK, not a reference point. With one tick a reader cannot
 * even tell which way the grid runs; with four they can interpolate a position
 * anywhere on the figure and check the plan against the ground. The interval
 * was being chosen for paper spacing alone and then most candidates were vetoed
 * for crossing the figure, which left one cross on a 1:1500 sheet -- and
 * nothing tried again.
 */
const MIN_GRID_TICKS = 4;

/** Ticks closer than this stop reading as a framework and start crowding the
 *  figure, so the hunt for more of them stops here rather than shrinking the
 *  interval indefinitely. */
const MIN_TICK_SPACING_MM = 15;

/* --------------------------------------------------------------- utilities */

const loToGround = ({ X, Y }) => ({ e: -Y, n: -X });

function centroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    const cr = x1 * y2 - x2 * y1;
    a += cr; cx += (x1 + x2) * cr; cy += (y1 + y2) * cr;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) {
    return [pts.reduce((s, p) => s + p[0], 0) / pts.length,
            pts.reduce((s, p) => s + p[1], 0) / pts.length];
  }
  return [cx / (6 * a), cy / (6 * a)];
}

export function ringArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function distToSegment([px, py], [x1, y1], [x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/* ------------------------------------------------------------- main routine */

/**
 * @param {object} spec
 * @param {Array}  spec.beacons    [{ name, X, Y, symbol:'peg'|'rm'|'trig', label:'auto'|'N'|'NE'|... }]
 * @param {Array}  spec.parcels    [{ label, ring:[beaconName], labelAt? }]
 * @param {Array}  [spec.existing] [{ from, to, extendFrom?, extendTo? }]  dashed parent boundaries, mm extensions
 * @param {Array}  [spec.roads]    [{ name, from, to, offset }]  offset in mm, +ve left of from->to
 * @param {string} [spec.srNumber]  Survey Record number, printed under the scale
 * @param {string} [spec.remainderLabel]  lettered inside the remainder
 * @param {string[]} [spec.remainderRing]  the remainder's full ring of beacon
 *   names, so the label can be centred on the parcel rather than on the subset
 *   of its sides that happen to be unshared
 * @param {Array}  [spec.remainderBoundary] [{from,to}] remainder sides, drawn dashed
 * @param {Array}  [spec.contiguous] [{ from, to, end:'from'|'to'|'both' }] abutting neighbours
 * @param {Array}  [spec.notes]    [{ text, X, Y, height? }]  e.g. neighbouring stand numbers
 * @param {Array}  spec.title      up to four heading lines
 * @param {number|'auto'} spec.scale
 * @param {object} [spec.certificate] { line1, line2 }
 * @param {boolean}[spec.approvalBox]
 * @param {object} [spec.inset]    { scale, gridInterval, beacons:[{name,X,Y,symbol}] }
 * @returns {{ dxf:string, scale:number, gridInterval:{e:number,n:number}, areas:object }}
 */
/** SI format: comma decimal, space thousands -- as the diagram renderer writes
 *  numbers, so an area reads identically on both documents. */
function fmtArea(v) {
  const fixed = Math.abs(Number(v) || 0).toFixed(2);
  const [int, dec] = fixed.split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${dec}`;
}

/**
 * How far a boundary line must stop short of a beacon, in paper mm: the reach
 * of the largest part of that sign.
 *
 * Measured per sign rather than assuming one radius -- the reference mark's
 * CROSS extends past its circle, and the trig triangle's vertices further
 * still, so a single figure would leave those two struck through.
 */
function symbolClearance(symbol) {
  const S = LAYOUT.symbol;
  const w = S.trigW / 2, h = S.trigH;
  const triReach = Math.max(h * 0.62, Math.hypot(w, h * 0.38));
  switch (symbol) {
    case 'found': case 'foundNotAdopted': return S.foundOuterDia / 2;
    case 'rm':   return S.refMarkArm / 2;
    case 'ws':   return S.stationDia / 2;
    case 'wsu':  return S.stationUnmarkedDia / 2;
    case 'trig': case 'ocp': return triReach;
    default:     return S.placedDia / 2;      // placed / peg
  }
}

export function generateWorkingPlan(spec) {
  const L = LAYOUT;
  const byName = new Map(spec.beacons.map((b) => [b.name, { ...b, ...loToGround(b) }]));
  const G = (name) => {
    const b = byName.get(name);
    if (!b) throw new Error(`generateWorkingPlan: unknown beacon "${name}"`);
    return b;
  };

  /* ---- figure extent: everything the sheet DRAWS.
   *
   * It was the ring vertices alone, "so stray RMs don't blow it up" -- the fear
   * being that one distant reference mark would force a coarse scale and shrink
   * the stands. The trade does not hold up: the sheet still DREW those points,
   * it just stopped sizing itself to them, so a reference mark outside the ring
   * extent was placed beyond the panel and, at a fine enough scale, off the
   * sheet entirely. On the Brackenhurst plan at 1:1500 that was 88X2, past the
   * border and simply gone.
   *
   * A slightly coarser scale costs a little room. A beacon drawn outside the
   * margin costs the surveyor the point, silently, and there is no reading of
   * the sheet that reveals it. So the extent covers every beacon, and if that
   * means the next scale up, that is the honest answer. */
  const beaconPts = [...byName.values()].map((b) => [b.e, b.n]);
  const extraPts = (spec.notes ?? []).map((t) => {
    const g = loToGround(t); return [g.e, g.n];
  });
  const all = beaconPts.concat(extraPts);
  const bb = {
    e0: Math.min(...all.map((p) => p[0])), e1: Math.max(...all.map((p) => p[0])),
    n0: Math.min(...all.map((p) => p[1])), n1: Math.max(...all.map((p) => p[1])),
  };

  /* ---- scale */
  const panelW = L.panel.x1 - L.panel.x0;
  const panelH = L.panel.y1 - L.panel.y0;
  let scale = spec.scale;
  if (scale === 'auto' || scale == null) {
    const need = Math.max((bb.e1 - bb.e0) / panelW, (bb.n1 - bb.n0) / panelH) * 1000 * 1.15;
    scale = STANDARD_SCALES.find((s) => s >= need) ?? STANDARD_SCALES.at(-1);
  }
  const mm = (v) => (v * scale) / 1000;              // paper mm -> ground metres

  /* ---- sheet placement: centre the figure in the plan panel */
  const panelCx = (L.panel.x0 + L.panel.x1) / 2;
  const panelCy = (L.panel.y0 + L.panel.y1) / 2;
  const originE = (bb.e0 + bb.e1) / 2 - mm(panelCx);
  const originN = (bb.n0 + bb.n1) / 2 + mm(panelCy);
  /** sheet millimetres (from top-left) -> ground */
  const S = (x, y) => [originE + mm(x), originN - mm(y)];
  /** ground -> sheet millimetres */
  const toSheet = (e, n) => [((e - originE) / scale) * 1000, ((originN - n) / scale) * 1000];

  /* ---- document scaffold */
  const doc = new DxfDocument({ ltscale: 1.0, insunits: 6 });
  doc.addLinetype('PLANDASH', 'Plan boundary dash ____ ____ ____',
    [mm(LINETYPES.PLANDASH.on + LINETYPES.PLANDASH.off),
      mm(LINETYPES.PLANDASH.on), -mm(LINETYPES.PLANDASH.off)]);
  doc.addLinetype('PLANDOT', 'Leader dots . . . . . . . .',
    [mm(LINETYPES.PLANDOT.on + LINETYPES.PLANDOT.off),
      mm(LINETYPES.PLANDOT.on), -mm(LINETYPES.PLANDOT.off)]);
  for (const [n, c, lt] of LAYERS) doc.addLayer(n, c, lt, L.lineweight);
  doc.addStyle('ARIAL', 'arial.ttf');
  doc.addStyle('ARIAL-BOLD', 'arialbd.ttf');
  doc.addStyle('SERIF', 'times.ttf');

  const circlePts = (r, n = 32) => Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [r * Math.cos(a), r * Math.sin(a)];
  });

  /** A filled disc, as a fan of SOLIDs -- R12 has no filled circle. */
  const disc = (b, r, n = 12) => {
    const p = circlePts(r, n);
    for (let i = 0; i < n; i++) b.solid([[0, 0], p[i], p[(i + 1) % n]]);
  };

  /**
   * Inscribed circle of the isoceles triangle the schedule draws for a trig
   * beacon and an official control point: tangent to all three sides, so it
   * sits INSIDE the triangle. r = area / semi-perimeter; the centre lies on the
   * axis of symmetry, one radius above the base.
   */
  const triIncircle = (w, h) => {
    const r = (w * h) / (w + Math.hypot(w, h));
    return { cy: -(h * 0.38) + r, r };
  };

  // --- SI 727 Fifth Schedule conventional signs ---

  // Beacon placed: an open circle.
  doc.addBlock('BCN_PLACED', (b) => {
    b.point([0, 0]);
    b.polyline(circlePts(mm(L.symbol.placedDia / 2)), { closed: true });
  });

  // Beacon found and adopted: concentric circles.
  doc.addBlock('BCN_FOUND', (b) => {
    b.point([0, 0]);
    b.polyline(circlePts(mm(L.symbol.foundOuterDia / 2)), { closed: true });
    b.polyline(circlePts(mm(L.symbol.foundInnerDia / 2)), { closed: true });
  });

  // Beacon found and not adopted: the same, struck through.
  doc.addBlock('BCN_FOUND_NA', (b) => {
    b.point([0, 0]);
    b.polyline(circlePts(mm(L.symbol.foundOuterDia / 2)), { closed: true });
    b.polyline(circlePts(mm(L.symbol.foundInnerDia / 2)), { closed: true });
    const a = mm(L.symbol.notAdoptedSlash) / 2 * Math.SQRT1_2;
    b.line([-a, -a], [a, a]);
  });

  // Reference mark: a circle with a cross through it.
  doc.addBlock('BCN_RM', (b) => {
    b.point([0, 0]);
    b.polyline(circlePts(mm(L.symbol.refMarkDia / 2)), { closed: true });
    const a = mm(L.symbol.refMarkArm) / 2;
    b.line([-a, 0], [a, 0]);
    b.line([0, -a], [0, a]);
  });

  // Traverse point / survey station, marked: circle with a filled centre.
  doc.addBlock('BCN_WS', (b) => {
    b.point([0, 0]);
    b.polyline(circlePts(mm(L.symbol.stationDia / 2)), { closed: true });
    disc(b, mm(L.symbol.stationDotDia / 2));
  });

  // Traverse point / survey station, unmarked: a filled dot.
  doc.addBlock('BCN_WSU', (b) => {
    b.point([0, 0]);
    disc(b, mm(L.symbol.stationUnmarkedDia / 2));
  });

  /**
   * A filled triangle with a genuine circular HOLE. The Fifth Schedule's sign is
   * a black triangle with a WHITE inscribed circle, and drawing the circle ON TOP
   * of a filled triangle -- which is what this replaces -- shows nothing: same
   * colour on same colour.
   *
   * R12 has no hatch-with-island and no wipeout, so the fill is built as a ring
   * of SOLID quads between the circle and the triangle's edges, each circle
   * sample projected outward along its own radius to whichever edge it meets.
   */
  const filledTriangleWithHole = (b, tri, centre, r, n = 36, layer = '0') => {
    const reach = (dx, dy) => {
      let best = Infinity;
      for (let k = 0; k < 3; k++) {
        const [ax, ay] = tri[k];
        const [bx, by] = tri[(k + 1) % 3];
        const ex = bx - ax, ey = by - ay;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((ax - centre[0]) * ey - (ay - centre[1]) * ex) / den;
        const s = ((ax - centre[0]) * dy - (ay - centre[1]) * dx) / den;
        if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9 && t < best) best = t;
      }
      return best;
    };
    for (let i = 0; i < n; i++) {
      const a1 = (2 * Math.PI * i) / n;
      const a2 = (2 * Math.PI * (i + 1)) / n;
      const d1 = [Math.cos(a1), Math.sin(a1)];
      const d2 = [Math.cos(a2), Math.sin(a2)];
      const t1 = reach(d1[0], d1[1]), t2 = reach(d2[0], d2[1]);
      if (!Number.isFinite(t1) || !Number.isFinite(t2)) continue;
      b.solid([
        [centre[0] + d1[0] * r, centre[1] + d1[1] * r],
        [centre[0] + d2[0] * r, centre[1] + d2[1] * r],
        [centre[0] + d2[0] * t2, centre[1] + d2[1] * t2],
        [centre[0] + d1[0] * t1, centre[1] + d1[1] * t1],
      ], { layer });
    }
  };

  // Trigonometrical beacon or town survey mark.
  doc.addBlock('BCN_TRIG', (b) => {
    const w = mm(L.symbol.trigW) / 2, h = mm(L.symbol.trigH);
    const c = triIncircle(w, h);
    b.point([0, 0]);
    filledTriangleWithHole(b, [[0, h * 0.62], [-w, -h * 0.38], [w, -h * 0.38]], [0, c.cy], c.r);
  });

  // Official control point: the same, inverted.
  doc.addBlock('BCN_OCP', (b) => {
    const w = mm(L.symbol.trigW) / 2, h = mm(L.symbol.trigH);
    const c = triIncircle(w, h);
    b.point([0, 0]);
    filledTriangleWithHole(b, [[0, -h * 0.62], [w, h * 0.38], [-w, h * 0.38]], [0, -c.cy], c.r);
  });

  const d = doc.sink;

  /** The meridian arrow -- eight rays about a centre, flanked by its T and N --
   *  drawn at whatever size is asked for. One symbol, used twice: the sheet
   *  carries it full size and the inset carries the same arrow small, rather
   *  than a second symbol that could drift from it. The letters' offset is
   *  taken from the arrow's own geometry, so they scale with the rays.
   *
   *  `k` = 1 reproduces the sheet's arrow exactly, which is what keeps the
   *  reference drawing byte-for-byte unchanged. */
  const drawNorthArrow = (cx, cy, k, letterMm) => {
    const na = L.northArrow;
    const hw = na.halfWidth * k;
    const rays = [
      [90, na.north], [270, na.south], [0, na.side], [180, na.side],
      [45, na.diagonal], [135, na.diagonal], [225, na.diagonal], [315, na.diagonal],
    ];
    for (const [deg, len] of rays) {
      const a = (deg * Math.PI) / 180;
      const tip = S(cx + Math.cos(a) * len * k, cy - Math.sin(a) * len * k);
      const b1 = S(cx - Math.sin(a) * hw, cy - Math.cos(a) * hw);
      const b2 = S(cx + Math.sin(a) * hw, cy + Math.cos(a) * hw);
      d.polyline([b1, tip, b2], { layer: 'NORTH-ARROW' });
    }
    // The letters sit at a fixed height on the sheet; expressed as an offset
    // from the arrow's own centre they travel with it at any size.
    const dy = (na.letters.baseline - na.cy) * k;
    d.text(na.letters.left, S(cx + na.letters.dxLeft * k, cy + dy), mm(letterMm),
      { layer: 'NORTH-ARROW', style: 'ARIAL' });
    d.text(na.letters.right, S(cx + na.letters.dxRight * k, cy + dy), mm(letterMm),
      { layer: 'NORTH-ARROW', style: 'ARIAL' });
  };

  /* ---- sheet border */
  d.polyline([S(L.border.x0, L.border.y0), S(L.border.x1, L.border.y0),
    S(L.border.x1, L.border.y1), S(L.border.x0, L.border.y1)],
  { layer: 'SHEET-BORDER', closed: true });

  /* ---- label obstacles: every label avoids the symbols, the boundaries and
         every label already placed. Built BEFORE anything is drawn so the
         parcel labels take part too -- they used to be written blind. */
  const figCx = (bb.e0 + bb.e1) / 2, figCy = (bb.n0 + bb.n1) / 2;
  const h = mm(L.text.beacon);
  /** How far a beacon's OWN sign reaches. Every label keeps clear of this much
   *  of it, and no more.
   *
   *  It used to be the largest sign on the sheet applied to every beacon, so an
   *  unmarked station -- a 1.05 mm dot -- was held off by the trig triangle's
   *  2.66 mm reach, on sheets carrying no trig at all. Reserving ground nothing
   *  occupies pushes a name away from the mark it belongs to, and on a crowded
   *  figure it is one more way for a label to find nothing free and fall back. */
  const signReach = (b) => mm(symbolClearance(b.symbol));

  const segments = spec.parcels.flatMap((p) => p.ring.map((n, i) => [
    [G(n).e, G(n).n],
    [G(p.ring[(i + 1) % p.ring.length]).e, G(p.ring[(i + 1) % p.ring.length]).n]]));

  // occupied rectangles, so labels do not sit on top of each other or a symbol
  const occupied = [];
  const hits = (rect) => occupied.some((o) =>
    rect[0] < o[2] && rect[2] > o[0] && rect[1] < o[3] && rect[3] > o[1]);
  const textRect = (s, x, y, hgt, align) => {
    const w = 0.63 * hgt * s.length;
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    return [x0, y - hgt * 0.15, x0 + w, y + hgt];
  };
  for (const b of byName.values()) {
    const rb = signReach(b);
    occupied.push([b.e - rb, b.n - rb, b.e + rb, b.n + rb]);
  }

  /** Does a segment cross this rectangle? Cohen-Sutherland, so a label is
   *  rejected when a boundary passes THROUGH it, not merely near it. */
  const segCrossesRect = (p0, q0, [x0, y0, x1, y1]) => {
    let p = p0.slice(), q = q0.slice();
    const code = ([x, y]) => (x < x0 ? 1 : 0) | (x > x1 ? 2 : 0) | (y < y0 ? 4 : 0) | (y > y1 ? 8 : 0);
    let a = code(p), b2 = code(q);
    for (let guard = 0; guard < 8; guard++) {
      if (!(a | b2)) return true;
      if (a & b2) return false;
      const c = a || b2;
      let x, y;
      if (c & 8) { x = p[0] + (q[0] - p[0]) * (y1 - p[1]) / (q[1] - p[1]); y = y1; }
      else if (c & 4) { x = p[0] + (q[0] - p[0]) * (y0 - p[1]) / (q[1] - p[1]); y = y0; }
      else if (c & 2) { y = p[1] + (q[1] - p[1]) * (x1 - p[0]) / (q[0] - p[0]); x = x1; }
      else { y = p[1] + (q[1] - p[1]) * (x0 - p[0]) / (q[0] - p[0]); x = x0; }
      if (c === a) { p = [x, y]; a = code(p); } else { q = [x, y]; b2 = code(q); }
    }
    return false;
  };

  /** The drawing panel, in ground units. Everything the figure owns lives here;
   *  outside it are the title block, the approval box and the inset, none of
   *  which the label placer can see. Without this a label that found no room in
   *  the figure simply walked out of the panel -- the Brackenhurst road name
   *  ended up written across the title. */
  const pA = S(L.panel.x0, L.panel.y0), pB = S(L.panel.x1, L.panel.y1);
  const panelBox = [Math.min(pA[0], pB[0]), Math.min(pA[1], pB[1]),
    Math.max(pA[0], pB[0]), Math.max(pA[1], pB[1])];
  const insidePanel = (r) => r[0] >= panelBox[0] && r[2] <= panelBox[2]
    && r[1] >= panelBox[1] && r[3] <= panelBox[3];

  /** Free of other labels, symbols AND boundary lines -- and on the drawing. */
  const free = (rect) => insidePanel(rect) && !hits(rect)
    && !segments.some((s) => segCrossesRect(s[0], s[1], rect));

  /** How badly a rectangle sits where it is: the area it steals from whatever is
   *  already placed, plus a label-sized fine for every boundary it crosses.
   *  Zero means clear. */
  const penalty = (rect) => {
    const w = Math.max(0, rect[2] - rect[0]), hgt = Math.max(0, rect[3] - rect[1]);
    const over = (o) => Math.max(0, Math.min(rect[2], o[2]) - Math.max(rect[0], o[0]))
      * Math.max(0, Math.min(rect[3], o[3]) - Math.max(rect[1], o[1]));
    return occupied.reduce((t, o) => t + over(o), 0)
      + segments.filter((sg) => segCrossesRect(sg[0], sg[1], rect)).length * w * hgt;
  };

  /** Choose a position for a label. The first CLEAR candidate wins outright --
   *  candidate order encodes the cartographic preference, so a free spot early
   *  beats a free spot late. Only when nothing is clear does the penalty decide.
   *
   *  That last case is not rare: a label can be too big to fit anywhere at any
   *  scale, and then the fallback alone decides where it lands. Every search
   *  here used to fall back to its FIRST candidate -- the preferred, closest-in
   *  spot, which on a crowded sheet is the most congested spot on the sheet. A
   *  label that fitted nowhere was put exactly where it did the most damage.
   *  It now goes to the emptiest candidate instead. */
  const bestOf = (candidates, rectOf) => {
    let onSheet = null, onScore = Infinity;
    let anywhere = null, anyScore = Infinity;
    for (const c of candidates) {
      const rect = rectOf(c);
      if (free(rect)) return { choice: c, rect, clear: true };
      const score = penalty(rect);
      // Leaving the panel is not a matter of degree. Crowding another label is
      // untidy; writing across the title block is a broken sheet, so a
      // congested spot ON the drawing beats a clear one off it, and the
      // off-panel candidate is kept only for a label with nowhere else at all.
      if (insidePanel(rect)) {
        if (score < onScore) { onScore = score; onSheet = { choice: c, rect, clear: false }; }
      } else if (score < anyScore) {
        anyScore = score; anywhere = { choice: c, rect, clear: false };
      }
    }
    return onSheet ?? anywhere;
  };

  /** A line between two beacons, pulled back to the rim of the sign at each
   *  end so it stops at the beacon instead of striking through it. `ends` says
   *  which ends to clip: a stub's far end is out in open ground and has no
   *  symbol to clear.
   *
   *  Shared, because it was not: only the new boundaries clipped, so the
   *  remainder's own sides and the abutment stubs were drawn straight through
   *  the marks they start from. */
  const clipToSigns = (a, b, from, to) => {
    const ux = b[0] - a[0], uy = b[1] - a[1];
    const len = Math.hypot(ux, uy) || 1;
    const dx = ux / len, dy = uy / len;
    const ra = from ? mm(symbolClearance(from)) : 0;
    const rb = to ? mm(symbolClearance(to)) : 0;
    // A side shorter than the two symbols is drawn whole rather than inverted.
    if (ra + rb >= len) return [a, b];
    return [[a[0] + dx * ra, a[1] + dy * ra], [b[0] - dx * rb, b[1] - dy * rb]];
  };

  /** Draw a line, leaving a gap wherever it passes through a beacon's sign.
   *  A parent boundary runs THROUGH its corner beacons and on past them, so
   *  keeping it out of the marks is cutting a hole in the middle, not pulling
   *  an end back -- clipToSigns cannot express it.
   *
   *  The gap is the chord the sign cuts from the line, so a beacon lying a
   *  little off the line opens a correspondingly narrower one, and a beacon
   *  clear of it opens none at all. */
  const drawWithGaps = (p0, p1, gaps, opts) => {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1];
    const len = Math.hypot(ux, uy);
    if (!len) return;
    const dx = ux / len, dy = uy / len;
    const cuts = gaps
      .map(({ at, r }) => {
        const along = (at[0] - p0[0]) * dx + (at[1] - p0[1]) * dy;
        const off = Math.abs(-(at[0] - p0[0]) * dy + (at[1] - p0[1]) * dx);
        const half = Math.sqrt(Math.max(0, r * r - off * off));
        return half > 0 ? [along - half, along + half] : null;
      })
      .filter(Boolean)
      .sort((q, w) => q[0] - w[0]);

    const P = (t) => [p0[0] + dx * t, p0[1] + dy * t];
    const parts = [];
    let t = 0;
    for (const [c0, c1] of cuts) {
      if (c1 <= t) continue;
      if (c0 > t) parts.push([t, Math.min(c0, len)]);
      t = Math.max(t, c1);
      if (t >= len) break;
    }
    if (t < len) parts.push([t, len]);
    // A line swallowed whole by the signs at its ends is drawn entire rather
    // than dropped: a boundary that vanishes is worse than one drawn through a
    // mark, and this is the same rule clipToSigns applies to a short side.
    if (parts.length === 0) { d.line(p0, p1, opts); return; }
    for (const [q0, q1] of parts) if (q1 - q0 > 1e-9) d.line(P(q0), P(q1), opts);
  };

  /* ---- parcel boundaries, clipped clear of the beacon symbols */
  const areas = {};
  for (const p of spec.parcels) {
    const pts = p.ring.map((n) => [G(n).e, G(n).n]);
    // Drawn edge by edge rather than as one closed polyline: each end is pulled
    // back to the rim of the symbol it meets, so the boundary stops at the
    // beacon instead of striking through it. The ring itself is unchanged --
    // areas, labels and the figure extent all still use the true vertices.
    for (let k = 0; k < p.ring.length; k++) {
      const j = (k + 1) % p.ring.length;
      const [ca, cb] = clipToSigns(pts[k], pts[j],
        G(p.ring[k]).symbol, G(p.ring[j]).symbol);
      d.line(ca, cb, { layer: 'BOUNDARY-NEW' });
    }
    areas[p.label] = ringArea(pts);
    const [cx, cy] = p.labelAt ? Object.values(loToGround(p.labelAt)) : centroid(pts);
    // The stand number is reserved so beacon names and grid ticks keep off it.
    // It was written blind before, and anything placed later could sit on it.
    const ph = mm(L.text.parcel);
    occupied.push(textRect(p.label, cx, cy - ph / 2, ph, 'center'));
    d.text(p.label, [cx, cy - ph / 2], ph,
      { layer: 'PARCEL-TEXT', style: 'ARIAL', align: 'center' });
  }

  /* ---- the remaining extent's own boundary, dashed */
  // These sides are pre-existing parent boundary, not newly surveyed, so they
  // take the same dashed line the parent boundaries do. Sides the new stands
  // share are absent by construction -- the stand already draws them solid, and
  // a dashed line over the top would contradict it.
  for (const s of spec.remainderBoundary ?? []) {
    const a = G(s.from), b = G(s.to);
    const [ca, cb] = clipToSigns([a.e, a.n], [b.e, b.n], a.symbol, b.symbol);
    d.line(ca, cb, { layer: 'BOUNDARY-EXIST' });
  }

  // Letter the remainder. It is part of the plan even though it is not a new
  // stand, so it is named -- just not drawn solid.
  if (spec.remainderLabel && (spec.remainderBoundary ?? []).length) {
    const ph = mm(L.text.parcel);
    // Centre it on the WHOLE remaining extent. The mean of the unshared sides'
    // endpoints is not the parcel's centre: on a remainder that wraps around the
    // new stands those sides are all on one flank, and their mean lands on a
    // boundary or outside the parcel entirely.
    const ring = (spec.remainderRing ?? []).filter((n) => byName.has(n));
    const known = ring.length >= 3;
    const pts = known ? ring.map((n) => [G(n).e, G(n).n])
      : spec.remainderBoundary.map((s) => [G(s.from).e, G(s.from).n]);
    const [c0, c1] = known ? centroid(pts)
      : [pts.reduce((t, q) => t + q[0], 0) / pts.length,
        pts.reduce((t, q) => t + q[1], 0) / pts.length];

    // A remainder is the one parcel whose own boundary can run through the
    // middle of its bounding box, so its name is SEARCHED like every other
    // label rather than written blind at the centre.
    const inside = (x, y) => {
      let hit = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    // Candidates: the centroid, then a grid across the parcel's own bounding
    // box, nearest first. Sized to the PARCEL, not to the text -- a remainder
    // can be many times the size of its own name, and a search stepping out in
    // text-heights would never reach the parts of it that are open.
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    const N = 7;
    const grid = [];
    for (let i = 1; i < N; i++) {
      for (let j = 1; j < N; j++) grid.push([x0 + ((x1 - x0) * i) / N, y0 + ((y1 - y0) * j) / N]);
    }
    grid.sort((a, b) => Math.hypot(a[0] - c0, a[1] - c1) - Math.hypot(b[0] - c0, b[1] - c1));
    // Never letter the remainder outside itself: a U-shaped remainder wrapped
    // around the new stands has its own centroid in the hollow, which is another
    // parcel's ground, and a name written there belongs to that parcel.
    const cands = [[c0, c1], ...grid];
    const within = known ? cands.filter((q) => inside(q[0], q[1])) : cands;
    const chosen = bestOf(within.length ? within : [[c0, c1]], (q) =>
      textRect(spec.remainderLabel, q[0], q[1] - ph / 2, ph, 'center'));
    occupied.push(chosen.rect);
    d.text(spec.remainderLabel, [chosen.choice[0], chosen.choice[1] - ph / 2], ph,
      { layer: 'PARCEL-TEXT', style: 'ARIAL', align: 'center' });
  }



  /* ---- existing (dashed) parent boundaries, with optional extensions */
  for (const ex of spec.existing ?? []) {
    const a = G(ex.from), b = G(ex.to);
    const ux = b.e - a.e, uy = b.n - a.n;
    const len = Math.hypot(ux, uy) || 1;
    const [dx, dy] = [ux / len, uy / len];
    const p0 = [a.e - dx * mm(ex.extendFrom ?? 0), a.n - dy * mm(ex.extendFrom ?? 0)];
    const p1 = [b.e + dx * mm(ex.extendTo ?? 0), b.n + dy * mm(ex.extendTo ?? 0)];
    drawWithGaps(p0, p1, [
      { at: [a.e, a.n], r: mm(symbolClearance(a.symbol)) },
      { at: [b.e, b.n], r: mm(symbolClearance(b.symbol)) },
    ], { layer: 'BOUNDARY-EXIST' });
  }

  /* ---- contiguous neighbours: outward stubs at the terminals they abut,
         drawn the way the diagram draws them (same shared helpers) */
  for (const c of spec.contiguous ?? []) {
    const a = G(c.from), b = G(c.to);
    // Which ring owns this side? A drawn stand, or -- for a side only the
    // remaining extent holds -- the remainder's own ring. Without the second,
    // every abutment on a remainder-only side was silently dropped: the ring
    // lookup failed and the mark was skipped, which is what took the offshoot
    // off beacon 87C.
    const host = spec.parcels.find((p) => p.ring.includes(c.from) && p.ring.includes(c.to))?.ring
      ?? ((spec.remainderRing ?? []).includes(c.from)
        && (spec.remainderRing ?? []).includes(c.to) ? spec.remainderRing : null);
    if (!host) continue;
    const pts = host.filter((n) => byName.has(n)).map((n) => [G(n).e, G(n).n]);
    if (pts.length < 3) continue;
    const cen = [
      pts.reduce((t, q) => t + q[0], 0) / pts.length,
      pts.reduce((t, q) => t + q[1], 0) / pts.length,
    ];
    const A = [a.e, a.n], B = [b.e, b.n];
    const marks = contiguousMarks(A, B, c.end);
    const st = edgeStrip(A, B, mm(L.contiguousStub), cen);
    // Started at the rim of the sign it springs from, and SHIFTED rather than
    // shortened: the stub keeps its full length, which is what guarantees it
    // three dashes and keeps it the same length as the diagram draws it.
    const stub = (at, end, symbol) => {
      const ux = end[0] - at[0], uy = end[1] - at[1];
      const len = Math.hypot(ux, uy) || 1;
      const r = mm(symbolClearance(symbol));
      const dx = (ux / len) * r, dy = (uy / len) * r;
      d.line([at[0] + dx, at[1] + dy], [end[0] + dx, end[1] + dy], { layer: 'ADJOINING' });
    };
    if (marks.stubFrom) stub(A, st[3], a.symbol);
    if (marks.stubTo) stub(B, st[2], b.symbol);
  }

  /* ---- road and servitude names, set along the line they belong to */
  /** Axis-aligned box of a rotated label, so it can join the shared obstacle set. */
  const rotatedRect = (text, x, y, hgt, ang, wf) => {
    const w = 0.63 * hgt * wf * text.length;
    const c = [[0, 0], [w, 0], [w, hgt], [0, hgt]].map(([u, v]) => [
      x + u * Math.cos(ang) - v * Math.sin(ang),
      y + u * Math.sin(ang) + v * Math.cos(ang)]);
    return [Math.min(...c.map((q) => q[0])), Math.min(...c.map((q) => q[1])),
      Math.max(...c.map((q) => q[0])), Math.max(...c.map((q) => q[1]))];
  };

  for (const rd of spec.roads ?? []) {
    const a = G(rd.from), b = G(rd.to);
    let ang = Math.atan2(b.n - a.n, b.e - a.e);
    let flip = false;
    if (ang > Math.PI / 2 || ang < -Math.PI / 2) { ang += Math.PI; flip = true; }
    const [sx, sy] = flip ? [b.e, b.n] : [a.e, a.n];

    // Default to the side away from the surveyed figure, unless the caller has
    // forced a side with a signed offset.
    let base = mm(Math.abs(rd.offset ?? 3));
    if (rd.offset != null && rd.offset < 0) base = -base;
    else {
      const mx = (a.e + b.e) / 2, my = (a.n + b.n) / 2;
      const side = -Math.sin(ang) * (figCx - mx) + Math.cos(ang) * (figCy - my);
      if (side > 0) base = -base;
    }
    const rh = mm(L.text.adjoining);
    const wf = rd.widthFactor ?? 1.2;
    const along0 = mm(rd.along ?? 6);

    // A road name is pinned to its own line, so its only freedoms are how far
    // out, how far along, and -- last -- which side. Tried in that order. This
    // is why roads are drawn BEFORE beacon names: the label with three freedoms
    // claims its place before the one with twenty-four.
    const tries = [];
    for (const sideSign of [1, -1]) {
      for (const outK of [1, 1.8, 2.6]) {
        for (const alongD of [0, 1, -1, 2, -2]) {
          const off = base * sideSign * outK;
          const al = along0 + alongD * mm(9);
          tries.push([
            sx - Math.sin(ang) * off + Math.cos(ang) * al,
            sy + Math.cos(ang) * off + Math.sin(ang) * al,
          ]);
        }
      }
    }
    const chosen = bestOf(tries, (c) => rotatedRect(rd.name, c[0], c[1], rh, ang, wf));
    const at = chosen.choice;
    occupied.push(chosen.rect);
    d.text(rd.name, at, rh,
      { layer: 'ROAD-TEXT', style: 'ARIAL', rotation: ang * 180 / Math.PI, widthFactor: wf });
  }


  /* ---- free notes (neighbouring stand numbers etc.) */
  for (const t of spec.notes ?? []) {
    const g = loToGround(t);
    const th = mm(t.height ?? L.text.adjoining);
    // Step outward from the figure until the name is clear of the grid, the
    // beacons, their labels AND the boundaries. Drawn AFTER the grid
    // deliberately: the coordinate framework is the more important of the two,
    // and a neighbour's name can move. A crowded sheet still letters the
    // neighbour rather than dropping it -- at the emptiest of the steps.
    const dx = g.e - figCx, dy = g.n - figCy;
    const len = Math.hypot(dx, dy) || 1;
    const step = mm(3);
    const steps = [];
    for (let k = 0; k <= 4; k++) {
      steps.push([g.e + (dx / len) * step * k, g.n + (dy / len) * step * k]);
    }
    const chosen = bestOf(steps, (c) => textRect(t.text, c[0], c[1], th, 'center'));
    const [px, py] = chosen.choice;
    occupied.push(chosen.rect);
    d.text(t.text, [px, py], th, { layer: 'PARCEL-TEXT', style: 'ARIAL', align: 'center' });
  }

  /* ---- beacons and their names */


  const ORDER = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  for (const b of byName.values()) {
    const block = {
      placed: 'BCN_PLACED', peg: 'BCN_PLACED',
      found: 'BCN_FOUND', foundNotAdopted: 'BCN_FOUND_NA',
      rm: 'BCN_RM', ws: 'BCN_WS', wsu: 'BCN_WSU',
      trig: 'BCN_TRIG', ocp: 'BCN_OCP',
    }[b.symbol ?? 'placed'] ?? 'BCN_PLACED';
    d.insert(block, [b.e, b.n], { layer: 'BEACONS' });

    let pos = b.label ?? 'auto';
    if (pos === 'auto') {
      const ang = Math.atan2(b.n - figCy, b.e - figCx) * 180 / Math.PI;
      pos = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE']
        [Math.round(((ang + 360) % 360) / 45) % 8];
    }
    if (pos === 'none') continue;
    const rb = signReach(b);
    const place = (p, k = 1) => {
      const gap = (rb + mm(0.5)) * k;
      return {
        N: [0, gap + mm(0.4), 'center'], S: [0, -(gap + h + mm(0.2)), 'center'],
        E: [gap, -h / 2, 'left'], W: [-gap, -h / 2, 'right'],
        NE: [gap * 0.5, gap * 0.9, 'left'], NW: [-gap * 0.5, gap * 0.9, 'right'],
        SE: [gap * 0.5, -(gap * 0.9 + h), 'left'], SW: [-gap * 0.5, -(gap * 0.9 + h), 'right'],
      }[p];
    };

    // Preferred position first, then the rest of the compass at the SAME
    // distance -- a label must stay near its beacon, so the whole ring is tried
    // before the distance grows at all. Only when all eight are blocked does it
    // step out, and by as little as possible.
    const tries = [pos, ...ORDER.slice(ORDER.indexOf(pos) + 1), ...ORDER.slice(0, ORDER.indexOf(pos))];
    // The whole compass at one distance, then further out. The last two steps
    // are for a name boxed in by a road label or a crowded corner: without them
    // it had nowhere left and fell back onto whatever was there.
    const cands = [];
    for (const k of [1, 1.5, 2.1, 3.0, 4.2]) for (const t of tries) cands.push(place(t, k));
    // Nothing free anywhere still letters the beacon -- a beacon without a name
    // is worse than a crowded one -- but in the emptiest of the 24 positions
    // rather than always on the preferred one.
    const chosen = bestOf(cands, (c) => textRect(b.name, b.e + c[0], b.n + c[1], h, c[2]));
    const P = chosen.choice;
    occupied.push(chosen.rect);
    d.text(b.name, [b.e + P[0], b.n + P[1]], h,
      { layer: 'BEACON-TEXT', style: 'ARIAL', align: P[2] });
  }

  /* ---- coordinate grid */
  const pick = () => GRID_INTERVALS.find((i) => (i / scale) * 1000 >= 40)
    ?? GRID_INTERVALS.at(-1);
  const arm = mm(L.symbol.gridArm) / 2;
  const inset = 10;                                   // keep ticks off the panel edge

  const [pe0] = S(L.panel.x0 + inset, 0), [pe1] = S(L.panel.x1 - inset, 0);
  const pn1 = S(0, L.panel.y0 + inset)[1], pn0 = S(0, L.panel.y1 - inset)[1];

  /** Where an interval's ticks would go. Reads `occupied` but never adds to it,
   *  so an interval can be tried and abandoned; only the chosen one is drawn. */
  const layGrid = (gi) => {
    const out = [];
    const gw = mm(L.gridLabel.xDx + 0.63 * L.text.grid * 13);
    const clashes = (r) => hits(r) || out.some(({ rect: o }) =>
      r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]);
    for (let e = Math.ceil(pe0 / gi) * gi; e <= pe1; e += gi) {
      for (let n = Math.ceil(pn0 / gi) * gi; n <= pn1; n += gi) {
        // the cross plus both of its labels must be clear of the figure,
        // of every beacon symbol, and of every label already placed
        const rect = [e - arm - mm(2), n - mm(L.gridLabel.yStartDy + 12),
          e + gw, n + arm + mm(2)];
        const clearOfLines = segments.every((s) => distToSegment([e, n], s[0], s[1]) > mm(7));
        if (!clearOfLines || clashes(rect)) continue;
        out.push({ e, n, rect });
      }
    }
    return out;
  };

  // An explicit interval is honoured as given. Otherwise: start at the spacing
  // the scale suggests and step FINER until four ticks survive the figure --
  // more candidates, not a weaker clearance, so no tick is ever drawn over the
  // drawing it is meant to reference. The best attempt is kept, so a crowded
  // sheet still gets the most ticks it can hold rather than the fewest.
  let gi = spec.gridInterval;
  let ticks;
  if (gi) {
    ticks = layGrid(gi);
  } else {
    let best = null;
    for (let k = GRID_INTERVALS.indexOf(pick()); k >= 0; k--) {
      const cand = GRID_INTERVALS[k];
      if ((cand / scale) * 1000 < MIN_TICK_SPACING_MM) break;
      const t = layGrid(cand);
      if (!best || t.length > best.ticks.length) best = { gi: cand, ticks: t };
      if (t.length >= MIN_GRID_TICKS) break;
    }
    ({ gi, ticks } = best ?? { gi: pick(), ticks: [] });
  }

  const gridInterval = { e: gi, n: gi };
  const placed = ticks.length;
  const gh = mm(L.text.grid);
  for (const { e, n, rect } of ticks) {
    occupied.push(rect);
    d.line([e - arm, n], [e + arm, n], { layer: 'GRID' });
    d.line([e, n - arm], [e, n + arm], { layer: 'GRID' });
    const Xlo = -n, Ylo = -e;
    d.text(`X = ${Xlo >= 0 ? '+' : ''}${Xlo.toFixed(0)}`,
      [e + mm(L.gridLabel.xDx), n - mm(L.gridLabel.xBaselineDy)], gh,
      { layer: 'GRID-TEXT', style: 'ARIAL' });
    d.text(`Y = ${Ylo.toFixed(0)}`,
      [e + mm(L.gridLabel.yDx), n - mm(L.gridLabel.yStartDy)], gh,
      { layer: 'GRID-TEXT', style: 'ARIAL', rotation: -90 });
  }

  /* ---- title block */
  const th = mm(L.text.title);
  spec.title.slice(0, 4).forEach((line, i) => {
    // The first line names the document ("WORKING PLAN OF") and is set larger
    // than the lines that identify the land. Its baseline is 8.2 mm from the
    // sheet top and the glyphs grow upward, which at 1.25x reaches 3.26 mm --
    // still clear of the border at 0.5 mm, and of the next line 12.1 mm below.
    d.text(line, S(L.title.cx, L.title.baselines[i]), i === 0 ? th * L.text.titleLeadFactor : th,
      { layer: 'TITLE', style: 'ARIAL-BOLD', align: 'center' });
  });
  d.text(`Scale 1:${scale}`, S(L.title.cx, L.title.scaleBaseline), mm(L.text.scale),
    { layer: 'TITLE', style: 'ARIAL', align: 'center' });

  /* ---- north arrow */
  drawNorthArrow(L.northArrow.cx, L.northArrow.cy, 1, 2.12);

  /* ---- approval box */
  if (spec.approvalBox !== false) {
    const A = L.approval, ah = mm(L.text.approval);
    d.polyline([S(A.box.x0, A.box.y0), S(A.box.x1, A.box.y0),
      S(A.box.x1, A.box.y1), S(A.box.x0, A.box.y1)],
    { layer: 'APPROVAL', closed: true });
    d.text('Approved', S((A.box.x0 + A.box.x1) / 2, A.approvedBaseline), ah,
      { layer: 'APPROVAL', style: 'SERIF', align: 'center' });
    d.line(S(A.leader1.x0, A.leader1.y), S(A.leader1.x1, A.leader1.y),
      { layer: 'APPROVAL', linetype: 'PLANDOT' });
    d.text('for Surveyor General', S((A.box.x0 + A.box.x1) / 2, A.forBaseline), ah,
      { layer: 'APPROVAL', style: 'SERIF', align: 'center' });
    d.text('Date:', S(A.dateX, A.dateBaseline), ah, { layer: 'APPROVAL', style: 'SERIF' });
    d.line(S(A.leader2.x0, A.leader2.y), S(A.leader2.x1, A.leader2.y),
      { layer: 'APPROVAL', linetype: 'PLANDOT' });
  }

  /* ---- surveyor's certificate */
  if (spec.certificate) {
    const ch = mm(L.text.certificate);
    d.text(spec.certificate.line1, S(L.certificate.line1.x, L.certificate.line1.baseline),
      ch, { layer: 'TITLE', style: 'ARIAL-BOLD' });
    d.text(spec.certificate.line2, S(L.certificate.line2.x, L.certificate.line2.baseline),
      ch, { layer: 'TITLE', style: 'ARIAL-BOLD' });
  }

  /* ---- Survey Record number (examination docket, Working Plan item 21) */
  if (spec.srNumber) {
    d.text(spec.srNumber, S(L.srNumber.cx, L.srNumber.baseline), mm(L.text.scale),
      { layer: 'TITLE', style: 'ARIAL-BOLD', align: 'center' });
  }

  /* ---- locality inset (its own, much smaller, scale) */
  if (spec.inset) {
    const B = L.inset.box;
    d.polyline([S(B.x0, B.y0), S(B.x1, B.y0), S(B.x1, B.y1), S(B.x0, B.y1)],
      { layer: 'INSET', closed: true });
    d.text('Inset (not to scale)', S(B.x0 + 5, B.y0 + 6), mm(L.text.insetTitle),
      { layer: 'INSET', style: 'ARIAL-BOLD' });

    // North point: the sheet's own meridian arrow at a fraction of its size.
    // The inset is drawn north-up like the main figure -- the same
    // capeLoToDxfSouthUp convention -- so it needs no rotation.
    //
    // On NORTH-ARROW, not INSET: it is a north point, and the sheet's arrow
    // lives there. That also keeps INSET meaning the inset's MAP, so anything
    // measuring that content is not reading an arrow by mistake.
    const nn = L.inset.north;
    drawNorthArrow(B.x1 - nn.dxFromRight, B.y0 + nn.dyFromTop, nn.scale, nn.letterMm);

    const iScale = spec.inset.scale;
    const ib = spec.inset.beacons.map((b) => ({ ...b, ...loToGround(b) }));
    const ic = {
      e: (Math.min(...ib.map((b) => b.e)) + Math.max(...ib.map((b) => b.e))) / 2,
      n: (Math.min(...ib.map((b) => b.n)) + Math.max(...ib.map((b) => b.n))) / 2,
    };
    const boxCx = (B.x0 + B.x1) / 2, boxCy = (B.y0 + B.y1) / 2;
    // ground position on the SHEET for an inset ground coordinate
    const I = (e, n) => S(boxCx + ((e - ic.e) / iScale) * 1000,
      boxCy - ((n - ic.n) / iScale) * 1000);
    const iSym = mm(1.0);
    // Every round sign in the inset is drawn at this radius, so it is the
    // inset's own idea of how big a beacon is.
    const iRing = iSym * 0.85;
    for (const b of ib) {
      const at = I(b.e, b.n);
      // Same Fifth Schedule signs as the main figure, drawn small.
      const ring = (r) => d.polyline(circlePts(r, 24).map(([x, y]) => [at[0] + x, at[1] + y]),
        { layer: 'INSET', closed: true });
      const dot = (r, n = 10) => {
        const pts = circlePts(r, n);
        for (let i = 0; i < n; i++) {
          d.solid([at, [at[0] + pts[i][0], at[1] + pts[i][1]],
            [at[0] + pts[(i + 1) % n][0], at[1] + pts[(i + 1) % n][1]]], { layer: 'INSET' });
        }
      };
      const triangle = (up) => {
        // The same construction as the beacon block: a filled triangle with a
        // real hole, NOT a filled triangle with a circle drawn over it. The
        // inset kept the old form after the blocks were fixed, and since a
        // sheet whose beacons are all pegs and marks shows trig symbols ONLY
        // here, this was the version actually reaching the surveyor.
        // Sized from the FIGURE's triangle, scaled by the ratio the inset draws
        // a found beacon at, so the two cannot drift apart again. They had: the
        // inset carried its own numbers, and its inscribed circle came out at
        // 64% of its own found-beacon circle where the figure draws the two the
        // same size. On a sheet whose beacons are all pegs and marks -- the
        // ordinary case -- trig and OCP appear ONLY here, so the inset was the
        // version the surveyor actually saw.
        const k = (iRing * 2) / mm(L.symbol.foundOuterDia);
        const w = mm(L.symbol.trigW / 2) * k, hh = mm(L.symbol.trigH) * k;
        const sgn = up ? 1 : -1;
        const tri = [
          [at[0], at[1] + sgn * hh * 0.62],
          [at[0] - sgn * w, at[1] - sgn * hh * 0.38],
          [at[0] + sgn * w, at[1] - sgn * hh * 0.38],
        ];
        const c = triIncircle(w, hh);
        filledTriangleWithHole(d, tri, [at[0], at[1] + sgn * c.cy], c.r, 24, 'INSET');
      };
      switch (b.symbol) {
        case 'trig': triangle(true); break;
        case 'ocp': triangle(false); break;
        case 'rm':
          ring(iRing);
          d.line([at[0] - iSym * 1.2, at[1]], [at[0] + iSym * 1.2, at[1]], { layer: 'INSET' });
          d.line([at[0], at[1] - iSym * 1.2], [at[0], at[1] + iSym * 1.2], { layer: 'INSET' });
          break;
        case 'ws': ring(iRing); dot(iSym * 0.32); break;
        case 'wsu': dot(iSym * 0.38); break;
        case 'placed': case 'peg': ring(iRing); break;
        default: ring(iRing); ring(iSym * 0.5); break;   // found / found-not-adopted
      }
      d.text(b.name, [at[0], at[1] + mm(1.8)], mm(L.text.insetLabel),
        { layer: 'INSET', style: 'ARIAL', align: 'center' });
    }
  }

  // sheetSize is reported so the caller can tell the surveyor -- and the plot
  // dialog -- which paper this was drawn for.
  return {
    dxf: doc.toString(), scale, gridInterval, gridTicks: placed, areas,
    sheetSize: 'A4', sheetWidthMm: SHEET.width, sheetHeightMm: SHEET.height,
  };
}
