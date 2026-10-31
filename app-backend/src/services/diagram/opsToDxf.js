/**
 * Turns what the diagram PDF drew (recorded page operations, see pdfOps.js) into a DXF.
 *
 * The DXF is not a second drawing of the diagram: it is the PDF's own drawing, operation for
 * operation, in Cape Lo ground coordinates. So the two cannot disagree about what is on the
 * sheet, where, in what size or in what order. What differs is only what a DXF can express:
 * Release 12 has no true colour (the nearest palette colour is used), no transparency, and
 * letters come from the CAD program's font rather than Helvetica.
 */
import { createDxfWriter } from './dxfPrimitives.js'
import { nearestAci } from './aci.js'
import { createDxfWriterR2000 } from './dxfWriterR2000.js'

/** Helvetica's capital height as a fraction of its font size: a DXF text height is a CAPITAL's
 *  height, a PDF font size is the em. */
export const CAP_HEIGHT = 0.718

export const DIAGRAM_LAYERS = [
  { name: 'SHEET_EDGE', color: 8 },
  { name: 'BORDER', color: 7 },
  { name: 'FIGURE', color: 7 },
  { name: 'FIGURE_BAND', color: 103 },
  { name: 'FIGURE_LABELS', color: 7 },
  { name: 'BEACONS', color: 7 },
  { name: 'NEIGHBOURS', color: 8 },
  { name: 'DIAGRAM_ROAD', color: 31 },
  { name: 'ADJOINING', color: 7 },
  { name: 'ADJOINING_SERVITUDE', color: 5 },
  { name: 'TABLE', color: 7 },
  { name: 'BEACON_DESC', color: 7 },
  { name: 'NORTH_ARROW', color: 7 },
  { name: 'APPROVED', color: 7 },
  { name: 'SCALE_BAR', color: 7 },
  { name: 'STATEMENT', color: 7 },
  { name: 'GRID', color: 7 },
]

const norm360 = (a) => ((a % 360) + 360) % 360

/**
 * @param {object[]} ops    recorded by recordPdfOps (page points, y down)
 * @param {{ perPt: number, figCenterPx: number, figCenterPy: number, center: {x:number,y:number} }} ground
 * @returns {{ dxfBuffer: Buffer, stats: object }}
 */
export function opsToDxf(ops, ground, { version = 'r12', layers = DIAGRAM_LAYERS } = {}) {
  const w = version === 'r2000' ? createDxfWriterR2000(layers) : createDxfWriter(layers)
  // Release 12 takes the palette index; Release 2000 and later take the exact RGB too.
  const colorOf = (hex) => ({ aci: nearestAci(hex), rgb: hex })
  const known = new Set(layers.map((l) => l.name))
  const layerOf = (op) => (known.has(op.layer) ? op.layer : '0')
  const g = (x, y) => ({
    x: ground.center.x + (x - ground.figCenterPx) * ground.perPt,
    y: ground.center.y - (y - ground.figCenterPy) * ground.perPt,
  })
  const len = (v) => v * ground.perPt
  const stats = { text: 0, stroke: 0, fill: 0, circle: 0 }
  const ext = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const track = (q) => {
    if (q.x < ext.minX) ext.minX = q.x
    if (q.y < ext.minY) ext.minY = q.y
    if (q.x > ext.maxX) ext.maxX = q.x
    if (q.y > ext.maxY) ext.maxY = q.y
  }

  // The paper's edge, which the PDF has by being a page and a DXF has no page to be: drawn so the
  // margins (the neat line's distance from each edge) can be read, and measured, in CAD.
  const sheet = ground.page ? [[0, 0], [ground.page.width, 0], [ground.page.width, ground.page.height], [0, ground.page.height]].map(([x, y]) => g(x, y)) : null
  if (sheet) w.addPolyline('SHEET_EDGE', sheet, { closed: true, color: { aci: 8, rgb: '#808080' } })

  for (const op of ops) {
    const layer = layerOf(op)
    if (op.type === 'text') {
      if (!op.text.trim()) continue
      const h = op.size * CAP_HEIGHT
      const factor = op.width / (op.text.length * h)
      const r = op.rotation * Math.PI / 180
      const align = op.box?.align === 'center' || op.box?.align === 'right' ? op.box.align : 'left'
      // The recorded x,y is the START of the baseline; a centred / right-aligned string is anchored
      // at its middle / end, along the string's own direction.
      const along = align === 'center' ? op.width / 2 : align === 'right' ? op.width : 0
      const a = g(op.x + Math.cos(r) * along, op.y + Math.sin(r) * along)
      w.addText(layer, a.x, a.y, op.text, len(h), norm360(-op.rotation), {
        align, widthFactor: factor, color: colorOf(op.color),
      })
      stats.text++
    } else if (op.type === 'stroke') {
      const pts = op.pts.map(([x, y]) => g(x, y))
      pts.forEach(track)
      const o = { width: len(op.width), color: colorOf(op.color), closed: op.closed }
      if (op.dash) o.linetype = w.dashed(len(op.dash.len), len(op.dash.space))
      w.addPolyline(layer, pts, o)
      stats.stroke++
    } else if (op.type === 'fill') {
      w.addFill(layer, op.rings.map((r) => r.map(([x, y]) => { const q = g(x, y); return [q.x, q.y] })), op.rule, colorOf(op.color))
      stats.fill++
    } else if (op.type === 'discFill') {
      const c = g(op.cx, op.cy)
      w.addDisc(layer, c.x, c.y, len(op.r), colorOf(op.color))
      stats.fill++
    } else if (op.type === 'circle') {
      const c = g(op.cx, op.cy)
      track({ x: c.x - len(op.r), y: c.y - len(op.r) }); track({ x: c.x + len(op.r), y: c.y + len(op.r) })
      w.addCircle(layer, c.x, c.y, len(op.r), { color: colorOf(op.color) })
      stats.circle++
    }
  }

  // The drawing opens on the sheet: its extent is the paper (or, without one, the neat line).
  const border = ops.find((o) => o.type === 'stroke' && o.layer === 'BORDER' && o.closed && o.pts.length === 4)
  let min, max
  if (sheet) {
    min = { x: Math.min(...sheet.map((p) => p.x)), y: Math.min(...sheet.map((p) => p.y)) }
    max = { x: Math.max(...sheet.map((p) => p.x)), y: Math.max(...sheet.map((p) => p.y)) }
  } else if (border) {
    const q = border.pts.map(([x, y]) => g(x, y))
    min = { x: Math.min(...q.map((p) => p.x)), y: Math.min(...q.map((p) => p.y)) }
    max = { x: Math.max(...q.map((p) => p.x)), y: Math.max(...q.map((p) => p.y)) }
  } else {
    min = { x: ext.minX, y: ext.minY }; max = { x: ext.maxX, y: ext.maxY }
  }
  return { dxfBuffer: w.finish(min, max), stats }
}
