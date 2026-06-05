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

import { TITLE_BLOCK, SCHEDULE_OF_AREAS, formatStandRanges } from '../../../app-shared/block-definitions.js'
import { findStandLabelPosition, findEdgeLabelPosition } from './dxfLabelPlacer.js'
import {
  extractScheduleRow,
  computeScheduleLayout,
  addScheduleTable,
  nextLargerSheet,
  SCHEDULE_HEADER_HEIGHT_MM,
} from './dxfScheduleHelpers.js'
import { emitScheduleOfAreasTopological } from './dxfScheduleEmitter.js'

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

export function capeLoToDxfSouthUp(capeY, capeX) {
  const [y, x] = normalizeCapeLoYX(capeY, capeX);
  // Sanity guard: typical Cape Lo input is Y>0, X>0; result should be x>0, y>0.
  // A negative x from positive Y means a stale x = -y formula sneaked through.
  if (capeY > 0 && y < 0) {
    // Log once via the singleton flag; logger may not be in scope here.
    if (!capeLoToDxfSouthUp._warned) {
      // eslint-disable-next-line no-console
      console.error('[DXF] capeLoToDxfSouthUp: positive Westing produced negative x â€” stale east-up call?')
      capeLoToDxfSouthUp._warned = true
    }
  }
  return { x: y, y: x };
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
   *   structured â€” 'scheduleOverflow' (stores `value` as the payload object)
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
    if (category === 'scheduleOverflow') {
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
  const beaconRadius = ptToGround(1.5, S);
  const beaconLabelHeight = ptToGround(6, S);
  const beaconLabelOffset = beaconRadius + ptToGround(1, S);

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
   * Draw a south-pointing arrow (page is south-up, so the arrow points to +DXF-Y).
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
    addText(layer, cx, cy + half + mm(5), 'S', mm(4), 0)
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

  // Helper: decide displayLabel + position for one beacon.
  // Returns null when the label should be suppressed (no text emitted).
  const beaconLabelInsideOffset = beaconRadius + mmToGround(1.5, S); // toward centroid
  const labelDecision = (beaconName, pt) => {
    if (!beaconName) return null;

    // PRIORITY 1: UI-supplied label.
    const uiLabel = beaconLabelMap.get(beaconName);
    if (uiLabel) {
      if (uiLabel.labelType === 'suppressed') return null;
      const text = String(uiLabel.text || '');
      if (!text) return null;
      if (uiLabel.isInsideParcel && uiLabel.displayInParcel != null) {
        const poly = parcelById.get(String(uiLabel.displayInParcel));
        if (poly) return placeInsideParcel(pt, poly, text);
      }
      return placeOutsideParcel(pt, text);
    }

    // PRIORITY 2: pattern-matched fallback (matches PDF:4855-4951).
    const m = beaconName.match(/^(\d+)([A-Za-z]+)$/);
    if (m) {
      const prefix = m[1];
      const suffix = m[2].toUpperCase();
      const poly = parcelByStand.get(prefix);
      if (poly) return placeInsideParcel(pt, poly, suffix);
    }
    // Control beacons (no numeric prefix) or unmatched: full name outside.
    return placeOutsideParcel(pt, beaconName);
  };

  // Place a label INSIDE a parcel: project from the beacon toward the parcel's
  // centroid by `beaconLabelInsideOffset`. Keeps the label adjacent to its
  // beacon while orienting it into the parcel's interior.
  function placeInsideParcel(pt, poly, text) {
    const centroid = shoelaceCentroid(poly);
    let dx = centroid.x - pt.x;
    let dy = centroid.y - pt.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return placeOutsideParcel(pt, text);
    dx /= len; dy /= len;
    return { x: pt.x + dx * beaconLabelInsideOffset, y: pt.y + dy * beaconLabelInsideOffset, text };
  }

  // Place a label OUTSIDE the parcel: small (+x, +y) offset from beacon.
  // Matches the existing pre-3-v2 convention and the PDF's `closeOffset` fallback.
  function placeOutsideParcel(pt, text) {
    return { x: pt.x + beaconLabelOffset, y: pt.y + beaconLabelOffset, text };
  }

  if (beacons?.features) {
    for (const feature of beacons.features) {
      const rc = feature.geometry?.coordinates;
      if (!Array.isArray(rc) || rc.length < 2) continue;

      // Guard: skip beacons with NaN/Infinity coords or unreasonable magnitudes
      const [byRaw, bxRaw] = rc;
      if (!Number.isFinite(byRaw) || !Number.isFinite(bxRaw)
          || Math.abs(byRaw) > 1e7 || Math.abs(bxRaw) > 1e7) {
        logger.warn(`[DXF] dropped beacon ${feature.properties?.pointId || '<unnamed>'}: bad coords`)
        warn('beacons')
        continue
      }

      const pt = capeLoToDxfSouthUp(rc[0], rc[1]);
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;

      // Filter: only beacons within outside figure + 2m buffer
      if (ofPolygon && !isWithinPolygonBuffer(pt.x, pt.y, ofPolygon, BEACON_BUFFER)) {
        beaconsSkipped++;
        continue;
      }

      trackPt(pt);
      const beaconType = feature.properties?.type || 'placed'
      const beaconDiameter = mmToGround(2.4, S)
      addBeaconSymbol('BEACONS', pt.x, pt.y, beaconType, beaconDiameter);
      const name = feature.properties?.pointId
                || feature.properties?.name
                || feature.properties?.beacon_name
                || '';
      const decision = labelDecision(name, pt);
      if (decision) {
        addText('BEACON_LABELS', decision.x, decision.y, decision.text, beaconLabelHeight);
      }
      beaconCount++;
    }
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

  // Drawing bounds
  const dL = minX || 0, dR = maxX || 0, dT = maxY || 0, dB = minY || 0;
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
  addLine(TB, cntL, drawDivY, cntR, drawDivY);       // below drawing (tables divider)
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

  // ── C) BOTTOM ZONE LAYOUT (within content area, below drawDivY) ──
  // 3-v2: col1 dissolved. Schedule and beacon descriptions emit topologically
  // in the drawing zone (above drawDivY). Bottom zone is split into two columns:
  //   statement (Statement+OFData, 58% of contentW from left)
  //   approved (Approved+Coords, ~42% of contentW from right)
  const statementL = cntL + mm(3);
  const statementR = cntL + contentW * 0.58;
  const approvedL  = statementR + mm(3);
  const approvedR  = cntR - mm(3);

  // Vertical divider between statement (left) and approved (right).
  addLine(TB, statementR, drawDivY, statementR, cntB);

  // ── C1) SCHEDULE OF AREAS — topological placement (3-v2) ──
  // Schedule and beacon descriptions emit into the drawing zone (above drawDivY).
  // emitScheduleOfAreasTopological returns southmostY = min(p.y) across placed
  // sub-tables (DXF south-up); beacon descriptions anchor just below that.
  const drawingZone = {
    x: cntL,
    y: drawDivY,                       // LOW y in DXF (bottom of drawing zone)
    width:  cntR - cntL,
    height: cntT - drawDivY,
  };

  // Outside-figure outline as polygon to avoid (null when absent).
  // ofResult.vertices carry Cape Lo {y, x} coords; the placer expects DXF
  // ground-metre {x, y} (matching drawingZone). Convert via capeLoToDxfSouthUp
  // and drop the trailing closing duplicate so polygon edges aren't
  // double-counted by the topology scanner.
  const figurePolygon = (ofResult && Array.isArray(ofResult.vertices) && ofResult.vertices.length >= 4)
    ? ofResult.vertices.slice(0, -1).map(v => capeLoToDxfSouthUp(v.y, v.x))
    : null;

  const scheduleResult = emitScheduleOfAreasTopological({
    surveyedFeatures,
    drawingZone,
    polygon: figurePolygon,
    sheetSize,
    fonts: { hHead, hBody, rH },
    helpers: {
      extractScheduleRow,
      computeScheduleLayout,
      addScheduleTable,
      nextLargerSheet,
      SCHEDULE_HEADER_HEIGHT_MM,
      mm,
    },
    addText: (layer, x, y, text, height, angle, style) => addText(layer, x, y, text, height, angle, style),
    addLine: (layer, x1, y1, x2, y2) => addLine(layer, x1, y1, x2, y2),
    warn,
    logger,
  });

  // Beacon descriptions — anchored just below the bottommost placed sub-table.
  // When no sub-tables placed (overflow), scheduleResult.southmostY === drawingZone.y;
  // fall back to anchoring near the top of the drawing zone.
  const beaconAnchorY = scheduleResult.placedTables.length > 0
    ? scheduleResult.southmostY - mm(8)
    : drawingZone.y + drawingZone.height - mm(20);
  addBeaconDescription(
    TB,
    cntL, cntR - mm(2),
    beaconAnchorY, cntB + mm(4),
    options.beaconGroups || [],
  );

  // â”€â”€ C2) SURVEY STATEMENT + OUTSIDE FIGURE DATA (center column) â”€â”€
  let cY = drawDivY - mm(5);
  // Statement
  if (metadata.date) {
    addText(TB, statementL, cY, `Surveyed in ${metadata.date} by me`, hBody);
    cY -= rH * 1.5;
  }
  if (metadata.surveyor) {
    addText(TB, statementL, cY, metadata.surveyor, hSub, 0, 'BOLD');
    cY -= rH;
    addText(TB, statementL, cY, '(Land Surveyor, Zim)', hBody);
    cY -= rH * 1.5;
  }

  // Horizontal divider before OF data
  addLine(TB, statementL - mm(3), cY + mm(2), approvedR + mm(3), cY + mm(2));
  cY -= mm(3);

  // Outside Figure Data table
  const c = (off) => statementL + off; // offset helper
  const cS = mm(0), cM = mm(28), cD = mm(50), cK = mm(78);
  const cCY = mm(95), cCX = mm(115);

  addText(TB, c(cS), cY, 'OUTSIDE FIGURE DATA', hHead, 0, 'BOLD');
  addText(TB, c(cCY), cY, `CO-ORDINATES`, hHead, 0, 'BOLD');
  cY -= rH * 0.8;
  addText(TB, c(cCY), cY, `System: Lo ${centralMeridian}`, hBody);
  cY -= rH * 0.6;
  // Add vertical divider between OF data and coordinates
  const coordDivX = c(cCY) - mm(3);
  addLine(TB, coordDivX, cY + rH * 1.5, coordDivX, cY - rH * ((outsideFigureData?.edges?.length || 0) + 1));

  // Column headers
  addLine(TB, statementL - mm(3), cY + mm(2), approvedR + mm(3), cY + mm(2));
  addText(TB, c(cS), cY, 'SIDES', hBody, 0, 'BOLD');
  addText(TB, c(cM), cY, 'Metres', hBody, 0, 'BOLD');
  addText(TB, c(cD), cY, 'DIRECTION', hBody, 0, 'BOLD');
  addText(TB, c(cK), cY, 'Constants', hBody, 0, 'BOLD');
  addText(TB, c(cCY), cY, 'Y', hBody, 0, 'BOLD');
  addText(TB, c(cCX), cY, 'X', hBody, 0, 'BOLD');
  addLine(TB, statementL - mm(3), cY - mm(2), approvedR + mm(3), cY - mm(2));
  cY -= rH;

  // Data rows
  if (outsideFigureData?.edges) {
    for (const edge of outsideFigureData.edges) {
      const side = edge.side || '';
      const dist = typeof edge.distance === 'number' ? edge.distance.toFixed(2) : String(edge.distance || '');
      const dir = edge.direction || '';
      const constId = edge.pointId || '';
      const yV = typeof edge.y === 'number' ? (edge.y >= 0 ? '+' : '') + edge.y.toFixed(2) : '';
      const xV = typeof edge.x === 'number' ? (edge.x >= 0 ? '+' : '') + edge.x.toFixed(2) : '';
      addText(TB, c(cS), cY, side, hBody);
      addText(TB, c(cM), cY, dist, hBody);
      addText(TB, c(cD), cY, dir, hBody);
      addText(TB, c(cK), cY, constId, hBody);
      addText(TB, c(cCY), cY, yV, hBody);
      addText(TB, c(cCX), cY, xV, hBody);
      cY -= rH;
    }
  }

  // â”€â”€ C3) APPROVED BOX (right bottom column) â”€â”€
  let aY = drawDivY - mm(5);
  const aCX = (approvedL + approvedR) / 2;
  addRect(TB, approvedL, aY - mm(30), approvedR, aY);  // approved box border
  aY -= mm(5);
  addText(TB, aCX, aY, 'Approved', hSub, 0, 'BOLD');
  aY -= mm(8);
  addText(TB, aCX, aY, '........................................', hBody);
  aY -= rH;
  addText(TB, aCX, aY, 'For Surveyor General', hBody);
  aY -= rH;
  addText(TB, aCX, aY, 'Date: ................', hBody);

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

  // UCS table â€” one entry so CAD users can toggle to north-up view.
  // Axes form a proper 180Â° rotation about Z (det = +1): X=(-1,0,0), Y=(0,-1,0).
  // After applying this UCS the view shows north at top with east at the left.
  dxf += p(0, 'TABLE');
  dxf += p(2, 'UCS');
  dxf += p(70, '1');
  dxf += p(0, 'UCS');
  dxf += p(2, 'CAD_NORTH_UP');
  dxf += p(70, '0');
  dxf += p(10, '0.0'); dxf += p(20, '0.0'); dxf += p(30, '0.0');   // origin
  dxf += p(11, '-1.0'); dxf += p(21, '0.0'); dxf += p(31, '0.0');  // X axis
  dxf += p(12, '0.0'); dxf += p(22, '-1.0'); dxf += p(32, '0.0');  // Y axis
  dxf += p(0, 'ENDTAB');

  // STYLE table â€” STANDARD + BOLD
  dxf += p(0, 'TABLE');
  dxf += p(2, 'STYLE');
  dxf += p(70, '2');
  // STANDARD style
  dxf += p(0, 'STYLE');
  dxf += p(2, 'STANDARD');
  dxf += p(70, '0');
  dxf += p(40, '0.0');
  dxf += p(41, '1.0');
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
  dxf += p(41, '1.0');
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
