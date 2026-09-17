/**
 * Shared polygon→planner-pt transform for PDF and DXF outputs.
 *
 * 3-v8: prior to this helper, PDF used transformCoords (fit-to-extent) while
 * DXF used pure 1:scale conversion. The planner saw two different polygons
 * for the same Outside Figure and produced divergent block placements
 * (PDF blocks right, DXF blocks left). This helper unifies both.
 *
 * Inputs are CapLo coordinates from the Outside Figure GeoJSON ring. Output
 * is a vertex list in planner pt-space at 1:scale, positioned so its bbox
 * is centered within the caller's mapBounds (or left-flush when the caller
 * opts for alignX:'left' — the dense-general-plan layout where the Schedule
 * of Areas needs the full right-hand column). The same vertices arrive in the
 * same order on both sides, so the planner makes the same decisions.
 *
 * Caller responsibilities:
 *   - PDF: pass mapBounds with absolute-pt origin (e.g. {x:141.73,y:141.73,...}).
 *     The returned polygon shares that frame.
 *   - DXF: pass mapBounds with content-relative origin ({x:0,y:0,...}).
 *     The returned polygon shares that frame, and toDxf() applies cntL/cntT.
 */

const PT_PER_MM = 72 / 25.4;

/**
 * Minimum clear column (pt) the schedule of areas (plus clearance) needs beside
 * a figure before the layout is allowed to stay centred. Below that the figure
 * is pushed left so the schedule gets the ENTIRE remaining column instead of
 * two half-width strips neither can hold a contiguous table.
 *
 * Must mirror the planner's blockSpacing/fit conventions: the schedule sits in
 * a whitespace zone with ~10-15pt of clearance around it, and block placement
 * uses a 2pt buffer against the figure polygon.
 */
export const ALIGN_COLUMN_PAD_PT = 40;

/**
 * Decide the figure's horizontal alignment for one render.
 *
 * 'center' keeps the figure centred in the drawing area; 'left' pushes it flush
 * to the drawing-area left edge so the full remaining column is available for
 * the Schedule of Areas / coordinate / endorsement blocks.
 *
 * Rules:
 *   - With no usable figure, schedule or bounds → 'center' (default, harmless).
 *   - If the centered layout's side column ((boundsW − figW) / 2) already fits
 *     the schedule (+ pad) → 'center' — preserves every existing centred layout.
 *   - Otherwise → 'left' (dense general plans). A single contiguous schedule
 *     cannot occupy two ~equal half-strips, so centring would force a scale
 *     step-up that left-alignment legitimately avoids.
 *
 * Both renderers call this with the SAME values (figure/extent width at 1:S,
 * drawing-area width, measured schedule width), so PDF and DXF always choose
 * the same alignment for the same input — parity is by construction, mirroring
 * how buildPlannerObstacles itself stays format-agnostic.
 *
 * @param {object}  opts
 * @param {number}  opts.figureWidthPt    Drawn figure width at 1:scale (pt).
 * @param {number}  opts.mapBoundsWidthPt Drawing-area width used by the planner (pt).
 * @param {number} [opts.scheduleWidthPt] Width of ONE contiguous schedule row (pt).
 * @returns {'center'|'left'}
 */
export function chooseFigureAlignX({ figureWidthPt, mapBoundsWidthPt, scheduleWidthPt }) {
  if (!Number.isFinite(figureWidthPt) || figureWidthPt <= 0) return 'center';
  if (!Number.isFinite(mapBoundsWidthPt) || mapBoundsWidthPt <= 0) return 'center';
  const scheduleW = Number.isFinite(scheduleWidthPt) ? scheduleWidthPt : 0;
  if (scheduleW <= 0) return 'center';

  const slack = mapBoundsWidthPt - figureWidthPt;
  if (slack <= 0) return 'center';   // no room either way — alignment is irrelevant
  const centeredSideColumn = slack / 2;
  return centeredSideColumn >= scheduleW + ALIGN_COLUMN_PAD_PT ? 'center' : 'left';
}

/**
 * Read a vertex from a GeoJSON ring. The ring can be in either ordering:
 *   - [easting, northing] (GeoJSON convention, what PDF's transformCoords assumes)
 *   - {x, y} object form
 * Returns [capeY, capeX] = [easting, northing] in CapLo metres.
 */
