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
import { contiguousMarks, continuedStubTip, CONTIG_STUB_MM } from '../diagram/contiguousMarks.js';
import { edgeStrip } from '../diagram/edgeStrip.js';
import { NORTH_ARROW_TEMPLATE } from '../diagram/diagramLayout.js';
import { SI727_SCALE_LADDER } from '../../../../app-shared/si727Scales.js';
import { crowdedClusters } from './crowdedBeacons.js';
import { insetCells } from './insetCells.js';
import { layoutMeasured } from './localityLayout.js';
import { placeInsetTicks } from './insetTicks.js';
import { clipSegmentToCircle, pointInPolygon, pointSegmentDistance } from '../diagram/detailInset.js';
import { MEASURED_INSET_SCALES, DETAIL_INSET_SCALES } from '../../../../app-shared/insetScales.js';
import { isReferenceMarkName } from '../../../../app-shared/beaconName.js';

/* ------------------------------------------------------------------ layout */

/**
 * The working plan's paper: ISO A4, in millimetres, landscape by default and portrait on request.
 *
 * One size, deliberately. A working plan is a field document and A4 is what a
 * surveyor carries and prints; when a figure will not fit, SI 727 Reg 32(2)
 * says the SCALE moves, not the paper. Reported in the result so a plot dialog
 * can set true size without the operator scaling by hand.
 */
export const SHEET_LANDSCAPE = { width: 297, height: 210 };
export const SHEET_PORTRAIT = { width: 210, height: 297 };
export const SHEET = SHEET_LANDSCAPE;

/**
 * The paper sizes a working plan may be drawn on. A4 is the field document and the default; A3 is the
 * escalation for a figure that cannot be plotted at the prescribed 1:2500 on A4 (see generateWorkingPlan).
 * Lettering, symbols and line weights keep their ISO sizes on either, so an A3 plot is still true size and
 * only the room between the blocks, and the figure's panel, grow.
 */
export const PAPER = {
  A4: { landscape: { width: 297, height: 210 }, portrait: { width: 210, height: 297 } },
  A3: { landscape: { width: 420, height: 297 }, portrait: { width: 297, height: 420 } },
};
const paper = (size, orientation) => PAPER[size === 'A3' ? 'A3' : 'A4'][orientation === 'portrait' ? 'portrait' : 'landscape'];

/**
 * The neat line stands this far inside the paper's edge. The measured sheet drew it 0.5 mm in, where a
 * desktop printer, which cannot print the last few millimetres, cuts it off. 8 mm clears every common
 * A4 printer's unprintable band (about 4-6 mm) and leaves the border whole on the plot.
 */
export const PRINT_MARGIN_MM = 8;

/** 10 pt of lettering, in millimetres: the size of everything on the sheet that is not the title block. */
export const TEN_PT = (25.4 * 10) / 72;

/**
 * The design measured off a Surveyor-General working plan, on the full landscape sheet with its neat line
 * at 0.5 mm. It is the source the two real layouts below are made from, never used directly.
 */
const MEASURED_LANDSCAPE = {
  border: { x0: 0.5, y0: 0.5, x1: 296.5, y1: 209.5 },

  // region the surveyed figure is centred in (mm from sheet top-left)
  panel: { x0: 6, y0: 6, x1: 152, y1: 172 },

  title: {
    cx: 175.93,
    // The block was dropped a size and its rows closed up so the top of the
    // sheet breathes: the heading (5,0) sits at 12.5 mm and the three naming
    // lines step down through 22.5 / 32.5 / 42.5, with the scale at 51.5.
    // The glyphs grow upward from their baselines, so the heading still starts
    // clear of the printer margin and every row has room below it.
    baselines: [12.5, 22.5, 32.5, 42.5],   // up to four heading lines
    scaleBaseline: 51.5,
  },

  northArrow: {
    cx: 275.89, cy: 25.66,
    north: 18.6, south: 39.7, side: 8.0, diagonal: 5.0, halfWidth: 1.31,
    letters: { left: 'T', right: 'N', dxLeft: -4.0, dxRight: 1.2, baseline: 8.55 },
    // Drawn half-size: the sheet's meridian arrow, not a compass rose. The
    // inset's arrow is this same symbol at a further fraction of it, so two
    // numbers, one construction.
    mainScale: 0.5,
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
    // The wedge diagram that shows the parcels meeting at a found or placed beacon: its radius, in mm.
    abutDetailRadius: 9.5,
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
   *        numbers, adjoining names, grid figures, inset marks, and the
   *        title's identification lines
   *   3,5  the sheet's own apparatus -- the scale, the certificate, the
   *        approval box
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
    beacon: TEN_PT, parcel: TEN_PT, adjoining: TEN_PT, grid: 2.5, insetLabel: TEN_PT,
    road: TEN_PT,
    // title dropped one ISO rung (3,5 -> 2,5) so the identification lines make
    // room for the sheet it names; the heading alone stays the document size.
    scale: 3.5, approval: 3.5, certificate: 3.5, title: 2.5,
    // One ISO rank below the other 3.5 mm captions. "INSET 2 (NOT TO
    // SCALE)" is 22 characters, and at 3.5 mm it ran about 69 mm -- past
    // the 58.5 mm a half-width inset cell leaves beside its frame.
    insetTitle: TEN_PT,
    // 5,0 / 2,5 -- two ISO steps, heading to the line that names the land.
    titleLeadFactor: 2.0,
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

/**
 * The landscape sheet with the neat line at PRINT_MARGIN_MM. Every POSITION and extent on the measured
 * design (panel, title block, north arrow, approval box, certificate, inset, Survey Record number) is
 * mapped from the measured neat line onto the printable one; lettering, symbols and line weights are not
 * touched, so the sheet keeps its ISO sizes and gives up only the white space between the blocks.
 */
function landscapeLayout(margin = PRINT_MARGIN_MM, sheet = SHEET_LANDSCAPE) {
  const B = MEASURED_LANDSCAPE;
  const sx = (sheet.width - 2 * margin) / (B.border.x1 - B.border.x0);
  const sy = (sheet.height - 2 * margin) / (B.border.y1 - B.border.y0);
  const fx = (x) => margin + (x - B.border.x0) * sx;
  const fy = (y) => margin + (y - B.border.y0) * sy;
  const rect = (r) => ({ x0: fx(r.x0), y0: fy(r.y0), x1: fx(r.x1), y1: fy(r.y1) });
  const A = B.approval;
  return {
    ...B,
    border: { x0: margin, y0: margin, x1: sheet.width - margin, y1: sheet.height - margin },
    panel: rect(B.panel),
    title: { cx: fx(B.title.cx), baselines: B.title.baselines.map(fy), scaleBaseline: fy(B.title.scaleBaseline) },
    northArrow: { ...B.northArrow, cx: fx(B.northArrow.cx), cy: fy(B.northArrow.cy) },
    approval: {
      box: rect(A.box),
      approvedBaseline: fy(A.approvedBaseline),
      leader1: { y: fy(A.leader1.y), x0: fx(A.leader1.x0), x1: fx(A.leader1.x1) },
      forBaseline: fy(A.forBaseline),
      dateBaseline: fy(A.dateBaseline), dateX: fx(A.dateX),
      leader2: { y: fy(A.leader2.y), x0: fx(A.leader2.x0), x1: fx(A.leader2.x1) },
    },
    certificate: {
      line1: { x: fx(B.certificate.line1.x), baseline: fy(B.certificate.line1.baseline) },
      line2: { x: fx(B.certificate.line2.x), baseline: fy(B.certificate.line2.baseline) },
    },
    inset: { ...B.inset, box: rect(B.inset.box) },
    srNumber: { cx: fx(B.srNumber.cx), baseline: fy(B.srNumber.baseline) },
  };
}

/**
 * The portrait sheet. The same blocks, arranged for a tall page: the title across the top with the north
 * arrow at its right, the drawing panel beneath it, then the certificate, and a foot of locality inset
 * (left) and approval box (right) with the Survey Record number below them. Block sizes are the measured
 * ones (the approval box keeps its 63.76 x 33.53 mm and its internal spacing); only where they stand
 * changes. The inset is narrower (120 mm) because the approval box shares its row.
 */
function portraitLayout(margin = PRINT_MARGIN_MM, sheet = SHEET_PORTRAIT) {
  const B = MEASURED_LANDSCAPE;
  const W = sheet.width, H = sheet.height;
  const A = B.approval;
  const boxW = A.box.x1 - A.box.x0, boxH = A.box.y1 - A.box.y0;
  const right = W - margin - 2;                 // blocks stand 2 mm inside the neat line
  const left = margin + 4;
  const footBottom = H - margin - 10;
  const ax = right - boxW, ay = footBottom - boxH;
  const dx = ax - A.box.x0, dy = ay - A.box.y0;
  const certLeft = left;
  return {
    ...B,
    border: { x0: margin, y0: margin, x1: W - margin, y1: H - margin },
    // The figure's own stubs (roads, abutments) reach a few millimetres past its beacons, so the panel
    // stands well clear of the title block above it.
    // Inset from the neat line by more than the blocks are: the grid labels at the side crosses reach
    // past the panel's edges. Measured on the reference plan at 1:2000, this gives five grid crosses with
    // every label inside the neat line; any narrower and the side crosses are lost.
    panel: { x0: left + 4, y0: 72, x1: right - 6, y1: H - 107 },
    title: { cx: W / 2, baselines: [20, 30, 40, 50], scaleBaseline: 59 },
    northArrow: { ...B.northArrow, cx: right - 12, cy: 30, refCy: B.northArrow.cy },
    approval: {
      box: { x0: ax, y0: ay, x1: ax + boxW, y1: ay + boxH },
      approvedBaseline: A.approvedBaseline + dy,
      leader1: { y: A.leader1.y + dy, x0: A.leader1.x0 + dx, x1: A.leader1.x1 + dx },
      forBaseline: A.forBaseline + dy,
      dateBaseline: A.dateBaseline + dy, dateX: A.dateX + dx,
      leader2: { y: A.leader2.y + dy, x0: A.leader2.x0 + dx, x1: A.leader2.x1 + dx },
    },
    certificate: {
      line1: { x: certLeft, baseline: H - 100 },
      line2: { x: certLeft + (B.certificate.line2.x - B.certificate.line1.x), baseline: H - 91.5 },
    },
    inset: { ...B.inset, box: { x0: left, y0: H - 85, x1: ax - 4, y1: footBottom } },
    srNumber: { cx: W / 2, baseline: H - margin - 3.5 },
  };
}

/** The party-wall table: one block is this wide, a body row this tall (shrunk to PARTY_ROW_MIN_MM to fit). */
export const PARTY_COL_MM = 43;
const PARTY_ROW_MM = 4.0, PARTY_ROW_MIN_MM = 2.8, PARTY_HEAD_MM = 11;

/**
 * How the party-wall table is cut to the height it has: the row pitch, how many rows a block holds and how
 * many blocks side by side. The table is as roomy as the sample plan's (4 mm a row) while its rows fit, then
 * tightens, and only then takes another block: a plan with 120 walls is a wide table, not an unreadable one.
 */
export function partyTableShape(rows, availH) {
  const body = availH - PARTY_HEAD_MM - 4.5;   // the head, and the padding above the first row and below the last
  const perBlock = (pitch) => Math.max(1, Math.floor(body / pitch));
  let pitch = PARTY_ROW_MM;
  if (rows > perBlock(pitch)) pitch = Math.max(PARTY_ROW_MIN_MM, body / rows);
  const per = perBlock(pitch);
  const blocks = Math.max(1, Math.ceil(rows / per));
  return { pitch, perBlock: per, blocks };
}

/**
 * The General Plan's working plan: a portrait sheet arranged as the Surveyor General's sample is. The title
 * runs across the top with the approval box at its right; the party-wall servitude table stands down the left
 * edge; the locality inset and the north arrow sit beside it under the title; the figure (the outside figure
 * alone, not its stands) fills the lower right, with the certificate beneath it.
 */
function generalPortraitLayout(rows, margin = PRINT_MARGIN_MM, sheet = SHEET_PORTRAIT, withInset = true) {
  const B = MEASURED_LANDSCAPE;
  const W = sheet.width, H = sheet.height;
  const A = B.approval;
  const boxW = A.box.x1 - A.box.x0, boxH = A.box.y1 - A.box.y0;
  const right = W - margin - 2, left = margin + 4;
  const ax = right - boxW, ay = margin + 6;
  const dx = ax - A.box.x0, dy = ay - A.box.y0;
  const tableTop = 52, tableBottom = H - margin - 14;
  const shape = partyTableShape(rows, tableBottom - tableTop);
  const tableRight = left + shape.blocks * PARTY_COL_MM + (shape.blocks - 1) * 2;
  const rx0 = tableRight + 8;
  return {
    ...B,
    border: { x0: margin, y0: margin, x1: W - margin, y1: H - margin },
    // With no inset to hold, the paper under the title is the figure's (and the grid's), the north point moves to the
    // top right, and the panel starts just below it: round the figure there is room for the crosses.
    panel: { x0: rx0, y0: withInset ? 128 : 92, x1: right - 6, y1: H - margin - 30 },
    title: { cx: (left + ax - 4) / 2, baselines: [18, 27, 36, 45], scaleBaseline: 52 },
    northArrow: { ...B.northArrow, cx: withInset ? rx0 + 12 : right - 14, cy: withInset ? 82 : 70, refCy: B.northArrow.cy },
    approval: {
      box: { x0: ax, y0: ay, x1: ax + boxW, y1: ay + boxH },
      approvedBaseline: A.approvedBaseline + dy,
      leader1: { y: A.leader1.y + dy, x0: A.leader1.x0 + dx, x1: A.leader1.x1 + dx },
      forBaseline: A.forBaseline + dy,
      dateBaseline: A.dateBaseline + dy, dateX: A.dateX + dx,
      leader2: { y: A.leader2.y + dy, x0: A.leader2.x0 + dx, x1: A.leader2.x1 + dx },
    },
    certificate: {
      // never so far right that the line runs off the sheet when a long table has pushed the figure right
      line1: { x: Math.min(rx0 + 8, W - margin - 72), baseline: H - margin - 24 },
      line2: { x: Math.min(rx0 + 8, W - margin - 72) + (B.certificate.line2.x - B.certificate.line1.x), baseline: H - margin - 12 },
    },
    inset: { ...B.inset, box: { x0: rx0 + 28, y0: 58, x1: right, y1: 124 } },
    // false when the sheet has no inset: the box is then not a block, and its paper is the figure's
    insetReserved: withInset,
    srNumber: { cx: W / 2, baseline: H - margin - 3.5 },
    partyTable: { x0: left, y0: tableTop, y1: tableBottom, ...shape },
  };
}

/**
 * The sheet and layout for an orientation; anything but 'portrait' is landscape. `opts.general` selects the
 * General Plan's arrangement (always portrait), with `opts.rows` party-wall rows to carry.
 */
export function layoutFor(orientation, opts = {}) {
  const size = opts.size === 'A3' ? 'A3' : 'A4';
  if (opts.general) {
    const sheet = paper(size, 'portrait');
    return { orientation: 'portrait', size, sheet, layout: generalPortraitLayout(opts.rows ?? 0, PRINT_MARGIN_MM, sheet, opts.withInset !== false) };
  }
  if (orientation === 'portrait') {
    const sheet = paper(size, 'portrait');
    return { orientation: 'portrait', size, sheet, layout: portraitLayout(PRINT_MARGIN_MM, sheet) };
  }
  const sheet = paper(size, 'landscape');
  return { orientation: 'landscape', size, sheet, layout: landscapeLayout(PRINT_MARGIN_MM, sheet) };
}

export const LAYOUT = landscapeLayout();

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
 * The scale a working plan is DRAWN at unless the ground will not fit on it.
 *
 * The Surveyor General accepts a working plan at 1:2500 in place of a separate
 * compilation plot, so 1:2500 is the scale that discharges the requirement: a
 * sheet at this scale needs no second plot, and a sheet at anything finer does.
 * That makes it a FLOOR on the automatic choice, not a rung to pass through --
 * fitting the figure as large as it will go put a typical stand at 1:1000 or
 * 1:1500, each of which leaves the surveyor still owing a compilation plot.
 *
 * The scale moves off 1:2500 in one direction only: when the ground will not fit
 * the panel, it steps coarser through the prescribed ladder as it always did. A
 * small figure at 1:2500 is not treated as a failure -- this A4 panel carries
 * about 330 m of ground at 1:2500 once the breathing room below is allowed
 * for, so even a modest stand draws as a legible field plan, and the
 * crowded-beacon and inset machinery is there for the ones that are not.
 */
const PREFERRED_SCALE = 2500;

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

/** The most crosses the outside-the-figure pass draws: a framework, not a mesh over the whole sheet. */
const MAX_OUTSIDE_TICKS = 8;

/**
 * Where those ticks have to be: one in each corner region of the FIGURE -- top
 * left and right, bottom left and right.
 *
 * Four ticks bunched down one side satisfy a count and help nobody. A reader
 * interpolates a position by working from the ticks that bracket it, so the
 * framework has to surround the drawing, not sit beside it.
 */
const GRID_QUADRANTS = ['LT', 'RT', 'LB', 'RB'];

/** What a grid figure's width is estimated from, as a multiple of the text height a character. 0.63 ran a
 *  millimetre or two short of Arial's capitals and digits, so two crosses' figures that measured as touching
 *  were drawn over each other; this leaves them clear. */
const GRID_CHAR_EM = 0.63;

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

/** The finest lattice the outside-the-figure pass will try, in paper millimetres. */
const MIN_TICK_SPACING_OUTSIDE_MM = 8;

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
 * @param {Array}  [spec.contiguous] [{ from, to, end:'from'|'to'|'both'|'mid' }] abutting neighbours
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

/**
 * The point of a polygon farthest from every edge, to a few metres: where a long label has the most room. An
 * L-shaped outside figure has its centroid on or near an edge, which is not a place to letter anything.
 */
/**
 * Where a multi-line label lies wholly inside a polygon with the most room round it.
 * Tries the widest wrapping first (fewest lines); a wrapping that fits with `margin` to spare wins, else the
 * wrapping and place with the greatest clearance. `hits` (optional) vetoes a place that lies on something else.
 * Returns {lines, x, y}: the centre of the block of lines in the polygon's own units.
 */
export function fitLabelInPolygon(pts, wrapAt, textH, hits = () => false, margin = textH * 0.6) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if ((pts[i][1] > y) !== (pts[j][1] > y)
        && x < ((pts[j][0] - pts[i][0]) * (y - pts[i][1])) / (pts[j][1] - pts[i][1]) + pts[i][0]) c = !c;
    }
    return c;
  };
  const edgeDist = (x, y) => {
    let m = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ux = b[0] - a[0], uy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ux + (y - a[1]) * uy) / (ux * ux + uy * uy || 1)));
      m = Math.min(m, Math.hypot(x - (a[0] + ux * t), y - (a[1] + uy * t)));
    }
    return m;
  };
  let best = null;
  const N = 56;
  for (const W of [34, 28, 22, 18, 14, 11]) {
    const lines = wrapAt(W);
    // 0.72 an em a character: capitals and the bold heading run wider than the 0.63 the label placer uses,
    // and a block that fits by the smaller figure touches the beacon name beside it.
    const w = 0.72 * textH * Math.max(...lines.map((l) => l.length));
    const h = textH * 1.4 * lines.length;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const cx = x0 + ((x1 - x0) * i) / N, cy = y0 + ((y1 - y0) * j) / N;
        // the block's outline sampled round its edge and in the middle: every sample must be inside, and the
        // least distance from any of them to the polygon's edge is the room it has
        let room = Infinity;
        for (const [dx, dy] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const px = cx + (dx * w) / 2, py = cy + (dy * h) / 2;
          if (!inside(px, py)) { room = -1; break; }
          room = Math.min(room, edgeDist(px, py));
        }
        if (room < 0) continue;
        if (hits([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2])) continue;
        if (!best || room > best.room) best = { room, lines, x: cx, y: cy };
      }
    }
    if (best && best.room >= margin) break;           // fits comfortably at this wrapping: take it
  }
  if (!best) { const [x, y] = roomiestPoint(pts); return { lines: wrapAt(30), x, y }; }
  return { lines: best.lines, x: best.x, y: best.y };
}

