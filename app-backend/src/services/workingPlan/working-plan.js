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
import { crowdedClusters, INSET_CROWD_MM } from './crowdedBeacons.js';
import { insetCells } from './insetCells.js';
import { insetScaleToFit } from '../../../../app-shared/insetScales.js';
import { isReferenceMarkName } from '../../../../app-shared/beaconName.js';

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
  /**
   * Lettering heights, ISO 3098 -- the standard for technical drawings, which a
   * survey plan is. Its nominal heights step by root 2: 1,8 / 2,5 / 3,5 / 5 / 7,
   * far enough apart that a reader sees a rank rather than an accident.
   *
   * Three sizes, no more. What was here had been measured off a source plot and
   * carried its noise: SIX body sizes inside 0,08 mm -- 2,99 / 3,00 / 3,03 /
   * 3,06 / 3,07 / 3,07 -- which is not a hierarchy, it is six attempts at one
   * size. A draughtsman letters at the sizes on the stencil.
   *
   *   2,5  what the surveyor reads off the drawing -- beacon names, stand
   *        numbers, adjoining names, grid figures, inset marks
   *   3,5  the sheet's own apparatus -- the scale, the certificate, the
   *        approval box, the title's naming lines
   *   5,0  the document heading alone
   *
   * The first rank is ONE size on purpose. A beacon name, a stand number and an
   * abutting property's name are read together, off the same drawing, and a
   * reader should not have to work out why one is smaller.
   *
   * 2,5 mm subtends about 17 arcmin at 500 mm and 12 at a full arm -- legible,
   * and comfortable at the distance a plan is actually read. 3,5 would be
   * comfortable at a full arm but does not fit: measured on a real sheet it
   * cost three overlapping labels and took the coordinate grid from five ticks
   * to two. The old 1,8 for adjoining names was 8,8 arcmin at a full arm, below
   * the legibility floor.
   */
  text: {
    beacon: 2.5, parcel: 2.5, adjoining: 2.5, grid: 2.5, insetLabel: 2.5,
    road: 2.5,
    scale: 3.5, approval: 3.5, certificate: 3.5, title: 3.5,
    // One ISO rank below the other 3.5 mm captions. "INSET 2 (NOT TO
    // SCALE)" is 22 characters, and at 3.5 mm it ran about 69 mm -- past
    // the 58.5 mm a half-width inset cell leaves beside its frame.
    insetTitle: 2.5,
    // 5,0 / 3,5 -- one step of the ISO series, and the reason this is no longer
    // the 1,25 it was set to: 4,375 mm is not a height on the stencil, and the
    // title read as merely bigger rather than as the heading.
    titleLeadFactor: 5.0 / 3.5,
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

/**
 * Where those ticks have to be: one in each corner region of the FIGURE -- top
 * left and right, bottom left and right.
 *
 * Four ticks bunched down one side satisfy a count and help nobody. A reader
 * interpolates a position by working from the ticks that bracket it, so the
 * framework has to surround the drawing, not sit beside it.
 */
const GRID_QUADRANTS = ['LT', 'RT', 'LB', 'RB'];

/**
 * Room left around the figure when the scale is chosen automatically, as a
 * fraction of the figure's own size.
 *
 * It is NOT the label placer's job done twice: labels search for room and are
 * held inside the panel, so this only has to stop the figure touching the
 * panel's edge. At 15% it was reserving more than the labels use and pushing
 * sheets a whole prescribed scale coarser than a draughtsman would draw them.
 */
const FIGURE_BREATHING = 1.10;

/** One ISO 3098 step below the reading size, for a name with nowhere to go. */
const SMALLER_THAN_READING_MM = 1.8;

/** Ticks closer than this stop reading as a framework and start crowding the
 *  figure, so the hunt for more of them stops here rather than shrinking the
 *  interval indefinitely. */
const MIN_TICK_SPACING_MM = 15;

/** How far a cross keeps off a boundary line, in paper millimetres. Enough to
 *  read as a separate mark; not so much that it cannot sit on the drawing. */
const GRID_LINE_CLEARANCE_MM = 7;

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
  const byName = new Map(spec.beacons.map((b) => {
    // The name is authoritative for a reference mark: RM16 with no description
    // or status still plots as the circle-with-a-cross, not as a peg.
    const symbol = isReferenceMarkName(b.name) ? 'rm' : (b.symbol ?? 'placed');
    return [b.name, { ...b, symbol, ...loToGround(b) }];
  }));
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
    const need = Math.max((bb.e1 - bb.e0) / panelW, (bb.n1 - bb.n0) / panelH)
      * 1000 * FIGURE_BREATHING;
    scale = STANDARD_SCALES.find((s) => s >= need) ?? STANDARD_SCALES.at(-1);
  }
  const mm = (v) => (v * scale) / 1000;              // paper mm -> ground metres

  /* ---- what the figure draws, and what it leaves to an inset
   *
   * Beacons that plot on top of each other get an inset of their own (see the
   * inset block below). Where one of them was found and NOT adopted, the figure
   * stops drawing it: the mark is superseded, the inset now carries it with its
   * own conventional sign, and two signs inside one dot told the reader nothing
   * anyway.
   *
   * A beacon a parcel ring is built from is never dropped, whatever its status.
   * Its position is a corner of the figure, and removing the corner would leave
   * a boundary that does not close.
   */
  const crowded = crowdedClusters([...byName.values()], mm(INSET_CROWD_MM));
  const ringBeacons = new Set((spec.parcels ?? []).flatMap((p) => p.ring ?? []));
  const insetOnly = new Set(
    crowded.flat()
      .filter((b) => b.symbol === 'foundNotAdopted' && !ringBeacons.has(b.name))
      .map((b) => b.name),
  );
  /** Beacons the figure itself draws. */
  const figureBeacons = () => [...byName.values()].filter((b) => !insetOnly.has(b.name));

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
  const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  /** Where a beacon's name sits for a given compass point and distance step. */
  const namePlace = (b, p, k = 1) => {
    const gap = (signReach(b) + mm(0.5)) * k;
    return {
      N: [0, gap + mm(0.4), 'center'], S: [0, -(gap + h + mm(0.2)), 'center'],
      E: [gap, -h / 2, 'left'], W: [-gap, -h / 2, 'right'],
      NE: [gap * 0.5, gap * 0.9, 'left'], NW: [-gap * 0.5, gap * 0.9, 'right'],
      SE: [gap * 0.5, -(gap * 0.9 + h), 'left'], SW: [-gap * 0.5, -(gap * 0.9 + h), 'right'],
    }[p];
  };

  /** The side of a beacon its name prefers: outward from the figure. */
  const namePreferred = (b) => {
    const p = b.label ?? 'auto';
    if (p !== 'auto') return p;
    const ang = Math.atan2(b.n - figCy, b.e - figCx) * 180 / Math.PI;
    return ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE']
      [Math.round(((ang + 360) % 360) / 45) % 8];
  };

  for (const b of figureBeacons()) {
    const rb = signReach(b);
    occupied.push([b.e - rb, b.n - rb, b.e + rb, b.n + rb]);
  }

  /**
   * Every beacon MUST be named -- a nameless beacon is not a survey mark -- so
   * its name claims ground before anything that can go elsewhere. Reserved at
   * the preferred compass point; the beacon releases its own reservation when
   * it comes to place its name, so it is never blocked by itself.
   *
   * Without this a road name, placed first because it has fewer freedoms, sat
   * across the very terminal whose number had to go there, and the beacon --
   * with nowhere left in forty positions -- fell back on top of it.
   */
  /**
   * The title block's own text, reserved before anything movable is placed.
   *
   * Its lines are CENTRED on the title column, and a long designation is wider
   * than that column: "Stands 403-405 Brackenhurst Township" spans 136 to 215
   * mm on a sheet whose drawing panel ends at 152. So the title reaches back
   * OVER the drawing, and a road name correctly placed inside the panel still
   * ended up underneath it. The panel boundary alone cannot see this; the text
   * has to be on the map of what is occupied.
   */
  {
    const th = mm(L.text.title);
    (spec.title ?? []).slice(0, 4).forEach((line, i) => {
      const hgt = i === 0 ? th * L.text.titleLeadFactor : th;
      const at = S(L.title.cx, L.title.baselines[i]);
      occupied.push(textRect(String(line), at[0], at[1], hgt, 'center'));
    });
    const sh = mm(L.text.scale);
    const sAt = S(L.title.cx, L.title.scaleBaseline);
    occupied.push(textRect(`Scale 1:${scale}`, sAt[0], sAt[1], sh, 'center'));
  }

  const reservedName = new Map();
  for (const b of figureBeacons()) {
    const p = namePreferred(b);
    if (p === 'none') continue;
    const c = namePlace(b, p);
    const rect = textRect(b.name, b.e + c[0], b.n + c[1], h, c[2]);
    reservedName.set(b.name, rect);
    occupied.push(rect);
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
    let anywhere = null, anyScore = Infinity, anyOn = -1;
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
      } else {
        // Nothing fits on the panel -- a long name letter-spaced along a short
        // side can be wider than the room beside it at any offset. Then the
        // measure is how much of the label stays ON the drawing, not how little
        // it collides: a name half on the figure still reads as the figure's,
        // where one clear of everything in the title block reads as the title.
        const on = Math.max(0, Math.min(rect[2], panelBox[2]) - Math.max(rect[0], panelBox[0]))
          * Math.max(0, Math.min(rect[3], panelBox[3]) - Math.max(rect[1], panelBox[1]));
        if (on > anyOn || (on === anyOn && score < anyScore)) {
          anyOn = on; anyScore = score; anywhere = { choice: c, rect, clear: false };
        }
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

  /** Every sign the figure draws that a line must keep clear of, other than
   *  the two beacons it ends at. */
  const midSigns = (fromName, toName) => figureBeacons()
    .filter((b) => b.name !== fromName && b.name !== toName)
    .map((b) => ({ at: [b.e, b.n], r: mm(symbolClearance(b.symbol)) }));

  /** A boundary side, pulled clear of the sign at EACH end and gapped wherever
   *  a beacon drawn on the line requires it -- the same mid-line trim the
   *  diagram leaves around a beacon's open circle. */
  const drawBoundary = (p0, p1, fromName, toName, layer) => {
    const [ca, cb] = clipToSigns(p0, p1,
      G(fromName).symbol, G(toName).symbol);
    drawWithGaps(ca, cb, midSigns(fromName, toName), { layer });
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
      drawBoundary(pts[k], pts[j], p.ring[k], p.ring[j], 'BOUNDARY-NEW');
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
    drawBoundary([a.e, a.n], [b.e, b.n], s.from, s.to, 'BOUNDARY-EXIST');
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
      ...midSigns(ex.from, ex.to),
    ], { layer: 'BOUNDARY-EXIST' });
  }

  /* ---- coordinate grid.
   *
   * Placed BEFORE the marks that can go elsewhere. It used to run last and
   * take whatever was left, which on a figure filling its panel meant the
   * crowded end of the drawing got nothing: six of seven ticks along one
   * edge, and the top right of the figure bare.
   *
   * A road name can slide along its road and a neighbour name can step
   * further out; a coordinate cross can only be where its coordinate is. So
   * it claims its ground first, and the movable labels work around it. */
  const pick = () => GRID_INTERVALS.find((i) => (i / scale) * 1000 >= 40)
    ?? GRID_INTERVALS.at(-1);
  const arm = mm(L.symbol.gridArm) / 2;
  const inset = 10;                                   // keep ticks off the panel edge

  const [pe0] = S(L.panel.x0 + inset, 0), [pe1] = S(L.panel.x1 - inset, 0);
  const pn1 = S(0, L.panel.y0 + inset)[1], pn0 = S(0, L.panel.y1 - inset)[1];

  /** Which corner of the figure a tick falls in. */
  const quadrantOf = (e, n) => `${e < figCx ? 'L' : 'R'}${n < figCy ? 'B' : 'T'}`;

  /** Where an interval's ticks would go. Reads `occupied` but never adds to it,
   *  so an interval can be tried and abandoned; only the chosen one is drawn. */
  const layGrid = (gi) => {
    const out = [];
    const gw = mm(L.gridLabel.xDx + 0.63 * L.text.grid * 13);
    const clashes = (r) => hits(r) || out.some(({ rect: o }) =>
      r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]);
    // Corner-most candidates are tried FIRST. The lattice used to be walked in
    // order and taken greedily, so the row nearest the start filled up and its
    // ticks blocked the rest: on a three-by-three lattice that put three of
    // five ticks along one edge and left the far corners with one between them.
    // A reader interpolates from the ticks that BRACKET a position, so the
    // corners are the ones worth having.
    const corners = [[bb.e0, bb.n0], [bb.e0, bb.n1], [bb.e1, bb.n0], [bb.e1, bb.n1]];
    const all = [];
    for (let e = Math.ceil(pe0 / gi) * gi; e <= pe1; e += gi) {
      for (let n = Math.ceil(pn0 / gi) * gi; n <= pn1; n += gi) all.push([e, n]);
    }

    // The corners take turns. Each corner's nearest candidate is tried, then
    // each corner's second nearest, and so on -- so every corner gets its best
    // shot before any corner gets its second.
    //
    // Ranking the whole lattice by distance-to-nearest-corner does NOT do this:
    // one corner's whole neighbourhood outranks another corner's best, and the
    // crowded end of the figure is served last with whatever room is left. That
    // is how six of seven ticks ended up along one edge.
    const byCorner = corners.map((c) => all.slice().sort((p, q) =>
      Math.hypot(p[0] - c[0], p[1] - c[1]) - Math.hypot(q[0] - c[0], q[1] - c[1])));
    const lattice = [];
    const taken = new Set();
    for (let k = 0; k < all.length; k++) {
      for (const list of byCorner) {
        const p = list[k];
        if (!p) continue;
        const id = `${p[0]}|${p[1]}`;
        if (taken.has(id)) continue;
        taken.add(id);
        lattice.push(p);
      }
    }

    {
      for (const [e, n] of lattice) {
        // A cross carries its figures on one side. Reading them to the right is
        // the convention, but a cross near the panel's right edge cannot -- and
        // its figures would run into the title block -- so the mirrored side is
        // tried before the cross is given up. Flipping a label costs nothing;
        // losing a tick costs the reader a reference.
        // Clear of the BOUNDARIES by enough that the cross reads as a cross
        // and not as part of the figure -- but no more. A coordinate grid is
        // drawn ACROSS a plan, not squeezed into the gaps around it; at 7 mm
        // the crosses could not enter the figure at all, so on a sheet whose
        // upper half is full of boundaries they all fell to the open ground
        // along the bottom.
        const clearOfLines = segments.every(
          (s) => distToSegment([e, n], s[0], s[1]) > mm(GRID_LINE_CLEARANCE_MM));
        if (!clearOfLines) continue;
        // A cross carries its figures into one QUADRANT of itself. Reading
        // them down and to the right is the convention; the other three are
        // tried before the cross is given up. Each needs about 25 mm of clear
        // width, and a figure that fills its panel leaves barely that at the
        // edges -- with only one quadrant to try, the corners of the drawing
        // went bare while the middle filled up.
        const drop = mm(L.gridLabel.yStartDy + 12);
        const near = arm + mm(2);
        const rects = {
          rightDown: [e - near, n - drop, e + gw, n + near],
          leftDown: [e - gw, n - drop, e + near, n + near],
        };
        let side = null;
        for (const s of ['rightDown', 'leftDown']) {
          if (insidePanel(rects[s]) && !clashes(rects[s])) { side = s; break; }
        }
        if (!side) continue;
        out.push({ e, n, rect: rects[side], side });
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
    // Judged on how well the ticks SURROUND the figure, then on count.
    //
    // The interval that satisfies the requirement earliest wins, and the
    // requirement is the surveyor's: two ticks above the figure's middle, one
    // to each side, and two below it likewise. A coarse interval can put one
    // cross in each quadrant and still leave the top of the sheet with a single
    // reference -- which is what a three-row lattice did, and why the ticks
    // read as clamped along the bottom.
    const covers = (t) => new Set(t.map((x) => quadrantOf(x.e, x.n))).size;
    // The bands are the outer THIRDS of the figure, not its halves. A tick a
    // hair above the middle satisfies "top" arithmetically and still reads as
    // the middle; the surveyor asked for marks at the top and bottom of the
    // drawing, and that is where a reader looks to bracket a position.
    const lo = bb.n0 + (bb.n1 - bb.n0) / 3;
    const hi = bb.n1 - (bb.n1 - bb.n0) / 3;
    const band = (t, top) => t.filter((x) => (top ? x.n >= hi : x.n <= lo)).length;
    const satisfies = (t) => covers(t) === GRID_QUADRANTS.length
      && band(t, true) >= 2 && band(t, false) >= 2;
    const rank = (t) => [covers(t), Math.min(band(t, true), band(t, false)), t.length];
    const better = (a, b) => {
      const ra = rank(a), rb = rank(b);
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i];
      return false;
    };
    let best = null;
    for (let k = GRID_INTERVALS.indexOf(pick()); k >= 0; k--) {
      const cand = GRID_INTERVALS[k];
      if ((cand / scale) * 1000 < MIN_TICK_SPACING_MM) break;
      const t = layGrid(cand);
      if (!best || better(t, best.ticks)) best = { gi: cand, ticks: t };
      if (satisfies(t) && t.length >= MIN_GRID_TICKS) break;
    }
    ({ gi, ticks } = best ?? { gi: pick(), ticks: [] });
  }

  const gridInterval = { e: gi, n: gi };
  const placed = ticks.length;
  const gh = mm(L.text.grid);
  for (const { e, n, rect, side } of ticks) {
    occupied.push(rect);
    d.line([e - arm, n], [e + arm, n], { layer: 'GRID' });
    d.line([e, n - arm], [e, n + arm], { layer: 'GRID' });
    const Xlo = -n, Ylo = -e;
    // Mirrored about the cross into whichever quadrant had room: the same
    // offsets reflected, with the easting set right-aligned when it reads
    // leftward so it still ends at the cross rather than starting there.
    const flipX = side.startsWith('left') ? -1 : 1;
    const flipY = 1;
    d.text(`X = ${Xlo >= 0 ? '+' : ''}${Xlo.toFixed(0)}`,
      [e + flipX * mm(L.gridLabel.xDx), n - flipY * mm(L.gridLabel.xBaselineDy)], gh,
      { layer: 'GRID-TEXT', style: 'ARIAL', ...(flipX < 0 ? { align: 'right' } : {}) });
    // The northing reads up the sheet; sent the other way it starts above the
    // cross instead of below it, so its run is measured from the far end.
    const yStart = flipY > 0
      ? n - mm(L.gridLabel.yStartDy)
      : n + mm(L.gridLabel.yStartDy) - mm(0.63 * L.text.grid * 13);
    d.text(`Y = ${Ylo.toFixed(0)}`,
      [e + flipX * mm(L.gridLabel.yDx), yStart], gh,
      { layer: 'GRID-TEXT', style: 'ARIAL', rotation: -90 });
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
    // Centred on the side it names, which is where a reader looks for it: the
    // name belongs to the whole road, not to the end it happens to start from.
    // The text is drawn from its left edge, so the insertion point is stepped
    // back half its width from the midpoint. Servitudes come through here too
    // and are centred the same way.
    const halfLen = Math.hypot(b.e - a.e, b.n - a.n) / 2;

    // A road name is pinned to its own line, so its only freedoms are how far
    // out, how far along, and -- last -- which side. Tried in that order. This
    // is why roads are drawn BEFORE beacon names: the label with three freedoms
    // claims its place before the one with twenty-four.
    /** Candidates for a name of a given height, centred on the side. */
    const roadTries = (hgt) => {
      const start = halfLen - (0.63 * hgt * wf * rd.name.length) / 2;
      const out = [];
      for (const sideSign of [1, -1]) {
        for (const outK of [1, 1.8, 2.6]) {
          // Sliding ALONG the road is the cheapest freedom a road name has: it
          // stays on its own line and simply moves away from the corner. The
          // range reaches past the side's terminals, because a long name
          // centred on a short side covers the very beacons whose numbers have
          // to sit there, and those are placed after it.
          for (const alongD of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
            const off = base * sideSign * outK;
            const al = start + alongD * mm(9);
            out.push([
              sx - Math.sin(ang) * off + Math.cos(ang) * al,
              sy + Math.cos(ang) * off + Math.sin(ang) * al,
            ]);
          }
        }
      }
      return out;
    };

    // A name that will not fit beside its line at the reading size is lettered
    // one size DOWN rather than pushed off the drawing -- which is what a
    // draughtsman does, and the only honest answer when the room is simply not
    // there. On this sheet 'M  A  I  N   R  O  A  D' is 47 mm against a 40 mm
    // side, with the figure already filling 102 of the panel's 146 mm.
    let chosen = null, rhUsed = rh;
    for (const hgt of [rh, mm(SMALLER_THAN_READING_MM)]) {
      const pick = bestOf(roadTries(hgt), (c) => rotatedRect(rd.name, c[0], c[1], hgt, ang, wf));
      chosen = pick; rhUsed = hgt;
      // The reading size is kept the moment it finds CLEAR ground -- being on
      // the panel is not enough, since the room beside a road is exactly what a
      // long name runs out of. Failing that the smaller size is taken even if
      // it too is crowded: a name that cannot fit does less damage set small,
      // and the loop ends on the smallest tried rather than the largest.
      if (pick && pick.clear) break;
    }
    // Last resort: slide it bodily onto the drawing. A name too long for the
    // room beside its road ends up a few millimetres off that road, which a
    // reader forgives; the same name written across the title block is a
    // broken sheet. Nothing else on the drawing has this problem, because
    // nothing else is pinned to a line it cannot fit along.
    let [ax, ay] = chosen.choice;
    let rect = chosen.rect;
    if (!insidePanel(rect)) {
      const dx = Math.max(0, panelBox[0] - rect[0]) - Math.max(0, rect[2] - panelBox[2]);
      const dy = Math.max(0, panelBox[1] - rect[1]) - Math.max(0, rect[3] - panelBox[3]);
      ax += dx; ay += dy;
      rect = [rect[0] + dx, rect[1] + dy, rect[2] + dx, rect[3] + dy];
    }
    occupied.push(rect);
    d.text(rd.name, [ax, ay], rhUsed,
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


  for (const b of figureBeacons()) {
    const block = {
      placed: 'BCN_PLACED', peg: 'BCN_PLACED',
      found: 'BCN_FOUND', foundNotAdopted: 'BCN_FOUND_NA',
      rm: 'BCN_RM', ws: 'BCN_WS', wsu: 'BCN_WSU',
      trig: 'BCN_TRIG', ocp: 'BCN_OCP',
    }[b.symbol ?? 'placed'] ?? 'BCN_PLACED';
    d.insert(block, [b.e, b.n], { layer: 'BEACONS' });

    const pos = namePreferred(b);
    if (pos === 'none') continue;
    // Release this beacon's own reservation, or it would refuse the very spot
    // that was held for it.
    const held = reservedName.get(b.name);
    if (held) {
      const at = occupied.indexOf(held);
      if (at >= 0) occupied.splice(at, 1);
    }
    const place = (p, k = 1) => namePlace(b, p, k);

    // Preferred position first, then the rest of the compass at the SAME
    // distance -- a label must stay near its beacon, so the whole ring is tried
    // before the distance grows at all. Only when all eight are blocked does it
    // step out, and by as little as possible.
    const tries = [pos, ...COMPASS.slice(COMPASS.indexOf(pos) + 1),
      ...COMPASS.slice(0, COMPASS.indexOf(pos))];
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

  /* ---- insets ------------------------------------------------------------
   *
   * The sheet has one uncommitted region, the inset box at the lower right, and
   * it may have to hold more than the locality diagram. Beacons that plot on
   * top of each other at this scale -- 87D and 87DNew of Brackenhurst are
   * 0.061 m apart, which is 0.03 mm at 1:2000 -- get a detail of their own,
   * because the figure has room to draw one mark where the ground carries two.
   *
   * They are numbered in one sequence. The locality diagram is INSET 1 when
   * there is one and the details follow; with no locality diagram the details
   * start at 1. A sheet with no crowding draws exactly what it always drew.
   */
  const insets = [];
  if (spec.inset) {
    insets.push({
      kind: 'locality',
      scale: spec.inset.scale,
      beacons: spec.inset.beacons.map((b) => ({ ...b, ...loToGround(b) })),
    });
  }
  for (const cluster of crowded) {
    insets.push({ kind: 'detail', beacons: cluster });
  }

  const cells = insetCells(L.inset.box, insets.length);

  insets.forEach((ins, idx) => {
    const B = cells[idx];
    const number = idx + 1;
    d.polyline([S(B.x0, B.y0), S(B.x1, B.y0), S(B.x1, B.y1), S(B.x0, B.y1)],
      { layer: 'INSET', closed: true });

    // Every inset is schematic enough to say so: a locality drawn on the sheet
    // has its content squeezed to whatever cell the sheet gives it, and the
    // marks of a crowded pair are spread to be read. No distance in either one
    // is exact, and the regulation's own caption is "Inset (not to scale)"
    // whatever the kind. Saying so is not optional.
    const caption = 'INSET ' + number + ' (NOT TO SCALE)';
    d.text(caption, S(B.x0 + 5, B.y0 + 6), mm(L.text.insetTitle),
      { layer: 'INSET', style: 'ARIAL-BOLD' });

    const iSym = mm(1.0);
    // Every round sign in an inset is drawn at this radius, so it is the
    // inset's own idea of how big a beacon is.
    const iRing = iSym * 0.85;

    /** One Fifth Schedule sign, drawn small, centred on a sheet point. */
    const drawSign = (at, symbol) => {
      const ring = (r) => d.polyline(circlePts(r, 24).map(([x, y]) => [at[0] + x, at[1] + y]),
        { layer: 'INSET', closed: true });
      const dot = (r, n = 10) => {
        const pts = circlePts(r, n);
        for (let k2 = 0; k2 < n; k2++) {
          d.solid([at, [at[0] + pts[k2][0], at[1] + pts[k2][1]],
            [at[0] + pts[(k2 + 1) % n][0], at[1] + pts[(k2 + 1) % n][1]]], { layer: 'INSET' });
        }
      };
      const triangle = (up) => {
        // The same construction as the beacon block: a filled triangle with a
        // real hole, NOT a filled triangle with a circle drawn over it. Sized
        // from the FIGURE's triangle, scaled by the ratio the inset draws a
        // found beacon at, so the two cannot drift apart.
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
      switch (symbol) {
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
        case 'foundNotAdopted': {
          // The found sign struck through, as BCN_FOUND_NA draws it. Without
          // the slash a rejected beacon is indistinguishable from an adopted
          // one, and the whole point of giving 87D an inset is to say which
          // of the two marks the survey stands on.
          ring(iRing); ring(iSym * 0.5);
          const k = (iRing * 2) / mm(L.symbol.foundOuterDia);
          const a = (mm(L.symbol.notAdoptedSlash) / 2) * Math.SQRT1_2 * k;
          d.line([at[0] - a, at[1] - a], [at[0] + a, at[1] + a], { layer: 'INSET' });
          break;
        }
        default: ring(iRing); ring(iSym * 0.5); break;   // found
      }
    };

    const label = (at, name) =>
      d.text(name, [at[0], at[1] + mm(1.8)], mm(L.text.insetLabel),
        { layer: 'INSET', style: 'ARIAL', align: 'center' });

    // North point: the sheet's own meridian arrow at a fraction of its size.
    // Every inset carries one, the locality diagram and the details alike --
    // both are drawn north-up, so neither needs rotation, and a detail without
    // one leaves the reader guessing which way its marks lie. On NORTH-ARROW,
    // not INSET: it is a north point, and that keeps INSET meaning the inset's
    // MAP.
    const nn = L.inset.north;
    drawNorthArrow(B.x1 - nn.dxFromRight, B.y0 + nn.dyFromTop, nn.scale, nn.letterMm);

    if (ins.kind === 'locality') {
      const ib = ins.beacons;
      const eMin = Math.min(...ib.map((b) => b.e)), eMax = Math.max(...ib.map((b) => b.e));
      const nMin = Math.min(...ib.map((b) => b.n)), nMax = Math.max(...ib.map((b) => b.n));
      const ic = { e: (eMin + eMax) / 2, n: (nMin + nMax) / 2 };

      // The spec's scale was chosen against the sheet's WHOLE inset box. Once
      // that box is shared, this cell is smaller, and drawing the same content
      // unchanged pushed the outer stations clean out of the frame and over the
      // figure -- RM7 ended up 24 mm to the left of its own cell. Refit to the
      // cell actually given, and keep whichever scale is coarser so a full-width
      // cell still draws exactly what it always drew.
      const iScale = Math.max(
        Number(ins.scale) || 0,
        insetScaleToFit(eMax - eMin, nMax - nMin, B.x1 - B.x0, B.y1 - B.y0),
      );
      const lcx = (B.x0 + B.x1) / 2, lcy = (B.y0 + B.y1) / 2;
      const I = (e, n) => S(lcx + ((e - ic.e) / iScale) * 1000,
        lcy - ((n - ic.n) / iScale) * 1000);
      for (const b of ib) {
        const at = I(b.e, b.n);
        drawSign(at, b.symbol);
        label(at, b.name);
      }
      return;
    }

    // A detail. The members are within millimetres of each other on the ground,
    // and for an exactly coincident pair no enlargement separates them at all,
    // so they are spread around their true position at a fixed spacing rather
    // than drawn to any scale. A leader ties each back to the one spot they all
    // occupy, which is the fact the reader needs.
    const dcx = (B.x0 + B.x1) / 2, dcy = (B.y0 + B.y1) / 2;
    const spread = Math.min(B.x1 - B.x0, B.y1 - B.y0) * 0.26;
    const centre = S(dcx, dcy);
    const gcE = ins.beacons.reduce((t, b) => t + b.e, 0) / ins.beacons.length;
    const gcN = ins.beacons.reduce((t, b) => t + b.n, 0) / ins.beacons.length;

    // Each member is pushed out along the TRUE bearing it bears from the group's
    // centre, all at one radius. Only the distances are invented, which is what
    // the caption says, and it is what lets the inset carry a north point at
    // all: spread by an arbitrary angle, the arrow would be a lie.
    //
    // Beacons recorded at the identical position have no bearing to preserve,
    // so those fall back to an even fan -- there is nothing else to honour.
    const bearings = ins.beacons.map((b) => Math.atan2(b.n - gcN, b.e - gcE));
    const degenerate = ins.beacons.every(
      (b) => Math.hypot(b.e - gcE, b.n - gcN) < 1e-9,
    );

    ins.beacons.forEach((b, k) => {
      const ang = degenerate
        ? -Math.PI / 2 + (k * 2 * Math.PI) / ins.beacons.length
        : bearings[k];
      // The sheet is drawn south-up, so a ground bearing's northing component
      // moves UP the page: subtract it, exactly as toSheet does.
      const at = S(dcx + spread * Math.cos(ang), dcy - spread * Math.sin(ang));
      d.line(centre, at, { layer: 'INSET' });
      drawSign(at, b.symbol ?? 'peg');
      label(at, b.name);
    });

    // And on the figure itself: a leader arrow drives straight at the spot the
    // detail enlarges, lettered with the inset's number at its tail. Without it
    // the detail names two beacons and never says where on the sheet they are.
    // A ring could only say "something round is here"; an arrow speaks more
    // precisely, because its point is ON the mark.
    const gc = {
      e: ins.beacons.reduce((t, b) => t + b.e, 0) / ins.beacons.length,
      n: ins.beacons.reduce((t, b) => t + b.n, 0) / ins.beacons.length,
    };
    const fs = toSheet(gc.e, gc.n);
    const fx = fs[0], fy = fs[1];
    if (fx >= L.panel.x0 && fx <= L.panel.x1 && fy >= L.panel.y0 && fy <= L.panel.y1) {
      const members = new Set(ins.beacons.map((b) => b.name));
      // The shaft may not strike a boundary or run through another beacon's
      // sign: an arrow drawn across the figure it is meant to point AT reads
      // as part of the figure, and the two marks that share the spot are the
      // only things it is allowed to touch. Everything the sheet has drawn by
      // now, in its own ground coordinates.
      const avoidLines = [
        ...segments,
        ...(spec.remainderBoundary ?? []).map((s) => {
          const a = G(s.from), b = G(s.to);
          return [[a.e, a.n], [b.e, b.n]];
        }),
        ...(spec.existing ?? []).map((ex) => {
          const a = G(ex.from), b = G(ex.to);
          return [[a.e, a.n], [b.e, b.n]];
        }),
      ];
      const signs = figureBeacons()
        .filter((b) => !members.has(b.name))
        .map((b) => ({ e: b.e, n: b.n, r: mm(symbolClearance(b.symbol)) }));

      const distToSeg = (p, a, b) => {
        const ux = b[0] - a[0], uy = b[1] - a[1];
        const L2 = ux * ux + uy * uy || 1;
        let t = ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / L2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p[0] - (a[0] + ux * t), p[1] - (a[1] + uy * t));
      };
      const distSegSeg = (a, b, c, d) => {
        const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
        if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return 0;
        return Math.min(distToSeg(a, c, d), distToSeg(b, c, d),
          distToSeg(c, a, b), distToSeg(d, a, b));
      };

      const spot = S(fx, fy);
      const labelH = mm(L.text.insetLabel);
      const aLen = mm(3.0), aHalf = mm(1.0);
      // How close is too close. Deliberately small: an arrow that is already
      // clear of the figure stays where it always was, and only a shaft that
      // actually cuts a line or a sign walks away from the scripted lead.
      const lineClear = mm(0.8), signPad = mm(0.4);

      const shaftPenalty = (tail, base) => {
        let cost = 0;
        for (const [p0, p1] of avoidLines) {
          if (distSegSeg(tail, base, p0, p1) < lineClear) cost += 1;
        }
        for (const s of signs) {
          if (distToSeg([s.e, s.n], tail, base) < s.r + signPad) cost += 1;
        }
        return cost;
      };
      // The number letters at the tail must stay on the drawing and clear of
      // the lines too (they are drawn INSET, so same layer rule as the shaft).
      const tailPenalty = (tail) => {
        const rect = textRect('INSET ' + number, tail[0], tail[1], labelH, 'left');
        let cost = insidePanel(rect) ? 0 : 10;
        for (const [p0, p1] of avoidLines) {
          if (segCrossesRect(p0, p1, rect)) cost += 1;
        }
        return cost;
      };

      const dirs = [];
      const start = Math.PI / 4;             // the scripted up-right lead
      // Reach in ground units: the scripted lead first (11 mm out and 11 mm
      // up), then shorter shafts for a spot boxed in by its own corners. A
      // leader must reach its mark, but a readable clear shaft beats a long one
      // thrown across the very lines that meet there.
      const reaches = [Math.SQRT2 * mm(11), mm(11), mm(8)];
      for (const L of reaches) {
        for (let k = 0; k < 32; k++) {
          const ang = start - (k * 2 * Math.PI) / 32;
          const ux = Math.cos(ang), uy = Math.sin(ang);
          const tail = [spot[0] + ux * L, spot[1] + uy * L];
          const base = [spot[0] - ux * aLen, spot[1] - uy * aLen];
          dirs.push({ ang, tail, base, cost: shaftPenalty(tail, base) + tailPenalty(tail) });
        }
      }
      // First a clear shaft at the longest reach, then the cheapest, then the
      // turn closest to the scripted up-right lead -- so a spot with clear
      // water all round is lettered exactly where it always was.
      dirs.sort((x, y) => (x.cost === 0) - (y.cost === 0) || x.cost - y.cost
        || Math.hypot(x.tail[0] - spot[0], x.tail[1] - spot[1])
           - Math.hypot(y.tail[0] - spot[0], y.tail[1] - spot[1])
        || Math.abs(x.ang - start) - Math.abs(y.ang - start));
      const pick = dirs[0];
      const tail = pick.tail, base = pick.base;
      // The shaft stops short of the point and a filled arrowhead, the same
      // construction a connection mark uses, carries the line the rest of the
      // way so the tip lands on the mark itself.
      d.line(tail, base, { layer: 'INSET' });
      const ux = (spot[0] - base[0]) / aLen, uy = (spot[1] - base[1]) / aLen;
      const px = -uy, py = ux;
      d.solid([spot, [base[0] + px * aHalf, base[1] + py * aHalf],
        [base[0] - px * aHalf, base[1] - py * aHalf]], { layer: 'INSET' });
      d.text('INSET ' + number, tail, labelH, { layer: 'INSET', style: 'ARIAL' });
    }
  });

  // sheetSize is reported so the caller can tell the surveyor -- and the plot
  // dialog -- which paper this was drawn for.
  return {
    dxf: doc.toString(), scale, gridInterval, gridTicks: placed, areas,
    sheetSize: 'A4', sheetWidthMm: SHEET.width, sheetHeightMm: SHEET.height,
  };
}