function readRingVertex(v) {
  if (Array.isArray(v)) return [v[0], v[1]];
  // Object form: prefer explicit y/x, fall back to ordered keys.
  const y = v.y ?? v[1];
  const x = v.x ?? v[0];
  return [y, x];
}

/**
 * Build polygon vertices in planner pt-space for one Outside Figure ring.
 *
 * @param {object}   opts
 * @param {object}   opts.outsideFigure  GeoJSON FeatureCollection or Feature.
 * @param {number}   opts.scaleDenom     The scale denominator S (e.g. 500 for 1:500).
 * @param {object}   opts.mapBounds      { x, y, width, height } in planner pt.
 *                                       The polygon is centered within this box
 *                                       unless alignX:'left' (flush to x).
 * @param {boolean} [opts.closeRing]     If true, append the first vertex at end
 *                                       to close the ring (PDF historical
 *                                       behavior). DXF passes false.
 * @param {string}  [opts.alignX]        'center' (default) or 'left'. The drawn
 *                                       figure MUST use the same value or the
 *                                       planner's search polygon and the real
 *                                       figure drift apart (phantom whitespace).
 * @returns {Array<{x:number,y:number}>}  Vertex list in planner pt-space, or
 *                                        [] if no usable ring was found.
 */
export function buildPolygonForPlanner({ outsideFigure, scaleDenom, mapBounds, closeRing = false, alignX = 'center' }) {
  const t = _buildPlannerTransform({ outsideFigure, scaleDenom, mapBounds, alignX });
  if (!t) return [];

  const out = t.capeVerts.map(([cy, cx]) => t.project(cy, cx));
  if (closeRing && out.length > 0) out.push({ x: out[0].x, y: out[0].y });
  return out;
}

/**
 * Build the polygon AND parcel-edge segments in the same planner pt-space.
 *
 * Both PDF and DXF feed the placement engine an obstacle set: the outside-figure
 * polygon (hard-reject) plus per-parcel edge segments (topology scoring + hard
 * segment intersection check in calculateBlockPositions). Previously PDF built
 * the segments via its own transformCoords pipeline while DXF passed none —
 * so the engine saw different obstacle sets and scored placements differently,
 * which surfaced as a schedule x-anchor divergence.
 *
 * This helper projects both the OF ring and every parcel ring through the same
 * OF-anchored transform that buildPolygonForPlanner uses, so the planner sees
 * identical obstacles on both sides modulo the per-format mapBounds origin.
 *
 * @param {object}   opts
 * @param {object}   opts.outsideFigure  GeoJSON FeatureCollection or Feature.
 * @param {object}   opts.parcels        GeoJSON FeatureCollection of parcels (optional).
 * @param {number}   opts.scaleDenom     Scale denominator S.
 * @param {object}   opts.mapBounds      { x, y, width, height } in planner pt.
 * @param {boolean} [opts.closeRing]     Whether to append the first OF vertex at the end.
 * @param {string}  [opts.alignX]        'center' (default) or 'left' — see
 *                                       buildPolygonForPlanner. Must match how
 *                                       the format actually draws its figure.
 * @returns {{ polyPts: Array<{x:number,y:number}>, parcelSegments: Array<{x1:number,y1:number,x2:number,y2:number}> }}
 */
export function buildPlannerObstacles({ outsideFigure, parcels, scaleDenom, mapBounds, closeRing = false, alignX = 'center' }) {
  const t = _buildPlannerTransform({ outsideFigure, scaleDenom, mapBounds, alignX });
  if (!t) return { polyPts: [], parcelSegments: [] };

  const polyPts = t.capeVerts.map(([cy, cx]) => t.project(cy, cx));
  if (closeRing && polyPts.length > 0) polyPts.push({ x: polyPts[0].x, y: polyPts[0].y });

  const parcelSegments = [];
  const features = parcels?.features ?? [];
  for (const feat of features) {
    const geom = feat?.geometry;
    if (geom?.type !== 'Polygon') continue;
    let ring = geom.coordinates?.[0];
    if (!Array.isArray(ring) || ring.length < 2) continue;
    if (Array.isArray(ring) && ring.length === 1 && Array.isArray(ring[0]) && Array.isArray(ring[0][0])) {
      ring = ring[0];
    }
    for (let i = 0; i < ring.length - 1; i++) {
      const [y0, x0] = readRingVertex(ring[i]);
      const [y1, x1] = readRingVertex(ring[i + 1]);
      if (!Number.isFinite(y0) || !Number.isFinite(x0) ||
          !Number.isFinite(y1) || !Number.isFinite(x1)) continue;
      const p0 = t.project(y0, x0);
      const p1 = t.project(y1, x1);
      parcelSegments.push({ x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y });
    }
  }

  return { polyPts, parcelSegments };
}

