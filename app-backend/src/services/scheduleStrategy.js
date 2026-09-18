// app-backend/src/services/scheduleStrategy.js

import { rectangleOverlapsPolygon } from './dxfGeometry.js';

/**
 * Decompose the whitespace around a figure into the four canonical strips
 * (left / right / top / bottom), in the same paper-mm frame as the inputs.
 *
 * Frame convention: x to the right, y UP. contentArea + figureBBox are
 * {x, y, w, h} with (x, y) = lower-left corner.
 *
 * Side strips (left/right) span the FULL content height; top/bottom strips span
 * the figure's horizontal band. Any reserved fixed-block bbox that overlaps a
 * strip trims that strip from the overlapping edge (height for side strips).
 *
 * @param {{ figureBBox: {x,y,w,h}, contentArea: {x,y,w,h}, fixedBlocks?: {x,y,w,h}[] }} opts
 * @returns {{ left: {x,y,w,h}, right: {x,y,w,h}, top: {x,y,w,h}, bottom: {x,y,w,h} }}
 */
export function measureFigureWhitespace({ figureBBox, contentArea, fixedBlocks = [] }) {
  const c = contentArea, f = figureBBox;

  const left   = { x: c.x,       y: c.y, w: Math.max(0, f.x - c.x),                   h: c.h };
  const right  = { x: f.x + f.w, y: c.y, w: Math.max(0, (c.x + c.w) - (f.x + f.w)), h: c.h };
  const bottom = { x: f.x, y: c.y,       w: f.w, h: Math.max(0, f.y - c.y) };
  const top    = { x: f.x, y: f.y + f.h, w: f.w, h: Math.max(0, (c.y + c.h) - (f.y + f.h)) };

  // Trim side strips by any reserved block that overlaps them (reserve from the top).
  // A block that sits at the top of a strip reduces the strip's height so it no longer
  // reaches the reserved band.
  for (const b of fixedBlocks) {
    for (const s of [left, right]) {
      // Does the block overlap this strip horizontally?
      const overlapX = b.x < s.x + s.w && b.x + b.w > s.x;
      if (!overlapX) continue;

      // Does the block touch or overlap the TOP of the strip?
      // i.e., the block's top edge reaches at least the strip's top edge.
      const blockTop    = b.y + b.h;   // upper edge of the fixed block
      const stripTop    = s.y + s.h;   // upper edge of the strip

      if (blockTop >= stripTop && b.y < stripTop) {
        // Block occupies the top band of the strip; trim strip down to b.y.
        const newH = Math.max(0, b.y - s.y);
        s.h = newH;
      }
    }
  }

  return { left, right, top, bottom };
}

const MIN_ROWS_PER_TABLE = 3; // matches planScheduleSplit's minRowsPerTable

/**
 * Decide where + how the schedule goes, from the measured strips.
 * Precedence: balance (both sides) → pool (one side) → flat (top/bottom) → escalate.
 *
 * @returns {{ mode, figureAlign, regions }} where mode ∈
 *   'balance'|'pool'|'flat'|'escalate', figureAlign ∈ 'center'|'left'|'right',
 *   regions = ordered array of strip rects the split path should fill.
 */
export function chooseScheduleStrategy({ strips, colW, rowH, headerH }) {
  const minTableH = headerH + rowH * MIN_ROWS_PER_TABLE;
  const usableSide = (s) => s && s.w >= colW && s.h >= minTableH;
  const usableFlat = (s) => s && s.h >= minTableH && s.w >= colW;

  if (usableSide(strips.left) && usableSide(strips.right)) {
    return { mode: 'balance', figureAlign: 'center', regions: [strips.left, strips.right] };
  }
  if (usableSide(strips.left) || usableSide(strips.right)) {
    const right = usableSide(strips.right) &&
      (!usableSide(strips.left) || strips.right.w >= strips.left.w);
    const region = right ? strips.right : strips.left;
    return { mode: 'pool', figureAlign: right ? 'left' : 'right', regions: [region] };
  }
  if (usableFlat(strips.bottom) || usableFlat(strips.top)) {
    const region = usableFlat(strips.bottom) ? strips.bottom : strips.top;
    return { mode: 'flat', figureAlign: 'center', regions: [region] };
  }
  return { mode: 'escalate', figureAlign: 'center', regions: [] };
}

