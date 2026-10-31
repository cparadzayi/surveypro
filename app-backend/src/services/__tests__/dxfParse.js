/**
 * Tiny DXF R12 ASCII parser for test assertions.
 * NOT a complete parser — only the inspection operations the tests need.
 * Each DXF line pair is (group code on one line, value on the next).
 */

/** Walk the LAYER table and return how many times `name` appears. */
export function countLayerOnTable(dxf, name) {
  // LAYER table block bounded by "0\nTABLE\n2\nLAYER" .. "0\nENDTAB"
  const m = dxf.match(/\bTABLE\b\s*\n\s*2\s*\n\s*LAYER\b[\s\S]*?\bENDTAB\b/)
  if (!m) return 0
  // Each layer entry is "0\nLAYER\n2\n<name>\n..."; count occurrences of "2\n<name>" inside the table block.
  const re = new RegExp(`\\b2\\s*\\n\\s*${name}\\b`, 'g')
  return (m[0].match(re) || []).length
}

/**
 * Walk the ENTITIES section and count entities of `entityType` on `layerName`.
 * Each entity is "0\n<Type>\n8\n<Layer>\n...".
 */
export function entityCount(dxf, entityType, layerName) {
  const ents = extractEntitiesSection(dxf)
  if (!ents) return 0
  // Split by "0\n<Type>" prefixes; each fragment's "8\n<layer>" is the layer.
  const re = new RegExp(
    `\\b0\\s*\\n\\s*${entityType}\\b[\\s\\S]*?(?=\\b0\\s*\\n\\s*(?:[A-Z]+)\\b|$)`,
    'g'
  )
  let count = 0
  for (const frag of ents.match(re) || []) {
    if (new RegExp(`\\b8\\s*\\n\\s*${layerName}\\b`).test(frag)) count++
  }
  return count
}

/**
 * Find the first entity of `entityType` on `layerName` and return parsed
 * coordinate (x, y) from group codes 10 (x) and 20 (y).
 */
export function parseFirstEntityOf(dxf, entityType, layerName) {
  const ents = extractEntitiesSection(dxf)
  if (!ents) return null
  const re = new RegExp(
    `\\b0\\s*\\n\\s*${entityType}\\b[\\s\\S]*?(?=\\b0\\s*\\n\\s*(?:[A-Z]+)\\b|$)`,
    'g'
  )
  for (const frag of ents.match(re) || []) {
    if (!new RegExp(`\\b8\\s*\\n\\s*${layerName}\\b`).test(frag)) continue
    const x = (frag.match(/\b10\s*\n\s*(-?[\d.]+)/) || [])[1]
    const y = (frag.match(/\b20\s*\n\s*(-?[\d.]+)/) || [])[1]
    if (x != null && y != null) return { x: parseFloat(x), y: parseFloat(y) }
  }
  return null
}

/**
 * Every entity on `layerName`, in file order, as { type, layer, text?, x?, y?,
 * x2?, y2? }. The general form behind `entityCount` / `parseFirstEntityOf` —
 * reach for this when a test needs to inspect what was drawn rather than just
 * how much of it there is.
 */
export function entitiesOnLayer(dxf, layerName) {
  const ents = extractEntitiesSection(dxf)
  if (!ents) return []
  const out = []
  let poly = null // the POLYLINE being read: its VERTEX entities follow it, up to SEQEND
  const flush = () => {
    if (!poly) return
    // A polyline is a run of segments: read as the LINEs it draws, so a test asks what was drawn, not
    // which entity type a writer chose (width needs a POLYLINE; a hairline could be a LINE).
    const v = poly.verts
    for (let i = 0; i + 1 < v.length; i++) {
      out.push({ type: 'LINE', x: v[i].x, y: v[i].y, x2: v[i + 1].x, y2: v[i + 1].y, width: poly.width })
    }
    if (poly.closed && v.length > 2) {
      out.push({ type: 'LINE', x: v[v.length - 1].x, y: v[v.length - 1].y, x2: v[0].x, y2: v[0].y, width: poly.width })
    }
    poly = null
  }
  // Each entity is "0\n<TYPE>\n..." up to the next "0\n<TYPE>".
  for (const frag of ents.match(/\b0\s*\n\s*[A-Z]+\b[\s\S]*?(?=\b0\s*\n\s*[A-Z]+\b|$)/g) || []) {
    const type = (frag.match(/^\s*0\s*\n\s*([A-Z]+)/) || [])[1]
    if (!type) continue
    const onLayer = new RegExp(`\\b8\\s*\\n\\s*${layerName}\\b`).test(frag)
    const num = (code) => {
      const v = (frag.match(new RegExp(`\\b${code}\\s*\\n\\s*(-?[\\d.]+)`)) || [])[1]
      return v == null ? undefined : parseFloat(v)
    }
    if (type === 'POLYLINE') {
      flush()
      poly = onLayer ? { verts: [], closed: (num(70) & 1) === 1, width: num(40) } : null
      continue
    }
    if (type === 'VERTEX') { if (poly) poly.verts.push({ x: num(10), y: num(20) }); continue }
    if (type === 'SEQEND') { flush(); continue }
    if (!onLayer) continue
    out.push({
      type,
      text: (frag.match(/\b1\s*\n\s*([^\n]*)/) || [])[1]?.trim(),
      x: num(10), y: num(20), x2: num(11), y2: num(21),
    })
  }
  flush()
  return out
}

/**
 * The DXF with every POLYLINE (and its VERTEXes) replaced by the LINE entities it draws, same
 * layer. For tests that ask "what lines are on this layer" by reading raw group codes: a width-
 * carrying polyline and a run of lines are the same drawing.
 */
export function expandPolylines(dxf) {
  const rows = dxf.split(/\r?\n/)
  const out = []
  let i = 0
  const pair = (k) => [rows[k].trim(), rows[k + 1]]
  while (i + 1 < rows.length) {
    const [c, v] = pair(i)
    if (c === '0' && v === 'POLYLINE') {
      let layer = '0', closed = false
      let j = i + 2
      while (j + 1 < rows.length && rows[j].trim() !== '0') {
        const [gc, gv] = pair(j)
        if (gc === '8') layer = gv
        if (gc === '70') closed = (parseInt(gv, 10) & 1) === 1
        j += 2
      }
      const verts = []
      while (j + 1 < rows.length) {
        const [gc, gv] = pair(j)
        if (gc === '0' && gv === 'SEQEND') { j += 2; while (j + 1 < rows.length && rows[j].trim() !== '0') j += 2; break }
        if (gc === '0' && gv === 'VERTEX') {
          let x, y; j += 2
          while (j + 1 < rows.length && rows[j].trim() !== '0') {
            const [vc, vv] = pair(j)
            if (vc === '10') x = vv
            if (vc === '20') y = vv
            j += 2
          }
          verts.push([x, y])
        } else j += 2
      }
      const seg = (a, b) => out.push('  0', 'LINE', '  8', layer, ' 10', a[0], ' 20', a[1], ' 11', b[0], ' 21', b[1])
      for (let k = 0; k + 1 < verts.length; k++) seg(verts[k], verts[k + 1])
      if (closed && verts.length > 2) seg(verts[verts.length - 1], verts[0])
      i = j
      continue
    }
    out.push(rows[i], rows[i + 1])
    i += 2
  }
  return out.join('\n')
}

function extractEntitiesSection(dxf) {
  const m = dxf.match(/\bSECTION\b\s*\n\s*2\s*\n\s*ENTITIES\b([\s\S]*?)\bENDSEC\b/)
  return m ? m[1] : null
}
