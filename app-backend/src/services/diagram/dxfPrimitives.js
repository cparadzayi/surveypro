/**
 * Self-contained DXF (AutoCAD Release 12, AC1009) file writer for the diagram. Release 12 is
 * written strictly: nothing a later release added (handles, subclass markers, true colour,
 * lineweights) -- a program reading an old-release file rejects what it does not know and
 * discards the drawing. Colours are palette indices (see aci.js); line weight is the width of a
 * POLYLINE, which Release 12 has.
 */

import { triangulateWithHoles } from './triangulate.js'

function p(code, value) {
  return String(code).padStart(3) + '\n' + value + '\n'
}

const f4 = (n) => Number(n).toFixed(4)

/** 0.55 is the STYLE width-factor the diagram's DXF text has always used, so a measurement here
 *  agrees with how TEXT emitted at that factor renders. */
export function textWidth(text, height) {
  return String(text).length * height * 0.55
}

export function createDxfWriter(layers) {
  let ent = ''
  const linetypes = [] // { name, on, off } in drawing units

  // A colour is a palette index, or { aci, rgb } (rgb is for versions that can hold it; this one cannot).
  const col = (c) => (c == null ? '' : p(62, String(typeof c === 'object' ? c.aci : c)))
  const lt = (name) => (name ? p(6, name) : '')

  /** A dashed linetype of `on` drawn / `off` gap (drawing units); the same pattern returns the same name. */
  function dashed(on, off) {
    const found = linetypes.find((l) => Math.abs(l.on - on) < 1e-9 && Math.abs(l.off - off) < 1e-9)
    if (found) return found.name
    const name = `DASH${linetypes.length + 1}`
    linetypes.push({ name, on, off })
    return name
  }

  function addLine(layer, x1, y1, x2, y2, o = {}) {
    ent += p(0, 'LINE') + p(8, layer) + col(o.color) + lt(o.linetype)
    ent += p(10, f4(x1)) + p(20, f4(y1)) + p(11, f4(x2)) + p(21, f4(y2))
  }

  /** A run of points as one POLYLINE carrying its line weight as a width. */
  function addPolyline(layer, pts, o = {}) {
    if (!Array.isArray(pts) || pts.length < 2) return
    const w = o.width && o.width > 0 ? o.width : 0
    ent += p(0, 'POLYLINE') + p(8, layer) + col(o.color) + lt(o.linetype) + p(66, '1')
    ent += p(10, '0.0') + p(20, '0.0') + p(30, '0.0')
    ent += p(70, o.closed ? '1' : '0')
    if (w) ent += p(40, f4(w)) + p(41, f4(w))
    for (const q of pts) {
      ent += p(0, 'VERTEX') + p(8, layer) + p(10, f4(q.x)) + p(20, f4(q.y)) + p(30, '0.0')
    }
    ent += p(0, 'SEQEND') + p(8, layer)
  }

  function addPolylineOutline(layer, points, closed = true, o = {}) {
    if (!Array.isArray(points) || points.length < 2) return
    for (let i = 0; i < points.length - 1; i++) {
      addLine(layer, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, o)
    }
    if (closed) {
      const a = points[points.length - 1], b = points[0]
      addLine(layer, a.x, a.y, b.x, b.y, o)
    }
  }

  function addCircle(layer, cx, cy, r, o = {}) {
    ent += p(0, 'CIRCLE') + p(8, layer) + col(o.color) + lt(o.linetype)
    ent += p(10, f4(cx)) + p(20, f4(cy)) + p(40, f4(r))
  }

  /**
   * TEXT. `align` is 'left' (x is the start of the baseline), 'center' or 'right' (x is the
   * middle / end of it). `widthFactor` sets the width of the letters relative to their height, so the
   * string runs as long as it does in the PDF.
   */
  function addText(layer, x, y, text, height, rotationDeg = 0, o = {}) {
    const align = o.align || 'left'
    ent += p(0, 'TEXT') + p(8, layer) + col(o.color)
    ent += p(10, f4(x)) + p(20, f4(y)) + p(40, f4(height)) + p(1, String(text))
    if (rotationDeg) ent += p(50, f4(rotationDeg))
    ent += p(41, o.widthFactor != null ? f4(o.widthFactor) : '0.55')
    if (align !== 'left') {
      ent += p(72, align === 'center' ? '1' : '2')
      ent += p(11, f4(x)) + p(21, f4(y))
    }
  }
  const addTextC = (layer, xc, y, text, height, o = {}) => addText(layer, xc, y, text, height, 0, { ...o, align: 'center' })
  const addTextR = (layer, xr, y, text, height, o = {}) => addText(layer, xr, y, text, height, 0, { ...o, align: 'right' })

  /** Filled axis-aligned rectangle via a SOLID; corner order is the "Z order" a SOLID needs. */
  function addSolidRect(layer, x1, y1, x2, y2, o = {}) {
    const lo = Math.min(x1, x2), hi = Math.max(x1, x2)
    const bo = Math.min(y1, y2), to = Math.max(y1, y2)
    ent += p(0, 'SOLID') + p(8, layer) + col(o.color)
    ent += p(10, f4(lo)) + p(20, f4(bo)) + p(11, f4(hi)) + p(21, f4(bo))
    ent += p(12, f4(lo)) + p(22, f4(to)) + p(13, f4(hi)) + p(23, f4(to))
  }

  /** Filled triangle: a SOLID has four corners, so the third is repeated (order 1, 2, 4, 3). */
  function addSolidTri(layer, a, b, c, o = {}) {
    ent += p(0, 'SOLID') + p(8, layer) + col(o.color)
    ent += p(10, f4(a[0])) + p(20, f4(a[1])) + p(11, f4(b[0])) + p(21, f4(b[1]))
    ent += p(12, f4(c[0])) + p(22, f4(c[1])) + p(13, f4(c[0])) + p(23, f4(c[1]))
  }

  /** Fill a simple polygon (convex or concave) with SOLID triangles by ear clipping. */
  function addSolidPolygon(layer, pts, o = {}) {
    const n = pts.length
    if (n < 3) return
    const area2 = pts.reduce((a, q, i) => { const r = pts[(i + 1) % n]; return a + (q[0] * r[1] - r[0] * q[1]) }, 0)
    const sgn = area2 >= 0 ? 1 : -1
    const cross = (o2, a, b) => (a[0] - o2[0]) * (b[1] - o2[1]) - (a[1] - o2[1]) * (b[0] - o2[0])
    const inside = (q, a, b, c) => cross(a, b, q) * sgn >= 0 && cross(b, c, q) * sgn >= 0 && cross(c, a, q) * sgn >= 0
    const idx = pts.map((_, i) => i)
    let guard = n * n
    while (idx.length > 3 && guard-- > 0) {
      let clipped = false
      for (let k = 0; k < idx.length; k++) {
        const a = pts[idx[(k + idx.length - 1) % idx.length]], b = pts[idx[k]], c = pts[idx[(k + 1) % idx.length]]
        if (cross(a, b, c) * sgn <= 0) continue
        if (idx.some((j) => { const pj = pts[j]; return pj !== a && pj !== b && pj !== c && inside(pj, a, b, c) })) continue
        addSolidTri(layer, a, b, c, o)
        idx.splice(k, 1)
        clipped = true
        break
      }
      if (!clipped) break
    }
    if (idx.length === 3) addSolidTri(layer, pts[idx[0]], pts[idx[1]], pts[idx[2]], o)
  }

  /** A filled region: rings in drawing units; an even-odd fill of several rings is a band, with the inner ones cut out. */
  function addFill(layer, rings, rule, color) {
    if (rule === 'evenodd' && rings.length >= 2) {
      const area = (r) => Math.abs(r.reduce((t, q, i) => { const n = r[(i + 1) % r.length]; return t + (q[0] * n[1] - n[0] * q[1]) }, 0))
      const order = rings.map((_, i) => i).sort((i, j) => area(rings[j]) - area(rings[i]))
      for (const t of triangulateWithHoles(rings[order[0]], order.slice(1).map((i) => rings[i]))) addSolidTri(layer, t[0], t[1], t[2], { color })
    } else {
      for (const r of rings) addSolidPolygon(layer, r, { color })
    }
  }

  /** A filled disc, as a fan of triangles. */
  function addDisc(layer, cx, cy, r, color) {
    const N = 24
    const ring = Array.from({ length: N }, (_, k) => [cx + r * Math.cos(2 * Math.PI * k / N), cy + r * Math.sin(2 * Math.PI * k / N)])
    for (let k = 0; k < N; k++) addSolidTri(layer, [cx, cy], ring[k], ring[(k + 1) % N], { color })
  }

  /**
   * The view a CAD program opens on. A DXF carries no "zoom extents": without a saved view a program
   * opens on its default window at the origin, and a diagram placed in real Lo coordinates (about 1e5
   * east, 2e6 south) opens as an apparently EMPTY drawing. So the active viewport is centred on the
   * drawing and sized to hold it.
   */
  function viewFor(extMin, extMax) {
    const cx = (extMin.x + extMax.x) / 2
    const cy = (extMin.y + extMax.y) / 2
    const w = Math.max(extMax.x - extMin.x, 1e-6)
    const h = Math.max(extMax.y - extMin.y, 1e-6)
    const aspect = 4 / 3
    const height = Math.max(h, w / aspect) * 1.05
    return { cx, cy, height, aspect }
  }

  function finish(extMin, extMax) {
    const view = viewFor(extMin, extMax)
    let dxf = ''
    dxf += p(0, 'SECTION') + p(2, 'HEADER')
    dxf += p(9, '$ACADVER') + p(1, 'AC1009')
    // Nothing here that Release 12 does not define ($INSUNITS and $MEASUREMENT are later releases').
    dxf += p(9, '$EXTMIN') + p(10, f4(extMin.x)) + p(20, f4(extMin.y))
    dxf += p(9, '$EXTMAX') + p(10, f4(extMax.x)) + p(20, f4(extMax.y))
    dxf += p(9, '$LIMMIN') + p(10, f4(extMin.x)) + p(20, f4(extMin.y))
    dxf += p(9, '$LIMMAX') + p(10, f4(extMax.x)) + p(20, f4(extMax.y))
    dxf += p(9, '$VIEWCTR') + p(10, f4(view.cx)) + p(20, f4(view.cy))
    dxf += p(9, '$VIEWSIZE') + p(40, f4(view.height))
    dxf += p(0, 'ENDSEC')

    dxf += p(0, 'SECTION') + p(2, 'TABLES')

    // The active viewport: where the drawing opens.
    dxf += p(0, 'TABLE') + p(2, 'VPORT') + p(70, '1')
    dxf += p(0, 'VPORT') + p(2, '*ACTIVE') + p(70, '0')
    dxf += p(10, '0.0') + p(20, '0.0') + p(11, '1.0') + p(21, '1.0')
    dxf += p(12, f4(view.cx)) + p(22, f4(view.cy))
    dxf += p(13, '0.0') + p(23, '0.0') + p(14, '1.0') + p(24, '1.0') + p(15, '0.0') + p(25, '0.0')
    dxf += p(16, '0.0') + p(26, '0.0') + p(36, '1.0') + p(17, '0.0') + p(27, '0.0') + p(37, '0.0')
    dxf += p(40, f4(view.height)) + p(41, f4(view.aspect)) + p(42, '50.0')
    dxf += p(43, '0.0') + p(44, '0.0') + p(50, '0.0') + p(51, '0.0')
    dxf += p(71, '0') + p(72, '100') + p(73, '1') + p(74, '3')
    dxf += p(75, '0') + p(76, '0') + p(77, '0') + p(78, '0')
    dxf += p(0, 'ENDTAB')

    dxf += p(0, 'TABLE') + p(2, 'LTYPE') + p(70, String(1 + linetypes.length))
    dxf += p(0, 'LTYPE') + p(2, 'CONTINUOUS') + p(70, '0') + p(3, 'Solid line') + p(72, '65') + p(73, '0') + p(40, '0.0')
    for (const l of linetypes) {
      dxf += p(0, 'LTYPE') + p(2, l.name) + p(70, '0') + p(3, 'Dashed') + p(72, '65') + p(73, '2')
      dxf += p(40, f4(l.on + l.off)) + p(49, f4(l.on)) + p(49, f4(-l.off))
    }
    dxf += p(0, 'ENDTAB')

    // Layer 0 always exists in a drawing; programs that rely on it fail on a file without one.
    const allLayers = layers.some((l) => l.name === '0') ? layers : [{ name: '0', color: 7 }, ...layers]
    dxf += p(0, 'TABLE') + p(2, 'LAYER') + p(70, String(allLayers.length))
    for (const layer of allLayers) {
      dxf += p(0, 'LAYER') + p(2, layer.name) + p(70, '0') + p(62, String(layer.color)) + p(6, 'CONTINUOUS')
    }
    dxf += p(0, 'ENDTAB')

    dxf += p(0, 'TABLE') + p(2, 'STYLE') + p(70, '1')
    dxf += p(0, 'STYLE') + p(2, 'STANDARD') + p(70, '0') + p(40, '0.0') + p(41, '0.55') + p(50, '0.0')
    dxf += p(71, '0') + p(42, '0.0') + p(3, 'txt') + p(4, '')
    dxf += p(0, 'ENDTAB')

    dxf += p(0, 'ENDSEC')
    dxf += p(0, 'SECTION') + p(2, 'ENTITIES') + ent + p(0, 'ENDSEC')
    dxf += p(0, 'EOF')

    // ASCII-safe degree control code.
    dxf = dxf.replace(/°/g, '%%d')
    return Buffer.from(dxf, 'utf8')
  }

  return {
    addLine, addPolyline, addPolylineOutline, addCircle, addText, addTextC, addTextR, addSolidRect,
    addSolidTri, addSolidPolygon, addFill, addDisc, dashed, finish,
  }
}