/**
 * Balance pooled schedule sub-tables across BOTH side strips. When the schedule
 * search has pooled the sub-tables on one side of the figure and the opposite
 * side strip has room, mirror the latter half of the tables across the figure's
 * vertical centre line (top-aligned to the kept tables) so the schedule fills
 * both strips — the ideal General Plan look.
 *
 * Frame-agnostic: the caller passes the figure-centre x and the content
 * [left, right] bound in the SAME units as the tables' x/width, so each generator
 * can call this at draw time in its own coordinate frame (DXF ground-metres or
 * PDF points). Returns a NEW array; returns the input unchanged when balancing
 * isn't possible (fewer than 2 tables, or a mirrored table wouldn't fit the
 * content area).
 *
 * A mirrored table is only moved when it (a) fits the content area and (b) does
 * not collide with any `obstacles` (other bottom-zone blocks — Outside Figure
 * Data, Surveyor-General box, survey statement, beacon descriptions). Tables that
 * can't be mirrored without overlapping stay at their original (planner) position,
 * so the schedule never overlaps another component — matching the PDF's
 * non-overlapping layout.
 *
 * @param {Array<{x:number,y:number,width:number,height:number}>} tables
 * @param {number} figureCX  figure centre x
 * @param {number} contentL  content-area left edge (min x)
 * @param {number} contentR  content-area right edge (max x)
 * @param {Array<{x:number,y:number,width:number,height:number}>} [obstacles]
 *        other blocks to avoid, in the SAME frame as `tables` (the caller's). For
 *        the DXF south-up frame each rect's `y` is its TOP edge, extending down by
 *        `height`.
 * @returns {Array<{x,y,width,height}>}
 */
/**
 * Decide whether a polygon-aware re-split of the schedule should REPLACE the
 * planner's exact tables. The caller only invokes this when the planner's tables
 * overlap the figure (the defect we're fixing). The re-split is adopted ONLY
 * when it is strictly better: it seats every stand (no data loss) AND none of
 * its tables overlap the figure. Otherwise the caller keeps the planner's
 * complete tables — we never trade a complete schedule for a lossy one, nor swap
 * one overlapping layout for another.
 *
 * `resplitTables` use the DXF emitter's returned convention: {x, y, width,
 * height} with (x, y) = lower-left (min) corner, same frame as `figurePolygon`
 * and `obstacles`.
 *
 * `obstacles` are the OTHER bottom-zone blocks the schedule must not cover
 * (Outside Figure Data, Surveyor-General box, survey statement, beacon
 * descriptions, scale bar, North arrow). The emitter's own search is seeded to
 * avoid these, but its last-resort pass can ignore seeds, so we re-check here:
 * a re-split that figure-dodges by landing on a sibling block is NOT adopted.
 *
 * @param {{ resplitTables: {x,y,width,height}[], missingStandCount: number,
 *           figurePolygon: {x,y}[], obstacles?: {x,y,width,height}[] }} opts
 * @returns {boolean}
 */
export function shouldAdoptResplit({ resplitTables, missingStandCount, figurePolygon, obstacles = [] }) {
  if (missingStandCount > 0) return false;                       // would drop stands
  if (!Array.isArray(figurePolygon) || figurePolygon.length < 3) return false;
  if (!Array.isArray(resplitTables) || resplitTables.length === 0) return false;
  const overlapsFigure = resplitTables.some((t) => rectangleOverlapsPolygon(
    { x: t.x, y: t.y, width: t.width, height: t.height }, figurePolygon, 0));
  if (overlapsFigure) return false;
  // AABB overlap in the shared min-corner frame.
  const rectsOverlap = (a, b) =>
    a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
  const overlapsSibling = resplitTables.some((t) =>
    obstacles.some((o) => rectsOverlap(t, o)));
  return !overlapsSibling;
}

export function balanceScheduleTables(tables, figureCX, contentL, contentR, obstacles = []) {
  if (!Array.isArray(tables) || tables.length < 2) return tables;
  const half = Math.ceil(tables.length / 2);

  // Rect overlap with `y` = top edge, extending downward by `height` (DXF south-up).
  const overlaps = (a, b) =>
    a.x < b.x + b.width && a.x + a.width > b.x &&
    (a.y - a.height) < b.y && a.y > (b.y - b.height);

  const out = tables.map((t) => ({ ...t }));
  let movedAny = false;
  for (let i = half; i < tables.length; i++) {
    const t = tables[i];
    const mx = 2 * figureCX - t.x - t.width;   // mirror x across the figure centre
    const my = tables[i - half].y;             // top-align to the kept counterpart
    const candidate = { x: mx, y: my, width: t.width, height: t.height };
    const fitsContent = mx >= contentL && (mx + t.width) <= contentR;
    const clear = obstacles.every((o) => !overlaps(candidate, o));
    if (fitsContent && clear) { out[i].x = mx; out[i].y = my; movedAny = true; }
  }
  return movedAny ? out : tables;
}

