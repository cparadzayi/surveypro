/**
 * Shared collision primitives for frontend layout and label systems.
 *
 * These helpers provide:
 * - Bounds normalization (handles negative width/height safely)
 * - Consistent spacing/margin semantics across modules
 * - Reusable AABB overlap and containment checks
 */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function normalizeSpacing(value: number = 0): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, value)
}

export function normalizeRect<T extends Rect>(rect: T): T {
  const x1 = Number.isFinite(rect.x) ? rect.x : 0
  const y1 = Number.isFinite(rect.y) ? rect.y : 0
  const x2 = Number.isFinite(rect.width) ? x1 + rect.width : x1
  const y2 = Number.isFinite(rect.height) ? y1 + rect.height : y1

  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)

  return {
    ...rect,
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

/**
 * Axis-aligned box intersection with spacing semantics:
 * - spacing=0 => strict geometric overlap/touch
 * - spacing>0 => treat near boxes (within spacing) as colliding
 */
export function boxesIntersect(box1: Rect, box2: Rect, spacing: number = 0): boolean {
  const a = normalizeRect(box1)
  const b = normalizeRect(box2)
  const s = normalizeSpacing(spacing)

  return !(
    a.x + a.width + s < b.x ||
    b.x + b.width + s < a.x ||
    a.y + a.height + s < b.y ||
    b.y + b.height + s < a.y
  )
}

export function calculateOverlapArea(box1: Rect, box2: Rect): number {
  const a = normalizeRect(box1)
  const b = normalizeRect(box2)

  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return xOverlap * yOverlap
}

export function isRectWithinBounds(rect: Rect, bounds: Rect, margin: number = 0): boolean {
  const r = normalizeRect(rect)
  const b = normalizeRect(bounds)
  const m = normalizeSpacing(margin)

  return (
    r.x >= b.x + m &&
    r.y >= b.y + m &&
    r.x + r.width <= b.x + b.width - m &&
    r.y + r.height <= b.y + b.height - m
  )
}
