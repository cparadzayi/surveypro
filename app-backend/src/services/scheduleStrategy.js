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