/**
 * Cut whitespace strips into the slots a Schedule of Areas should fill, ideal
 * columns first.
 *
 * The ideal General Plan layout is ONE full column of schedule down each side
 * strip. SI 727 practice caps a table at a fraction of the drawing band (95%)
 * so it never reads as a full-height wall beside the figure, so the "full"
 * column is the tallest whole-row table that fits under the cap. Only what does
 * NOT fit in those ideal columns spills into the space left below them — a
 * strip is never subdivided for its own sake.
 *
 * For the 240-stand Maglas plan on SI727_1000x800 that yields two 119-row
 * columns (1850pt, one per 567pt gutter) plus a 2-row remainder in the 96pt
 * left over below one of them — rather than four equal 60-row tables, which
 * would split the schedule more than the paper requires.
 *
 * Each slot's height is quantised DOWN to a whole number of rows. That matters:
 * reserving the cap's full 1858.4pt instead of the 1850pt actually used would
 * waste 8pt and cost the leftover slot one of its two rows.
 *
 * Strips use the `measureFigureWhitespace` frame ({x, y, w, h}, y up from the
 * lower-left); the returned slots use `planScheduleSplit`'s gap shape
 * ({x, y, width, height}) so they can be passed straight through. Pass
 * `minRowsPerTable: 1` to that splitter so a small remainder — a continuation
 * by construction — is not rejected by the 3-row standalone minimum.
 *
 * @param {object}   opts
 * @param {Array<{x,y,w,h}>} opts.strips      whitespace strips to fill
 * @param {number}   opts.maxTableHeight      cap on any one table's height
 * @param {number}   opts.tableWidth          width of ONE schedule column
 * @param {number}  [opts.spacing=10]         gap between stacked slots
 * @param {number}  [opts.headerHeight=65]    non-row chrome (title+header+pad)
 * @param {number}  [opts.rowHeight=15]       height of one schedule row
 * @returns {Array<{x:number,y:number,width:number,height:number}>}
 */
