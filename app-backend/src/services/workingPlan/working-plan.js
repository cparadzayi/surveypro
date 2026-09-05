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
import { contiguousMarks } from '../diagram/contiguousMarks.js';
import { edgeStrip } from '../diagram/edgeStrip.js';

/* ------------------------------------------------------------------ layout */

export const SHEET = { width: 297, height: 210 };          // A4 landscape, mm

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

  inset: { box: { x0: 162.9, y0: 109.69, x1: 291.97, y1: 196.13 } },

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
    // Enlarged 1.5x from 2.963/2.286 so the inscribed circle reads clearly: at
    // this size it is 2.416 mm across, near enough the found beacon's 2.498 mm
    // circle that it carries the same familiar weight, with the triangle drawn
    // around it. The clipping clearance follows automatically -- symbolClearance
    // derives the triangle's reach from these two numbers.
    trigW: 4.444, trigH: 3.429, // trig beacon / official control point triangle
    gridArm: 8.008,         // full length of a grid cross arm
  },

  // grid-label offsets from the cross centre, mm
  gridLabel: { xDx: 4.45, xBaselineDy: 1.06, yDx: -1.02, yStartDy: 5.38 },

  // Stub length in paper mm. The diagram uses CONTIG_STUB_PT = 6 mm expressed in
  // points; the same 6 mm here keeps the mark the same size on both documents.
  contiguousStub: 6,

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
  // Dotted: a surrounding property is indicated, not surveyed. This diverges
  // from the diagram, which draws its abutment stubs solid -- the working
  // plan was asked for dotted and the request is the authority here.
  ['ADJOINING', 7, 'PLANDOT'],
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

