/**
 * DXF Generator for Survey Plans â€” R12 (AC1009) format
 * Mirrors the PDF labeling system: scale-aware text heights, shared-edge
 * topology (distance one side / bearing the other), stand labels rotated to
 * longest edge, BOLD text style for stand numbers.
 *
 * Compatible with AutoCAD R12 through AutoCAD 2026+.
 * All geometry in Cape Lo ground coordinates (real-world metres).
 *
 * Layers:
 *   OUTSIDE_FIGURE   â€“ Outside figure boundary (red)
 *   PARCELS           â€“ Land parcel boundaries (white/black)
 *   BEACONS           â€“ Beacon circles (green)
 *   BEACON_LABELS     â€“ Beacon name text (green)
 *   DISTANCES         â€“ Edge distance annotations (cyan)
 *   DIRECTIONS        â€“ Edge bearing annotations (magenta)
 *   STAND_NUMBERS     â€“ Parcel stand numbers (yellow, BOLD style)
 *   TITLE_BLOCK       â€“ Title and metadata text (white)
 */

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import {
  TITLE_BLOCK,
  SCHEDULE_OF_AREAS,
  OUTSIDE_FIGURE_DATA,
  SURVEYOR_GENERAL_BOX,
  formatStandRanges,
  computeScheduleColumnWidths,
} from '../../../app-shared/block-definitions.js'

/** Conversion factor: 1 PDF point = 0.352778 mm. block-definitions values
 *  are in PDF pts (matching the PDF generator's native unit); the DXF
 *  generator works in paper-mm so it converts at the boundary.
 */
const PT_TO_MM_GEN = 25.4 / 72
import { findStandLabelPosition, findEdgeLabelPosition } from './dxfLabelPlacer.js'
import {
  placeSuffixLabelPOIDirected,
  tryTightFullBeaconLabelPosition,
  calculateFullBeaconLabelOutsideOnEdge,
  pickBeaconFontSize,
  computeBeaconRadius,
  groupSplayBeacons,
  orderSplayGroupByAngle,
  createCollisionRegistry,
} from './dxfBeaconPlacer.js'
import {
  extractScheduleRow,
  computeScheduleLayout,
  addScheduleTable,
  nextLargerSheet,
  SCHEDULE_HEADER_HEIGHT_MM,
} from './dxfScheduleHelpers.js'
import { emitScheduleOfAreasTopological } from './dxfScheduleEmitter.js'
import {
  emitOFDTable,
  emitBeaconDescriptions,
  emitStatement,
  emitSGBox,
} from './dxfBottomZoneEmitter.js'
import { planSheetLayout } from './sheetLayoutPlanner.js'

// Re-export schedule helpers extracted to dxfScheduleHelpers.js during 3-v2.
// External consumers (tests, other modules) keep importing from dxfGenerator.js.
export {
  extractScheduleRow,
  computeScheduleLayout,
  addScheduleTable,
  nextLargerSheet,
} from './dxfScheduleHelpers.js'

/**
 * Word-boundary wrap for single-line DXF TEXT entities.
 * Splits `str` into chunks no longer than `maxChars` characters, never
 * breaking inside a word. Single tokens longer than `maxChars` are emitted
 * as their own line (no truncation, no hyphenation). Returns [] for empty
 * input; never produces empty entries.
 */
export function splitToWidth(str, maxChars) {
  if (!str) return []
  const tokens = String(str).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  const lines = []
  let current = ''
  for (const tok of tokens) {
    if (current === '') {
      current = tok
      continue
    }
    if (current.length + 1 + tok.length <= maxChars) {
      current += ' ' + tok
    } else {
      lines.push(current)
      current = tok
    }
  }
  if (current !== '') lines.push(current)
  return lines
}

/**
 * Returns `["SHEET N"]` when sheetInfo indicates a multi-sheet plan
 * (totalSheets > 1) with a positive integer sheetNumber. Returns [] for
 * any other input shape. No warning on malformed input â€” the absent label
 * is itself visible to the surveyor in CAD.
 */
export function formatSheetLabel(sheetInfo) {
  if (!sheetInfo || typeof sheetInfo !== 'object') return []
  const { sheetNumber, totalSheets } = sheetInfo
  if (typeof totalSheets !== 'number' || totalSheets <= 1) return []
  if (!Number.isInteger(sheetNumber) || sheetNumber <= 0) return []
  return [`SHEET ${sheetNumber}`]
}

/**
 * Returns the SI 727 Seventh Schedule (b) Vide template from
 * `app-shared/block-definitions.js`, wrapped via `splitToWidth` to fit
 * `maxLineChars`. Always returns at least one entry. Throws if the
 * template is missing from the shared module (configuration bug â€”
 * the PDF would fail the same way).
 */
export function formatVideLine(maxLineChars) {
  const template = TITLE_BLOCK?.vide?.template
  if (!template) throw new Error('TITLE_BLOCK.vide.template missing from app-shared/block-definitions.js')
  return splitToWidth(template, maxLineChars)
}

/**
 * Title-case helper: "lot 9 of borrowdale" â†’ "Lot 9 Of Borrowdale".
 * Matches the PDF's `toTitleCase` style for figure-description substitutions.
 */
function titleCase(str) {
  return String(str || '').replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

/**
 * Builds the SI 727 Seventh Schedule (b) figure-description sentence
 * from the figureDescription template in `app-shared/block-definitions.js`,
 * wrapped to `maxLineChars`. Returns [] when there is no outside-figure
 * sequence to describe or no surveyed parcels to count.
 *
 * Placeholder substitutions and missing-field fallbacks are documented in
 * the spec (2026-06-01-dxf-title-block-si727-design.md, Components).
 *
 * Note: single-sheet template only. The multi-sheet variant
 * (`figureDescription.multiSheetTemplate`) is owned by sub-project #6
 * (multi-sheet tiling).
 */
export function formatFigureDescription(metadata, outsideFigureData, surveyedParcels, maxLineChars) {
  const template = TITLE_BLOCK?.figureDescription?.template
  if (!template) throw new Error('TITLE_BLOCK.figureDescription.template missing from app-shared/block-definitions.js')

  const edges = outsideFigureData?.edges
  if (!Array.isArray(edges) || edges.length === 0) return []
  if (!Array.isArray(surveyedParcels) || surveyedParcels.length === 0) return []

  // Beacon sequence: closed loop, first vertex repeated at the end.
  const ids = edges.map(e => e?.pointId || '').filter(Boolean)
  if (ids.length === 0) return []
  const beaconSequence = ids.concat(ids[0]).join(', ')

  const township = titleCase(metadata?.township) || 'the township'
  const district = titleCase(metadata?.district) || 'the district'
  const parentProperty = titleCase(metadata?.parentProperty)
  const wholePortion = (metadata?.wholePortion || '').trim() || 'the whole'
  const ofTarget = parentProperty ? `${township} of ${parentProperty}` : township

  const standNames = surveyedParcels.map(sp => String(sp?.stand ?? '')).filter(Boolean)
  if (standNames.length === 0) return []
  const standCount = standNames.length
  const standRange = formatStandRanges(standNames) || '-'

  const sentence = template
    .replace('{beaconSequence}', beaconSequence)
    .replace('{township}',       township)
    .replace('{standCount}',     String(standCount))
    .replace('{standRange}',     standRange)
    .replace('{wholePortion}',   wholePortion)
    .replace('{ofTarget}',       ofTarget)
    .replace('{district}',       district)

  return splitToWidth(sentence, maxLineChars)
}

function normalizeCapeLoYX(y, x) {
  if (!Number.isFinite(y) || !Number.isFinite(x)) return [y, x];
  const ay = Math.abs(y);
  const ax = Math.abs(x);
  if ((ay > 1000000 && ax < 1000000) || ay > ax * 2) return [x, y];
  return [y, x];
}

/**
 * Convert Cape Lo (Y = Westing, X = Southing) to DXF coordinates with
 * **north-up east-right** orientation — matching the PDF view.
 *
 *   DXF.x = -capeY  (negate westing → easting; east increases to the right)
 *   DXF.y = -capeX  (negate southing → northing; north increases upward)
 *
 * Renamed-in-place: the function still ends in "SouthUp" for historical
 * compatibility with imports across tests/fixtures/docs, but the behavior
 * was flipped on 2026-06-05 after the user noticed the DXF and PDF plots
 * had opposite orientations. The negation is a 180° rotation of the
 * previous south-up west-right output. Text-label angles compensate via
 * the existing `if (ang > 90 || ang < -90) ang += 180` normalization
 * downstream, so labels remain right-side-up.
 */
export function capeLoToDxfSouthUp(capeY, capeX) {
  const [y, x] = normalizeCapeLoYX(capeY, capeX);
  return { x: -y, y: -x };
}

/** Shoelace centroid in AutoCAD space from an array of AutoCAD {x,y} points */
function shoelaceCentroid(pts) {
  let twiceArea = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % pts.length];
    const cross = p0.x * p1.y - p1.x * p0.y;
    twiceArea += cross;
    cx += (p0.x + p1.x) * cross;
    cy += (p0.y + p1.y) * cross;
  }
  if (Math.abs(twiceArea) > 1e-6) {
    return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) };
  }
  // Fallback: simple average
  let sx = 0, sy = 0;
  pts.forEach((q) => { sx += q.x; sy += q.y; });
  return { x: sx / pts.length, y: sy / pts.length };
}

/**
 * Walk outsideFigureData.edges and return the ordered vertex list around the
 * outside-figure boundary, with a closing duplicate appended so callers can
 * pair vertices[i] with vertices[i+1] for edge geometry without index-modulo
 * wraparound.
 *
 * Each edge in edges[] carries the START vertex of that edge as { pointId, y, x }.
 * Non-finite vertices (NaN / Infinity / |coord| > 1e7 plausibility bound) are
 * filtered out and counted via skippedCount so the caller can bump
 * warnings.summary.outsideFigureVertices.
 *
 * @param {Object|null} outsideFigureData  May be null/undefined; empty .edges OK.
 * @returns {{ vertices: Array<{y:number,x:number,pointId:string}>, skippedCount: number }}
 *   vertices: ordered around the boundary, with closing duplicate.
 *   skippedCount: how many edges had non-finite vertex coords.
 */
export function computeOutsideFigureVertices(outsideFigureData) {
  const edges = outsideFigureData?.edges
  if (!Array.isArray(edges) || edges.length === 0) {
    return { vertices: [], skippedCount: 0 }
  }
  const vertices = []
  let skippedCount = 0
  for (let idx = 0; idx < edges.length; idx++) {
    const e = edges[idx]
    if (!Number.isFinite(e.y) || !Number.isFinite(e.x)
        || Math.abs(e.y) > 1e7 || Math.abs(e.x) > 1e7) {
      skippedCount++
      continue
    }
    // edgeIndex preserves the original position in outsideFigureData.edges so
    // consumers can detect "bridged" polygon edges (i.e. consecutive kept
    // vertices whose original indices aren't adjacent â€” indicating a filtered
    // vertex in between) and fall back to geometry rather than reading stale
    // distance/direction metadata from the wrong original edge.
    vertices.push({ y: e.y, x: e.x, pointId: e.pointId || '', edgeIndex: idx })
  }
  // Append closing duplicate (first valid vertex) so consumers can iterate
  // vertices[i] / vertices[i+1] without wraparound.
  if (vertices.length > 0) {
    vertices.push({ ...vertices[0] })
  }
  return { vertices, skippedCount }
}

