// app-backend/src/services/scheduleStrategy.js

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
 * @param {Array<{x:number,y:number,width:number,height:number}>} tables
 * @param {number} figureCX  figure centre x
 * @param {number} contentL  content-area left edge (min x)
 * @param {number} contentR  content-area right edge (max x)
 * @returns {Array<{x,y,width,height}>}
 */
export function balanceScheduleTables(tables, figureCX, contentL, contentR) {
  if (!Array.isArray(tables) || tables.length < 2) return tables;
  const half = Math.ceil(tables.length / 2);
  const moved = [];
  for (let i = half; i < tables.length; i++) {
    const t = tables[i];
    // mirror x across the figure centre; top-align to the kept counterpart's y
    moved.push({ i, x: 2 * figureCX - t.x - t.width, y: tables[i - half].y });
  }
  const fits = moved.length > 0 && moved.every(
    (m) => m.x >= contentL && (m.x + tables[m.i].width) <= contentR,
  );
  if (!fits) return tables;
  const out = tables.map((t) => ({ ...t }));
  for (const m of moved) { out[m.i].x = m.x; out[m.i].y = m.y; }
  return out;
}