const STANDARD_SCALES = [200, 250, 500, 1000, 1250, 2000, 2500, 5000, 10000, 20000];
const GRID_INTERVALS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];

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

  /* ---- figure extent (boundary beacons only, so stray RMs don't blow it up) */
  const ringPts = spec.parcels.flatMap((p) => p.ring.map((n) => [G(n).e, G(n).n]));
  const extraPts = (spec.notes ?? []).map((t) => {
    const g = loToGround(t); return [g.e, g.n];
  });
  const all = ringPts.concat(extraPts);
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

  /* ---- sheet border */
  d.polyline([S(L.border.x0, L.border.y0), S(L.border.x1, L.border.y0),
    S(L.border.x1, L.border.y1), S(L.border.x0, L.border.y1)],
  { layer: 'SHEET-BORDER', closed: true });

  /* ---- label obstacles: every label avoids the symbols, the boundaries and
         every label already placed. Built BEFORE anything is drawn so the
         parcel labels take part too -- they used to be written blind. */
  const figCx = (bb.e0 + bb.e1) / 2, figCy = (bb.n0 + bb.n1) / 2;
  const h = mm(L.text.beacon);
  const r = mm(Math.max(L.symbol.foundOuterDia, L.symbol.refMarkArm, L.symbol.trigW) / 2);

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
  for (const b of byName.values()) occupied.push([b.e - r, b.n - r, b.e + r, b.n + r]);

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

  /** Free of other labels, symbols AND boundary lines. */
  const free = (rect) => !hits(rect) && !segments.some((s) => segCrossesRect(s[0], s[1], rect));

  /* ---- parcel boundaries, clipped clear of the beacon symbols */
  const areas = {};
  for (const p of spec.parcels) {
    const pts = p.ring.map((n) => [G(n).e, G(n).n]);
    // Drawn edge by edge rather than as one closed polyline: each end is pulled
    // back to the rim of the symbol it meets, so the boundary stops at the
    // beacon instead of striking through it. The ring itself is unchanged --
    // areas, labels and the figure extent all still use the true vertices.
    for (let k = 0; k < p.ring.length; k++) {
      const a = pts[k], b = pts[(k + 1) % p.ring.length];
      const ux = b[0] - a[0], uy = b[1] - a[1];
      const len = Math.hypot(ux, uy) || 1;
      const dx = ux / len, dy = uy / len;
      const ra = mm(symbolClearance(G(p.ring[k]).symbol));
      const rb = mm(symbolClearance(G(p.ring[(k + 1) % p.ring.length]).symbol));
      // A side shorter than the two symbols is drawn whole rather than inverted.
      if (ra + rb >= len) { d.line(a, b, { layer: 'BOUNDARY-NEW' }); continue; }
      d.line([a[0] + dx * ra, a[1] + dy * ra], [b[0] - dx * rb, b[1] - dy * rb],
        { layer: 'BOUNDARY-NEW' });
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

  /* ---- existing (dashed) parent boundaries, with optional extensions */
  for (const ex of spec.existing ?? []) {
    const a = G(ex.from), b = G(ex.to);
    const ux = b.e - a.e, uy = b.n - a.n;
    const len = Math.hypot(ux, uy) || 1;
    const [dx, dy] = [ux / len, uy / len];
    const p0 = [a.e - dx * mm(ex.extendFrom ?? 0), a.n - dy * mm(ex.extendFrom ?? 0)];
    const p1 = [b.e + dx * mm(ex.extendTo ?? 0), b.n + dy * mm(ex.extendTo ?? 0)];
    d.line(p0, p1, { layer: 'BOUNDARY-EXIST' });
  }

  /* ---- contiguous neighbours: outward stubs at the terminals they abut,
         drawn the way the diagram draws them (same shared helpers) */
  for (const c of spec.contiguous ?? []) {
    const a = G(c.from), b = G(c.to);
    const ring = spec.parcels.find((p) => p.ring.includes(c.from) && p.ring.includes(c.to));
    if (!ring) continue;
    const pts = ring.ring.map((n) => [G(n).e, G(n).n]);
    const cen = [
      pts.reduce((t, q) => t + q[0], 0) / pts.length,
      pts.reduce((t, q) => t + q[1], 0) / pts.length,
    ];
    const A = [a.e, a.n], B = [b.e, b.n];
    const marks = contiguousMarks(A, B, c.end);
    const st = edgeStrip(A, B, mm(L.contiguousStub), cen);
    if (marks.stubFrom) d.line(A, st[3], { layer: 'ADJOINING' });
    if (marks.stubTo) d.line(B, st[2], { layer: 'ADJOINING' });
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
    let at = tries[0];
    for (const c of tries) {
      if (free(rotatedRect(rd.name, c[0], c[1], rh, ang, wf))) { at = c; break; }
    }
    occupied.push(rotatedRect(rd.name, at[0], at[1], rh, ang, wf));
    d.text(rd.name, at, rh,
      { layer: 'ROAD-TEXT', style: 'ARIAL', rotation: ang * 180 / Math.PI, widthFactor: wf });
  }


  /* ---- free notes (neighbouring stand numbers etc.) */
  for (const t of spec.notes ?? []) {
    const g = loToGround(t);
    const th = mm(t.height ?? L.text.adjoining);
    // Step outward from the figure until the name is clear of the grid, the
    // beacons and their labels. Drawn AFTER the grid deliberately: the
    // coordinate framework is the more important of the two, and a neighbour's
    // name can move. Falls back to the requested spot after the last step, so a
    // crowded sheet still letters the neighbour rather than dropping it.
    const dx = g.e - figCx, dy = g.n - figCy;
    const len = Math.hypot(dx, dy) || 1;
    const step = mm(3);
    let px = g.e, py = g.n;
    for (let k = 0; k <= 4; k++) {
      const cx = g.e + (dx / len) * step * k;
      const cy = g.n + (dy / len) * step * k;
      const rc = textRect(t.text, cx, cy, th, 'center');
      if (!hits(rc)) { px = cx; py = cy; occupied.push(rc); break; }
    }
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
    const place = (p, k = 1) => {
      const gap = (r + mm(0.5)) * k;
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
    let P = null, rect = null;
    for (const k of [1, 1.5, 2.1]) {
      for (const t of tries) {
        const c = place(t, k);
        const rc = textRect(b.name, b.e + c[0], b.n + c[1], h, c[2]);
        if (free(rc)) { P = c; rect = rc; break; }
      }
      if (rect) break;
    }
    // Nothing free anywhere: place it at the preferred spot rather than drop the
    // name. A beacon without a name is worse than a crowded one, and this is the
    // only path that can still overlap.
    if (!rect) { P = place(pos); rect = textRect(b.name, b.e + P[0], b.n + P[1], h, P[2]); }
    occupied.push(rect);
    d.text(b.name, [b.e + P[0], b.n + P[1]], h,
      { layer: 'BEACON-TEXT', style: 'ARIAL', align: P[2] });
  }

  /* ---- coordinate grid */
  const pick = (span) => GRID_INTERVALS.find((i) => (i / scale) * 1000 >= 40)
    ?? GRID_INTERVALS.at(-1);
  const gi = spec.gridInterval ?? pick();
  const arm = mm(L.symbol.gridArm) / 2;
  const inset = 10;                                   // keep ticks off the panel edge

  const [pe0] = S(L.panel.x0 + inset, 0), [pe1] = S(L.panel.x1 - inset, 0);
  const pn1 = S(0, L.panel.y0 + inset)[1], pn0 = S(0, L.panel.y1 - inset)[1];
  const gridInterval = { e: gi, n: gi };
  let placed = 0;
  for (let e = Math.ceil(pe0 / gi) * gi; e <= pe1; e += gi) {
    for (let n = Math.ceil(pn0 / gi) * gi; n <= pn1; n += gi) {
      // the cross plus both of its labels must be clear of the figure,
      // of every beacon symbol, and of every label already placed
      const gw = mm(L.gridLabel.xDx + 0.63 * L.text.grid * 13);
      const tickRect = [e - arm - mm(2), n - mm(L.gridLabel.yStartDy + 12),
        e + gw, n + arm + mm(2)];
      const clearOfLines = segments.every((s) => distToSegment([e, n], s[0], s[1]) > mm(7));
      if (!clearOfLines || hits(tickRect)) continue;
      occupied.push(tickRect);
      d.line([e - arm, n], [e + arm, n], { layer: 'GRID' });
      d.line([e, n - arm], [e, n + arm], { layer: 'GRID' });
      const gh = mm(L.text.grid);
      const Xlo = -n, Ylo = -e;
      d.text(`X = ${Xlo >= 0 ? '+' : ''}${Xlo.toFixed(0)}`,
        [e + mm(L.gridLabel.xDx), n - mm(L.gridLabel.xBaselineDy)], gh,
        { layer: 'GRID-TEXT', style: 'ARIAL' });
      d.text(`Y = ${Ylo.toFixed(0)}`,
        [e + mm(L.gridLabel.yDx), n - mm(L.gridLabel.yStartDy)], gh,
        { layer: 'GRID-TEXT', style: 'ARIAL', rotation: -90 });
      placed++;
    }
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
  const na = L.northArrow;
  const rays = [
    [90, na.north], [270, na.south], [0, na.side], [180, na.side],
    [45, na.diagonal], [135, na.diagonal], [225, na.diagonal], [315, na.diagonal],
  ];
  for (const [deg, len] of rays) {
    const a = (deg * Math.PI) / 180;
    const tip = S(na.cx + Math.cos(a) * len, na.cy - Math.sin(a) * len);
    const b1 = S(na.cx - Math.sin(a) * na.halfWidth, na.cy - Math.cos(a) * na.halfWidth);
    const b2 = S(na.cx + Math.sin(a) * na.halfWidth, na.cy + Math.cos(a) * na.halfWidth);
    d.polyline([b1, tip, b2], { layer: 'NORTH-ARROW' });
  }
  d.text(na.letters.left, S(na.cx + na.letters.dxLeft, na.letters.baseline), mm(2.12),
    { layer: 'NORTH-ARROW', style: 'ARIAL' });
  d.text(na.letters.right, S(na.cx + na.letters.dxRight, na.letters.baseline), mm(2.12),
    { layer: 'NORTH-ARROW', style: 'ARIAL' });

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
        const w = iSym, hh = iSym * 1.55, sgn = up ? 1 : -1;
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
          ring(iSym * 0.85);
          d.line([at[0] - iSym * 1.2, at[1]], [at[0] + iSym * 1.2, at[1]], { layer: 'INSET' });
          d.line([at[0], at[1] - iSym * 1.2], [at[0], at[1] + iSym * 1.2], { layer: 'INSET' });
          break;
        case 'ws': ring(iSym * 0.85); dot(iSym * 0.32); break;
        case 'wsu': dot(iSym * 0.38); break;
        case 'placed': case 'peg': ring(iSym * 0.85); break;
        default: ring(iSym * 0.85); ring(iSym * 0.5); break;   // found / found-not-adopted
      }
      d.text(b.name, [at[0], at[1] + mm(1.8)], mm(L.text.insetLabel),
        { layer: 'INSET', style: 'ARIAL', align: 'center' });
    }
  }

  return { dxf: doc.toString(), scale, gridInterval, gridTicks: placed, areas };
}