export function roomiestPoint(pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if ((pts[i][1] > y) !== (pts[j][1] > y)
        && x < ((pts[j][0] - pts[i][0]) * (y - pts[i][1])) / (pts[j][1] - pts[i][1]) + pts[i][0]) c = !c;
    }
    return c;
  };
  const edgeDist = (x, y) => {
    let m = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ux = b[0] - a[0], uy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ux + (y - a[1]) * uy) / (ux * ux + uy * uy || 1)));
      m = Math.min(m, Math.hypot(x - (a[0] + ux * t), y - (a[1] + uy * t)));
    }
    return m;
  };
  let best = [(x0 + x1) / 2, (y0 + y1) / 2], bestD = -1;
  const N = 40;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x = x0 + ((x1 - x0) * i) / N, y = y0 + ((y1 - y0) * j) / N;
      if (!inside(x, y)) continue;
      const dist = edgeDist(x, y);
      if (dist > bestD) { bestD = dist; best = [x, y]; }
    }
  }
  return best;
}

/** A label broken at its ", " into lines of about `max` characters; a line is never broken inside a name. */
export function wrapAtCommas(text, max) {
  const parts = String(text).split(/,\s*/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const [i, part] of parts.entries()) {
    const piece = part + (i < parts.length - 1 ? ',' : '');
    if (cur && (cur + ' ' + piece).length > max) { lines.push(cur); cur = piece; }
    else cur = cur ? cur + ' ' + piece : piece;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [String(text)];
}

/**
 * One drawing of the sheet. A General Plan with no locality inset is laid out without the inset's room; if the
 * sheet then turns out to need an inset after all (a crowded mark, a far control point), it is drawn again with
 * the room kept (renderWorkingPlan, below).
 */
function renderOnce(spec) {
  // A General Plan's working plan draws the outside figure and a party-wall table; a diagrams-only survey's
  // draws its stands. `spec.kind` says which; absent means the stands (the original sheet).
  const general = spec.kind === 'general';
  const partyRows = general ? (spec.partyWalls ?? []) : [];
  const { orientation, size, sheet, layout: L } = layoutFor(spec.orientation, { size: spec.sheetSize, ...(general ? { general: true, rows: partyRows.length, withInset: !!spec.inset || !!spec.reserveInset } : {}) });
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
  const bbAll = {
    e0: Math.min(...all.map((p) => p[0])), e1: Math.max(...all.map((p) => p[0])),
    n0: Math.min(...all.map((p) => p[1])), n1: Math.max(...all.map((p) => p[1])),
  };

  /* ---- scale */
  const panelW = L.panel.x1 - L.panel.x0;
  const panelH = L.panel.y1 - L.panel.y0;
  const scaleIndex = (s) => STANDARD_SCALES.indexOf(s);
  const pickScale = (b) => {
    const need = Math.max((b.e1 - b.e0) / panelW, (b.n1 - b.n0) / panelH)
      * 1000 * FIGURE_BREATHING;
    const fit = STANDARD_SCALES.find((s) => s >= need) ?? STANDARD_SCALES.at(-1);
    // The finest scale the figure fits at, but never finer than the one that
    // discharges the compilation-plot requirement. 1:2500 is itself prescribed,
    // so the floor can only ever return a rung the regulation offers.
    return Math.max(fit, PREFERRED_SCALE);
  };

  /* ---- the divided figure: a far mark must not shrink the survey.
   *
   * The extent covers every beacon -- "if that means the next scale up, that is
   * the honest answer" -- but one far reference mark can push a whole sheet a
   * prescribed scale coarser than its survey needs, and then the STANDS shrink
   * to serve a mark a corner reads once. The divided figure pays both bills:
   * the main figure is drawn for the ground it actually measures, and the
   * outlying marks are carried by the locality map, which draws the survey's
   * footprint with them, to a scale that fits the pair together. The sheet
   * still draws every mark -- nothing is lost -- and the measured survey is
   * drawn as large as it deserves.
   *
   * One boundary rule, taken from the renderer's own corner: a beacon a parcel
   * ring (or the remainder ring) is built from NEVER moves. Its position is a
   * corner of the figure, and removing the corner leaves a boundary that does
   * not close. Only marks the geometry does not stand on -- a far reference
   * mark, a base point, a station strung out past the plot -- are eligible.
   *
   * Splitting is the SCALE GAP: it happens only when leaving the outlier in the
   * figure's extent forces the figure at least one prescribed scale coarser
   * than the survey alone needs, and only when the scale is AUTO. An explicit
   * scale is the surveyor's own instruction for the whole sheet; reorganising
   * it under them is not forgiveness, it is surprise.
   */
  const holdNames = new Set([
    ...(spec.parcels ?? []).flatMap((p) => p.ring ?? []),
    ...(spec.remainderRing ?? []).filter((n) => byName.has(n)),
  ]);

  let bb = bbAll;
  let scale = spec.scale;
  /** Beacons the MAIN figure gives up to the locality map (the marks it maps
   *  beside the survey's footprint, out of range of any figure scale). Empty on
   *  an ordinary sheet, so nothing is reserved or skipped. */
  const extensionNames = new Set();
  if (scale === 'auto' || scale == null) {
    const scaleAll = pickScale(bbAll);
    let bbMain = bbAll, scaleMain = scaleAll, remote = [];
    if (holdNames.size > 0) {
      // The survey's own ground: the ring vertices, padded by up to a tenth of
      // its size but never more than 150 m, never less than 30 m. A reference
      // mark inside that band is part of the survey's fabric and stays on the
      // figure; one beyond it is the outlier the merged map exists for.
      const ringPts = [...holdNames].map((n) => byName.get(n)).filter(Boolean);
      const re0 = Math.min(...ringPts.map((p) => p.e)),
        re1 = Math.max(...ringPts.map((p) => p.e)),
        rn0 = Math.min(...ringPts.map((p) => p.n)),
        rn1 = Math.max(...ringPts.map((p) => p.n));
      const pad = Math.min(150, Math.max(30,
        Math.max(re1 - re0, rn1 - rn0) * 0.10));
      const withinPad = (e, n) => e >= re0 - pad && e <= re1 + pad
        && n >= rn0 - pad && n <= rn1 + pad;
      const mainNames = [...byName.values()]
        .filter((b) => holdNames.has(b.name) || withinPad(b.e, b.n));
      const mainPts = mainNames.map((b) => [b.e, b.n]).concat(extraPts);
      bbMain = {
        e0: Math.min(...mainPts.map((p) => p[0])),
        e1: Math.max(...mainPts.map((p) => p[0])),
        n0: Math.min(...mainPts.map((p) => p[1])),
        n1: Math.max(...mainPts.map((p) => p[1])),
      };
      scaleMain = pickScale(bbMain);
      remote = [...byName.values()]
        .filter((b) => !holdNames.has(b.name) && !withinPad(b.e, b.n));
    }
    if (remote.length > 0 && scaleIndex(scaleMain) < scaleIndex(scaleAll)) {
      // The split is decided for the outlier that costs the scale, not for every mark beyond the band: a
      // mark that fits the figure at the scale the survey needs stays on it (OF2 and the SL marks of Scenic,
      // a couple of hundred metres out on a sheet with room to spare, were set aside with DB, 700 m away,
      // and sent to a map of their own for no reason). The nearest are tried first and each is kept while
      // the figure still draws at the main scale with it.
      const gapTo = (b) => Math.hypot(
        Math.max(bbMain.e0 - b.e, 0, b.e - bbMain.e1), Math.max(bbMain.n0 - b.n, 0, b.n - bbMain.n1));
      let bbKept = bbMain;
      for (const b of [...remote].sort((p, q) => gapTo(p) - gapTo(q))) {
        const grown = {
          e0: Math.min(bbKept.e0, b.e), e1: Math.max(bbKept.e1, b.e),
          n0: Math.min(bbKept.n0, b.n), n1: Math.max(bbKept.n1, b.n),
        };
        if (pickScale(grown) === scaleMain) bbKept = grown;
        else extensionNames.add(b.name);
      }
      bb = bbKept;
      scale = scaleMain;
    } else {
      scale = scaleAll;
    }
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
const crowded = crowdedClusters(
    [...byName.values()].filter((b) => !extensionNames.has(b.name)),
    (b) => mm(symbolClearance(b.symbol)),
  );
  const ringBeacons = new Set((spec.parcels ?? []).flatMap((p) => p.ring ?? []));
  const insetOnly = new Set(
    crowded.flat()
      .filter((b) => b.symbol === 'foundNotAdopted' && !ringBeacons.has(b.name))
      .map((b) => b.name),
  );
  /** Beacons the figure itself draws. The marks the divided figure sets aside
   *  are drawn in the locality map, later; the main figure neither draws nor
   *  labels them. */
  const figureBeacons = () => [...byName.values()].filter((b) =>
    !insetOnly.has(b.name) && !extensionNames.has(b.name));
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
  // A working plan is monochrome: every layer is colour 7 (black on paper), so its lines, symbols and fills
  // print black as its lettering does (see dxf-r12.js text). The layer table's own colours (LAYERS) are kept
  // as the working plan's palette for a coloured review copy, but not written to the sheet.
  for (const [n, , lt] of LAYERS) doc.addLayer(n, 7, lt, L.lineweight);
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

  /** The meridian arrow -- the surveyor's template north arrow (a true-north
   *  line, a leaning grid-north line ending in a barb) with its T and N either
   *  side of the line -- drawn at whatever size is asked for. One symbol, used
   *  twice: the sheet carries it full size and the inset carries the same arrow
   *  small, rather than a second symbol that could drift from it. The letters'
   *  offset is taken from the arrow's own geometry, so they scale with it.
   *
   *  The template's construction (NORTH_ARROW_TEMPLATE, shared with the diagram
   *  renderers) is stretched so its true-north line spans exactly what the
   *  shaft of the old arrow did, from `north` above the centre to `south`
   *  below it; `k` scales the whole symbol. */
  const drawNorthArrow = (cx, cy, k, letterMm) => {
    const na = L.northArrow;
    const T = NORTH_ARROW_TEMPLATE;
    const f = (na.north + na.south) / T.trueNorth[1][1];
    const apexY = cy - na.north * k;
    const at = ([dx, dy]) => S(cx + dx * f * k, apexY + dy * f * k);
    for (const [a, b] of [T.trueNorth, T.gridNorth, T.barb]) {
      d.polyline([at(a), at(b)], { layer: 'NORTH-ARROW' });
    }
    // The letters sit at a fixed height on the sheet; expressed as an offset
    // from the arrow's own centre they travel with it at any size.
    // (refCy: the measured arrow's own centre, which the letters' height is measured from; a layout that
    // moves the arrow moves cy, not this.)
    const dy = (na.letters.baseline - (na.refCy ?? na.cy)) * k;
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

  // A multi-sheet General Plan's cut(s): the line that divides the outside figure between its sheets, as ground
  // polylines. They are lines on the sheet like any boundary, so labels and grid crosses keep off them.
  const splitLines = (spec.splitLines ?? [])
    .map((pl) => (pl ?? []).map((p) => { const g = loToGround(p); return [g.e, g.n]; }))
    .filter((pl) => pl.length >= 2);
  const segments = [
    ...spec.parcels.flatMap((p) => p.ring.map((n, i) => [
      [G(n).e, G(n).n],
      [G(p.ring[(i + 1) % p.ring.length]).e, G(p.ring[(i + 1) % p.ring.length]).n]])),
    ...splitLines.flatMap((pl) => pl.slice(1).map((q, i) => [pl[i], q])),
  ];

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

  /** How far below its centre a control-point sign reaches, in paper mm. The
   *  trig triangle's flat BASE hangs below; the official control point, drawn
   *  inverted, points down. The monument name letters clear whichever part it
   *  is before the label sits under the symbol. */
  const symbolDownreach = (symbol) => {
    const S = L.symbol;
    if (symbol === 'ocp') return S.trigH * 0.62;
    return S.trigH * 0.38;                       // trig
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

  /** A control point's monument NAME -- "Mnyami" under trig beacon 170/P --
   *  lettered centred below its own symbol. Reserved with the first rank of
   *  labels so the designation, the grid ticks and every other label work
   *  around it; drawn once the beacon itself is on the sheet. Only control
   *  points carry one: it is the registry name of the mark, not commentary. */
  const underName = new Map();
  for (const b of figureBeacons()) {
    if (!b.cpName) continue;
    const down = mm(symbolDownreach(b.symbol)) + mm(0.6) + h;
    const at = [b.e, b.n - down];
    underName.set(b.name, at);
    occupied.push(textRect(b.cpName, at[0], at[1], h, 'center'));
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
    let [cx, cy] = p.labelAt ? Object.values(loToGround(p.labelAt)) : (general ? roomiestPoint(pts) : centroid(pts));
    // The stand number is reserved so beacon names and grid ticks keep off it.
    // It was written blind before, and anything placed later could sit on it.
    // The General Plan's one label names every stand the outside figure holds ("STANDS 1294 - 1421, 1423, ...")
    // and runs to dozens of characters, so it is set smaller and broken at its commas into short lines.
    const ph = mm(general ? 2.8 : L.text.parcel);
    let lines = general ? wrapAtCommas(p.label, 30) : [p.label];
    if (general && !p.labelAt) {
      // The label is as long as the stands it names, so it is fitted to the figure: the widest wrapping that
      // lies wholly inside the outline with daylight round it, at the place with the most room. Broken into
      // more, shorter lines only as far as that takes.
      const fit = fitLabelInPolygon(pts, (W) => wrapAtCommas(p.label, W), ph, hits);
      lines = fit.lines; cx = fit.x; cy = fit.y;
    }
    // A plan of several sheets letters each part of the figure with ITS sheet number and ITS stands instead
    // (below); the one label naming every stand is then not drawn.
    const sheeted = general && (spec.sheets ?? []).length > 1;
    const top = cy - ph / 2 + ((lines.length - 1) * ph * 1.4) / 2;   // the block is centred on the figure
    if (!sheeted) lines.forEach((line, i) => {
      const y = top - i * ph * 1.4;
      occupied.push(general ? [cx - (0.72 * ph * line.length) / 2, y - ph * 0.15, cx + (0.72 * ph * line.length) / 2, y + ph] : textRect(line, cx, y, ph, 'center'));
      d.text(line, [cx, y], ph, { layer: 'PARCEL-TEXT', style: 'ARIAL', align: 'center' });
    });
  }

  /* ---- a multi-sheet General Plan: the split line, and each sheet's number and stands.
   * The cut that divides the outside figure is drawn solid in black (the figure's own layer) through the points it passes (clipped
   * clear of the beacon signs on it, like a boundary), and each part carries "SHEET n" over the stand
   * numbers on that sheet, fitted inside that part. */
  if (general && (spec.sheets ?? []).length > 1) {
    const nameAt = (p) => [...byName.values()].find((b) => Math.hypot(b.e - p[0], b.n - p[1]) < 0.5)?.name;
    for (const pl of splitLines) {
      for (let i = 0; i + 1 < pl.length; i++) {
        const na = nameAt(pl[i]), nb = nameAt(pl[i + 1]);
        if (na && nb) drawBoundary(pl[i], pl[i + 1], na, nb, 'BOUNDARY-NEW');
        else d.line(pl[i], pl[i + 1], { layer: 'BOUNDARY-NEW' });
      }
    }
    const ph = mm(2.8);
    for (const sh of spec.sheets) {
      const poly = (sh.polygon ?? []).map((q) => { const g = loToGround(q); return [g.e, g.n]; });
      if (poly.length < 3) continue;
      const head = `SHEET ${sh.number}`;
      const fit = fitLabelInPolygon(poly, (W) => [head, ...wrapAtCommas(sh.stands, W)], ph, hits);
      const top = fit.y - ph / 2 + ((fit.lines.length - 1) * ph * 1.4) / 2;
      fit.lines.forEach((line, i) => {
        const y = top - i * ph * 1.4;
        // reserved at the width it is set (0.72 an em), so a beacon name placed later keeps clear of it
        const wr = 0.72 * ph * line.length;
        occupied.push([fit.x - wr / 2, y - ph * 0.15, fit.x + wr / 2, y + ph]);
        d.text(line, [fit.x, y], ph, { layer: 'PARCEL-TEXT', style: i === 0 ? 'ARIAL-BOLD' : 'ARIAL', align: 'center' });
      });
    }
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

  /* The outside figure, for keeping the grid off it: the stands' rings and the remaining extent's, as ground
   * polygons. A point is "in the figure" when any of them holds it. */
  const figureRings = [...(spec.parcels ?? []).map((p) => p.ring ?? []), spec.remainderRing ?? []]
    .map((r) => r.filter((n) => byName.has(n)).map((n) => [G(n).e, G(n).n]))
    .filter((r) => r.length >= 3);
  const inFigure = (e, n) => figureRings.some((poly) => pointInPolygon([e, n], poly));
  /** A cross's figures reach over the drawing: true when any corner or the middle of their rectangle does. */
  const rectTouchesFigure = (r) => inFigure((r[0] + r[2]) / 2, (r[1] + r[3]) / 2)
    || [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]].some(([e, n]) => inFigure(e, n));

  /* The paper a cross may use when it stays OUTSIDE the figure: the panel and the margin round it, up to the neat
   * line, but never the blocks the sheet keeps for something else. A figure that fills its panel leaves almost
   * nothing outside it within the panel, and four crosses need room round the drawing, not inside it. */
  const blockRect = (x0, y0, x1, y1) => {
    const a = S(x0, y0), b = S(x1, y1);
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  };
  const bd = L.border;
  const roomBox = blockRect(bd.x0 + 4, bd.y0 + 4, bd.x1 - 4, bd.y1 - 4);
  const na0 = L.northArrow;
  const blocks = [
    blockRect(L.approval.box.x0 - 1, L.approval.box.y0 - 1, L.approval.box.x1 + 1, L.approval.box.y1 + 1),
    ...(L.insetReserved === false ? [] : [blockRect(L.inset.box.x0 - 1, L.inset.box.y0 - 1, L.inset.box.x1 + 1, L.inset.box.y1 + 1)]),
    blockRect(na0.cx - 9, na0.cy - 14, na0.cx + 9, na0.cy + na0.south * na0.mainScale + 6),
    blockRect(L.certificate.line1.x - 1, L.certificate.line1.baseline - 6, L.certificate.line1.x + 80, L.certificate.line1.baseline + 2),
    blockRect(L.certificate.line2.x - 1, L.certificate.line2.baseline - 6, L.certificate.line2.x + 60, L.certificate.line2.baseline + 2),
    blockRect(L.srNumber.cx - 45, L.srNumber.baseline - 6, L.srNumber.cx + 45, L.srNumber.baseline + 2),
    ...(L.partyTable ? [blockRect(L.partyTable.x0 - 1, L.partyTable.y0 - 1,
      L.partyTable.x0 + L.partyTable.blocks * 45 + 1, L.partyTable.y1 + 1)] : []),
  ];
  const withinRoom = (r) => r[0] >= roomBox[0] && r[2] <= roomBox[2] && r[1] >= roomBox[1] && r[3] <= roomBox[3]
    && !blocks.some((o) => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]);

  /** Which corner of the figure a tick falls in. */
  const quadrantOf = (e, n) => `${e < figCx ? 'L' : 'R'}${n < figCy ? 'B' : 'T'}`;

  /** A cross's figure geometry: where its X and Y labels sit, and the rectangle
   *  the pair actually occupy. Shared by the lattice walk below and by the
   *  fallback that guarantees a cross when the figure leaves the walk nothing,
   *  so the two can never disagree about what a readable cross needs. */
  // "X = +2247850" measured on a rendered plan: 21.5 mm of text beyond its 4.45 mm offset. The estimate had been
  // 1 mm short, which let a road name be set over the end of a figure.
  const gw = mm(L.gridLabel.xDx + 22);
  const drop = mm(L.gridLabel.yStartDy + 12);
  const near = arm + mm(2);
  const labH = mm(L.text.grid);
  const yLabelReach = (e) => GRID_CHAR_EM * labH * `Y = ${(-e).toFixed(0)}`.length;
  const guard = (e, n, side) => {
    const flipX = side.startsWith('left') ? -1 : 1;
    const gx = flipX > 0 ? e + gw : e - gw;
    const yLx = e + flipX * mm(L.gridLabel.yDx);
    // 'Up': the northing figure reads down INTO the cross from above it, so a cross can stand just above a
    // figure instead of needing the room below it. Its box runs from the cross up to the figure's far end.
    if (side.endsWith('Up')) {
      return [
        Math.min(e - near, gx, yLx),
        n - near,
        Math.max(e + near, gx, yLx + labH),
        n + mm(L.gridLabel.yStartDy) + yLabelReach(e),
      ];
    }
    const yLy = n - mm(L.gridLabel.yStartDy);
    return [
      Math.min(e - near, gx, yLx),
      Math.min(n - drop, yLy - yLabelReach(e)),
      Math.max(e + near, gx, yLx + labH),
      n + near,
    ];
  };

  /** Where an interval's ticks would go. Reads `occupied` but never adds to it,
   *  so an interval can be tried and abandoned; only the chosen one is drawn. */
  const layGrid = (gi, gap = 2.5, outsideOnly = true) => {
    const out = [];
    // Two crosses' figures are kept a couple of millimetres apart: the width above is an estimate, and
    // an estimate that ends exactly where the next figure begins prints one over the other.
    const apart = mm(gap);
    const clashes = (r) => hits(r) || out.some(({ rect: o }) =>
      r[0] < o[2] + apart && r[2] > o[0] - apart && r[1] < o[3] && r[3] > o[1]);
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
    // (The outside-only pass is capped at MAX_OUTSIDE_TICKS below: a figure with a great deal of paper round it
    // would otherwise fill the sheet with crosses.)
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

    /** The cross a node earns: clear of the BOUNDARIES by the full reading
     *  margin, and able to letter its figures. Null when it is not.
     *
     *  A cross carries its figures on one side -- reading them down and to the
     *  right is the convention, and the mirrored side is tried before the cross
     *  is given up; flipping a label costs nothing, losing a tick costs the
     *  reader a reference. */
    const crossAt = (e, n) => {
      // Never inside the outside figure: a coordinate mark belongs around the drawing, where it brackets
      // the ground, not over the stands it is meant to reference.
      if (outsideOnly && inFigure(e, n)) return null;
      // Clear of the BOUNDARIES by enough that the cross reads as a cross and
      // not as part of the figure -- but no more. A coordinate grid is drawn
      // ACROSS a plan, not squeezed into the gaps around it; at 7 mm the
      // crosses could not enter the figure at all, so on a sheet whose upper
      // half is full of boundaries they all fell to the open ground along the
      // bottom.
      if (!segments.every((s) => distToSegment([e, n], s[0], s[1]) > mm(GRID_LINE_CLEARANCE_MM))) return null;
      for (const s of ['rightDown', 'leftDown', 'rightUp', 'leftUp']) {
        const r = guard(e, n, s);
        if (outsideOnly ? (withinRoom(r) && !clashes(r) && !rectTouchesFigure(r)) : (insidePanel(r) && !clashes(r))) return { rect: r, side: s };
      }
      return null;
    };

    for (const [e, n] of lattice) {
      if (outsideOnly && out.length >= MAX_OUTSIDE_TICKS) break;
      const c = crossAt(e, n);
      if (c) out.push({ e, n, rect: c.rect, side: c.side });
    }
    return out;
  };

  /** A single cross as the last resort a dense survey leaves. The walk above
   *  holds every tick a full 7 mm clear of the boundaries it references; on a
   *  figure that reaches the edge of its panel there may be NO node with that
   *  room -- each candidate sits inside the drawing it is meant to reference,
   *  and the sheet drew no coordinate framework at all, silently.
   *
   *  A cross read close to the drawing beats a sheet a reader cannot place on
   *  the ground, so the most open node whose figures still fit the panel is
   *  drawn instead of none. The first pass keeps the figures clear of every
   *  sign, label and title already placed; where no node clears them all, the
   *  second takes the least damage instead. */
  const fallbackGridTick = (gi) => {
    const nodes = [];
    for (let e = Math.ceil(pe0 / gi) * gi; e <= pe1; e += gi) {
      for (let n = Math.ceil(pn0 / gi) * gi; n <= pn1; n += gi) nodes.push([e, n]);
    }
    const clear = (e, n) => Math.min(...segments.map((s) => distToSegment([e, n], s[0], s[1])));
    const cornerD = (e, n) => Math.min(
      Math.hypot(e - bb.e0, n - bb.n0), Math.hypot(e - bb.e0, n - bb.n1),
      Math.hypot(e - bb.e1, n - bb.n0), Math.hypot(e - bb.e1, n - bb.n1));
    for (const allowOverlap of [false, true]) {
      let best = null;
      let bestScore = null;
      for (const [e, n] of nodes) {
        for (const side of ['rightDown', 'leftDown']) {
          const rect = guard(e, n, side);
          if (!insidePanel(rect)) continue;
          if (!allowOverlap && hits(rect)) continue;
          const c = clear(e, n);
          const score = allowOverlap
            ? [-penalty(rect), c]                      // least damage, most room
            : [c, -cornerD(e, n)];                     // most room, nearest a corner
          const beats = !bestScore || score[0] > bestScore[0]
            || (score[0] === bestScore[0] && score[1] > bestScore[1]);
          if (beats) { best = { e, n, rect, side }; bestScore = score; }
        }
      }
      if (best) return best;
    }
    return null;
  };

  // An explicit interval is honoured as given. Otherwise: start at the spacing
  // the scale suggests and step FINER until four ticks survive the figure --
  // more candidates, not a weaker clearance, so no tick is ever drawn over the
  // drawing it is meant to reference. The best attempt is kept, so a crowded
  // sheet still gets the most ticks it can hold rather than the fewest.
  const findTicks = (outsideOnly) => {
  let gi = spec.gridInterval;
  let ticks;
  if (gi) {
    ticks = layGrid(gi, 2.5, outsideOnly);
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
      // The outside pass may go finer (a figure with little paper round it needs more nodes to find four that
      // stand clear); it still draws only a handful of crosses, so a finer lattice does not crowd the sheet.
      if ((cand / scale) * 1000 < (outsideOnly ? MIN_TICK_SPACING_OUTSIDE_MM : MIN_TICK_SPACING_MM)) break;
      // Figures kept clear of each other first; a dense sheet that cannot find its four crosses that way
      // takes the ones that touch rather than lose a reference.
      let t = layGrid(cand, 2.5, outsideOnly);
      if (t.length < MIN_GRID_TICKS) {
        const tight = layGrid(cand, 0, outsideOnly);
        if (tight.length > t.length) t = tight;
      }
      if (!best || better(t, best.ticks)) best = { gi: cand, ticks: t };
      if (satisfies(t) && t.length >= MIN_GRID_TICKS) break;
    }
    ({ gi, ticks } = best ?? { gi: pick(), ticks: [] });
  }
  return { gi, ticks };
  };

  // The ticks stand OUTSIDE the figure. A figure that fills its panel leaves too little paper around it for four
  // of them, and a sheet with fewer than four has no framework a reader can interpolate from. So the outside
  // ones are taken first and are never given up; only a shortfall is made up, from the search that ignores the
  // figure (it steps to finer intervals until it finds enough), nearest the figure's outline first, and only
  // until there are four.
  let { gi, ticks } = findTicks(true);
  if (ticks.length < MIN_GRID_TICKS) {
    const relaxed = findTicks(false);
    const have = new Set(ticks.map((t) => `${t.e}|${t.n}`));
    const extra = relaxed.ticks.filter((t) => !have.has(`${t.e}|${t.n}`));
    const edgeD = (t) => Math.min(...segments.map((sg) => distToSegment([t.e, t.n], sg[0], sg[1])));
    extra.sort((p, q) => edgeD(p) - edgeD(q));
    const apart = mm(2.5);
    for (const t of extra) {
      if (ticks.length >= MIN_GRID_TICKS) break;
      const clash = ticks.some(({ rect: o }) => t.rect[0] < o[2] + apart && t.rect[2] > o[0] - apart && t.rect[1] < o[3] && t.rect[3] > o[1]);
      if (!clash) ticks.push(t);
    }
    if (ticks.length === 0) gi = relaxed.gi;
  }

  // A figure that leaves the lattice NO cross at all must keep its framework:
  // the walk refuses every node that cannot hold its figures clear of the
  // lines and ground it references, and when the drawing covers the panel no
  // node qualifies -- so the most open node is drawn instead of none.
  if (ticks.length === 0) {
    const rescue = fallbackGridTick(gi);
    if (rescue) ticks = [rescue];
  }

  const gridInterval = { e: gi, n: gi };
  const placed = ticks.length;
  const gh = mm(L.text.grid);
  // One labelled coordinate cross: the main grid's ticks and every scaled inset's tick are drawn by this.
  // (e, n) is the cross's place in drawing units; X and Y are the figures it is lettered with (the
  // survey's own, X = -n and Y = -e on the ground); `side` is the quadrant its figures read into.
  const drawGridTick = (e, n, Xlo, Ylo, side) => {
    d.line([e - arm, n], [e + arm, n], { layer: 'GRID' });
    d.line([e, n - arm], [e, n + arm], { layer: 'GRID' });
    // Mirrored about the cross into whichever quadrant had room: the same
    // offsets reflected, with the easting set right-aligned when it reads
    // leftward so it still ends at the cross rather than starting there.
    const flipX = side.startsWith('left') ? -1 : 1;
    const flipY = side.endsWith('Up') ? -1 : 1;
    d.text(`X = ${Xlo >= 0 ? '+' : ''}${Xlo.toFixed(0)}`,
      [e + flipX * mm(L.gridLabel.xDx), n - mm(L.gridLabel.xBaselineDy)], gh,
      { layer: 'GRID-TEXT', style: 'ARIAL', ...(flipX < 0 ? { align: 'right' } : {}) });
    // The northing reads up the sheet; sent the other way it starts above the
    // cross instead of below it, so its run is measured from the far end.
    const yStart = flipY > 0
      ? n - mm(L.gridLabel.yStartDy)
      : n + mm(L.gridLabel.yStartDy) + GRID_CHAR_EM * gh * `Y = ${Ylo.toFixed(0)}`.length;
    d.text(`Y = ${Ylo.toFixed(0)}`,
      [e + flipX * mm(L.gridLabel.yDx), yStart], gh,
      { layer: 'GRID-TEXT', style: 'ARIAL', rotation: -90 });
  };
  for (const { e, n, rect, side } of ticks) {
    occupied.push(rect);
    drawGridTick(e, n, -n, -e, side);
  }
  // Ticks drawn in insets, by inset number: every scaled inset carries one.
  const insetTicks = {};
  const TICK_GEOMETRY = {
    arm: L.symbol.gridArm / 2 + 1,   // paper mm, like the rest of the geometry
    labelW: L.gridLabel.xDx + 22,   // "X = +2176760" measured in the rendered plan: 21.5 mm from its offset
    drop: L.gridLabel.yStartDy + 0.63 * L.text.grid * 13,   // the Y figure runs this far below the cross
  };


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
    // Each stub keeps the direction of the figure's own adjacent side, not the perpendicular to the side it abuts.
    const names = host.filter((n) => byName.has(n));
    const nn = names.length, iA = names.indexOf(c.from), iB = names.indexOf(c.to);
    const at = (k) => { const g = G(names[((k % nn) + nn) % nn]); return [g.e, g.n]; };
    let advA = null, advB = null;
    if (iA >= 0 && iB >= 0) {
      if ((iA + 1) % nn === iB) { advA = at(iA - 1); advB = at(iB + 1); }
      else if ((iB + 1) % nn === iA) { advA = at(iA + 1); advB = at(iB - 1); }
    }
    if (marks.stubFrom) stub(A, continuedStubTip(A, advA, st[3]), a.symbol);
    if (marks.stubTo) stub(B, continuedStubTip(B, advB, st[2]), b.symbol);
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

    // Default to the side away from the surveyed figure. A signed offset names a
    // specific bank -- +ve LEFT of from->to, -ve right -- and a surveyor's
    // labourers flatten roads onto whatever side they actually are, so a sign
    // is honoured as given and never overridden by where the figure sits.
    let base = mm(Math.abs(rd.offset ?? 3));
    if (rd.offset != null) base = Math.sign(rd.offset) * Math.abs(base);
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
    // out and how far ALONG it runs. It never changes bank: a name lettered on
    // the side it labels is read as naming THAT road, and the same name on the
    // far side reads as naming whatever lies across it -- which is a different
    // (and possibly unsurveyed) property. So candidates are stepped outward
    // from the road on the sign `base` already carries, and the search, the
    // size ladder and the last-resort fit all keep that sign.
    /** Candidates for a name of a given height, centred on the labelled side. */
    const roadTries = (hgt) => {
      const start = halfLen - (0.63 * hgt * wf * rd.name.length) / 2;
      const out = [];
      for (const outK of [1, 1.8, 2.6]) {
        // Sliding ALONG the road is the cheapest freedom a road name has: it
        // stays on its own line and simply moves away from the corner. The
        // range reaches past the side's terminals, because a long name
        // centred on a short side covers the very beacons whose numbers have
        // to sit there, and those are placed after it.
        for (const alongD of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
          const off = base * outK;
          const al = start + alongD * mm(9);
          out.push([
            sx - Math.sin(ang) * off + Math.cos(ang) * al,
            sy + Math.cos(ang) * off + Math.sin(ang) * al,
          ]);
        }
      }
      return out;
    };

    // A name that will not fit beside its line at the reading size is lettered
    // one size DOWN rather than pushed off the drawing -- which is what a
    // draughtsman does, and the only honest answer when the room is simply not
    // there. On this sheet 'M  A  I  N   R  O  A  D' is 47 mm against a 40 mm
    // side, with the figure already filling 102 of the panel's 146 mm.
    // We step down the ISO size ladder so the label shrinks to fit the road
    // space on its OWN BANK, never changing side. The floor is the smaller
    // size (1.8 mm); below that the label would be unreadable. Rungs that fall
    // under the floor in their own right are dropped, not reached: at the
    // reading size the 0.7 rung is 1.75 mm, and a label smaller than the floor
    // it ends at would only be reached on the way down to a size it cannot be.
    let chosen = null, rhUsed = rh;
    const sizes = [
      rh,
      rh * 0.9,
      rh * 0.8,
      rh * 0.7,
      mm(SMALLER_THAN_READING_MM),
    ].filter((s) => s >= mm(SMALLER_THAN_READING_MM) - 1e-9);
    for (const hgt of sizes) {
      const pick = bestOf(roadTries(hgt), (c) => rotatedRect(rd.name, c[0], c[1], hgt, ang, wf));
      chosen = pick; rhUsed = hgt;
      // The reading size is kept the moment it finds CLEAR ground -- being on
      // the panel is not enough, since the room beside a road is exactly what a
      // long name runs out of. We continue shrinking until we hit clear ground
      // or the floor, so the name stays on its own side at the largest size
      // that actually fits.
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
      // The pan back onto the sheet may not carry the name across its own
      // road: a label overhanging a margin by a millimetre is an honest
      // overflow of a name too long for its side, but the same name on the
      // far bank is lettered against the wrong property. Keep the pan only
      // when the centre it produces is still on the side `base` names.
      const cx = (rect[0] + rect[2]) / 2 + dx;
      const cy = (rect[1] + rect[3]) / 2 + dy;
      const cross = Math.cos(ang) * (cy - a.n) - Math.sin(ang) * (cx - a.e);
      const onOwnSide = base === 0 || cross * Math.sign(base) >= 0;
      if (onOwnSide) {
        ax += dx; ay += dy;
        rect = [rect[0] + dx, rect[1] + dy, rect[2] + dx, rect[3] + dy];
      }
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


  /* ---- abutting properties
   *
   * A found or placed beacon states which properties abut it. They are read off the drawing itself: the
   * parcels (and the remainder) whose ring the beacon is on, each with the true bearing from the beacon
   * toward the parcel's middle. A beacon on no drawn ring (88X2 of Brackenhurst stands off the figure, a
   * mark of the neighbouring stand 88) names its stand by its own name: the leading digits of a beacon
   * name are the stand it belongs to. Reference marks and control points abut nothing and say nothing.
   */
  const ABUT_SYMBOLS = new Set(['placed', 'peg', 'found', 'foundNotAdopted', 'ws', 'wsu']);
  const abutShapes = [
    ...(spec.parcels ?? []).map((p) => ({ label: p.label, ring: p.ring ?? [] })),
    ...(spec.remainderLabel && (spec.remainderRing ?? []).length >= 3
      ? [{ label: spec.remainderLabel, ring: spec.remainderRing }] : []),
  ].map((p) => {
    const pts = p.ring.filter((n) => byName.has(n)).map((n) => [G(n).e, G(n).n]);
    return { ...p, mid: pts.length >= 3 ? centroid(pts) : null };
  });
  const onAnyRing = (name) => abutShapes.some((p) => p.ring.includes(name));
  /**
   * The parcels meeting at a beacon, each as the wedge it fills round it: the bearings of the two ring
   * sides that leave the beacon, and the label. Which of the two arcs between those bearings is the
   * parcel's own is the one the parcel's middle lies in. Empty when the beacon is on no ring, or a
   * parcel cannot say where its middle is.
   */
  const wedgesOf = (b) => {
    const TAU = Math.PI * 2;
    const norm = (a) => ((a % TAU) + TAU) % TAU;
    const out = [];
    for (const p of abutShapes) {
      const names = p.ring.filter((n, i) => !(i === p.ring.length - 1 && n === p.ring[0]));
      const i = names.indexOf(b.name);
      if (i < 0 || !p.label || !p.mid || names.length < 3) continue;
      const prev = names[(i + names.length - 1) % names.length], next = names[(i + 1) % names.length];
      if (!byName.has(prev) || !byName.has(next)) continue;
      const bearing = (n) => Math.atan2(G(n).n - b.n, G(n).e - b.e);
      const a1 = bearing(prev), a2 = bearing(next), ac = Math.atan2(p.mid[1] - b.n, p.mid[0] - b.e);
      const ccw = norm(a2 - a1);                       // the span from a1 round to a2, counter-clockwise
      const start = norm(ac - a1) <= ccw ? a1 : a2;    // the parcel's own side is the span holding its middle
      const span = norm(ac - a1) <= ccw ? ccw : TAU - ccw;
      out.push({ label: String(p.label).trim(), start, span });
    }
    return out;
  };
  /** [{ label, bearing? }] -- bearing in radians, ground axes (east 0, north +pi/2). */
  const abuttersOf = (b) => {
    const on = abutShapes.filter((p) => p.ring.includes(b.name) && p.label);
    if (on.length) {
      return on.map((p) => ({
        label: String(p.label).trim(),
        ...(p.mid ? { bearing: Math.atan2(p.mid[1] - b.n, p.mid[0] - b.e) } : {}),
      }));
    }
    // Off every ring: a splay point such as 88X2 abuts its stand (the digits of its name) and the
    // roads whose line it stands on.
    const out = [];
    const stand = /^(\d+)[A-Za-z]/.exec(b.name);
    if (stand) out.push({ label: stand[1] });
    for (const rd of spec.roads ?? []) {
      if ((rd.part ?? 'name') !== 'name' || !byName.has(rd.from) || !byName.has(rd.to)) continue;
      const p = G(rd.from), q = G(rd.to);
      const dx = q.e - p.e, dy = q.n - p.n, len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((b.e - p.e) * dx + (b.n - p.n) * dy) / len2));
      if (Math.hypot(b.e - (p.e + t * dx), b.n - (p.n + t * dy)) <= 1.0) {
        const label = String(rd.name).replace(/\s+[\d.]+\s*m$/i, '').trim();
        if (label && !out.some((o) => o.label === label)) out.push({ label });
      }
    }
    return out;
  };

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
    // rather than always on the preferred one. 24 spoke-and-step positions make
    // a coarse ring, though, and a name boxed in by other names' ground stays
    // boxed whatever the step: every position can be blocked while open ground
    // lies just outside the ring. A beacon name is small and must never
    // overwrite a fellow name, so -- when LABELS are what block it, not the
    // panel it stands beside -- it steps FARTHER out rather than accept the
    // collision; a name whose candidates are all merely off the panel's edge
    // stays where it is. Only a label so long that no offsets clear anything is
    // allowed to fall back onto the figure it belongs to.
    let chosen = bestOf(cands, (c) => textRect(b.name, b.e + c[0], b.n + c[1], h, c[2]));
    let P = chosen.choice;
    const boxedByLabels = cands.some((c) => {
      const r = textRect(b.name, b.e + c[0], b.n + c[1], h, c[2]);
      return insidePanel(r) && hits(r);
    });
    if (!chosen.clear && boxedByLabels) {
      const far = [];
      for (const k of [6, 8.6, 12, 17, 24]) for (const t of tries) far.push(place(t, k));
      chosen = bestOf(far, (c) => textRect(b.name, b.e + c[0], b.n + c[1], h, c[2]));
      P = chosen.choice;
    }
    occupied.push(chosen.rect);
    d.text(b.name, [b.e + P[0], b.n + P[1]], h,
      { layer: 'BEACON-TEXT', style: 'ARIAL', align: P[2] });

    // A found or placed beacon off every drawn ring has no neighbours lettered around it, so its
    // abutting property is lettered beside it, as a stand number is.
    if (ABUT_SYMBOLS.has(b.symbol ?? 'placed') && !onAnyRing(b.name)) {
      const text = abuttersOf(b).map((a) => a.label).filter((t) => t && t !== b.name).join(', ');
      if (text) {
        const ah = mm(L.text.adjoining);
        const spots = [];
        for (const k of [1.4, 2.0, 2.8, 3.8]) for (const t of tries) spots.push(namePlace(b, t, k));
        const at = bestOf(spots, (c) => textRect(text, b.e + c[0], b.n + c[1], ah, c[2]));
        occupied.push(at.rect);
        d.text(text, [b.e + at.choice[0], b.n + at.choice[1]], ah,
          { layer: 'PARCEL-TEXT', style: 'ARIAL', align: at.choice[2] });
      }
    }

    // The monument's own name, centred below its sign where the reservation
    // already held the ground. It is fixed -- no compass search -- because it
    // names the mark it belongs to, not a label that may sit anywhere readable.
    const under = underName.get(b.name);
    if (under) {
      d.text(b.cpName, under, h,
        { layer: 'BEACON-TEXT', style: 'ARIAL', align: 'center' });
    }
  }

  /* ---- title block */
  const th = mm(L.text.title);
  spec.title.slice(0, 4).forEach((line, i) => {
    // The first line names the document ("WORKING PLAN OF") and is set larger
    // than the lines that identify the land. Its baseline is 12.5 mm from the
    // sheet top and the glyphs grow upward, keeping clear both of the border at
    // 0.5 mm and of the next line 10 mm below.
    d.text(line, S(L.title.cx, L.title.baselines[i]), i === 0 ? th * L.text.titleLeadFactor : th,
      { layer: 'TITLE', style: 'ARIAL-BOLD', align: 'center' });
  });
  d.text(`Scale 1:${scale}`, S(L.title.cx, L.title.scaleBaseline), mm(L.text.scale),
    { layer: 'TITLE', style: 'ARIAL', align: 'center' });

  /* ---- party-wall servitude table (General Plan only) */
  if (general && L.partyTable) {
    const T = L.partyTable, pr = T.pitch;
    const hh = mm(2.3), ch = mm(2.0), bh = mm(pr >= 3.2 ? 2.2 : 1.9);   // the longest boundary must fit half a column
    const lineOpts = { layer: 'TITLE' };
    for (let blk = 0; blk < T.blocks; blk++) {
      const x0 = T.x0 + blk * (PARTY_COL_MM + 2), x1 = x0 + PARTY_COL_MM, xm = x0 + PARTY_COL_MM * 0.49;
      const chunk = partyRows.slice(blk * T.perBlock, (blk + 1) * T.perBlock);
      if (chunk.length === 0 && blk > 0) break;
      const yEnd = Math.min(T.y1, T.y0 + PARTY_HEAD_MM + chunk.length * pr + 3);
      d.polyline([S(x0, T.y0), S(x1, T.y0), S(x1, yEnd), S(x0, yEnd)], { ...lineOpts, closed: true });
      d.line(S(x0, T.y0 + 4.8), S(x1, T.y0 + 4.8), lineOpts);
      d.line(S(x0, T.y0 + 9.0), S(x1, T.y0 + 9.0), lineOpts);
      d.line(S(xm, T.y0 + 4.8), S(xm, yEnd), lineOpts);
      d.text('Party-Wall Servitude Data', S((x0 + x1) / 2, T.y0 + 3.6), hh,
        { layer: 'TITLE', style: 'ARIAL-BOLD', align: 'center' });
      d.text('Stand Numbers', S((x0 + xm) / 2, T.y0 + 7.8), ch, { layer: 'TITLE', style: 'ARIAL-BOLD', align: 'center' });
      d.text('Boundary', S((xm + x1) / 2, T.y0 + 7.8), ch, { layer: 'TITLE', style: 'ARIAL-BOLD', align: 'center' });
      chunk.forEach((row, i) => {
        const y = T.y0 + PARTY_HEAD_MM + 1.5 + i * pr + pr * 0.72;
        d.text(String(row.stands), S((x0 + xm) / 2, y), bh, { layer: 'TITLE', style: 'ARIAL', align: 'center' });
        d.text(String(row.boundary), S((xm + x1) / 2, y), bh, { layer: 'TITLE', style: 'ARIAL', align: 'center' });
      });
    }
  }

  /* ---- north arrow */
  // Drawn at half its own size: the sheet's meridian arrow, not a compass rose.
  drawNorthArrow(L.northArrow.cx, L.northArrow.cy, L.northArrow.mainScale, 2.12);

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
      ch, { layer: 'TITLE', style: 'ARIAL' });
    d.text(spec.certificate.line2, S(L.certificate.line2.x, L.certificate.line2.baseline),
      ch, { layer: 'TITLE', style: 'ARIAL' });
  }

  /* ---- Survey Record number (examination docket, Working Plan item 21) */
  if (spec.srNumber) {
    d.text(spec.srNumber, S(L.srNumber.cx, L.srNumber.baseline), mm(L.text.scale),
      { layer: 'TITLE', style: 'ARIAL', align: 'center' });
  }

  /* ---- insets ------------------------------------------------------------
   *
* The sheet has one uncommitted region, the inset box at the lower right, and
    * it may have to hold more than the locality diagram. Beacons whose signs
    * overlap by more than half -- one centre inside the other's mark -- get a
    * detail of their own: 87D and 87DNew of Brackenhurst are 0.061 m apart,
    * which is 0.03 mm at 1:2000, and the figure has room to draw one mark where
    * the ground carries two. A pair that merely touches reads as two marks and
    * stays on the figure.
   *
   * They are numbered in one sequence. The locality diagram is INSET 1 when
   * there is one and the details follow; with no locality diagram the details
   * start at 1. A sheet with no crowding draws exactly what it always drew.
   */
  const insets = [];
  // A FAR MARK's ground position, in the survey's own lo-axes. These are the
  // outlying reference marks the divided figure set aside earlier.
  const farMarks = [...byName.values()]
    .filter((b) => extensionNames.has(b.name))
    .map((b) => ({ ...b, ...loToGround(b) }));
  // The survey's own ground: everything the main figure draws, notes included.
  // Its envelope is the footprint shown in the outlying-marks inset.
  const surveyPts = [...byName.values()]
    .filter((b) => !extensionNames.has(b.name))
    .map((b) => [b.e, b.n])
    .concat(extraPts);
  const surveyEnv = (() => {
    const es = surveyPts.map((p) => p[0]), ns = surveyPts.map((p) => p[1]);
    return { e0: Math.min(...es), e1: Math.max(...es), n0: Math.min(...ns), n1: Math.max(...ns) };
  })();

  // The TRIG INSET: the control the survey was observed from. It is a
  // requirement of the Surveyor General that a sheet which uses trig beacons
  // carries them, so when any are given the inset is drawn (a locality diagram
  // is the only place they fit on a working plan). It is a MAP to a stated
  // scale, the finest round one at which it fits its cell: positions are the
  // ground's own. The far marks the divided figure set aside stand in it too,
  // beside the control, rather than in a map of their own -- a mark that far
  // from the survey belongs with the network it is measured against.
  //
  // Not every far mark goes there, only those whose distance from the survey would flatten the outlying-
  // marks map: the map shows the survey's footprint and its far marks at one scale, so a mark far enough
  // away to push that scale a rung coarser (DB of Scenic, 700 m from a survey 300 m across, took the map
  // from 1:5000 to 1:12500) belongs on the trig map instead, with the network it is measured against. The
  // rule is the figure's own: a mark is set aside when keeping it costs the map a prescribed scale.
  const surveyCentre = { e: (surveyEnv.e0 + surveyEnv.e1) / 2, n: (surveyEnv.n0 + surveyEnv.n1) / 2 };
  const envOfMarks = (marks) => ({
    eMin: Math.min(surveyEnv.e0, ...marks.map((b) => b.e)),
    eMax: Math.max(surveyEnv.e1, ...marks.map((b) => b.e)),
    nMin: Math.min(surveyEnv.n0, ...marks.map((b) => b.n)),
    nMax: Math.max(surveyEnv.n1, ...marks.map((b) => b.n)),
  });
  const mapScaleWith = (marks) => {
    const E = envOfMarks(marks);
    const need = Math.max((E.eMax - E.eMin) / (L.inset.box.x1 - L.inset.box.x0),
      (E.nMax - E.nMin) / (L.inset.box.y1 - L.inset.box.y0)) * 1000 * FIGURE_BREATHING;
    return STANDARD_SCALES.find((s) => s >= need) ?? STANDARD_SCALES.at(-1);
  };
  // ...and only one clear of the survey by at least the figure's own width: at the trig map's scale a mark
  // nearer than that would stand on top of the survey's own marker there, and is better where it is.
  // Measured against the FIGURE (the parcels' own corners), not the whole survey envelope: that one grows
  // with every neighbour's name set beside the boundary, which would move the threshold with the lettering.
  const ringMarks = [...holdNames].map((n) => byName.get(n)).filter(Boolean);
  const figureEnv = ringMarks.length
    ? {
      e0: Math.min(...ringMarks.map((b) => b.e)), e1: Math.max(...ringMarks.map((b) => b.e)),
      n0: Math.min(...ringMarks.map((b) => b.n)), n1: Math.max(...ringMarks.map((b) => b.n)),
    }
    : surveyEnv;
  const figureSpan = Math.max(figureEnv.e1 - figureEnv.e0, figureEnv.n1 - figureEnv.n0);
  const clearOfSurvey = (b) => Math.hypot(
    Math.max(figureEnv.e0 - b.e, 0, b.e - figureEnv.e1),
    Math.max(figureEnv.n0 - b.n, 0, b.n - figureEnv.n1)) >= figureSpan;
  const promoted = [];
  let outlying = [...farMarks];
  if (spec.inset) {
    while (outlying.length > 0) {
      const farthest = outlying.reduce((m, b) => (Math.hypot(b.e - surveyCentre.e, b.n - surveyCentre.n)
        > Math.hypot(m.e - surveyCentre.e, m.n - surveyCentre.n) ? b : m));
      const rest = outlying.filter((b) => b !== farthest);
      if (!clearOfSurvey(farthest)) break;
      if (STANDARD_SCALES.indexOf(mapScaleWith(outlying)) <= STANDARD_SCALES.indexOf(mapScaleWith(rest))) break;
      promoted.push(farthest);
      outlying = rest;
    }
    insets.push({
      kind: 'locality',
      beacons: [
        ...(spec.inset.beacons ?? []).map((b) => ({ ...b, ...loToGround(b) })),
        ...promoted,
      ],
    });
  }
  // The OUTLYING MARKS inset: the survey's footprint with the far marks the divided figure set aside, at a
  // scale that shows both -- a measured map, captioned with its scale, framed close around its marks rather
  // than sprawled across the cell. Those promoted to the trig map are not here.
  if (outlying.length) {
    insets.push({
      kind: 'merged',
      far: outlying,
      surveyEnv,
      env: envOfMarks(outlying),
    });
  }
  for (const cluster of crowded) {
    insets.push({ kind: 'detail', beacons: cluster });
  }
  // The PARCELS MEETING AT a station of the trig map -- the site marker -- as an inset of their own, drawn
  // from the real boundaries to a stated scale. They used to be a wedge diagram round the marker, fixed
  // at 19 mm across: a symbol bigger than the whole survey on a map to scale, which covered whatever
  // stood beside it (DB, 580 m from the marker, was lettered over it).
  for (const b of insets.find((i) => i.kind === 'locality')?.beacons ?? []) {
    if (ABUT_SYMBOLS.has(b.symbol ?? 'peg') && wedgesOf(b).length > 0) insets.push({ kind: 'abut', beacon: b });
  }

  // The column beside the trig map is as narrow as its insets allow: the parcels circle and a tick fit 36 mm, but a
  // detail of crowded marks or the outlying-marks map needs about 60 mm (names, wedge and the pair's separation), which is as much as the old half-and-half split.
  const sideNeeds = insets.slice(1).some((i) => i.kind === 'detail' || i.kind === 'merged') ? 63 : 36;
  const cells = insetCells(L.inset.box, insets.length, { sideColumnMm: sideNeeds });

  insets.forEach((ins, idx) => {
    const B = cells[idx];
    const number = idx + 1;
    // Every inset but the merged map takes its whole cell; the merged map
    // draws its own frame close around its marks below.
    if (ins.kind !== 'merged') {
      d.polyline([S(B.x0, B.y0), S(B.x1, B.y0), S(B.x1, B.y1), S(B.x0, B.y1)],
        { layer: 'INSET', closed: true });
    }

    // Every inset captions itself in its own branch below, with the scale it was drawn at: the trig map and
    // the outlying-marks map always, and a detail whenever its marks can be told apart at some round scale.
    // Only marks recorded at one identical position cannot be, and that detail says so.

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

    /** Inscribe a beacon's inscription around its sign as the INSET draws it:
     *  the DESIGNATION (170/P) reads ABOVE the mark, a control point's
     *  MONUMENT NAME (Mnyami) reads centred BELOW it. Both cleared of the
     *  sign by the same half-millimetre gap. The clearances use the inset's
     *  own symbol scale so a trig shrunk to its cell is cleared by that
     *  smaller reach, not by the figure's. */
    const letter = (at, b, { plain = false } = {}) => {
      const h = mm(L.text.insetLabel);
      const k = (iRing * 2) / mm(L.symbol.foundOuterDia);
      const up = (() => {
        if (b.symbol === 'trig') return mm(L.symbol.trigH) * k * 0.62;
        if (b.symbol === 'ocp') return mm(L.symbol.trigH) * k * 0.38;
        if (b.symbol === 'rm') return iSym * 1.2;
        return iRing;
      })();
      const down = (() => {
        if (b.symbol === 'ocp') return mm(L.symbol.trigH) * k * 0.62;
        if (b.symbol === 'trig') return mm(L.symbol.trigH) * k * 0.38;
        if (b.symbol === 'rm') return iSym * 1.2;
        return iRing;
      })();
      // A found or placed beacon is shown with the parcels that meet at it, as a small wedge diagram
      // round its sign (the abutting properties, each in the part of the circle it fills) in place of
      // loose labels that said the same thing around the sign and read as stray stand numbers. The
      // designation then sits above the diagram instead of above the sign.
      const wedges = !plain && ABUT_SYMBOLS.has(b.symbol ?? 'peg') ? wedgesOf(b) : [];
      const R = mm(L.inset.abutDetailRadius);
      if (wedges.length) {
        const seen = new Set();
        const ray = (ang) => {
          const key = Math.round(((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 1000);
          if (seen.has(key)) return;
          seen.add(key);
          d.line([at[0] + Math.cos(ang) * iRing, at[1] + Math.sin(ang) * iRing],
            [at[0] + Math.cos(ang) * R, at[1] + Math.sin(ang) * R], { layer: 'INSET' });
        };
        for (const w of wedges) {
          ray(w.start); ray(w.start + w.span);
          const steps = Math.max(4, Math.ceil(w.span / (Math.PI / 18)));
          d.polyline(Array.from({ length: steps + 1 }, (_, i) => {
            const a = w.start + (w.span * i) / steps;
            return [at[0] + Math.cos(a) * R, at[1] + Math.sin(a) * R];
          }), { layer: 'INSET' });
          // The label sits in its wedge, on the bisector; a narrow wedge takes it further out.
          const mid = w.start + w.span / 2;
          const r = R * (w.span < 1.0 ? 0.68 : 0.58);
          d.text(w.label, [at[0] + Math.cos(mid) * r, at[1] + Math.sin(mid) * r - h / 2], h * 0.62,
            { layer: 'INSET', style: 'ARIAL', align: 'center' });
        }
      }
      // Designation ABOVE the symbol (above the wedge diagram when there is one).
      const nameRise = wedges.length ? R : up;
      d.text(b.name, [at[0], at[1] + nameRise + mm(0.5)], h,
        { layer: 'INSET', style: 'ARIAL', align: 'center' });
      // Monument name BELOW the symbol (control points only).
      if (b.cpName) {
        d.text(b.cpName, [at[0], at[1] - down - mm(0.5) - h], h,
          { layer: 'INSET', style: 'ARIAL', align: 'center' });
      }

      // The abutting properties of a found or placed beacon, each lettered on the side of the sign
      // it lies toward (its true bearing), turned aside in steps until clear of the name and of its
      // fellows. A detail's marks are spread, but their bearings to the parcels are the real ones.
      if (!plain && ABUT_SYMBOLS.has(b.symbol ?? 'peg') && wedges.length === 0) {
        // textRect's width is 0.63 of the height a character, which is a little short of Arial's digits
        // and capitals; the fit therefore measures a longer string than is drawn, so two labels that
        // measure as touching are never drawn overlapping.
        const roomFor = (str, x, y, align) => textRect('W'.repeat(Math.ceil(str.length * 1.3) + 1), x, y, h, align);
        const taken = [roomFor(b.name, at[0], at[1] + nameRise + mm(0.5), 'center')];
        if (b.cpName) taken.push(roomFor(b.cpName, at[0], at[1] - down - mm(0.5) - h, 'center'));
        const clear = (r) => !taken.some((o) => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]);
        const reach = iRing + mm(1.1);
        const turns = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6];
        const radii = [1, 1.8, 2.6];   // the nearest ring first, a wider one when every side of it is taken
        for (const a of abuttersOf(b)) {
          if (!a.label || a.label === b.name) continue;
          const base = a.bearing ?? -Math.PI / 2;   // no bearing: beneath the sign
          let drawn = null;
          search: for (const ring of radii) {
            for (const turn of turns) {
              const ang = base + turn * (Math.PI / 6);
              const cx = Math.cos(ang), cy = Math.sin(ang);
              const align = cx > 0.35 ? 'left' : cx < -0.35 ? 'right' : 'center';
              const px = at[0] + cx * reach * ring, py = at[1] + cy * reach * ring;
              const y = cy < -0.35 ? py - h : cy > 0.35 ? py : py - h / 2;   // baseline
              const r = roomFor(a.label, px, y, align);
              if (clear(r)) { drawn = { px, y, align, r }; break search; }
              drawn ??= { px, y, align, r };   // nothing clear: the first choice, rather than none
            }
          }
          taken.push(drawn.r);
          d.text(a.label, [drawn.px, drawn.y], h, { layer: 'INSET', style: 'ARIAL', align: drawn.align });
        }
      }
    };

    // North point: the sheet's own meridian arrow at a fraction of its size.
    // Every inset carries one, the locality diagram and the details alike --
    // both are drawn north-up, so neither needs rotation, and a detail without
    // one leaves the reader guessing which way its marks lie. On NORTH-ARROW,
    // not INSET: it is a north point, and that keeps INSET meaning the inset's
    // MAP.
    // In a narrow cell (the column beside the trig map) the north point is drawn smaller, so it leaves the
    // cell room for its map.
    const narrowCell = (B.x1 - B.x0) < 45;
    const nn = narrowCell ? { ...L.inset.north, scale: L.inset.north.scale * 0.6, dxFromRight: L.inset.north.dxFromRight * 0.6 } : L.inset.north;
    drawNorthArrow(B.x1 - nn.dxFromRight, B.y0 + nn.dyFromTop, nn.scale, nn.letterMm);

    // Where nothing may be drawn in this cell: the caption at the top left and the north arrow at the top right.
    // A station fitted to the cell knew neither, so one near the top of a tall layout ended up under them (333/S
    // of Scenic), and a name near the edge crossed the frame. The caption is measured at its longest, a
    // seven-digit scale, so the reservation holds whatever scale is chosen.
    const widest = 'INSET ' + number + ' (1:2000000)';
    const tH = L.text.insetTitle;
    const na = L.northArrow;
    const ncx = B.x1 - nn.dxFromRight, ncy = B.y0 + nn.dyFromTop;
    // The caption sits on one line when the cell is wide enough to hold it clear of the north arrow, and on
    // two ("INSET 2" over "(1:3000)") when it is not: the trig map keeps three quarters of the box, so the
    // cells beside it are narrow.
    const oneLine = (B.x1 - B.x0) >= 0.63 * tH * widest.length + 5 + 10;
    const capWidth = oneLine ? 0.63 * tH * widest.length : 0.63 * tH * '(1:2000000)'.length;
    const capLines = oneLine ? 1 : 2;
    const caption = (at, scaleText) => {
      if (oneLine) {
        d.text(`INSET ${number} ${scaleText}`, S(at[0], at[1]), mm(tH), { layer: 'INSET', style: 'ARIAL-BOLD' });
      } else {
        d.text(`INSET ${number}`, S(at[0], at[1]), mm(tH), { layer: 'INSET', style: 'ARIAL-BOLD' });
        d.text(scaleText, S(at[0], at[1] + tH * 1.15), mm(tH), { layer: 'INSET', style: 'ARIAL-BOLD' });
      }
    };
    const reserved = [
      { x0: B.x0 + 4, y0: B.y0 + 6 - tH * 1.1, x1: B.x0 + 5 + capWidth + 1, y1: B.y0 + 6 + tH * 0.3 + (capLines - 1) * tH * 1.15 },
      { x0: ncx - 3, y0: ncy - 7.2, x1: ncx + 3.5, y1: ncy + na.south * nn.scale + 0.6 },
    ];
    // Each station's box on the sheet, in paper millimetres: its sign, its designation above, its monument
    // name below and, where it has one, its wedge diagram or the properties lettered round it.
    const lh = L.text.insetLabel;
    const strW = (str) => 0.63 * lh * String(str).length * 1.15;
    const ringMm = 0.85;
    const kSign = (ringMm * 2) / L.symbol.foundOuterDia;
    const reachUp = (b) => (b.symbol === 'trig' ? L.symbol.trigH * kSign * 0.62
      : b.symbol === 'ocp' ? L.symbol.trigH * kSign * 0.38 : b.symbol === 'rm' ? 1.2 : ringMm);
    const reachDown = (b) => (b.symbol === 'ocp' ? L.symbol.trigH * kSign * 0.62
      : b.symbol === 'trig' ? L.symbol.trigH * kSign * 0.38 : b.symbol === 'rm' ? 1.2 : ringMm);
    const extOf = (b, plain = false) => {
      const abuts = !plain && ABUT_SYMBOLS.has(b.symbol ?? 'peg');
      const wedge = abuts && wedgesOf(b).length > 0;
      const R = L.inset.abutDetailRadius;
      let u = (wedge ? R : reachUp(b)) + 0.5 + lh;
      let dn = reachDown(b) + (b.cpName ? 0.5 + lh * 1.15 : 0);
      let half = Math.max(strW(b.name) / 2, b.cpName ? strW(b.cpName) / 2 : 0, 1.2);
      if (wedge) { dn = Math.max(dn, R); half = Math.max(half, R); }
      else if (abuts) { u += 6; dn += 6; half += 6; }
      return { l: half, r: half, u, d: dn };
    };
    const centreOf = (bs) => ({
      e: (Math.min(...bs.map((b) => b.e)) + Math.max(...bs.map((b) => b.e))) / 2,
      n: (Math.min(...bs.map((b) => b.n)) + Math.max(...bs.map((b) => b.n))) / 2,
    });

    // The box a station occupies on the sheet, from its ground place through the inset's own mapping.
    const stationBox = (T, b, plain = false) => {
      const [x, y] = T(b.e, b.n), x_ = extOf(b, plain);
      return { x0: x - x_.l, y0: y - x_.u, x1: x + x_.r, y1: y + x_.d };
    };
    // Every scaled inset carries at least one labelled tick: a cross at a round coordinate, lettered as the
    // main grid's are. `T` maps ground to sheet mm in this inset, `Tinv` back; `obstacles` is what the inset
    // has drawn, so the tick finds clear ground. Returns the placement (its box lets a hugging frame include it).
    const placeTick = (T, Tinv, D, obstacles) => {
      const r = placeInsetTicks({ cell: B, reserved, obstacles, D, T, Tinv, geometry: TICK_GEOMETRY });
      for (const t of r.ticks) {
        const at = S(t.x, t.y);
        drawGridTick(at[0], at[1], t.X, t.Y, t.side);
      }
      insetTicks[number] = (insetTicks[number] ?? 0) + r.ticks.length;
      return r;
    };

    if (ins.kind === 'merged') {
      // THE OUTLYING MARKS. One measured map for the figure and the marks the
      // divided figure set apart from it, at a scale that shows both -- no
      // second EXTENSION frame, because there is no second map to host. The
      // scale is fitted to the cell as with any inset, but the FRAME is drawn
      // close around the survey's footprint and the marks, not round the cell:
      // the map is allowed to sit small and low in its space instead of
      // stretching to cover ground that holds nothing.
      const E = ins.env;
      const need = Math.max((E.eMax - E.eMin) / (B.x1 - B.x0),
        (E.nMax - E.nMin) / (B.y1 - B.y0)) * 1000 * FIGURE_BREATHING;
      const ec = { e: (E.eMin + E.eMax) / 2, n: (E.nMin + E.nMax) / 2 };
      // The scale is the first prescribed one at which the map fits its cell -- as always -- and then the
      // first at which no far mark's inscription touches the caption, the north arrow, the frame or another
      // mark either; the footprint's corners must stay in the cell too. Where the first fits cleanly the map
      // is drawn exactly as before.
      const fitScales = STANDARD_SCALES.filter((s) => s >= need);
      const corner = (e, n) => ({ e, n, ext: { l: 0, r: 0, u: 0, d: 0 } });
      const fit = layoutMeasured({
        beacons: [
          ...ins.far.map((b) => ({ e: b.e, n: b.n, ext: extOf(b) })),
          corner(ins.surveyEnv.e0, ins.surveyEnv.n0), corner(ins.surveyEnv.e1, ins.surveyEnv.n0),
          corner(ins.surveyEnv.e1, ins.surveyEnv.n1), corner(ins.surveyEnv.e0, ins.surveyEnv.n1),
        ],
        cell: B, reserved, ic: ec, scales: fitScales.length ? fitScales : [STANDARD_SCALES.at(-1)],
      });
      const F = fit.denominator;
      const cx = fit.cx, cy = fit.cy;
      // Sheet-millimetre position of a ground point inside the cell...
      const P = (e, n) => [cx + ((e - ec.e) / F) * 1000, cy - ((n - ec.n) / F) * 1000];
      const I = (e, n) => S(P(e, n)[0], P(e, n)[1]);

      // The survey's own footprint, light, so a reader can see what stays home
      // and what stands beyond it.
      const f0 = I(ins.surveyEnv.e0, ins.surveyEnv.n0);
      const f1 = I(ins.surveyEnv.e1, ins.surveyEnv.n1);
      d.polyline([f0, [f1[0], f0[1]], f1, [f0[0], f1[1]]],
        { layer: 'INSET', closed: true, linetype: 'PLANDASH' });

      // The survey itself, drawn inside its footprint: the boundaries that stay
      // home and the marks that stand at them, so the map reads as the survey
      // the far marks measure against, not a blank box. Its own ring edges and
      // its own signs, nothing lettered -- the names belong to the main figure,
      // and a measured map the size of a stamp need not repeat them.
      for (const [pa, pb] of segments) {
        d.line(I(pa[0], pa[1]), I(pb[0], pb[1]), { layer: 'INSET' });
      }
      for (const b of figureBeacons()) {
        drawSign(I(b.e, b.n), b.symbol);
      }

      // The farthest marks, signs at their conventional inset sizes and the
      // inscriptions around them exactly as the main figure renders its own.
      for (const b of ins.far) {
        const at = I(b.e, b.n);
        drawSign(at, b.symbol);
        letter(at, b);
      }

      // The frame hugs what the map plotted: the footprint's corners and the
      // marks it drew. One station high on the sheet gets its inscription
      // above the sign, and the caption shares the head of the frame, so the
      // box is kept clear of the marks on the north side and clipped to the
      // cell if a lopsided survey would push it over the edge.
      const plotted = [
        ...ins.far.map((b) => P(b.e, b.n)),
        P(ins.surveyEnv.e0, ins.surveyEnv.n0),
        P(ins.surveyEnv.e1, ins.surveyEnv.n0),
        P(ins.surveyEnv.e1, ins.surveyEnv.n1),
        P(ins.surveyEnv.e0, ins.surveyEnv.n1),
      ];
      const xs = plotted.map((p) => p[0]), ys = plotted.map((p) => p[1]);
      const pad = { side: mm(4), top: mm(6), bottom: mm(4) };
      // The tick goes on clear ground in the cell: not on the footprint (the survey is drawn in it) nor on a
      // far mark's inscription. The frame then takes it in, so it is inside the map.
      const mergedTick = placeTick(
        P, (x, y) => [ec.e + ((x - cx) * F) / 1000, ec.n - ((y - cy) * F) / 1000], F,
        [
          ...ins.far.map((b) => stationBox(P, b)),
          { x0: Math.min(...xs) - 1, y0: Math.min(...ys) - 1, x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1 },
          // The frame's head holds the caption, so nothing but the map may stand above the footprint.
          { x0: B.x0, y0: B.y0, x1: B.x1, y1: Math.min(...ys) },
        ]);
      const tb = mergedTick.ticks[0].box;
      const fx0 = Math.max(B.x0, Math.min(...xs, tb.x0) - pad.side);
      const fx1 = Math.min(B.x1, Math.max(Math.max(...xs, tb.x1) + pad.side, fx0 + 6 + capWidth));
      const fy0 = Math.max(B.y0, Math.min(...ys) - pad.top);
      const fy1 = Math.min(B.y1, Math.max(...ys, tb.y1) + pad.bottom);
      d.polyline([S(fx0, fy0), S(fx1, fy0), S(fx1, fy1), S(fx0, fy1)],
        { layer: 'INSET', closed: true });
      caption([fx0 + 3, fy0 + 4], `(1:${F})`);
      return;
    }

    if (ins.kind === 'abut') {
      // THE PARCELS MEETING AT ONE BEACON, to scale. A circle round the beacon holds the real boundaries
      // that pass through it, at the largest round scale at which the nearest corner of its parcels is
      // still inside, and each parcel is named where it lies. Nothing is schematic: a line's bearing and
      // length are the ground's at 1:D.
      const b = ins.beacon;
      // A caption on two lines (a narrow cell) pushes the circle down by the second line.
      const capDrop = capLines > 1 ? (capLines - 1) * tH * 1.15 + 2 : 0;
      const Rm = Math.min(16, (B.x1 - B.x0) / 2 - 3, (B.y1 - B.y0 - 14 - capDrop) / 2);
      const c0 = [B.x0 + 7 + Rm, B.y0 + 12 + capDrop + Rm];
      const on = abutShapes.filter((p) => p.ring.includes(b.name) && p.label);
      let nearest = Infinity;
      for (const p of on) {
        for (const n of p.ring) {
          if (n === b.name || !byName.has(n)) continue;
          nearest = Math.min(nearest, Math.hypot(G(n).e - b.e, G(n).n - b.n));
        }
      }
      const rungs = [...new Set([...DETAIL_INSET_SCALES, ...MEASURED_INSET_SCALES])].sort((x, y) => x - y);
      const want = Number.isFinite(nearest) && nearest > 0 ? (nearest * 1000) / (0.7 * Rm) : 500;
      const D = rungs.find((r) => r >= want) ?? rungs.at(-1);
      const T = (e, n) => [c0[0] + ((e - b.e) / D) * 1000, c0[1] - ((n - b.n) / D) * 1000];

      const C = S(c0[0], c0[1]);
      d.polyline(circlePts(mm(Rm), 72).map(([x, y]) => [C[0] + x, C[1] + y]), { layer: 'INSET', closed: true });
      const drawn = [];
      for (const p of abutShapes) {
        const names = p.ring.filter((n, i) => !(i === p.ring.length - 1 && n === p.ring[0]) && byName.has(n));
        for (let i = 0; i < names.length; i++) {
          const q0 = T(G(names[i]).e, G(names[i]).n), q1 = T(G(names[(i + 1) % names.length]).e, G(names[(i + 1) % names.length]).n);
          const seg = clipSegmentToCircle(q0, q1, c0, Rm);
          if (!seg) continue;
          d.line(S(seg[0][0], seg[0][1]), S(seg[1][0], seg[1][1]), { layer: 'INSET' });
          drawn.push(seg);
        }
      }
      drawSign(C, b.symbol);
      const lh = mm(L.text.insetLabel);
      d.text(b.name, [C[0], C[1] + mm(Rm) + mm(1.2)], lh, { layer: 'INSET', style: 'ARIAL', align: 'center' });

      // Each parcel's name where it lies inside the circle, on the clearest ground in it.
      for (const p of on) {
        const poly = p.ring.filter((n) => byName.has(n)).map((n) => T(G(n).e, G(n).n));
        let best = null, bestClear = -1;
        const steps = 17;
        for (let i = 0; i < steps; i++) {
          for (let j = 0; j < steps; j++) {
            const q = [c0[0] - Rm + (2 * Rm * (i + 0.5)) / steps, c0[1] - Rm + (2 * Rm * (j + 0.5)) / steps];
            if (Math.hypot(q[0] - c0[0], q[1] - c0[1]) > Rm * 0.78 || !pointInPolygon(q, poly)) continue;
            // the clearest ground: far from every drawn line and from the beacon's own sign
            let clear = Math.hypot(q[0] - c0[0], q[1] - c0[1]) - 1.5;
            for (const [u, v] of drawn) clear = Math.min(clear, pointSegmentDistance(q, u, v));
            if (clear > bestClear) { bestClear = clear; best = q; }
          }
        }
        if (best) {
          d.text(String(p.label).trim(), S(best[0], best[1] - 0.8), lh * 0.8, { layer: 'INSET', style: 'ARIAL', align: 'center' });
        }
      }
      caption([B.x0 + 5, B.y0 + 6], `(1:${D})`);
      // The circle is a disc, not its bounding square: strips of it, so the corners of the cell stay usable.
      const discs = [];
      for (let k = 0; k < 12; k++) {
        const y0 = c0[1] - Rm + (2 * Rm * k) / 12, y1 = y0 + (2 * Rm) / 12;
        const half = Math.sqrt(Math.max(0, Rm * Rm - Math.min((y0 - c0[1]) ** 2, (y1 - c0[1]) ** 2))) + 0.5;
        discs.push({ x0: c0[0] - half, y0, x1: c0[0] + half, y1 });
      }
      discs.push({ x0: c0[0] - 0.63 * L.text.insetLabel * b.name.length, y0: c0[1] + Rm, x1: c0[0] + 0.63 * L.text.insetLabel * b.name.length, y1: c0[1] + Rm + 1.2 + 1.3 * L.text.insetLabel });
      placeTick(T, (x, y) => [b.e + ((x - c0[0]) * D) / 1000, b.n - ((y - c0[1]) * D) / 1000], D, discs);
      return;
    }

    if (ins.kind === 'locality') {
      // THE TRIGS THE SURVEY WAS OBSERVED FROM, with the far marks. The Surveyor General's one requirement
      // of a working plan that uses control is that it carries them, here, on a map to a stated scale:
      // every position is the ground's own at 1:D, D the finest round scale at which the stations, their
      // inscriptions and the caption and north arrow all fit the cell without touching.
      const ib = ins.beacons;
      const ic = centreOf(ib);
      const fit = layoutMeasured({
        beacons: ib.map((b) => ({ e: b.e, n: b.n, ext: extOf(b, true) })),
        cell: B, reserved, ic, scales: MEASURED_INSET_SCALES,
      });
      const D = fit.denominator;
      const I = (e, n) => S(fit.cx + ((e - ic.e) / D) * 1000, fit.cy - ((n - ic.n) / D) * 1000);
      for (const b of ib) {
        const at = I(b.e, b.n);
        drawSign(at, b.symbol);
        letter(at, b, { plain: true });
      }
      caption([B.x0 + 5, B.y0 + 6], `(1:${D})`);
      const Tl = (e, n) => [fit.cx + ((e - ic.e) / D) * 1000, fit.cy - ((n - ic.n) / D) * 1000];
      placeTick(Tl, (x, y) => [ic.e + ((x - fit.cx) * D) / 1000, ic.n - ((y - fit.cy) * D) / 1000], D,
        ib.map((b) => stationBox(Tl, b, true)));
      return;
    }

    // A DETAIL: an enlargement of marks that plot on top of each other on the figure, drawn to a stated
    // scale like every other inset. Marks a few centimetres apart on the ground (87D and 87D New of
    // Brackenhurst are 0.061 m apart) are 12 mm apart at 1:5, which separates them with room to letter
    // each: so the scale is the largest round one at which the closest pair is at least 12 mm apart and
    // every mark's inscription fits the cell clear of the others. Marks recorded at one identical position
    // cannot be separated at any scale; those, and only those, fall back to an even fan, captioned so.
    const gcE = ins.beacons.reduce((t, b) => t + b.e, 0) / ins.beacons.length;
    const gcN = ins.beacons.reduce((t, b) => t + b.n, 0) / ins.beacons.length;
    let dmin = Infinity;
    for (let i = 0; i < ins.beacons.length; i++) {
      for (let j = i + 1; j < ins.beacons.length; j++) {
        dmin = Math.min(dmin, Math.hypot(ins.beacons[i].e - ins.beacons[j].e, ins.beacons[i].n - ins.beacons[j].n));
      }
    }
    const MIN_SEPARATION_MM = 12;
    let scaled = null;
    if (dmin > 1e-9 && Number.isFinite(dmin)) {
      const usable = DETAIL_INSET_SCALES.filter((D) => (dmin * 1000) / D >= MIN_SEPARATION_MM);
      if (usable.length) {
        const ic = centreOf(ins.beacons);
        const fit = layoutMeasured({
          beacons: ins.beacons.map((b) => ({ e: b.e, n: b.n, ext: extOf(b) })),
          cell: B, reserved, ic, scales: usable,
        });

        if (fit.fits) scaled = { D: fit.denominator, cx: fit.cx, cy: fit.cy, ic };
      }
    }

    if (scaled) {
      for (const b of ins.beacons) {
        const at = S(scaled.cx + ((b.e - scaled.ic.e) / scaled.D) * 1000,
          scaled.cy - ((b.n - scaled.ic.n) / scaled.D) * 1000);
        drawSign(at, b.symbol ?? 'peg');
        letter(at, b);
      }
      caption([B.x0 + 5, B.y0 + 6], `(1:${scaled.D})`);
      const Td = (e, n) => [scaled.cx + ((e - scaled.ic.e) / scaled.D) * 1000, scaled.cy - ((n - scaled.ic.n) / scaled.D) * 1000];
      placeTick(Td, (x, y) => [scaled.ic.e + ((x - scaled.cx) * scaled.D) / 1000, scaled.ic.n - ((y - scaled.cy) * scaled.D) / 1000],
        scaled.D, ins.beacons.map((b) => stationBox(Td, b)));
    } else {
      // Identical positions: nothing to measure. They are fanned out round the one spot they all occupy, a
      // leader tying each back to it, and the regulation's own caption applies: "Inset (not to scale)".
      const dcx = (B.x0 + B.x1) / 2, dcy = (B.y0 + B.y1) / 2;
      const spread = Math.min(B.x1 - B.x0, B.y1 - B.y0) * 0.26;
      const centre = S(dcx, dcy);
      const bearings = ins.beacons.map((b) => Math.atan2(b.n - gcN, b.e - gcE));
      const degenerate = ins.beacons.every((b) => Math.hypot(b.e - gcE, b.n - gcN) < 1e-9);
      ins.beacons.forEach((b, k) => {
        const ang = degenerate
          ? -Math.PI / 2 + (k * 2 * Math.PI) / ins.beacons.length
          : bearings[k];
        // The sheet is drawn south-up, so a ground bearing's northing component
        // moves UP the page: subtract it, exactly as toSheet does.
        const at = S(dcx + spread * Math.cos(ang), dcy - spread * Math.sin(ang));
        d.line(centre, at, { layer: 'INSET' });
        drawSign(at, b.symbol ?? 'peg');
        letter(at, b);
      });
      caption([B.x0 + 5, B.y0 + 6], '(NOT TO SCALE)');
    }

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
  const out = {
    dxf: doc.toString(), scale, gridInterval, gridTicks: placed, gridTicksInFigure: ticks.filter((t) => inFigure(t.e, t.n)).length, insetTicks, areas, kind: general ? 'general' : 'diagrams', partyWallRows: partyRows.length, insetCount: insets.length,
    sheetSize: size, orientation, sheetWidthMm: sheet.width, sheetHeightMm: sheet.height,
  };
  // What the PDF is drawn from: the same shapes the DXF holds, and the transform that puts them on the
  // sheet. Not enumerable, so it never leaks into a serialised result.
  Object.defineProperty(out, 'model', { value: { doc, originE, originN, scale, sheet } });
  return out;
}

/**
 * Which paper, then the sheet. A working plan is an A4 field document, and 1:2500 is the scale that discharges
 * the compilation-plot requirement (PREFERRED_SCALE). When the figure does not fit at 1:2500 on A4 the scale
 * would move to the next prescribed rung and the plan would need a separate plot; the sensible answer is the
 * next paper up, so the plan can still be plotted at 1:2500. So the sheet is chosen with the scale:
 *
 *   - A4 if the figure fits at 1:2500 (or finer is not wanted: 1:2500 is the floor), else
 *   - A3, the same way up, if it fits at 1:2500 there, else
 *   - whichever of the two draws it at the finer scale (A3, by its size), never a coarser one for being bigger.
 *
 * Left alone: a spec that names its paper (`sheetSize` 'A4' or 'A3') or fixes its scale is the surveyor's own
 * instruction, and the way up is theirs too: it is never flipped to fit. The result says what was chosen
 * (`sheetSize`) and, when it went up, why (`escalation`), so the plot dialog and the surveyor can be told.
 */
function renderWorkingPlan(spec) {
  const out = renderOnce(spec);
  if (spec.kind === 'general' && !spec.inset && !spec.reserveInset && out.insetCount > 0) {
    return renderOnce({ ...spec, reserveInset: true });
  }
  return out;
}

export function generateWorkingPlan(spec) {
  const named = spec.sheetSize === 'A3' || spec.sheetSize === 'A4';
  const fixedScale = spec.scale != null && spec.scale !== 'auto';
  if (named || fixedScale) return renderWorkingPlan({ ...spec, sheetSize: named ? spec.sheetSize : 'A4' });

  const onA4 = renderWorkingPlan({ ...spec, sheetSize: 'A4' });
  if (onA4.scale <= PREFERRED_SCALE) return onA4;
  const onA3 = renderWorkingPlan({ ...spec, sheetSize: 'A3' });
  if (onA3.scale >= onA4.scale) return onA4;          // the bigger sheet buys nothing: keep the field size
  onA3.escalation = {
    from: 'A4', to: 'A3', a4Scale: onA4.scale, scale: onA3.scale,
    reached: onA3.scale <= PREFERRED_SCALE,
    reason: onA3.scale <= PREFERRED_SCALE
      ? `The figure does not fit at 1:${PREFERRED_SCALE} on A4 (it would be 1:${onA4.scale}), so the plan is drawn on A3 and can be plotted at 1:${PREFERRED_SCALE}.`
      : `The figure does not fit at 1:${PREFERRED_SCALE} on A4 (1:${onA4.scale}) or on A3, so it is drawn on A3 at 1:${onA3.scale}, the finest scale the larger sheet allows.`,
  };
  return onA3;
}
