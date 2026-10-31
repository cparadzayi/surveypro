/**
 * Writes a General Plan's drawing as AutoCAD Release 2000.
 *
 * The General Plan generator (dxfGenerator.js) builds its entities as Release 12 text with a small,
 * regular vocabulary: LINE, CIRCLE, TEXT, SOLID and closed POLYLINE. Rather than rewrite the
 * generator's thousands of lines of layout, its entity stream is read back and written through the
 * Release 2000 writer -- the same one the diagram uses -- so the file carries handles, owners and
 * subclass markers, names a view that opens on the sheet, and AutoCAD accepts it (see
 * scripts/validateDxfInAutocad.ps1). Geometry, text, layers and styles are carried over unchanged,
 * entity for entity.
 */
import { createDxfWriterR2000 } from './diagram/dxfWriterR2000.js'

/** The entities of an R12 ENTITIES body ("  0\nTYPE\n  8\nLAYER\n..."), as { type, g: [[code, value]] }. */
export function parseR12Entities(body) {
  const rows = String(body).split(/\r?\n/)
  const ents = []
  let cur = null
  for (let i = 0; i + 1 < rows.length; i += 2) {
    const c = rows[i].trim(), v = rows[i + 1]
    if (c === '0') { cur = { type: v, g: [] }; ents.push(cur) } else if (cur) cur.g.push([c, v])
  }
  return ents
}

const first = (e, code, d) => { const x = e.g.find((q) => q[0] === String(code)); return x ? x[1] : d }
const num = (e, code, d = 0) => { const v = first(e, code); return v == null ? d : Number(v) }

/**
 * @param {string} entitiesText  the generator's R12 entity stream
 * @param {{name:string,color:number}[]} layers
 * @param {{ min:{x:number,y:number}, max:{x:number,y:number}, styles?: string[] }} frame
 * @returns {Buffer}
 */
export function r12EntitiesToR2000(entitiesText, layers, frame) {
  const styles = frame.styles ?? ['STANDARD', 'BOLD']
  const w = createDxfWriterR2000(layers, { styles })
  const ents = parseR12Entities(entitiesText)
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i]
    const layer = first(e, 8, '0')
    if (e.type === 'LINE') {
      w.addLine(layer, num(e, 10), num(e, 20), num(e, 11), num(e, 21))
    } else if (e.type === 'CIRCLE') {
      w.addCircle(layer, num(e, 10), num(e, 20), num(e, 40))
    } else if (e.type === 'TEXT') {
      const al = first(e, 72, '0')
      const align = al === '1' ? 'center' : al === '2' ? 'right' : 'left'
      w.addText(layer, align === 'left' ? num(e, 10) : num(e, 11), align === 'left' ? num(e, 20) : num(e, 21),
        first(e, 1, ''), num(e, 40), num(e, 50, 0), { align, widthFactor: num(e, 41, 0.55), style: first(e, 7) })
    } else if (e.type === 'SOLID') {
      w.addSolid(layer, [0, 1, 2, 3].map((k) => [num(e, 10 + k), num(e, 20 + k)]))
    } else if (e.type === 'POLYLINE') {
      const closed = (parseInt(first(e, 70, '0'), 10) & 1) === 1
      const pts = []
      let j = i + 1
      while (j < ents.length && ents[j].type === 'VERTEX') { pts.push({ x: num(ents[j], 10), y: num(ents[j], 20) }); j++ }
      if (ents[j]?.type === 'SEQEND') j++
      i = j - 1
      w.addPolyline(layer, pts, { closed })
    } else if (e.type === 'VERTEX' || e.type === 'SEQEND') {
      // consumed with their POLYLINE
    } else {
      throw new Error(`dxfR12ToR2000: the General Plan wrote a ${e.type} entity, which this conversion does not know`)
    }
  }
  return w.finish(frame.min, frame.max)
}
