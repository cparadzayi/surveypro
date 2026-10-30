/**
 * Shared collision primitives for backend layout and labeling systems.
 *
 * Kept deliberately small to avoid behavior drift while enabling reuse.
 */

export function normalizeSpacing(value = 0) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

export function normalizeRect(rect) {
  const x1 = Number.isFinite(rect?.x) ? rect.x : 0;
  const y1 = Number.isFinite(rect?.y) ? rect.y : 0;
  const x2 = Number.isFinite(rect?.width) ? x1 + rect.width : x1;
  const y2 = Number.isFinite(rect?.height) ? y1 + rect.height : y1;

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  return {
    ...rect,
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Axis-aligned box intersection with optional spacing.
 * spacing=0 preserves strict overlap/touch semantics.
 */
export function boxesIntersect(box1, box2, spacing = 0) {
  // Same arithmetic as normalizeRect(), without allocating (and object-spreading) two rects per
  // call: this runs millions of times when labels are placed on a dense plan.
  const ax1 = Number.isFinite(box1?.x) ? box1.x : 0;
  const ay1 = Number.isFinite(box1?.y) ? box1.y : 0;
  const ax2 = Number.isFinite(box1?.width) ? ax1 + box1.width : ax1;
  const ay2 = Number.isFinite(box1?.height) ? ay1 + box1.height : ay1;
  const bx1 = Number.isFinite(box2?.x) ? box2.x : 0;
  const by1 = Number.isFinite(box2?.y) ? box2.y : 0;
  const bx2 = Number.isFinite(box2?.width) ? bx1 + box2.width : bx1;
  const by2 = Number.isFinite(box2?.height) ? by1 + box2.height : by1;
  const aMinX = Math.min(ax1, ax2), aMinY = Math.min(ay1, ay2);
  const bMinX = Math.min(bx1, bx2), bMinY = Math.min(by1, by2);
  const s = normalizeSpacing(spacing);

  return !(
    aMinX + (Math.max(ax1, ax2) - aMinX) + s < bMinX ||
    bMinX + (Math.max(bx1, bx2) - bMinX) + s < aMinX ||
    aMinY + (Math.max(ay1, ay2) - aMinY) + s < bMinY ||
    bMinY + (Math.max(by1, by2) - bMinY) + s < aMinY
  );
}

export function calculateOverlapArea(box1, box2) {
  const a = normalizeRect(box1);
  const b = normalizeRect(box2);

  const xOverlap = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  );
  const yOverlap = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  );

  return xOverlap * yOverlap;
}

export function isRectWithinBounds(rect, bounds, margin = 0) {
  const r = normalizeRect(rect);
  const b = normalizeRect(bounds);
  const m = normalizeSpacing(margin);

  return (
    r.x >= b.x + m &&
    r.y >= b.y + m &&
    r.x + r.width <= b.x + b.width - m &&
    r.y + r.height <= b.y + b.height - m
  );
}