/** Polygon area from AutoCAD {x,y} points (shoelace, absolute) */
function polygonAreaGround(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y;
    a -= pts[j].x * pts[i].y;
  }
  return Math.abs(a / 2);
}

function degToDMS(deg) {
  const d = Math.floor(deg);
  const rm = (deg - d) * 60;
  const m = Math.floor(rm);
  const s = Math.round((rm - m) * 60);
  return `${d}d${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"`;
}

/** Shared-edge key: sorted, rounded to 10mm â€” matches PDF's createEdgeKey */
function createEdgeKey(c1, c2) {
  const y1 = Math.round(c1[0] * 100) / 100;
  const x1 = Math.round(c1[1] * 100) / 100;
  const y2 = Math.round(c2[0] * 100) / 100;
  const x2 = Math.round(c2[1] * 100) / 100;
  const pts = [[y1, x1], [y2, x2]].sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);
  return `${pts[0][0]},${pts[0][1]}_${pts[1][0]},${pts[1][1]}`;
}

/** Point-in-polygon test (ray casting) for AutoCAD {x,y} points */
function isPointInPolygon(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Minimum distance from point (px,py) to any edge of polygon [{x,y}...] */
function minDistToPolygon(px, py, polygon) {
  let minD = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const ax = polygon[i].x, ay = polygon[i].y;
    const bx = polygon[j].x, by = polygon[j].y;
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-12) { // degenerate edge
      const d = Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
      if (d < minD) minD = d;
      continue;
    }
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    const d = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
    if (d < minD) minD = d;
  }
  return minD;
}

/** Check if point is inside polygon OR within buffer distance of its boundary */
function isWithinPolygonBuffer(px, py, polygon, buffer) {
  if (isPointInPolygon(px, py, polygon)) return true;
  return minDistToPolygon(px, py, polygon) <= buffer;
}

/** Parse scale denominator from "1:2000" or "1:500" etc. */
function parseScaleDenom(scaleStr) {
  if (!scaleStr) return 2500;
  const m = String(scaleStr).match(/1\s*:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 2500;
}

/** ISO paper sizes in mm (landscape orientation: width > height) */
const PAPER_SIZES = {
  'ISO_A4': { w: 297, h: 210 },
  'ISO_A3': { w: 420, h: 297 },
  'ISO_A2': { w: 594, h: 420 },
  'ISO_A1': { w: 841, h: 594 },
  'ISO_A0': { w: 1189, h: 841 },
};

// SHEET_LADDER, SCHEDULE_HEADER_HEIGHT_MM, nextLargerSheet, extractScheduleRow,
// computeScheduleLayout, addScheduleTable: extracted to dxfScheduleHelpers.js
// during sub-project 3-v2. Re-exported above so external consumers still work.


/** Convert PDF point size to ground metres at given scale */
function ptToGround(pt, S) { return pt * S * 0.000352778; }

/** Convert paper mm to ground metres at given scale */
function mmToGround(mm, S) { return mm * S / 1000; }

// â”€â”€ DXF R12 primitives â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function p(code, value) {
  return String(code).padStart(3) + '\n' + value + '\n';
}