export function subdivideStripsForCap({
  strips, maxTableHeight, tableWidth, spacing = 10,
  headerHeight = 65, rowHeight = 15, obstacles = [], bounds = null,
}) {
  if (!Array.isArray(strips) || !(maxTableHeight > 0) || !(tableWidth > 0)) return [];

  // Callers cut the strips against the figure inflated by a clearance, so a
  // figure flush to the drawing edge pushes the top/bottom bands outside it —
  // real output had band slots 28pt into the sheet margin. Clip every strip to
  // the drawing area before slotting.
  const clip = (s) => {
    if (!bounds) return s;
    const x0 = Math.max(s.x, bounds.x);
    const y0 = Math.max(s.y, bounds.y);
    const x1 = Math.min(s.x + (s.w ?? s.width), bounds.x + (bounds.w ?? bounds.width));
    const y1 = Math.min(s.y + (s.h ?? s.height), bounds.y + (bounds.h ?? bounds.height));
    return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  };

  // Tile one clear vertical run into cap-limited, whole-row tables.
  const tileRun = (top, bottom) => {
    const out = [];
    let y = top;
    for (;;) {
      const usable = Math.min(bottom - y, maxTableHeight);
      const rows = Math.floor((usable - headerHeight) / rowHeight);
      if (rows < 1) break;                      // no room for even a one-row table
      const height = headerHeight + rows * rowHeight;
      out.push({ y, height });
      y += height + spacing;
    }
    return out;
  };

  // The vertical runs of one column that no obstacle covers. An obstacle only
  // matters where it overlaps this column horizontally — a block clipping the
  // top corner should push the column down, never delete it.
  const clearRuns = (x, top, bottom) => {
    const blocked = obstacles
      .filter((o) => o && o.x < x + tableWidth && o.x + o.width > x)
      .map((o) => [o.y, o.y + o.height])
      .sort((a, b) => a[0] - b[0]);

    const runs = [];
    let cursor = top;
    for (const [bTop, bBottom] of blocked) {
      if (bBottom <= cursor) continue;          // already behind us
      if (bTop > cursor) runs.push([cursor, Math.min(bTop, bottom)]);
      cursor = Math.max(cursor, bBottom);
      if (cursor >= bottom) break;
    }
    if (cursor < bottom) runs.push([cursor, bottom]);
    return runs.filter(([a, b]) => b > a);
  };

  // Per strip: how many columns fit, and each column's tiling around obstacles.
  const prepared = [];
  for (const raw of strips) {
    if (!raw) continue;
    const strip = clip(raw);
    const width  = strip.w ?? strip.width;
    const height = strip.h ?? strip.height;
    // A strip narrower than a single column can hold no table at all.
    if (!(width >= tableWidth) || !(height > 0)) continue;

    const columns = Math.floor((width + spacing) / (tableWidth + spacing));
    if (columns < 1) continue;

    const perColumn = [];
    for (let c = 0; c < columns; c++) {
      const x = strip.x + c * (tableWidth + spacing);
      const tiles = clearRuns(x, strip.y, strip.y + height)
        .flatMap(([top, bottom]) => tileRun(top, bottom));
      perColumn.push({ x, tiles });
    }
    if (perColumn.some((col) => col.tiles.length > 0)) prepared.push({ columns, perColumn });
  }

  // Emit column-major ACROSS strips: the first column of every strip before the
  // second column of any. planScheduleSplit fills the biggest slots first and
  // ties resolve in emission order, so this is what keeps the schedule balanced
  // across the available whitespace instead of stacking up in one region.
  const maxColumns = prepared.reduce((m, p) => Math.max(m, p.columns), 0);
  const slots = [];
  for (let c = 0; c < maxColumns; c++) {
    for (const p of prepared) {
      const col = p.perColumn[c];
      if (!col) continue;
      for (const tile of col.tiles) {
        slots.push({ x: col.x, y: tile.y, width: tableWidth, height: tile.height });
      }
    }
  }
  return slots;
}

/**
 * Even out the row counts of an already-chosen set of schedule tables.
 *
 * planScheduleSplit fills greedily — each table takes its full capacity and the
 * last one gets whatever is left. That is the right way to decide HOW MANY
 * tables are needed, but it reads badly: a sheet ends up with two full columns
 * and a table holding a single parcel. Levelling keeps the same slots and the
 * same total, and just spreads the rows across them as evenly as each slot's
 * own capacity allows, so 145 + 121 becomes 133 + 133.
 *
 * Water-fills: every table still short of its capacity takes an equal share of
 * what is left, repeatedly, so a small slot fills up and drops out while the
 * tall ones keep absorbing. No table ever exceeds its slot.
 *
 * @param {object} opts
 * @param {Array<{gapIndex:number,startRow:number,rowCount:number,isContinuation:boolean}>} opts.plan
 * @param {Array<{height:number}>} opts.slots        indexed by the plan's gapIndex
 * @param {number} opts.headerHeight                 non-row chrome per table
 * @param {number} opts.rowHeight
 * @returns {Array} a new plan; the input is returned as-is when levelling is moot
 */
export function levelScheduleTables({ plan, slots, headerHeight, rowHeight }) {
  if (!Array.isArray(plan) || plan.length < 2) return plan;

  const caps = plan.map((entry) => {
    const slot = slots?.[entry.gapIndex];
    if (!slot) return entry.rowCount;
    return Math.max(0, Math.floor((slot.height - headerHeight) / rowHeight));
  });

  const total = plan.reduce((sum, e) => sum + e.rowCount, 0);
  const rows = caps.map(() => 0);
  let remaining = total;

  while (remaining > 0) {
    const open = rows.map((r, i) => i).filter((i) => rows[i] < caps[i]);
    if (open.length === 0) break;                     // capacity exhausted
    const share = Math.max(1, Math.floor(remaining / open.length));
    for (const i of open) {
      if (remaining <= 0) break;
      const add = Math.min(share, caps[i] - rows[i], remaining);
      rows[i] += add;
      remaining -= add;
    }
  }

  let startRow = 0;
  return plan.map((entry, i) => {
    const out = { ...entry, startRow, rowCount: rows[i], isContinuation: i > 0 };
    startRow += rows[i];
    return out;
  });
}
