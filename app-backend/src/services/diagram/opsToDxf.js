/**
 * Turns what the diagram PDF drew (recorded page operations, see pdfOps.js) into a DXF.
 *
 * The DXF is not a second drawing of the diagram: it is the PDF's own drawing, operation for
 * operation, in Cape Lo ground coordinates. So the two cannot disagree about what is on the
 * sheet, where, in what size or in what order. What differs is only what a DXF can express:
 * Release 12 has no true colour (the nearest palette colour is used), no transparency, and
 * letters come from the CAD program's font rather than Helvetica.
 */
import { maskHiddenByWhiteFills } from './maskHidden.js'
import { createDxfWriter } from './dxfPrimitives.js'
import { nearestAci } from './aci.js'
import { createDxfWriterR2000 } from './dxfWriterR2000.js'

/** Helvetica's capital height as a fraction of its font size: a DXF text height is a CAPITAL's
 *  height, a PDF font size is the em. */
export const CAP_HEIGHT = 0.718

/** The PDF's four Helvetica faces and the Arial faces that carry them in the DXF (same letter widths). */
export const PDF_FONT_STYLES = {
  'Helvetica': { name: 'PDF_Helvetica', file: 'arial.ttf', face: 'Arial' },
  'Helvetica-Bold': { name: 'PDF_Helvetica_Bold', file: 'arialbd.ttf', face: 'Arial', bold: true },
  'Helvetica-Oblique': { name: 'PDF_Helvetica_Oblique', file: 'ariali.ttf', face: 'Arial', italic: true },
  'Helvetica-BoldOblique': { name: 'PDF_Helvetica_BoldOblique', file: 'arialbi.ttf', face: 'Arial', bold: true, italic: true },
}

