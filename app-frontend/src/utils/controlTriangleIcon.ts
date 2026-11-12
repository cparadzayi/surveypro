/**
 * The conventional sign of national control on a web map: a black equilateral triangle with a small white
 * circle at its centroid. A trig beacon points up; an official control point (OCP, the "6091/V" series) is the
 * same sign inverted, as the Fifth Schedule and the working plan draw it.
 */
export interface ControlTriangleOptions {
  /** Point down: an official control point. */
  inverted?: boolean
  fill?: string
  /** Outline of the triangle (white, so it reads on a busy basemap). */
  outline?: string
  size?: number
}

/** A canvas holding the sign, ready for `map.addImage(name, canvas.getContext('2d').getImageData(...))`. */
export function drawControlTriangle(opts: ControlTriangleOptions = {}): HTMLCanvasElement {
  const size = opts.size ?? 48
  const inverted = !!opts.inverted
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const m = 8                         // margin
  const h = size - 2 * m              // triangle height
  const apexY = inverted ? size - m : m
  const baseY = inverted ? m : size - m

  ctx.fillStyle = opts.fill ?? '#000000'
  ctx.strokeStyle = opts.outline ?? '#ffffff'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(size / 2, apexY)
  ctx.lineTo(size - m, baseY)
  ctx.lineTo(m, baseY)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // the white circle sits at the centroid, one third of the height in from the base
  const side = (h * 2) / Math.sqrt(3)
  const inRadius = ((side * Math.sqrt(3)) / 6) * 0.25
  const cy = inverted ? baseY + h / 3 : baseY - h / 3
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(size / 2, cy, inRadius, 0, 2 * Math.PI)
  ctx.fill()
  ctx.stroke()
  return canvas
}

/** An official control point, by its status, registry type or designation ("6091/V"). */
export function isOcpPoint(p: { status?: unknown; type?: unknown; id?: unknown; description?: unknown }): boolean {
  const up = (v: unknown) => String(v ?? '').trim().toUpperCase()
  if (up(p.status) === 'OCP' || up(p.type) === 'OCP') return true
  const stripped = (v: unknown) => up(v).replace(/^CP-/, '')
  return /^(TSM)?\d+\/V$/.test(stripped(p.id)) || /^(TSM)?\d+\/V$/.test(stripped(p.description))
}
