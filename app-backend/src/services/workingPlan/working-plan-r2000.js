/**
 * The Working Plan as an AutoCAD Release 2000 DXF.
 *
 * The plan is built as a Release 12 drawing (dxf-r12.js), and that string is what the golden tests pin. A
 * Release 12 file has no UTF-8: an en dash or a degree sign written into it arrives as a control byte or as
 * mojibake, and the file has none of Release 2000's structure (handles, owners, true colour, TrueType faces).
 * So the file a surveyor receives is written from the same recorded drawing, through the Release 2000 writer
 * the General Plan and the diagram use. Nothing is redrawn: this walks the drawing's operations the way the
 * working plan's PDF does, so the two sheets carry the same drawing at the same place and size.
 *
 * What changes from the Release 12 file, and why:
 *  - Block inserts (the beacon signs) are flattened into plain entities at their ground position. The Release
 *    2000 writer has no user blocks, and the signs are fixed conventional signs, not something to be edited
 *    as a block.
 *  - A layer's linetype is applied to each entity (the writer's layers are continuous), so the dashed
 *    boundaries and the dotted leaders stay dashed.
 *  - Lettering is the PDF's own faces: Arial, Arial Bold and Times (the approval box was Times; it is Arial now),
 *    as TrueType styles, so the line is as long in CAD as on the PDF.
 *
 * Coordinates are the drawing's own ground metres, exactly as in the Release 12 file.
 */
import { createDxfWriterR2000 } from '../diagram/dxfWriterR2000.js'

/** The text styles the working plan's lettering uses, as TrueType faces. */
const STYLES = [
  { name: 'ARIAL', file: 'arial.ttf', face: 'Arial' },
  { name: 'ARIAL-BOLD', file: 'arialbd.ttf', face: 'Arial', bold: true },
  { name: 'SERIF', file: 'times.ttf', face: 'Times New Roman' },
]

/**
 * @param {{ doc: object, originE: number, originN: number, scale: number, sheet: { width: number, height: number } }} model
 * @returns {Buffer}
 */
export function workingPlanDxf2000(model) {
  const { doc, originE, originN, scale, sheet } = model
  const layers = new Map(doc.layers.map((l) => [l.name, l]))
  const patterns = new Map(doc.linetypes.map((l) => [l.name, l.pattern]))
  const blocks = new Map(doc.blocks.map((b) => [b.name, b.ops]))

  const w = createDxfWriterR2000(
    doc.layers.map((l) => ({ name: l.name, color: l.color })),
    { styles: STYLES },
  )

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const grow = (x, y) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }

  /** A point of a shape, after the inserts it sits in. */
  const place = (x, y, ctx) => {
    const c = Math.cos(ctx.rot), s = Math.sin(ctx.rot)
    const gx = ctx.dx + ctx.scale * (x * c - y * s)
    const gy = ctx.dy + ctx.scale * (x * s + y * c)
    grow(gx, gy)
    return [gx, gy]
  }

  /** The writer's name for the dashed linetype this entity is drawn with, or nothing for a solid line. */
  const linetypeFor = (layerName, linetype) => {
    const layer = layers.get(layerName) ?? layers.get('0')
    const name = linetype ?? layer?.linetype ?? 'CONTINUOUS'
    const pattern = patterns.get(name)                 // [total, on, -off]; none for a continuous line
    if (!pattern || pattern.length < 3) return undefined
    return w.dashed(pattern[1], -pattern[2])
  }

  const draw = (ops, ctx) => {
    for (const op of ops) {
      // Layer 0 inside a block takes the layer of the INSERT.
      const layerName = op.layer === '0' && ctx.layer ? ctx.layer : op.layer
      const c = { ...ctx, layer: layerName }
      switch (op.t) {
        case 'line': {
          const [x1, y1] = place(op.a[0], op.a[1], c), [x2, y2] = place(op.b[0], op.b[1], c)
          w.addLine(layerName, x1, y1, x2, y2, { linetype: linetypeFor(layerName, op.linetype) })
          break
        }
        case 'polyline': {
          if (op.points.length < 2) break
          const pts = op.points.map(([x, y]) => { const [gx, gy] = place(x, y, c); return { x: gx, y: gy } })
          w.addPolyline(layerName, pts, { closed: !!op.closed, linetype: linetypeFor(layerName, op.linetype) })
          break
        }
        case 'circle': {
          const [cx, cy] = place(op.c[0], op.c[1], c)
          w.addCircle(layerName, cx, cy, op.r * ctx.scale)
          grow(cx - op.r * ctx.scale, cy - op.r * ctx.scale)
          grow(cx + op.r * ctx.scale, cy + op.r * ctx.scale)
          break
        }
        case 'solid': {
          const p = op.pts.map(([x, y]) => place(x, y, c))
          // a triangle repeats its last corner; a SOLID stores its corners in the order 1, 2, 4, 3
          const four = p.length === 3 ? [p[0], p[1], p[2], p[2]] : p
          w.addSolid(layerName, [four[0], four[1], four[3], four[2]])
          break
        }
        case 'text': {
          const [px, py] = place(op.at[0], op.at[1], c)
          // lettering is monochrome: colour 7, whatever its layer
          w.addText(layerName, px, py, op.str, op.height * ctx.scale, op.rotation + (ctx.rot * 180) / Math.PI, {
            align: op.align, widthFactor: op.widthFactor, style: op.style, color: { aci: 7 },
          })
          break
        }
        case 'insert': {
          const inner = blocks.get(op.block)
          if (!inner) break
          const gx = ctx.dx + ctx.scale * (op.at[0] * Math.cos(ctx.rot) - op.at[1] * Math.sin(ctx.rot))
          const gy = ctx.dy + ctx.scale * (op.at[0] * Math.sin(ctx.rot) + op.at[1] * Math.cos(ctx.rot))
          draw(inner, { dx: gx, dy: gy, scale: ctx.scale * op.scale, rot: ctx.rot + (op.rotation * Math.PI) / 180, layer: layerName })
          break
        }
        default: break
      }
    }
  }

  draw(doc.ops, { dx: 0, dy: 0, scale: 1, rot: 0, layer: null })

  // The view opens on the sheet: its paper size, in ground metres, from the drawing's origin (top-left, north up).
  const groundW = (sheet.width * scale) / 1000
  const groundH = (sheet.height * scale) / 1000
  const frame = Number.isFinite(minX)
    ? { min: { x: Math.min(minX, originE), y: Math.min(minY, originN - groundH) }, max: { x: Math.max(maxX, originE + groundW), y: Math.max(maxY, originN) } }
    : { min: { x: originE, y: originN - groundH }, max: { x: originE + groundW, y: originN } }
  return w.finish(frame.min, frame.max)
}