export const DIAGRAM_LAYERS = [
  { name: 'PAPER', color: 255 },
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
export function opsToDxf(rawOps, ground, { version = 'r12', layers = DIAGRAM_LAYERS, dropWhiteFills = false, autoContrastBlack = false } = {}) {
  const r2000 = version === 'r2000'
  // Without the white fills the PDF masks with, what they hid is taken out of the lines and circles instead, so the
  // drawing shows what the PDF shows (maskHidden.js).
  const ops = dropWhiteFills ? maskHiddenByWhiteFills(rawOps) : rawOps
  // Release 2000 only, which is the editable file: the lettering goes on a layer of its own beside each layer that
  // has any ("PARCELS" / "PARCELS_TEXT"), so labels can be switched off or frozen apart from the linework, and the
  // PAPER layer (the white sheet under everything) is locked, so a click in the drawing never picks the sheet.
  const textLayerOf = (name) => `${name}_TEXT`
  const layersWithText = r2000 ? new Set(ops.filter((o) => o.type === 'text' && layers.some((l) => l.name === o.layer)).map((o) => o.layer)) : new Set()
  const outLayers = r2000
    ? [
      // With the white fills dropped there is no sheet fill either (the General Plan's DXF, like the working plan's, has
      // none), so there is no PAPER layer to carry; otherwise it is locked.
      ...layers.filter((l) => !(dropWhiteFills && l.name === 'PAPER')).map((l) => (l.name === 'PAPER' ? { ...l, locked: true } : l)),
      ...layers.filter((l) => layersWithText.has(l.name)).map((l) => ({ name: textLayerOf(l.name), color: l.color })),
    ]
    : layers
  const w = r2000 ? createDxfWriterR2000(outLayers, { styles: ['Standard', ...Object.values(PDF_FONT_STYLES)] }) : createDxfWriter(layers)
  // Release 12 takes the palette index; Release 2000 and later take the exact RGB too.
  // `autoContrastBlack`: the PDF's black is written as plain colour 7 and no true colour. Colour 7 is CAD's "contrast"
  // colour, white on a dark background and black on a white one; a true-colour black (group 420) overrides it and
  // is invisible on a dark background, which is how a General Plan arrived in AutoCAD 2026's dark theme.
  // "Black" includes near-black: the beacon letters are slate #1E293B, which is as invisible as black on a dark background.
  const isBlack = (hex) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex ?? ''))
    return !!m && [m[1], m[2], m[3]].every((c) => parseInt(c, 16) < 64)   // every channel dark: a deep red or blue keeps its colour
  }
  const colorOf = (hex) => (autoContrastBlack && r2000 && isBlack(hex) ? { aci: 7 } : { aci: nearestAci(hex), rgb: hex })
  const known = new Set(layers.map((l) => l.name))
  const layerOf = (op) => (known.has(op.layer) ? op.layer : '0')
  const isWhite = (hex) => /^#?f{6}$/i.test(String(hex ?? ''))
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
  // A PAPER layer, where the plan has one, takes a white fill of the whole sheet under everything else,
  // so the plan reads on white whatever the CAD screen's own background is set to.
  // A sheet-sized white hatch turned the whole drawing blue when it was clicked, so nothing under it could be picked
  // (a locked layer did not stop it): the General Plan's DXF has none, as the working plan's has none.
  if (sheet && known.has('PAPER') && !dropWhiteFills) w.addFill('PAPER', [sheet.map((q) => [q.x, q.y])], 'nonzero', { aci: 255, rgb: '#ffffff' })
  if (sheet) w.addPolyline('SHEET_EDGE', sheet, { closed: true, color: { aci: 8, rgb: '#808080' } })

  for (const op of ops) {
    const layer = layerOf(op)
    if (op.type === 'text') {
      if (!op.text.trim()) continue
      const textLayer = layersWithText.has(layer) ? textLayerOf(layer) : layer
      // Release 2000 text is set in the PDF's own face: AutoCAD sizes a TrueType face by its capital
      // height (measured), and Arial's letters are Helvetica's, so the width factor is 1 and the line is
      // as long as the PDF's. Release 12 has no faces: the stroke font is squeezed to the PDF's width.
      const face = r2000 ? (PDF_FONT_STYLES[op.font] ?? PDF_FONT_STYLES.Helvetica) : null
      const h = op.size * CAP_HEIGHT
      const factor = face ? 1 : op.width / (op.text.length * h)
      const r = op.rotation * Math.PI / 180
      const align = op.box?.align === 'center' || op.box?.align === 'right' ? op.box.align : 'left'
      // The recorded x,y is the START of the baseline; a centred / right-aligned string is anchored
      // at its middle / end, along the string's own direction.
      const along = align === 'center' ? op.width / 2 : align === 'right' ? op.width : 0
      const a = g(op.x + Math.cos(r) * along, op.y + Math.sin(r) * along)
      w.addText(textLayer, a.x, a.y, op.text, len(h), norm360(-op.rotation), {
        align, widthFactor: factor, color: colorOf(op.color), ...(face ? { style: face.name } : {}),
      })
      stats.text++
    } else if (op.type === 'stroke') {
      const pts = op.pts.map(([x, y]) => g(x, y))
      pts.forEach(track)
      // Release 2000 takes the PDF's line width as a real lineweight (points -> hundredths of a millimetre);
      // Release 12 has only a polyline width, a band of fixed ground size.
      const o = r2000
        ? { lineweight: (op.width * 25.4 * 100) / 72, color: colorOf(op.color), closed: op.closed }
        : { width: len(op.width), color: colorOf(op.color), closed: op.closed }
      if (op.dash) o.linetype = w.dashed(len(op.dash.len), len(op.dash.space))
      w.addPolyline(layer, pts, o)
      stats.stroke++
    } else if (op.type === 'fill') {
      // A white fill behind a stand only hides what lies beneath it in the PDF; in CAD it covers the neighbouring
      // stands' edges and is picked ahead of the line under it.
      if (dropWhiteFills && layer !== 'PAPER' && isWhite(op.color)) continue
      w.addFill(layer, op.rings.map((r) => r.map(([x, y]) => { const q = g(x, y); return [q.x, q.y] })), op.rule, colorOf(op.color))
      stats.fill++
    } else if (op.type === 'discFill') {
      if (dropWhiteFills && isWhite(op.color)) continue
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