/**
 * Internal: build the shared transform anchored on the OF polygon bbox.
 * Returns { project, capeVerts } or null if inputs are unusable.
 */
function _buildPlannerTransform({ outsideFigure, scaleDenom, mapBounds, alignX = 'center' }) {
  if (!outsideFigure || !Number.isFinite(scaleDenom) || scaleDenom <= 0) return null;
  if (!mapBounds || !Number.isFinite(mapBounds.width) || !Number.isFinite(mapBounds.height)) return null;

  const feat = outsideFigure.features ? outsideFigure.features[0] : outsideFigure;
  const geom = feat?.geometry;
  if (geom?.type !== 'Polygon') return null;

  let ring = geom.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;
  if (Array.isArray(ring) && ring.length === 1 && Array.isArray(ring[0]) && Array.isArray(ring[0][0])) {
    ring = ring[0];
  }

  // Strip trailing closing-duplicate vertex if present. GeoJSON rings include
  // it by convention, but DXF strips it before calling and PDF doesn't —
  // without normalizing here, the two formats hand the planner different
  // vertex counts (PDF saw 7+closeRing=8, DXF saw 6+0=6) and the planner
  // chose different anchor sides for the schedule. closeRing now applies to
  // the same base shape on both sides.
  if (ring.length > 1) {
    const first = ring[0];
    const last  = ring[ring.length - 1];
    const [fy, fx] = readRingVertex(first);
    const [ly, lx] = readRingVertex(last);
    if (Number.isFinite(fy) && Number.isFinite(fx) &&
        Number.isFinite(ly) && Number.isFinite(lx) &&
        fy === ly && fx === lx) {
      ring = ring.slice(0, -1);
    }
  }
  if (ring.length < 3) return null;

  const M_TO_PT = (1000 / scaleDenom) * PT_PER_MM;

  const capeVerts = [];
  let minCapY = Infinity, maxCapY = -Infinity;
  let minCapX = Infinity, maxCapX = -Infinity;
  for (const v of ring) {
    const [cy, cx] = readRingVertex(v);
    if (!Number.isFinite(cy) || !Number.isFinite(cx)) continue;
    capeVerts.push([cy, cx]);
    if (cy < minCapY) minCapY = cy;
    if (cy > maxCapY) maxCapY = cy;
    if (cx < minCapX) minCapX = cx;
    if (cx > maxCapX) maxCapX = cx;
  }
  if (capeVerts.length < 3) return null;

  const polyWidthPt  = (maxCapY - minCapY) * M_TO_PT;
  const polyHeightPt = (maxCapX - minCapX) * M_TO_PT;

  // Center polygon within mapBounds — same on both formats. alignX:'left'
  // flushes it to mapBounds.x so the drawn figure (left-aligned with the same
  // value by its generator) and this search polygon stay coincident.
  const offsetX = mapBounds.x + (alignX === 'left' ? 0 : (mapBounds.width  - polyWidthPt)  / 2);
  const offsetY = mapBounds.y + (mapBounds.height - polyHeightPt) / 2;

  // (capeY, capeX) → planner pt with northing flipped to y-down.
  // Parcels outside the OF bbox land outside mapBounds; that's fine since the
  // engine only evaluates candidate slots inside mapBounds.
  const project = (cy, cx) => ({
    x: (cy - minCapY) * M_TO_PT + offsetX,
    y: (maxCapX - cx) * M_TO_PT + offsetY,
  });

  return { project, capeVerts };
}
