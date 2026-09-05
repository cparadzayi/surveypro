/**
 * Self-contained DXF (AutoCAD R12 ASCII) file writer. Deliberately duplicates the
 * low-level plumbing dxfGenerator.js keeps private (group-code helper, HEADER/
 * TABLES/ENTITIES/EOF assembly, LINE/TEXT/CIRCLE/SOLID emitters) rather than
 * extracting a shared module — dxfGenerator.js has existing snapshot/parity tests
 * and is not touched by this renderer. See the DXF diagram design spec for the
 * rationale.
 */

function p(code, value) {
  return String(code).padStart(3) + '\n' + value + '\n'
}

/** 0.55 is the STYLE width-factor this codebase's DXF text always uses (matches
 *  adjoiningFeaturesDxf.js and dxfGenerator.js's STYLE_WIDTH_FACTOR), so a
 *  measurement here agrees with how the emitted TEXT actually renders. */
export function textWidth(text, height) {
  return String(text).length * height * 0.55
}

export function createDxfWriter(layers) {
  let ent = ''

  function addLine(layer, x1, y1, x2, y2) {
    ent += p(0, 'LINE')
    ent += p(8, layer)
    ent += p(10, x1.toFixed(4))
    ent += p(20, y1.toFixed(4))
    ent += p(11, x2.toFixed(4))
    ent += p(21, y2.toFixed(4))
  }

  function addPolylineOutline(layer, points, closed = true) {
    if (!Array.isArray(points) || points.length < 2) return
    for (let i = 0; i < points.length - 1; i++) {
      addLine(layer, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y)
    }
    if (closed) {
      const a = points[points.length - 1], b = points[0]
      addLine(layer, a.x, a.y, b.x, b.y)
    }
  }

  function addCircle(layer, cx, cy, r) {
    ent += p(0, 'CIRCLE')
    ent += p(8, layer)
    ent += p(10, cx.toFixed(4))
    ent += p(20, cy.toFixed(4))
    ent += p(40, r.toFixed(4))
  }

  function addText(layer, x, y, text, height, rotationDeg = 0) {
    ent += p(0, 'TEXT')
    ent += p(8, layer)
    ent += p(10, x.toFixed(4))
    ent += p(20, y.toFixed(4))
    ent += p(40, height.toFixed(4))
    ent += p(1, String(text))
    if (rotationDeg) ent += p(50, rotationDeg.toFixed(4))
    ent += p(41, '0.55')
  }

  function addTextC(layer, xc, y, text, height) {
    ent += p(0, 'TEXT')
    ent += p(8, layer)
    ent += p(10, xc.toFixed(4))
    ent += p(20, y.toFixed(4))
    ent += p(40, height.toFixed(4))
    ent += p(1, String(text))
    ent += p(41, '0.55')
    ent += p(72, '1')
    ent += p(11, xc.toFixed(4))
    ent += p(21, y.toFixed(4))
  }

  function addTextR(layer, xr, y, text, height) {
    ent += p(0, 'TEXT')
    ent += p(8, layer)
    ent += p(10, xr.toFixed(4))
    ent += p(20, y.toFixed(4))
    ent += p(40, height.toFixed(4))
    ent += p(1, String(text))
    ent += p(41, '0.55')
    ent += p(72, '2')
    ent += p(11, xr.toFixed(4))
    ent += p(21, y.toFixed(4))
  }

  /** Filled axis-aligned rectangle via a DXF SOLID entity. Corner order (bottom-left,
   *  bottom-right, top-left, top-right — the "Z order") is required for an
   *  axis-aligned quad to fill correctly instead of as a bowtie. */
  function addSolidRect(layer, x1, y1, x2, y2) {
    const lo = Math.min(x1, x2), hi = Math.max(x1, x2)
    const bo = Math.min(y1, y2), to = Math.max(y1, y2)
    ent += p(0, 'SOLID')
    ent += p(8, layer)
    ent += p(10, lo.toFixed(4)) + p(20, bo.toFixed(4))
    ent += p(11, hi.toFixed(4)) + p(21, bo.toFixed(4))
    ent += p(12, lo.toFixed(4)) + p(22, to.toFixed(4))
    ent += p(13, hi.toFixed(4)) + p(23, to.toFixed(4))
  }

  /** Filled triangle via a DXF SOLID. A SOLID always has four corners, so the
   *  third is repeated -- the standard way to express a triangle, and what
   *  AutoCAD writes itself. Corner order is 1, 2, 4, 3 around the shape (the
   *  "Z order"), not 1-2-3-4, which fills as a bowtie. */
  function addSolidTri(layer, a, b, c) {
    ent += p(0, 'SOLID')
    ent += p(8, layer)
    ent += p(10, a[0].toFixed(4)) + p(20, a[1].toFixed(4))
    ent += p(11, b[0].toFixed(4)) + p(21, b[1].toFixed(4))
    ent += p(12, c[0].toFixed(4)) + p(22, c[1].toFixed(4))
    ent += p(13, c[0].toFixed(4)) + p(23, c[1].toFixed(4))
  }

  function finish(extMin, extMax) {
    let dxf = ''
    dxf += p(0, 'SECTION')
    dxf += p(2, 'HEADER')
    dxf += p(9, '$ACADVER')
    dxf += p(1, 'AC1009')
    dxf += p(9, '$EXTMIN')
    dxf += p(10, extMin.x.toFixed(4))
    dxf += p(20, extMin.y.toFixed(4))
    dxf += p(9, '$EXTMAX')
    dxf += p(10, extMax.x.toFixed(4))
    dxf += p(20, extMax.y.toFixed(4))
    dxf += p(0, 'ENDSEC')

    dxf += p(0, 'SECTION')
    dxf += p(2, 'TABLES')

    dxf += p(0, 'TABLE')
    dxf += p(2, 'LTYPE')
    dxf += p(70, '1')
    dxf += p(0, 'LTYPE')
    dxf += p(2, 'CONTINUOUS')
    dxf += p(70, '0')
    dxf += p(3, 'Solid line')
    dxf += p(72, '65')
    dxf += p(73, '0')
    dxf += p(40, '0.0')
    dxf += p(0, 'ENDTAB')

    dxf += p(0, 'TABLE')
    dxf += p(2, 'LAYER')
    dxf += p(70, String(layers.length))
    for (const layer of layers) {
      dxf += p(0, 'LAYER')
      dxf += p(2, layer.name)
      dxf += p(70, '0')
      dxf += p(62, String(layer.color))
      dxf += p(6, 'CONTINUOUS')
    }
    dxf += p(0, 'ENDTAB')

    const STYLE_WIDTH_FACTOR = '0.55'
    dxf += p(0, 'TABLE')
    dxf += p(2, 'STYLE')
    dxf += p(70, '1')
    dxf += p(0, 'STYLE')
    dxf += p(2, 'STANDARD')
    dxf += p(70, '0')
    dxf += p(40, '0.0')
    dxf += p(41, STYLE_WIDTH_FACTOR)
    dxf += p(50, '0.0')
    dxf += p(71, '0')
    dxf += p(42, '0.0')
    dxf += p(3, 'txt')
    dxf += p(4, '')
    dxf += p(0, 'ENDTAB')

    dxf += p(0, 'ENDSEC')

    dxf += p(0, 'SECTION')
    dxf += p(2, 'ENTITIES')
    dxf += ent
    dxf += p(0, 'ENDSEC')

    dxf += p(0, 'EOF')

    // ASCII-safe degree control code (matches dxfGenerator.js's own encoding).
    dxf = dxf.replace(/°/g, '%%d')

    return Buffer.from(dxf, 'utf8')
  }

  return {
    addLine, addPolylineOutline, addCircle, addText, addTextC, addTextR, addSolidRect,
    addSolidTri, finish,
  }
}