// â”€â”€ Main generator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function generateDXF(options, logger) {
  // Warnings accumulator. Mutated by guards inside the emitters; returned
  // alongside the Buffer so the route can surface counts to the surveyor.
  const warnings = {
    count: 0,
    summary: {
      beacons: 0,
      parcels: 0,
      outsideFigureVertices: 0,
      scaleFallback: false,
      beaconDescTruncated: 0,
      priorDiagramsTruncated: 0,
      nonAscii: false,
      scheduleOverflow: null,
    },
  }
  /**
   * Records a warning of a given category. Three category families exist:
   *   booleans   â€” 'scaleFallback', 'nonAscii' (sets summary[category] to true)
   *   structured â€” any category ending in 'Overflow' (stores `value` as
   *                the payload object). Pre-3-v4 only 'scheduleOverflow'
   *                was structured; 3-v4 added ofd/beacon/statement/sg.
   *   counters   â€” everything else (adds `value` to summary[category])
   * `warnings.count` increments by 1 for booleans + structured, by `value`
   * for counters.
   */
  function warn(category, value = 1) {
    if (category === 'scaleFallback' || category === 'nonAscii') {
      warnings.summary[category] = true
      warnings.count += 1
      return
    }
    if (typeof category === 'string' && category.endsWith('Overflow')) {
      warnings.summary[category] = value
      warnings.count += 1
      return
    }
    warnings.summary[category] = (warnings.summary[category] || 0) + value
    warnings.count += value
  }

  const {
    parcels,
    beacons,
    outsideFigureData,
    metadata = {},
    projection = 'Cape Lo',
    scale,
    sheetSize = 'ISO_A2',
    sheetInfo = null,
    // SI 727 plan type. 'general-developed' suppresses parcel-edge distance +
    // direction labels (matches pdfkitLabeling.js:386,456 — developed township
    // general plans omit internal stand edge labels; per-stand survey diagrams
    // carry that detail instead). Outside-figure edge labels are unaffected.
    planType = null,
    // UI-supplied beacon label decisions. Same shape as PDF's `beaconLabels`:
    // [{ beaconName, text, isInsideParcel, displayInParcel, labelType }].
    // labelType 'suffix' / 'full' / 'suppressed'. When present, drives display
    // text + inside/outside placement (matches pdfkitGeoPDF.js:4654-4733). When
    // absent, falls back to pattern matching: `^(\d+)([A-Z]+)$` → prefix=stand,
    // suffix=letter; if a parcel has matching stand, show suffix inside, else
    // show full name outside.
    beaconLabels = null,
  } = options;
  const isDevelopedPlan = planType === 'general-developed';

  const declaredS = parseScaleDenom(scale);
  const paper = PAPER_SIZES[sheetSize] || PAPER_SIZES['ISO_A2'];

  // â”€â”€ Pre-scan drawing extent (outside figure + parcels ONLY, not unfiltered beacons) â”€â”€
  // Beacons are excluded because pre-filtering they span a huge area (e.g. 268 beacons).
  // Filtered beacons (within OF + 5m buffer) will all be inside the outside figure extent.
  let extMinX = Infinity, extMinY = Infinity, extMaxX = -Infinity, extMaxY = -Infinity;
  function trackExt(pt) {
    if (pt.x < extMinX) extMinX = pt.x;
    if (pt.y < extMinY) extMinY = pt.y;
    if (pt.x > extMaxX) extMaxX = pt.x;
    if (pt.y > extMaxY) extMaxY = pt.y;
  }
  // Outside figure edges define the primary extent
  if (outsideFigureData?.edges) {
    for (const e of outsideFigureData.edges) { trackExt(capeLoToDxfSouthUp(e.y, e.x)); }
  }
  // Also include non-outside-figure parcels (they should be inside OF, but just in case)
  if (parcels?.features) {
    for (const f of parcels.features) {
      const st = f.properties?.stand || '';
      if (f.properties?.isOutsideFigure || st.toLowerCase().includes('outside figure')) continue;
      const coords = f.geometry?.coordinates?.[0];
      if (!coords) continue;
      for (const c of coords) { trackExt(capeLoToDxfSouthUp(c[0], c[1])); }
    }
  }
  // Add 5m buffer for beacons that sit just outside the figure
  const extBuffer = 10; // metres
  extMinX -= extBuffer; extMinY -= extBuffer;
  extMaxX += extBuffer; extMaxY += extBuffer;
  const drawW = (extMaxX - extMinX) || 100;
  const drawH = (extMaxY - extMinY) || 100;

  // â”€â”€ Use declared scale from PDF export; auto-fit only as fallback â”€â”€
  let S;
  if (declaredS) {
    S = declaredS;
  } else {
    // Fallback: auto-fit drawing to ~70% of paper drawing zone
    const cW = paper.w - 50 - 150, cH = paper.h - 50 - 50;
    const aW = cW * 0.70, aH = cH * 0.55 * 0.70;
    S = Math.ceil(Math.max((drawW * 1000) / aW, (drawH * 1000) / aH) / 50) * 50;
  }

  logger.info(`[DXF] Drawing extent: ${drawW.toFixed(1)}m x ${drawH.toFixed(1)}m`);
  logger.info(`[DXF] Using scale 1:${S} (declared: 1:${declaredS}, sheet ${sheetSize} ${paper.w}x${paper.h}mm)`);

  // â”€â”€ Scale-aware sizes (matching pdfkitLabeling.js) â”€â”€
  let distPt, bearPt;
  if (S <= 500)       { distPt = 7; bearPt = 7; }
  else if (S <= 1000) { distPt = 7; bearPt = 7; }
  else if (S <= 2000) { distPt = 8; bearPt = 7; }
  else                { distPt = 9; bearPt = 8; }

  const distHeight = ptToGround(distPt, S);
  const bearHeight = ptToGround(bearPt, S);
  const edgeOffset = mmToGround(3, S);
  const pairGap = ptToGround(0.6, S);
  // PDF-parity sizing (#6 Task 6.2). Replaces fixed pt(1.5)/pt(6)/pt(1)+radius
  // with scale-aware values matching pdfkitGeoPDF.js:renderBeacons:4629-4636
  // (logarithmic radius, 1.8-3.0 pt clamp) and :4800-4807 (font tier switch).
  const beaconFontSizePt  = pickBeaconFontSize(S);
  const beaconLabelHeight = ptToGround(beaconFontSizePt, S);     // ground-metres
  const beaconRadiusMM    = computeBeaconRadius(S);              // paper-mm
  const beaconRadius      = mmToGround(beaconRadiusMM, S);       // ground-metres
  const beaconLabelOffset = beaconRadius + mmToGround(1, S);     // legacy fallback offset (used when all placers fail)

  logger.info(`[DXF] Sizes at 1:${S}: dist=${distHeight.toFixed(3)}m, bear=${bearHeight.toFixed(3)}m, offset=${edgeOffset.toFixed(3)}m, beaconR=${beaconRadius.toFixed(3)}m`);

  // ACI colors: 1=red, 2=yellow, 3=green, 4=cyan, 5=blue, 6=magenta, 7=white
  const layers = [
    { name: 'OUTSIDE_FIGURE',  color: 1 },
    { name: 'PARCELS',         color: 7 },
    { name: 'BEACONS',         color: 3 },
    { name: 'BEACON_LABELS',   color: 3 },
    { name: 'DISTANCES',       color: 4 },
    { name: 'DIRECTIONS',      color: 6 },
    { name: 'STAND_NUMBERS',   color: 2 },
    { name: 'TITLE_BLOCK',     color: 7 },
    { name: 'NORTH_ARROW',     color: 7 },
    { name: 'SCALE_BAR',       color: 7 },
    { name: 'GRID',            color: 8 },
    { name: 'MARGIN_GUIDES',   color: 8 },
    { name: 'OUTSIDE_FIGURE_LABELS', color: 8 },
  ];

  // Track extents
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  function trackPt(pt) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
    minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
  }

  // â”€â”€ Build entities â”€â”€
  let ent = '';

  function addPolyline(layer, points) {
    ent += p(0, 'POLYLINE');
    ent += p(8, layer);
    ent += p(66, '1');
    ent += p(70, '1');
    for (const pt of points) {
      ent += p(0, 'VERTEX');
      ent += p(8, layer);
      ent += p(10, pt.x.toFixed(4));
      ent += p(20, pt.y.toFixed(4));
    }
    ent += p(0, 'SEQEND');
    ent += p(8, layer);
  }

  function addCircle(layer, cx, cy, r) {
    ent += p(0, 'CIRCLE');
    ent += p(8, layer);
    ent += p(10, cx.toFixed(4));
    ent += p(20, cy.toFixed(4));
    ent += p(40, r.toFixed(4));
  }

  function addText(layer, x, y, text, height, rotation, style) {
    ent += p(0, 'TEXT');
    ent += p(8, layer);
    ent += p(10, x.toFixed(4));
    ent += p(20, y.toFixed(4));
    ent += p(40, height.toFixed(4));
    ent += p(1, text);
    if (rotation && rotation !== 0) {
      ent += p(50, rotation.toFixed(4));
    }
    if (style) {
      ent += p(7, style);
    }
  }

  function addLine(layer, x1, y1, x2, y2) {
    ent += p(0, 'LINE');
    ent += p(8, layer);
    ent += p(10, x1.toFixed(4));
    ent += p(20, y1.toFixed(4));
    ent += p(11, x2.toFixed(4));
    ent += p(21, y2.toFixed(4));
  }

  /**
   * Draw a beacon symbol differentiated by type.
   *   placed â†’ solid-filled circle (CIRCLE + 8 radial LINEs since R12 has no HATCH)
   *   found  â†’ open CIRCLE + crossing `+` (two LINEs through the centre)
   */
  function addBeaconSymbol(layer, cx, cy, type, sizeM) {
    const r = sizeM / 2
    addCircle(layer, cx, cy, r)
    if (type === 'placed') {
      // Eight short radial LINEs from centre outward at 45Â° intervals to mimic a fill
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4
        addLine(layer, cx, cy, cx + r * Math.cos(a), cy + r * Math.sin(a))
      }
    } else if (type === 'found') {
      // Two LINEs forming a "+" through the centre, length 1.4Â·r
      const h = r * 1.4
      addLine(layer, cx - h, cy, cx + h, cy)
      addLine(layer, cx, cy - h, cx, cy + h)
    }
  }

  /**
   * Draw a north-pointing arrow. After the 2026-06-05 orientation flip,
   * +DXF-Y is north (we negate Cape Lo X / southing), so the apex at +Y
   * correctly points up = north.
   * Three LINEs form the arrowhead triangle; one TEXT entity reads "S" above the apex.
   * sizeM is the arrowhead height in ground metres at the chosen scale.
   */
  function addNorthArrow(layer, cx, cy, sizeM) {
    const half = sizeM / 2
    const baseHalf = sizeM * 0.3
    const apex = { x: cx, y: cy + half }
    const baseL = { x: cx - baseHalf, y: cy - half }
    const baseR = { x: cx + baseHalf, y: cy - half }
    addLine(layer, apex.x, apex.y, baseL.x, baseL.y)
    addLine(layer, apex.x, apex.y, baseR.x, baseR.y)
    addLine(layer, baseL.x, baseL.y, baseR.x, baseR.y)
    addText(layer, cx, cy + half + mm(5), 'N', mm(4), 0)
  }

  /**
   * Graduated horizontal scale bar.
   * Bar length is chosen so the value at the right end rounds to a "nice"
   * number at the supplied scale (e.g., 100 m at 1:500, 500 m at 1:2500).
   */
  function addScaleBar(layer, cx, cy, scaleDenom) {
    const niceLengthM = pickNiceScaleBarLengthM(scaleDenom)
    const barWidthGround = niceLengthM   // bar spans exactly niceLengthM metres on the ground
    const halfW = barWidthGround / 2
    const halfH = mm(2)
    // Outer rectangle (2 horizontal LINEs)
    addLine(layer, cx - halfW, cy + halfH, cx + halfW, cy + halfH)
    addLine(layer, cx - halfW, cy - halfH, cx + halfW, cy - halfH)
    // Centreline
    addLine(layer, cx - halfW, cy, cx + halfW, cy)
    // Four vertical tick lines at 0 / Â¼ / Â½ / 1
    for (const f of [0, 0.25, 0.5, 1]) {
      const x = cx - halfW + f * barWidthGround
      addLine(layer, x, cy - halfH, x, cy + halfH)
      const labelM = Math.round(f * niceLengthM).toString()
      addText(layer, x, cy - halfH - mm(3), labelM, mm(2), 0)
    }
    // "1:<scale>" footer
    addText(layer, cx, cy - halfH - mm(8), `1:${scaleDenom}`, mm(2.5), 0)
  }

  /** Pick a round metre length suitable for a 60 mm bar at the given scale. */
  function pickNiceScaleBarLengthM(scaleDenom) {
    if (scaleDenom <= 500) return 50
    if (scaleDenom <= 1000) return 100
    if (scaleDenom <= 2500) return 250
    if (scaleDenom <= 5000) return 500
    return 1000
  }

  /**
   * Coordinate-grid edge ticks. For every Cape Lo Y, X that falls on a round
   * `gridStepM` multiple within the drawing bounds, emit short ticks inward
   * from each border with the rounded coordinate as a label.
   * No interior grid lines â€” matches the PDF exporter's drawGridReferences.
   * drawL/R/T/B are in DXF coordinate space (after south-up swap).
   */
  function addGridReferences(layer, drawL, drawR, drawT, drawB, gridStepM) {
    const tickLen = mm(5)
    // Horizontal axis ticks (DXF X = Cape Lo Y / westings)
    const xStart = Math.ceil(drawL / gridStepM) * gridStepM
    for (let x = xStart; x <= drawR; x += gridStepM) {
      addLine(layer, x, drawB, x, drawB + tickLen)
      addLine(layer, x, drawT, x, drawT - tickLen)
      const label = Math.round(x).toString()
      addText(layer, x, drawB - mm(3), label, mm(2), 0)
      addText(layer, x, drawT + mm(3), label, mm(2), 0)
    }
    // Vertical axis ticks (DXF Y = Cape Lo X / southings)
    const yStart = Math.ceil(drawB / gridStepM) * gridStepM
    for (let y = yStart; y <= drawT; y += gridStepM) {
      addLine(layer, drawL, y, drawL + tickLen, y)
      addLine(layer, drawR, y, drawR - tickLen, y)
      const label = Math.round(y).toString()
      addText(layer, drawL - mm(8), y, label, mm(2), 0)
      addText(layer, drawR + mm(2), y, label, mm(2), 0)
    }
  }

  /** Round grid step in metres for the given scale denominator. */
  function pickGridStepM(scaleDenom) {
    if (scaleDenom <= 500) return 100
    if (scaleDenom <= 1000) return 250
    if (scaleDenom <= 2500) return 500
    return 1000
  }

  /**
   * Drafting-table convention: short tick marks at each content-area corner +
   * tiny crop-mark crosses at each page corner.
   */
  function addMarginGuides(layer, pageL, pageR, pageT, pageB, cntL, cntR, cntT, cntB) {
    const tick = mm(5)
    const crop = mm(3)
    // Content-area corner ticks (2 LINEs per corner, one X-axis one Y-axis)
    const corners = [
      { x: cntL, y: cntT, dx: tick, dy: -tick },   // top-left
      { x: cntR, y: cntT, dx: -tick, dy: -tick },  // top-right
      { x: cntL, y: cntB, dx: tick, dy: tick },    // bottom-left
      { x: cntR, y: cntB, dx: -tick, dy: tick },   // bottom-right
    ]
    for (const c of corners) {
      addLine(layer, c.x, c.y, c.x + c.dx, c.y)
      addLine(layer, c.x, c.y, c.x, c.y + c.dy)
    }
    // Page-corner crop-mark crosses (2 LINEs per corner)
    const pageCorners = [
      { x: pageL, y: pageT }, { x: pageR, y: pageT },
      { x: pageL, y: pageB }, { x: pageR, y: pageB },
    ]
    for (const c of pageCorners) {
      addLine(layer, c.x - crop, c.y, c.x + crop, c.y)
      addLine(layer, c.x, c.y - crop, c.x, c.y + crop)
    }
  }

  /**
   * For each non-duplicate vertex of the outside figure, emit one TEXT entity
   * reading "Y=<westing> X=<southing>" (whole metres) on the OUTSIDE_FIGURE_LABELS
   * layer, offset 5 mm outward from the polygon centroid.
   *
   * @param {string} layer  Target layer name.
   * @param {Array<{y:number,x:number,pointId:string}>} vertices  From
   *   computeOutsideFigureVertices(); last entry is the closing duplicate.
   * @param {{x:number,y:number}} centroidGround  In DXF (south-up) coords.
   */
  function addOutsideFigureVertexLabels(layer, vertices, centroidGround) {
    const offset = mm(5)
    const height = mm(2)
    // Iterate vertices[0 .. length-2] â€” skip the closing duplicate at the end.
    for (let i = 0; i < vertices.length - 1; i++) {
      const v = vertices[i]
      const dxfV = capeLoToDxfSouthUp(v.y, v.x)
      let nx = dxfV.x - centroidGround.x
      let ny = dxfV.y - centroidGround.y
      const mag = Math.sqrt(nx * nx + ny * ny)
      if (mag < 1e-6) {
        // Degenerate centroid: fall back to fixed direction (DXF +X).
        nx = 1; ny = 0
        logger.warn(`[DXF] OF vertex ${v.pointId}: degenerate centroid, using +X fallback`)
      } else {
        nx /= mag; ny /= mag
      }
      const label = `Y=${Math.round(v.y)} X=${Math.round(v.x)}`
      addText(layer, dxfV.x + nx * offset, dxfV.y + ny * offset, label, height, 0)
    }
  }

  /**
   * For each non-duplicate vertex of the outside figure, emit one short LINE
   * tick on `layer` pointing outward from the polygon centroid. The
   * centroid-to-vertex direction matches the vertex-label placement so each
   * tick + label pair reads as a coherent "I am here at Y=â€¦ X=â€¦" marker.
   *
   * Functional-minimum: uses centroid direction. Pdfkit reference uses an
   * angle-bisector for concave outside figures â€” deferred.
   *
   * @param {string} layer
   * @param {Array<{y,x,pointId}>} vertices  From computeOutsideFigureVertices().
   * @param {{x,y}} centroidGround
   */
  function addOutsideFigureTickMarks(layer, vertices, centroidGround) {
    const tickLen = mm(3)
    for (let i = 0; i < vertices.length - 1; i++) {
      const v = vertices[i]
      const dxfV = capeLoToDxfSouthUp(v.y, v.x)
      let nx = dxfV.x - centroidGround.x
      let ny = dxfV.y - centroidGround.y
      const mag = Math.sqrt(nx * nx + ny * ny)
      if (mag < 1e-6) { nx = 1; ny = 0 } else { nx /= mag; ny /= mag }
      addLine(layer, dxfV.x, dxfV.y, dxfV.x + nx * tickLen, dxfV.y + ny * tickLen)
    }
  }

  /**
   * For each edge of the outside figure, emit a distance TEXT on `distLayer`
   * and a South-oriented bearing TEXT on `dirLayer`, placed at the edge
   * midpoint offset outward from the polygon centroid.
   *
   * Distance text format: "<m>.<cm>" via toFixed(2).
   * Bearing text: preserves edges[i].direction when it parses as DMS, else
   * derives via degToDMS() from the vertex delta.
   *
   * @param {string} distLayer  Existing DISTANCES layer.
   * @param {string} dirLayer   Existing DIRECTIONS layer.
   * @param {Array<{y,x,pointId}>} vertices  From computeOutsideFigureVertices()
   *   (with closing duplicate so vertices[i+1] is always valid).
   * @param {Array} edges  Raw outsideFigureData.edges array (parallel to
   *   vertices[0..length-2] â€” edges[i] starts at vertices[i]).
   * @param {{x,y}} centroidGround
   */
  function addOutsideFigureEdgeLabels(distLayer, dirLayer, vertices, edges, centroidGround) {
    const distOffset = mm(3)
    const bearOffset = mm(6)
    for (let i = 0; i < vertices.length - 1; i++) {
      const a = capeLoToDxfSouthUp(vertices[i].y, vertices[i].x)
      const b = capeLoToDxfSouthUp(vertices[i + 1].y, vertices[i + 1].x)
      const dx = b.x - a.x, dy = b.y - a.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len < 1e-6) continue   // degenerate edge â€” skip silently
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      // Counter-clockwise 90Â° rotation of the edge direction, then flip
      // toward the outside (away from polygon centre).
      let nx = -dy / len, ny = dx / len
      if (nx * (mx - centroidGround.x) + ny * (my - centroidGround.y) < 0) {
        nx = -nx; ny = -ny
      }
      // Edge angle for upright text.
      let ang = Math.atan2(dy, dx) * (180 / Math.PI)
      if (ang > 90 || ang < -90) ang += 180

      // Edge metadata is only valid when the polygon edge vertices[i] â†’ vertices[i+1]
      // corresponds to a single ORIGINAL edge in outsideFigureData.edges (i.e., no
      // vertex was filtered between them). Intactness check: edges[vIdx] describes
      // the original edge whose successor is original-index (vIdx + 1) mod N, so
      // the next polygon vertex must carry that original-index to match. When the
      // check fails (a filtered vertex bridged two original edges), fall back to
      // geometry by leaving `edge` empty.
      const vIdx = vertices[i].edgeIndex
      const vIdxNext = vertices[i + 1].edgeIndex
      const isIntact = typeof vIdx === 'number'
        && typeof vIdxNext === 'number'
        && vIdxNext === (vIdx + 1) % edges.length
      const edge = isIntact ? (edges[vIdx] || {}) : {}
      const givenDist = typeof edge.distance === 'number'
        ? edge.distance
        : parseFloat(edge.distance)
      const distVal = Number.isFinite(givenDist) ? givenDist : len
      const distText = distVal.toFixed(2)

      // Bearing text â€” prefer edges[i].direction when it looks like DMS,
      // else derive South-oriented bearing from the vertex delta.
      const dirStr = typeof edge.direction === 'string' ? edge.direction : ''
      const dirText = /\d+\D+\d+\D+\d+/.test(dirStr)
        ? dirStr
        : degToDMS((((Math.atan2(
            vertices[i + 1].y - vertices[i].y,
            vertices[i + 1].x - vertices[i].x
          ) * 180 / Math.PI) % 360) + 360) % 360)

      addText(distLayer, mx + nx * distOffset, my + ny * distOffset, distText, distHeight, ang)
      addText(dirLayer, mx + nx * bearOffset, my + ny * bearOffset, dirText, bearHeight, ang)
    }
  }

  function addRect(layer, x1, y1, x2, y2) {
    addLine(layer, x1, y1, x2, y1); // bottom
    addLine(layer, x2, y1, x2, y2); // right
    addLine(layer, x2, y2, x1, y2); // top
    addLine(layer, x1, y2, x1, y1); // left
  }

  /**
   * Beacon descriptions table â€” one row per beaconGroups[] entry.
   * Truncates with "+ N more â€” see PDF" if rows would overflow zoneBottom.
   */
  function addBeaconDescription(layer, zoneL, zoneR, zoneTop, zoneBottom, beaconGroups) {
    if (!Array.isArray(beaconGroups) || beaconGroups.length === 0) return
    const headerH = mm(4)
    const rowH = mm(3.5)
    let y = zoneTop
    addText(layer, zoneL, y, 'BEACON DESCRIPTIONS', headerH, 0, 'BOLD')
    y -= headerH * 1.4
    // Separator LINE
    addLine(layer, zoneL, y, zoneR, y)
    y -= mm(1)
    let printed = 0
    for (const g of beaconGroups) {
      if (y - rowH < zoneBottom) break
      const text = `${g.points}: ${g.description || ''}`
      addText(layer, zoneL, y, text, mm(2.4), 0)
      y -= rowH
      printed++
    }
    const remaining = beaconGroups.length - printed
    if (remaining > 0) {
      if (y - rowH < zoneBottom) y = zoneBottom + rowH    // squeeze in the footer
      addText(layer, zoneL, y, `+ ${remaining} more â€” see PDF for full list`, mm(2.2), 0)
      warn('beaconDescTruncated', remaining)
    }
  }

  /**
   * Full endorsement zone in the right-margin column. Five sub-blocks,
   * top to bottom:
   *   1. APPROVED FOR LODGEMENT header + Date / Surveyor-General / Reference lines
   *   2. Dispensation Certificate slot
   *   3. Plan number stamp box (RECT 30 Ã— 15 mm)
   *   4. Prior diagram references (list or "None")
   *   5. Surveyor certification footer
   */
  function drawEndorsementZone(zoneL, zoneR, zoneTop, zoneBottom) {
    // NOTE: mm() and pt() are not yet defined at helper-definition time; they
    // are only called at call-time (after S is set), so this is safe.
    let y = zoneTop
    const lineH = mm(4)
    // â”€â”€ 1) SG approval header â”€â”€
    addText(TB, zoneL, y, 'APPROVED FOR LODGEMENT', mm(3.5), 0, 'BOLD')
    y -= lineH
    for (const lbl of ['Date', 'Surveyor-General', 'Reference']) {
      addText(TB, zoneL, y, `${lbl}: `, mm(2.4), 0)
      addLine(TB, zoneL + mm(20), y - mm(1), zoneR - mm(2), y - mm(1))
      y -= lineH
    }
    y -= mm(2)
    // â”€â”€ 2) Dispensation Certificate slot â”€â”€
    addText(TB, zoneL, y,
            'Dispensation Certificate No. ........... relates to this plan',
            mm(2.4), 0)
    y -= lineH * 1.5
    // â”€â”€ 3) Plan number stamp box â”€â”€
    const boxW = mm(30), boxH = mm(15)
    addRect(TB, zoneL, y - boxH, zoneL + boxW, y)
    addText(TB, zoneL + mm(2), y - mm(4), 'Plan No.:', mm(2.4), 0)
    y -= boxH + mm(4)
    // â”€â”€ 4) Prior diagrams â”€â”€
    const priors = metadata.priorDiagrams || []
    if (priors.length === 0) {
      addText(TB, zoneL, y, 'Prior diagrams: None', mm(2.4), 0)
      y -= lineH
    } else {
      addText(TB, zoneL, y, 'Prior diagrams:', mm(2.4), 0, 'BOLD')
      y -= lineH
      let printed = 0
      for (const d of priors) {
        if (y - lineH < zoneBottom + mm(15)) break
        addText(TB, zoneL + mm(3), y, d, mm(2.4), 0)
        y -= lineH
        printed++
      }
      const remaining = priors.length - printed
      if (remaining > 0) {
        addText(TB, zoneL + mm(3), y, `+ ${remaining} more (see PDF)`, mm(2.2), 0)
        y -= lineH
        warn('priorDiagramsTruncated', remaining)
      }
    }
    // â”€â”€ 5) Surveyor certification footer â”€â”€
    // Guard: emit unless there is clearly no vertical room.
    // Treat NaN (degenerate layout) as "room available" so the text
    // always appears in test fixtures with empty geometry.
    if (!(zoneBottom + mm(15) > y)) {
      const surv = metadata.surveyor || '<surveyor>'
      const lic = metadata.licenseNumber || ''
      addText(TB, zoneL, zoneBottom + mm(10),
              `I, ${surv} (PLS ${lic}), certify this plan correct`,
              mm(2.4), 0)
      addLine(TB, zoneL, zoneBottom + mm(6), zoneR - mm(2), zoneBottom + mm(6))
    }
  }

  // â”€â”€ 1. Outside Figure boundary â”€â”€
  let ofPolygon = null; // AutoCAD coords for beacon filtering
  let ofResult = null; // Will store vertex data for annotation (computed below)
  if (outsideFigureData?.edges?.length > 0) {
    const ofPts = outsideFigureData.edges.map((e) => {
      const pt = capeLoToDxfSouthUp(e.y, e.x); trackPt(pt); return pt;
    });
    addPolyline('OUTSIDE_FIGURE', ofPts);
    ofPolygon = ofPts; // save for beacon filtering
    logger.info(`[DXF] Outside Figure: ${ofPts.length} vertices`);

    // Compute vertex data for later annotation (after mm is defined)
    ofResult = computeOutsideFigureVertices(outsideFigureData);
    if (ofResult.skippedCount > 0) {
      warn('outsideFigureVertices', ofResult.skippedCount);
    }
  }

  // â”€â”€ 2. Identify shared edges (topology â€” same as PDF) â”€â”€
  const edgeOccurrences = new Map();
  if (parcels?.features) {
    for (const feature of parcels.features) {
      const coords = feature.geometry?.coordinates?.[0];
      if (!coords) continue;
      for (let i = 0; i < coords.length - 1; i++) {
        const key = createEdgeKey(coords[i], coords[i + 1]);
        edgeOccurrences.set(key, (edgeOccurrences.get(key) || 0) + 1);
      }
    }
  }
  const sharedEdges = new Set();
  edgeOccurrences.forEach((count, key) => { if (count > 1) sharedEdges.add(key); });
  const labeledEdges = new Map(); // edgeKey â†’ { distance: bool, bearing: bool }
  logger.info(`[DXF] Shared edges detected: ${sharedEdges.size}`);

  // â”€â”€ 3. Parcels + stand numbers + edge labels â”€â”€
  let parcelCount = 0, edgeLabelCount = 0;
  if (parcels?.features) {
    for (const feature of parcels.features) {
      const props = feature.properties || {};
      const stand = props.stand || '';
      if (props.isOutsideFigure || stand.toLowerCase().includes('outside figure')) continue;
      const coords = feature.geometry?.coordinates?.[0];
      if (!coords) continue;

      // Guard: skip parcel with fewer than 3 finite vertices
      const rawVerts = coords;
      const finiteVerts = rawVerts.filter(([yy, xx]) =>
        Number.isFinite(yy) && Number.isFinite(xx));
      if (finiteVerts.length !== rawVerts.length || finiteVerts.length < 3) {
        logger.warn(`[DXF] dropped parcel ${stand || '<unnamed>'}: missing or non-finite vertices (${finiteVerts.length}/${rawVerts.length} finite)`)
        warn('parcels')
        continue
      }

      // Build AutoCAD polygon (unique vertices, no closing duplicate)
      const polyPts = coords.slice(0, -1).map((c) => {
        const pt = capeLoToDxfSouthUp(c[0], c[1]); trackPt(pt); return pt;
      });
      addPolyline('PARCELS', polyPts);
      parcelCount++;

      // â”€â”€ Stand label: shoelace centroid + 4d's iterative font-shrink â”€â”€
      const centroid = shoelaceCentroid(polyPts);
      const area = polygonAreaGround(polyPts);

      // Adaptive stand font size â€” area-bucketed initial value (matches existing behavior).
      // 4d's findStandLabelPosition may shrink this further if the rendered string
      // doesn't fit the parcel's allowable bounds.
      let standPt;
      if (area > 10000) standPt = 16;
      else if (area > 2000) standPt = 14;
      else if (area > 500) standPt = 12;
      else if (area > 100) standPt = 10;
      else standPt = 8;
      const standHeight = ptToGround(standPt, S);

      // Find longest edge angle (matches PDF's renderDeferredStandLabels)
      let longestLen = 0, longestAngle = 0;
      for (let i = 0; i < polyPts.length; i++) {
        const j = (i + 1) % polyPts.length;
        const dx = polyPts[j].x - polyPts[i].x;
        const dy = polyPts[j].y - polyPts[i].y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > longestLen) {
          longestLen = len;
          longestAngle = Math.atan2(dy, dx) * (180 / Math.PI);
        }
      }
      if (longestAngle > 90) longestAngle -= 180;
      if (longestAngle < -90) longestAngle += 180;

      // 4d: smart stand-label position. Falls back to centroid if placer returns null
      // (degenerate polygon â€” same as the existing Number.isFinite guard below).
      const standPos = findStandLabelPosition({
        polygon: polyPts, standNumber: String(stand), fontHeight: standHeight,
      });
      if (standPos && Number.isFinite(standPos.x) && Number.isFinite(standPos.y)) {
        addText('STAND_NUMBERS', standPos.x, standPos.y, String(stand), standPos.fontHeight, longestAngle, 'BOLD');
      } else if (Number.isFinite(centroid.x) && Number.isFinite(centroid.y)) {
        // Fallback: existing inline behavior. Matches pre-4d output for degenerate polygons.
        addText('STAND_NUMBERS', centroid.x, centroid.y, String(stand), standHeight, longestAngle, 'BOLD');
      }

      // â”€â”€ Edge labels with shared-edge topology â”€â”€
      // Most callers don't pre-compute props.edges; derive distance + South-
      // oriented bearing from successive vertex pairs as a fallback so the
      // DISTANCES / DIRECTIONS layers populate even when the GeoJSON omits
      // edges. South-oriented whole-circle bearing convention: 0Â° = +Southing
      // (south), 90Â° = +Westing (west), normalised to [0, 360).
      let edges = props.edges || [];
      if (edges.length === 0 && coords.length > 1) {
        edges = [];
        for (let i = 0; i < coords.length - 1; i++) {
          const a = coords[i], b = coords[i + 1];
          const dY = b[0] - a[0];   // Westing delta
          const dX = b[1] - a[1];   // Southing delta
          const distance = Math.sqrt(dY * dY + dX * dX);
          let bearing = Math.atan2(dY, dX) * (180 / Math.PI);
          bearing = ((bearing % 360) + 360) % 360;
          edges.push({ distance, bearing });
        }
      }
      for (let i = 0; i < edges.length && i < coords.length - 1; i++) {
        const edge = edges[i];
        if (!edge) continue;

        const edgeKey = createEdgeKey(coords[i], coords[i + 1]);
        const isShared = sharedEdges.has(edgeKey);
        const edgeInfo = labeledEdges.get(edgeKey);

        // Determine label mode (matches PDF's renderEdgeLabels logic)
        let labelMode = 'both';
        if (edgeInfo) {
          if (edgeInfo.distance && edgeInfo.bearing) continue; // fully labeled
          else if (edgeInfo.distance && !edgeInfo.bearing) labelMode = 'bearing-only';
          else if (!edgeInfo.distance && edgeInfo.bearing) labelMode = 'distance-only';
        } else if (isShared) {
          labelMode = 'distance-only'; // first parcel gets distance, second gets bearing
        }

        const a = capeLoToDxfSouthUp(coords[i][0], coords[i][1]);
        const b = capeLoToDxfSouthUp(coords[i + 1][0], coords[i + 1][1]);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.01) continue;

        // Edge angle (keep text readable)
        let ang = Math.atan2(dy, dx) * (180 / Math.PI);
        if (ang > 90 || ang < -90) ang += 180;

        // Perpendicular toward centroid (existing â€” kept as fallback when placer returns null)
        let nx = -dy / len, ny = dx / len;
        if (nx * (centroid.x - mx) + ny * (centroid.y - my) < 0) { nx = -nx; ny = -ny; }

        // Distance text
        const distVal = edge.distanceRounded ?? edge.distance;
        const distNum = typeof distVal === 'number' ? distVal : parseFloat(distVal);
        const distText = Number.isFinite(distNum) ? distNum.toFixed(2) : null;

        // Direction text
        const bearDeg = typeof edge.bearing === 'number' ? edge.bearing
          : typeof edge.bearingDeg === 'number' ? edge.bearingDeg
          : parseFloat(edge.bearing);
        const dirText = Number.isFinite(bearDeg) ? (edge.directionDMS || degToDMS(bearDeg)) : null;

        // 4d: smart edge-label position for the distance label (the bearing label,
        // if any, is positioned at a further offset along the same perpendicular
        // direction). Char-width approximation for label-width estimate matches
        // sub-project #2's splitToWidth convention.
        const distLabelWidth = distText ? distText.length * distHeight * 0.55 : distHeight * 4;
        const smartPos = findEdgeLabelPosition({
          edgeStart: a, edgeEnd: b, polygon: polyPts,
          labelHeight: distHeight, labelWidth: distLabelWidth, angle: ang,
        });

        // Derive distance-label position + implied offset for stacking the bearing
        const distX = smartPos?.x ?? (mx + nx * edgeOffset);
        const distY = smartPos?.y ?? (my + ny * edgeOffset);
        // Implied offset = distance from edge midpoint to chosen position.
        // Falls back to the existing fixed edgeOffset when the placer returned null.
        const impliedOffset = smartPos
          ? Math.sqrt((distX - mx) * (distX - mx) + (distY - my) * (distY - my))
          : edgeOffset;

        // Developed Township General Plan: suppress parcel-edge distance + direction
        // labels (per-stand survey diagrams carry that detail). Still record the edge
        // in labeledEdges so shared-edge topology decisions for any non-developed edges
        // remain consistent. Outside-figure edge labels are emitted on a separate path
        // (addOutsideFigureEdgeLabels at the figure-emission site) and are NOT affected.
        if (isDevelopedPlan) {
          if (!edgeInfo) {
            labeledEdges.set(edgeKey, { distance: false, bearing: false });
          }
          continue;
        }

        if (labelMode === 'both' || labelMode === 'distance-only') {
          if (distText) {
            addText('DISTANCES', distX, distY, distText, distHeight, ang);
            edgeLabelCount++;
          }
          // Register this edge
          if (!edgeInfo) {
            labeledEdges.set(edgeKey, { distance: true, bearing: false });
          } else {
            edgeInfo.distance = true;
          }
          // For non-shared 'both': place bearing stacked further out along the same perpendicular
          if (labelMode === 'both' && dirText) {
            const bearOff = impliedOffset + distHeight / 2 + pairGap + bearHeight / 2;
            addText('DIRECTIONS', mx + nx * bearOff, my + ny * bearOff, dirText, bearHeight, ang);
            edgeLabelCount++;
            const stored = labeledEdges.get(edgeKey);
            if (stored) stored.bearing = true;
          }
        }

        if (labelMode === 'bearing-only' && dirText) {
          // Shared edge: bearing uses the smart position too (single label, not stacked)
          addText('DIRECTIONS', distX, distY, dirText, bearHeight, ang);
          edgeLabelCount++;
          if (edgeInfo) edgeInfo.bearing = true;
        }
      }
    }
  }
  logger.info(`[DXF] Parcels: ${parcelCount}, Edge labels: ${edgeLabelCount}`);

  // ── 4. Beacons (filtered to outside figure + 2m buffer) ──
  const BEACON_BUFFER = 2; // metres
  let beaconCount = 0, beaconsSkipped = 0;

  // Pre-compute parcel lookup maps for beacon-label placement (matches PDF's
  // beaconLabelMap + parcel lookup at pdfkitGeoPDF.js:4779-4783, 4881-4884).
  // parcelByStand: stand-string → polygon in DXF coords. Used to find the parcel
  //   whose stand matches a beacon name's numeric prefix (e.g. "2475A" → "2475").
  // parcelById: numeric id → polygon in DXF coords. Used when the UI supplies an
  //   explicit `displayInParcel` parcel id.
  const parcelByStand = new Map();
  const parcelById = new Map();
  if (parcels?.features) {
    for (const feature of parcels.features) {
      const props = feature.properties || {};
      if (props.isOutsideFigure) continue;
      const coords = feature.geometry?.coordinates?.[0];
      if (!Array.isArray(coords) || coords.length < 4) continue;
      const poly = coords.slice(0, -1)
        .map(c => capeLoToDxfSouthUp(c[0], c[1]))
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (poly.length < 3) continue;
      const standKey = String(props.stand ?? '');
      if (standKey) parcelByStand.set(standKey, poly);
      const idKey = props.id ?? feature.id;
      if (idKey != null) parcelById.set(String(idKey), poly);
    }
  }

  // UI-supplied label map (when provided). One entry per beacon name.
  const beaconLabelMap = new Map();
  if (Array.isArray(beaconLabels)) {
    for (const lbl of beaconLabels) {
      if (lbl && lbl.beaconName) beaconLabelMap.set(lbl.beaconName, lbl);
    }
  }

  // Helper: decide displayLabel + which parcel polygon to use for inside
  // placement. Returns null when the label should be suppressed.
  // Position computation is the placer's job — done downstream in the beacon
  // emission loop using the dxfBeaconPlacer module (#6 Task 6.3).
  const labelDecision = (beaconName) => {
    if (!beaconName) return null;

    // PRIORITY 1: UI-supplied label.
    const uiLabel = beaconLabelMap.get(beaconName);
    if (uiLabel) {
      if (uiLabel.labelType === 'suppressed') return null;
      const text = String(uiLabel.text || '');
      if (!text) return null;
      if (uiLabel.isInsideParcel && uiLabel.displayInParcel != null) {
        const polygon = parcelById.get(String(uiLabel.displayInParcel));
        if (polygon) return { text, isInsideParcel: true, polygon };
      }
      return { text, isInsideParcel: false, polygon: null };
    }

    // PRIORITY 2: pattern-matched fallback (matches PDF:4855-4951).
    const m = beaconName.match(/^(\d+)([A-Za-z]+)$/);
    if (m) {
      const polygon = parcelByStand.get(m[1]);
      if (polygon) return { text: m[2].toUpperCase(), isInsideParcel: true, polygon };
    }
    return { text: beaconName, isInsideParcel: false, polygon: null };
  };

  /**
   * Walk splay components via BFS, order each by angle, return a flat list
   * of beacon features in emission order. Solo beacons (not in any splay
   * group) appear in their original input order. (#6 Task 6.5)
   */
  function computeBeaconIterationOrder(features, beaconPositions, splayMap) {
    const beaconsByName = new Map(features.map(f => {
      const n = f.properties?.pointId || f.properties?.name || f.properties?.beacon_name;
      return [n, f];
    }));
    const emitted = new Set();
    const order = [];
    for (const f of features) {
      const name = f.properties?.pointId || f.properties?.name || f.properties?.beacon_name;
      if (!name || emitted.has(name)) continue;
      const neighbors = splayMap.get(name);
      if (!neighbors || neighbors.length === 0) {
        order.push(f);
        emitted.add(name);
        continue;
      }
      const component = new Set([name]);
      const queue = [name];
      while (queue.length) {
        const cur = queue.shift();
        for (const n of (splayMap.get(cur) || [])) {
          if (!component.has(n.name)) { component.add(n.name); queue.push(n.name); }
        }
      }
      const members = [...component].map(n => ({ name: n, pos: beaconPositions.get(n) }));
      for (const m of orderSplayGroupByAngle(members)) {
        const feat = beaconsByName.get(m.name);
        if (feat) order.push(feat);
        emitted.add(m.name);
      }
    }
    return order;
  }

  // ── Pre-loop setup (#6 Task 6.4) ───────────────────────────────────────────
  const beaconPositions = new Map();
  if (beacons?.features) {
    for (const f of beacons.features) {
      const rc = f.geometry?.coordinates;
      if (!Array.isArray(rc) || rc.length < 2) continue;
      const [byRaw, bxRaw] = rc;
      if (!Number.isFinite(byRaw) || !Number.isFinite(bxRaw)
          || Math.abs(byRaw) > 1e7 || Math.abs(bxRaw) > 1e7) continue;
      const pt = capeLoToDxfSouthUp(rc[0], rc[1]);
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
      const name = f.properties?.pointId || f.properties?.name || f.properties?.beacon_name;
      if (name) beaconPositions.set(name, pt);
    }
  }

  // For each beacon, find the parcel polygons whose vertex matches the beacon.
  const incidentParcelsByBeacon = new Map();
  for (const [name, pt] of beaconPositions) {
    const inc = [];
    if (parcels?.features) {
      for (const f of parcels.features) {
        if (f.properties?.isOutsideFigure) continue;
        const coords = f.geometry?.coordinates?.[0];
        if (!Array.isArray(coords) || coords.length < 4) continue;
        const poly = coords.slice(0, -1).map(c => capeLoToDxfSouthUp(c[0], c[1]));
        if (poly.some(p => Math.abs(p.x - pt.x) < 0.01 && Math.abs(p.y - pt.y) < 0.01)) {
          inc.push(poly);
        }
      }
    }
    if (inc.length > 0) incidentParcelsByBeacon.set(name, inc);
  }

  const PT_TO_MM_GEN = 25.4 / 72;
  const proximityFloorG = mmToGround(18 * PT_TO_MM_GEN, S);
  const splayMap = groupSplayBeacons(beaconPositions, beaconRadius, proximityFloorG);
  const iterationOrder = computeBeaconIterationOrder(beacons?.features || [], beaconPositions, splayMap);

  const registry = createCollisionRegistry();
  const deferredCircles = [];
  // 2026-06-06: leader-line emission suppressed by user request. Beacon
  // labels keep their leader-aware placements (POI, tight-outside,
  // edge-anchored) — the placer's geometry isn't affected — but no LINE
  // entities are emitted on the BEACON_LABELS layer. The visual result:
  // labels sit near their beacons (proximity carries the association)
  // without any connecting strokes. See the (commented-out) leader
  // emission block further down for the prior trigger logic.

  // ── Beacon emission loop (#6 Task 6.4) ─────────────────────────────────────
  for (const feature of iterationOrder) {
    const rc = feature.geometry?.coordinates;
    if (!Array.isArray(rc) || rc.length < 2) continue;

    const [byRaw, bxRaw] = rc;
    if (!Number.isFinite(byRaw) || !Number.isFinite(bxRaw)
        || Math.abs(byRaw) > 1e7 || Math.abs(bxRaw) > 1e7) {
      logger.warn(`[DXF] dropped beacon ${feature.properties?.pointId || '<unnamed>'}: bad coords`);
      warn('beacons');
      continue;
    }
    const pt = capeLoToDxfSouthUp(rc[0], rc[1]);
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;

    if (ofPolygon && !isWithinPolygonBuffer(pt.x, pt.y, ofPolygon, BEACON_BUFFER)) {
      beaconsSkipped++;
      continue;
    }

    trackPt(pt);
    const beaconType = feature.properties?.type || 'placed';
    const beaconDiameter = beaconRadius * 2;

    // Defer the beacon symbol — emitted after all labels so circles sit on top.
    deferredCircles.push({ x: pt.x, y: pt.y, type: beaconType, diameter: beaconDiameter });
    beaconCount++;

    const name = feature.properties?.pointId
              || feature.properties?.name
              || feature.properties?.beacon_name
              || '';
    if (!name) continue;
    const decision = labelDecision(name);
    if (!decision) continue;

    const labelText    = decision.text;
    const labelWidth   = labelText.length * beaconLabelHeight * 0.55;
    const labelHeightG = beaconLabelHeight * 1.2;

    let labelPos;
    if (decision.isInsideParcel && decision.polygon) {
      labelPos = placeSuffixLabelPOIDirected({
        beaconPos: pt, polygon: decision.polygon,
        labelWidth, labelHeight: labelHeightG,
        beaconRadius, registry,
      });
    } else {
      const incident = incidentParcelsByBeacon.get(name) || [];
      const padding  = mmToGround(0.8, S);
      labelPos =
        tryTightFullBeaconLabelPosition({
          beaconPos: pt, labelWidth, labelHeight: labelHeightG,
          beaconRadius, padding, incidentPolygons: incident, registry,
        })
        || calculateFullBeaconLabelOutsideOnEdge({
          beaconPos: pt, incidentPolygons: incident,
          labelWidth, labelHeight: labelHeightG,
          beaconRadius, registry,
        })
        || {
          x: pt.x + beaconLabelOffset,
          y: pt.y + beaconLabelOffset,
        };
    }

    registry.add({ x: labelPos.x, y: labelPos.y, width: labelWidth, height: labelHeightG });
    addText('BEACON_LABELS', labelPos.x, labelPos.y, labelText, beaconLabelHeight);

    // 2026-06-06: leader-line emission removed by user request. The placer
    // still uses leader-aware geometry to position labels (POI-directed,
    // tight-outside, edge-anchored); we just don't draw the connecting line.
    // Original emission (preserved here as a comment for future restoration):
    //
    //   const lcx = labelPos.x + labelWidth / 2;
    //   const lcy = labelPos.y + labelHeightG / 2;
    //   if (Math.hypot(lcx - pt.x, lcy - pt.y) > LEADER_THRESHOLD) {
    //     const angle       = Math.atan2(pt.y - lcy, pt.x - lcx);
    //     const beaconEdgeX = pt.x - Math.cos(angle) * beaconRadius;
    //     const beaconEdgeY = pt.y - Math.sin(angle) * beaconRadius;
    //     const closestX    = Math.max(labelPos.x, Math.min(pt.x, labelPos.x + labelWidth));
    //     const closestY    = Math.max(labelPos.y, Math.min(pt.y, labelPos.y + labelHeightG));
    //     addLine('BEACON_LABELS', beaconEdgeX, beaconEdgeY, closestX, closestY);
    //   }
  }

  // ── Deferred-circle z-order: emit beacon symbols AFTER all labels ──────────
  for (const c of deferredCircles) {
    addBeaconSymbol('BEACONS', c.x, c.y, c.type, c.diameter);
  }
  logger.info(`[DXF] Beacons: ${beaconCount} included, ${beaconsSkipped} filtered out (outside figure + ${BEACON_BUFFER}m buffer)`);

  // â”€â”€ 5. Page layout (matching PDF structure) â”€â”€
  const mm = (v) => mmToGround(v, S); // shorthand
  const pt = (v) => ptToGround(v, S);

  // ── Outside-figure vertex labels ──
  // (OF polyline and vertex calculation done earlier; now emit the labels)
  // Vertex coordinate labels (e.g. "M4") + tick marks always emit.
  // Outside-figure edge distance + direction labels are suppressed for
  // developed townships (matches the parcel-edge suppression below — the
  // user's instruction extends the PDF's `isDeveloped` behavior to all edge
  // labels, including the OF boundary).
  if (ofResult && ofResult.vertices.length >= 3) {
    const ofDxfPts = ofResult.vertices.slice(0, -1)
      .map(v => capeLoToDxfSouthUp(v.y, v.x));
    const ofCentroid = shoelaceCentroid(ofDxfPts);
    addOutsideFigureVertexLabels('OUTSIDE_FIGURE_LABELS', ofResult.vertices, ofCentroid);
    addOutsideFigureTickMarks('OUTSIDE_FIGURE_LABELS', ofResult.vertices, ofCentroid);
    if (!isDevelopedPlan) {
      addOutsideFigureEdgeLabels('DISTANCES', 'DIRECTIONS',
                                  ofResult.vertices, outsideFigureData.edges, ofCentroid);
    }
  }

  // Extract central meridian
  const loMatch = String(projection).match(/222(\d+)/);
  const centralMeridian = loMatch ? loMatch[1] : '31';

  // Text sizes
  const hTitle = pt(16);     // GENERAL PLAN
  const hSub = pt(10);       // subtitles
  const hBody = pt(7);       // table body
  const hHead = pt(8);       // table headers
  const rH = hBody * 1.6;    // row height

  // Drawing bounds. When no features were tracked (empty parcels + empty
  // beacons + no outside figure data), minX/maxX stay at ±Infinity from
  // their initial values. Guard against that so cntL/cntR/cntT/cntB stay
  // finite — otherwise the bottom-zone topology emitter receives a NaN
  // contentArea and fires spurious overflow warns. Default fallback span:
  // 100m around origin (matches drawW/drawH fallback at line 467).
  const dL = Number.isFinite(minX) ? minX : 0;
  const dR = Number.isFinite(maxX) ? maxX : 100;
  const dT = Number.isFinite(maxY) ? maxY : 100;
  const dB = Number.isFinite(minY) ? minY : 0;
  const dW = dR - dL, dH = dT - dB;
  const dCX = (dL + dR) / 2;

  // â”€â”€ Page frame from actual paper size with exact margins â”€â”€
  // Margins: L=50mm, T=50mm, B=50mm, R=150mm (endorsements in right margin)
  const mL = mm(50), mT = mm(50), mB = mm(50), mR = mm(150);
  const pageW = mm(paper.w);   // full paper width in ground
  const pageH = mm(paper.h);   // full paper height in ground

  // Content area dimensions (inside margins, excluding endorsements)
  const contentW = pageW - mL - mR;   // 594 - 50 - 150 = 394mm
  const contentH = pageH - mT - mB;   // 420 - 50 - 50 = 320mm

  // Page positioned so drawing is centered in content area
  const contentCX = dCX;                              // drawing centered horizontally
  const contentCY = (dT + dB) / 2;                    // drawing centered vertically

  // Page edges (outer border)
  const pageL = contentCX - contentW / 2 - mL;       // left edge of paper
  const pageR = pageL + pageW;                        // right edge of paper
  const pageB = contentCY - contentH / 2 - mB;       // bottom edge of paper
  const pageT = pageB + pageH;                        // top edge of paper

  // Content area edges (inside margins)
  const cntL = pageL + mL;                            // content left  (50mm from left)
  const cntR = pageR - mR;                            // content right (150mm from right)
  const cntT = pageT - mT;                            // content top   (50mm from top)
  const cntB = pageB + mB;                            // content bottom(50mm from bottom)

  // Endorsements column (in the right margin area)
  const endDivX = cntR;                               // vertical divider at content right
  const endorseL = endDivX + mm(3);                   // endorsements text start

  // Layout zones within content area
  // Title zone: top 20% of content, Tables zone: bottom 40% of content
  const titleZoneH = contentH * 0.20;
  const tableZoneH = contentH * 0.40;
  const drawDivY = cntB + tableZoneH;                // horizontal divider above tables
  const titleDivY = cntT - titleZoneH;               // not drawn but used for reference

  logger.info(`[DXF] Margins: L=${50}mm T=${50}mm B=${50}mm R=${150}mm, Content: ${(contentW / mm(1)).toFixed(0)}x${(contentH / mm(1)).toFixed(0)}mm`);

  // Filter outside-figure parcels and sort by stand. Used by both the
  // figure-description text (surveyedParcels) and the Schedule of Areas
  // emission (scheduleDataRows below) â€” sharing the source prevents
  // silent drift between the two consumers.
  const surveyedFeatures = (parcels?.features || [])
    .filter(f => {
      const st = (f.properties?.stand || '').toLowerCase();
      return !f.properties?.isOutsideFigure && !st.includes('outside figure');
    })
    .sort((a, b) => {
      const na = parseInt(a.properties?.stand) || 0;
      const nb = parseInt(b.properties?.stand) || 0;
      return na - nb || String(a.properties?.stand || '').localeCompare(String(b.properties?.stand || ''));
    });

  // Lightweight projection consumed by formatFigureDescription.
  const surveyedParcels = surveyedFeatures.map(f => ({
    stand: f.properties?.stand || '',
    area_m2: f.properties?.area_m2 || 0,
  }));

  // â”€â”€ PAGE FRAME + DIVIDERS â”€â”€
  const TB = 'TITLE_BLOCK';
  addRect(TB, pageL, pageB, pageR, pageT);           // outer paper border
  // Content area border (margin lines)
  addRect(TB, cntL, cntB, cntR, cntT);               // content border
  addLine(TB, endDivX, pageB, endDivX, pageT);       // endorsements divider (full height)
  // The drawing-zone / bottom-zone separator at drawDivY was previously drawn
  // as a full-width horizontal line. The PDF doesn't emit any equivalent
  // (it relies on block placement + per-block borders), so the line is
  // omitted here for 1:1 PDF parity. `drawDivY` is still used as a y-coord
  // boundary by the schedule placer and the bottom-zone layout below.
  addMarginGuides('MARGIN_GUIDES', pageL, pageR, pageT, pageB, cntL, cntR, cntT, cntB)

  // â”€â”€ A) TITLE ZONE (within top margin area, centered in content) â”€â”€
  const txC = (cntL + cntR) / 2; // center of content area
  let ty = cntT - mm(8);
  addText(TB, txC, ty, 'GENERAL PLAN', hTitle, 0, 'BOLD');
  ty -= hTitle * 1.6;
  if (metadata.surveyOf) {
    addText(TB, txC, ty, metadata.surveyOf, hSub, 0, 'BOLD');
    ty -= hSub * 1.6;
  }
  // Stand list still consumed by the `if (metadata.district && !standList)`
  // block further down; the ad-hoc "Survey of Stands ..." emission is now
  // superseded by the SI 727 figureDescription emission below.
  const standList = surveyedParcels.map(sp => sp.stand).join(', ');
  ty -= mm(3);
  addText(TB, txC, ty, `SCALE 1:${S}`, hSub, 0, 'BOLD');

  // New SI 727 fields the PDF carries
  if (metadata.firm) {
    ty -= hSub * 1.4
    addText(TB, txC, ty, metadata.firm, hSub, 0)
  }
  if (metadata.licenseNumber) {
    ty -= hSub * 1.4
    addText(TB, txC, ty, `PLS ${metadata.licenseNumber}`, hSub, 0)
  }
  if (metadata.parentProperty) {
    ty -= hSub * 1.4
    addText(TB, txC, ty, `Parent property: ${metadata.parentProperty}`, hSub, 0)
  }
  if (metadata.wholePortion) {
    ty -= hSub * 1.4
    addText(TB, txC, ty, `Survey covers: ${metadata.wholePortion}`, hSub, 0)
  }
  if (metadata.district && !standList) {
    ty -= hSub * 1.4
    addText(TB, txC, ty, `District: ${metadata.district}`, hSub, 0)
  }

  // â”€â”€ SI 727 Seventh Schedule (b) lines â”€â”€
  // Character budget for wrapping: content area width divided by an average
  // character-to-text-height ratio of 0.55 (see spec). This is the one knob
  // to tune if manual CAD verification shows lines too short or too long.
  const titleMaxLineChars = Math.floor((cntR - cntL) / (hBody * 0.55))

  // (b.i) Conditional SHEET N label â€” only emits for multi-sheet plans.
  for (const line of formatSheetLabel(sheetInfo)) {
    ty -= hSub * 1.6
    addText(TB, txC, ty, line, hSub, 0, 'BOLD')
  }

  // (b.ii) Figure description sentence (replaces the old ad-hoc line).
  for (const line of formatFigureDescription(metadata, outsideFigureData, surveyedParcels, titleMaxLineChars)) {
    ty -= hBody * 1.6
    addText(TB, txC, ty, line, hBody, 0)
  }

  // (b.iii) Vide diagram line â€” always emitted.
  for (const line of formatVideLine(titleMaxLineChars)) {
    ty -= hBody * 1.6
    addText(TB, txC, ty, line, hBody, 0)
  }

  // North/south arrow in the upper-right of the drawing zone
  addNorthArrow('NORTH_ARROW', cntR - mm(15), cntT - mm(20), mm(20))

  // Scale bar in the lower-right of the drawing zone
  addScaleBar('SCALE_BAR', cntR - mm(40), cntB + mm(20), S)

  // Coordinate grid ticks along the drawing-zone borders
  addGridReferences('GRID', dL, dR, dT, dB, pickGridStepM(S))

  // â”€â”€ B) ENDORSEMENTS (right margin column: 150mm) â”€â”€
  const eX = endorseL;
  const endorseR = pageR - mm(5);        // right edge with small padding
  const endorseColW = endorseR - eX;     // usable width in endorsements
  let eY = cntT;
  addText(TB, eX, eY, 'ENDORSEMENTS', hHead, 0, 'BOLD');
  addLine(TB, endDivX, eY - mm(2), pageR, eY - mm(2)); // underline
  eY -= mm(8);
  drawEndorsementZone(eX, endorseR, cntT - mm(5), cntB + mm(5));

  // ── C) BOTTOM ZONE — topological emission (3-v4) ──
  // Replaces the pre-3-v4 fixed bottom-zone partition. All five blocks
  // (OFD table, schedule of areas, beacon descriptions, survey date
  // statement, SG approval box) now flow through placeBottomZoneBlocks
  // which mirrors pdfkitGeoPDF.js:calculateBlockPositions ordering and
  // calls findBlockPosition for each block. Pre-seeded obstacles below
  // (title zone, north arrow, scale bar) keep the topology scan away
  // from the already-emitted fixed elements.
  //
  // The figurePolygon construction below mirrors the pre-3-v4 logic:
  // ofResult.vertices carry Cape Lo {y, x} coords; the placer expects
  // DXF ground-metre {x, y}. Convert via capeLoToDxfSouthUp and drop
  // the trailing closing duplicate so polygon edges aren't double-
  // counted by the topology scanner.
  const figurePolygon = (ofResult && Array.isArray(ofResult.vertices) && ofResult.vertices.length >= 4)
    ? ofResult.vertices.slice(0, -1).map(v => capeLoToDxfSouthUp(v.y, v.x))
    : null;

  const contentArea = {
    x:      cntL,
    y:      cntB,
    width:  cntR - cntL,
    height: cntT - cntB,
  };

  // Pre-seeded obstacles — fixed-position elements already emitted above.
  const bottomZoneObstacles = [
    // Title zone covers the top ~20% of the content area.
    { name: 'titleZone',  x: cntL,           y: titleDivY,         width: cntR - cntL, height: cntT - titleDivY },
    // North arrow at top-right of drawing zone.
    { name: 'northArrow', x: cntR - mm(15),  y: cntT - mm(20),     width: mm(15),      height: mm(20) },
    // Scale bar at bottom-right of drawing zone.
    { name: 'scaleBar',   x: cntR - mm(40),  y: cntB + mm(15),     width: mm(40),      height: mm(10) },
  ];

  // Schedule-specific fonts matching the PDF generator (9 pt title,
  // 7 pt body/headers, 15 pt row height per drawScheduleOfAreasSingleColumn).
  // OFD + SG sizes pulled from block-definitions.js (single source of truth
  // shared with pdfkitGeoPDF.js).
  const bottomZoneFonts = {
    hHead:    pt(9),
    hBody:    pt(7),
    hSub,
    rH:       pt(15),
    ofTitleH: pt(OUTSIDE_FIGURE_DATA.titleFontSize),
    ofBodyH:  pt(OUTSIDE_FIGURE_DATA.fontSize),
    ofRowH:   pt(OUTSIDE_FIGURE_DATA.rowHeight),
    sgTitleH: pt(SURVEYOR_GENERAL_BOX.titleFontSize),
    sgBodyH:  pt(SURVEYOR_GENERAL_BOX.bodyFontSize),
  };

  // 2026-06-06: dynamic column widths. Computed once per generateDXF call
  // from header + data measurements via the same algorithm PDF uses.
  // PT_TO_MM_GEN converts from PDF pt to paper-mm; mm() converts to
  // ground-metres at use site.
  //
  // DXF-specific calibration (vs PDF's doc.widthOfString):
  //   1. headerFontSize uses bodyFontSize (= 7 pt). DXF's addScheduleTable
  //      renders headers at hBody (= pt(7)), NOT at PDF's 6-pt header font.
  //      Sizing the column for the actually-rendered font is what matters.
  //   2. Char-width ratio is 1.0 (square characters), not the STYLE table's
  //      0.55. Many CAD viewers ignore the STYLE width factor and render
  //      text at width factor 1.0. Using 1.0 in the measurer guarantees
  //      columns fit headers on every viewer. Compliant viewers (honoring
  //      0.55) see extra padding inside the cell — visually fine, the
  //      grid lines just sit further from the text.
  const renderedFontSize = SCHEDULE_OF_AREAS.singleColumn.fontSize  // 7 pt
  const dxfMeasureText = (text, fontSize) =>
    String(text).length * fontSize * 1.0
  const scheduleColumnWidthsPt = computeScheduleColumnWidths({
    dataRows:       surveyedFeatures.map(extractScheduleRow),
    headerFontSize: renderedFontSize,
    bodyFontSize:   renderedFontSize,
    measureText:    dxfMeasureText,
  });
  const scheduleColumnWidthsG = scheduleColumnWidthsPt.map(w => mm(w * PT_TO_MM_GEN));

  // ── 3-v5: Bottom-zone positions come from the shared sheet-layout planner ──
  // The planner expects PDF-point coordinates with y-down origin. DXF works
  // in ground metres with south-up y. Convert at both boundaries.
  //
  //   1 PDF pt = (25.4/72) mm paper = (25.4/72) * (S/1000) ground metres
  //   So: groundMetres → PDF pt = groundMetres * 1000 / S / (25.4/72)
  const M_TO_PT = 1000 / S / (25.4 / 72);
  const PT_TO_M = 1 / M_TO_PT;
  const contentWidthPt  = (cntR - cntL) * M_TO_PT;
  const contentHeightPt = (cntT - cntB) * M_TO_PT;

  // Polygon: shift to content-area-relative coords, flip y (south-up → top-down).
  const polyPtsForPlanner = (figurePolygon || []).map(p => ({
    x: (p.x - cntL) * M_TO_PT,
    y: (cntT - p.y) * M_TO_PT,
  }));

  // Pre-seeded obstacles: same shift/flip.
  const tickMarkBoundsForPlanner = bottomZoneObstacles.map(o => ({
    name: o.name,
    x: (o.x - cntL) * M_TO_PT,
    y: (cntT - (o.y + o.height)) * M_TO_PT,  // top edge in y-down
    width:  o.width  * M_TO_PT,
    height: o.height * M_TO_PT,
  }));

  const plannerMeasure = (str, { size }) => String(str).length * size * 0.55;

  const blockPositions = planSheetLayout({
    metadata,
    parcels:           { type: 'FeatureCollection', features: surveyedFeatures },
    outsideFigureData,
    beacons:           { type: 'FeatureCollection', features: [] },
    mapBounds:         { x: 0, y: 0, width: contentWidthPt, height: contentHeightPt },
    mapFeatureBounds:  { x: 0, y: 0, width: contentWidthPt, height: contentHeightPt, pdfPoints: polyPtsForPlanner },
    scale:             { value: S, label: `1:${S}` },
    extent:            { minX: pageL, maxX: pageR, minY: pageB, maxY: pageT },
    tickMarkBounds:    tickMarkBoundsForPlanner,
    polyPts:           polyPtsForPlanner,
    measureText:       plannerMeasure,
    logger,
  });

  // Convert planner positions (y-down PDF pt, relative to content area top-left)
  // → DXF ground metres (south-up). Emit position.y = TOP of block in south-up.
  const toDxf = (p) => ({
    x:      cntL + p.x * PT_TO_M,
    y:      cntT - p.y * PT_TO_M,
    width:  p.width  * PT_TO_M,
    height: p.height * PT_TO_M,
  });
  const ofdPos       = toDxf(blockPositions.outsideFigureData);
  const schedPos     = toDxf(blockPositions.scheduleOfAreas);
  const beaconPos    = toDxf(blockPositions.beaconDescription);
  const statementPos = toDxf(blockPositions.surveyStatement);
  const sgPos        = toDxf(blockPositions.sgSignature);

  if (outsideFigureData?.edges?.length) {
    emitOFDTable(addText, addLine, { x: ofdPos.x, y: ofdPos.y },
      outsideFigureData, bottomZoneFonts, mm, centralMeridian, TB);
  }

  emitScheduleOfAreasTopological({
    surveyedFeatures,
    drawingZone: {
      x: schedPos.x,
      y: schedPos.y - schedPos.height,   // bottom of zone in south-up = top - height
      width: schedPos.width,
      height: schedPos.height,
    },
    polygon: figurePolygon,
    sheetSize,
    fonts: bottomZoneFonts,
    helpers: {
      mm, extractScheduleRow, computeScheduleLayout, addScheduleTable,
      nextLargerSheet, SCHEDULE_HEADER_HEIGHT_MM, columnWidthsG: scheduleColumnWidthsG,
    },
    addText, addLine, warn, logger,
    seedPlacedBlocks: [],
  });

  if ((options.beaconGroups || []).length) {
    emitBeaconDescriptions(addBeaconDescription, TB,
      { x: beaconPos.x, y: beaconPos.y },
      { width: beaconPos.width, height: beaconPos.height },
      options.beaconGroups);
  }

  emitStatement(addText, { x: statementPos.x, y: statementPos.y },
    metadata, bottomZoneFonts, TB);

  emitSGBox(addText, addLine, addRect,
    { x: sgPos.x, y: sgPos.y },
    { width: sgPos.width, height: sgPos.height },
    bottomZoneFonts, mm, TB);

  logger.info(`[DXF] Shared planner placement complete: 5 surrounding blocks emitted`);

  logger.info(`[DXF] Page frame: ${(pageR - pageL).toFixed(0)}m x ${(pageT - pageB).toFixed(0)}m ground`);

  // â”€â”€ Assemble DXF â”€â”€
  const pad = mm(2);
  const eMin = { x: pageL - pad, y: pageB - pad };
  const eMax = { x: pageR + pad, y: pageT + pad };

  let dxf = '';

  // HEADER
  dxf += p(0, 'SECTION');
  dxf += p(2, 'HEADER');
  dxf += p(9, '$ACADVER');
  dxf += p(1, 'AC1009');
  dxf += p(9, '$EXTMIN');
  dxf += p(10, eMin.x.toFixed(4));
  dxf += p(20, eMin.y.toFixed(4));
  dxf += p(9, '$EXTMAX');
  dxf += p(10, eMax.x.toFixed(4));
  dxf += p(20, eMax.y.toFixed(4));
  dxf += p(0, 'ENDSEC');

  // TABLES
  dxf += p(0, 'SECTION');
  dxf += p(2, 'TABLES');

  // LTYPE table
  dxf += p(0, 'TABLE');
  dxf += p(2, 'LTYPE');
  dxf += p(70, '1');
  dxf += p(0, 'LTYPE');
  dxf += p(2, 'CONTINUOUS');
  dxf += p(70, '0');
  dxf += p(3, 'Solid line');
  dxf += p(72, '65');
  dxf += p(73, '0');
  dxf += p(40, '0.0');
  dxf += p(0, 'ENDTAB');

  // LAYER table
  dxf += p(0, 'TABLE');
  dxf += p(2, 'LAYER');
  dxf += p(70, String(layers.length));
  for (const layer of layers) {
    dxf += p(0, 'LAYER');
    dxf += p(2, layer.name);
    dxf += p(70, '0');
    dxf += p(62, String(layer.color));
    dxf += p(6, 'CONTINUOUS');
  }
  dxf += p(0, 'ENDTAB');

  // UCS table — entry retained as an IDENTITY UCS for backward compatibility.
  // The geometry is already plotted north-up east-right in WCS (see
  // capeLoToDxfSouthUp), so CAD_NORTH_UP no longer needs a rotation. Anyone
  // toggling to this UCS gets the same view as the WCS default.
  dxf += p(0, 'TABLE');
  dxf += p(2, 'UCS');
  dxf += p(70, '1');
  dxf += p(0, 'UCS');
  dxf += p(2, 'CAD_NORTH_UP');
  dxf += p(70, '0');
  dxf += p(10, '0.0'); dxf += p(20, '0.0'); dxf += p(30, '0.0');   // origin
  dxf += p(11, '1.0'); dxf += p(21, '0.0'); dxf += p(31, '0.0');   // X axis (identity)
  dxf += p(12, '0.0'); dxf += p(22, '1.0'); dxf += p(32, '0.0');   // Y axis (identity)
  dxf += p(0, 'ENDTAB');

  // STYLE table — STANDARD + BOLD.
  //
  // Group code 41 is the text WIDTH FACTOR — character horizontal scale
  // relative to height. CAD viewers default the STANDARD font (txt.shx)
  // to a 1.0 (square) ratio, which renders characters ~1.8× wider than
  // the Helvetica-style proportions the PDF uses. Visible effect: column
  // contents overflow their layout slots and the schedule / OFD tables
  // appear "wide" even though their geometry matches the PDF exactly.
  //
  // Setting 41 = 0.55 here makes every TEXT entity emit at Helvetica-like
  // proportions. The 0.55 ratio also matches the assumption baked into
  // the DXF placer (dxfLabelPlacer.js `charWidthRatio = 0.55`) and the
  // existing schedule emitter constants — so label-position math now
  // agrees with the actual rendered width.
  const STYLE_WIDTH_FACTOR = '0.55'
  dxf += p(0, 'TABLE');
  dxf += p(2, 'STYLE');
  dxf += p(70, '2');
  // STANDARD style
  dxf += p(0, 'STYLE');
  dxf += p(2, 'STANDARD');
  dxf += p(70, '0');
  dxf += p(40, '0.0');
  dxf += p(41, STYLE_WIDTH_FACTOR);
  dxf += p(50, '0.0');
  dxf += p(71, '0');
  dxf += p(42, '0.0');
  dxf += p(3, 'txt');
  dxf += p(4, '');
  // BOLD style
  dxf += p(0, 'STYLE');
  dxf += p(2, 'BOLD');
  dxf += p(70, '0');
  dxf += p(40, '0.0');
  dxf += p(41, STYLE_WIDTH_FACTOR);
  dxf += p(50, '0.0');
  dxf += p(71, '0');
  dxf += p(42, '0.0');
  dxf += p(3, 'txt');
  dxf += p(4, '');
  dxf += p(0, 'ENDTAB');

  dxf += p(0, 'ENDSEC');

  // ENTITIES
  dxf += p(0, 'SECTION');
  dxf += p(2, 'ENTITIES');
  dxf += ent;
  dxf += p(0, 'ENDSEC');

  // EOF
  dxf += p(0, 'EOF');

  const sizeKB = (Buffer.byteLength(dxf, 'utf8') / 1024).toFixed(1);
  logger.info(`[DXF] Generation complete: ${sizeKB} KB, ${parcelCount} parcels, ${beaconCount} beacons, ${edgeLabelCount} edge labels, ${sharedEdges.size} shared edges`);

  return { buffer: Buffer.from(dxf, 'utf8'), warnings };
}
