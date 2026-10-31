/**
 * DXF writer for AutoCAD Release 2000 (AC1015), which Release 12 cannot be: it carries what the
 * diagram's PDF has and Release 12 cannot -- the EXACT colour of a road or band (true colour, group
 * 420, as in the surveyor's template "lot 1 CORR"), real HATCH fills, and polylines with a line weight.
 *
 * Release 2000 is strict about structure: every object has a handle, an owner and subclass markers,
 * the tables include a block record for model space, and the BLOCKS section names it. The file written
 * here is the smallest such structure AutoCAD reads without complaint; it is validated by opening it in
 * AutoCAD (see dxfAutocadValidation.md notes in the diagram DXF tests), not by guesswork.
 *
 * Same drawing API as the Release 12 writer (dxfPrimitives.js), so opsToDxf drives either.
 */

const f4 = (n) => Number(n).toFixed(4)
const p = (code, value) => String(code).padStart(3) + '\n' + value + '\n'

/** '#rrggbb' -> the packed integer group 420 holds. */
const packRgb = (hex) => parseInt(String(hex).replace('#', ''), 16)

export function createDxfWriterR2000(layers) {
  let next = 0x30 // handles below are reserved for the fixed structure
  const handle = () => (next++).toString(16).toUpperCase()
  const H = { // fixed handles of the structure the entities hang from
    vportTable: '8', ltypeTable: '5', layerTable: '2', styleTable: '3', viewTable: '6', ucsTable: '7',
    appidTable: '9', dimstyleTable: 'A', blockRecordTable: '1',
    modelRecord: '1F', paperRecord: '1E', modelBlock: '20', modelEnd: '21', paperBlock: '22', paperEnd: '23',
    rootDict: 'C', groupDict: 'D', plotStyleDict: 'E', plotStyleNormal: 'F',
  }
  let ent = ''
  const linetypes = []

  const colour = (c) => {
    if (c == null) return ''
    if (typeof c === 'object') return (c.aci != null ? p(62, String(c.aci)) : '') + (c.rgb ? p(420, String(packRgb(c.rgb))) : '')
    return p(62, String(c))
  }
  /** The head every entity starts with. */
  const head = (type, layer, o = {}) =>
    p(0, type) + p(5, handle()) + p(330, H.modelRecord) + p(100, 'AcDbEntity') + p(8, layer) +
    (o.linetype ? p(6, o.linetype) : '') + colour(o.color)

  function dashed(on, off) {
    const found = linetypes.find((l) => Math.abs(l.on - on) < 1e-9 && Math.abs(l.off - off) < 1e-9)
    if (found) return found.name
    const name = `DASH${linetypes.length + 1}`
    linetypes.push({ name, on, off })
    return name
  }

  /** A run of points as a light-weight polyline carrying its line weight as a constant width. */
  function addPolyline(layer, pts, o = {}) {
    if (!Array.isArray(pts) || pts.length < 2) return
    ent += head('LWPOLYLINE', layer, o) + p(100, 'AcDbPolyline') + p(90, String(pts.length)) + p(70, o.closed ? '1' : '0')
    if (o.width > 0) ent += p(43, f4(o.width))
    for (const q of pts) ent += p(10, f4(q.x)) + p(20, f4(q.y))
  }

  function addLine(layer, x1, y1, x2, y2, o = {}) {
    ent += head('LINE', layer, o) + p(100, 'AcDbLine') + p(10, f4(x1)) + p(20, f4(y1)) + p(30, '0.0') + p(11, f4(x2)) + p(21, f4(y2)) + p(31, '0.0')
  }

  function addCircle(layer, cx, cy, r, o = {}) {
    ent += head('CIRCLE', layer, o) + p(100, 'AcDbCircle') + p(10, f4(cx)) + p(20, f4(cy)) + p(30, '0.0') + p(40, f4(r))
  }

  function addText(layer, x, y, text, height, rotationDeg = 0, o = {}) {
    const align = o.align || 'left'
    ent += head('TEXT', layer, o) + p(100, 'AcDbText')
    ent += p(10, f4(x)) + p(20, f4(y)) + p(30, '0.0') + p(40, f4(height)) + p(1, String(text))
    if (rotationDeg) ent += p(50, f4(rotationDeg))
    ent += p(41, o.widthFactor != null ? f4(o.widthFactor) : '1.0')
    if (align !== 'left') ent += p(72, align === 'center' ? '1' : '2') + p(11, f4(x)) + p(21, f4(y)) + p(31, '0.0')
    ent += p(100, 'AcDbText')
  }

  /** A solid fill of one or more rings; several rings under the even-odd rule are a band with holes. */
  function addFill(layer, rings, rule, color) {
    const groups = rule === 'evenodd' && rings.length >= 2 ? [rings] : rings.map((r) => [r])
    for (const g of groups) {
      ent += head('HATCH', layer, { color }) + p(100, 'AcDbHatch')
      ent += p(10, '0.0') + p(20, '0.0') + p(30, '0.0') + p(210, '0.0') + p(220, '0.0') + p(230, '1.0')
      ent += p(2, 'SOLID') + p(70, '1') + p(71, '0') + p(91, String(g.length))
      g.forEach((ring, i) => {
        // external boundary first (flag 1), the rest are islands (flag 16 = outermost); all polyline paths (flag 2)
        ent += p(92, i === 0 ? '3' : '18') + p(72, '0') + p(73, '1') + p(93, String(ring.length))
        for (const q of ring) ent += p(10, f4(q[0])) + p(20, f4(q[1]))
        ent += p(97, '0')
      })
      ent += p(75, '0') + p(76, '1') + p(98, '0')
    }
  }

  /** A filled disc: a HATCH whose boundary is one circular edge. */
  function addDisc(layer, cx, cy, r, color) {
    ent += head('HATCH', layer, { color }) + p(100, 'AcDbHatch')
    ent += p(10, '0.0') + p(20, '0.0') + p(30, '0.0') + p(210, '0.0') + p(220, '0.0') + p(230, '1.0')
    ent += p(2, 'SOLID') + p(70, '1') + p(71, '0') + p(91, '1')
    ent += p(92, '1') + p(93, '1') + p(72, '2') + p(10, f4(cx)) + p(20, f4(cy)) + p(40, f4(r)) + p(50, '0.0') + p(51, '360.0') + p(73, '1') + p(97, '0')
    ent += p(75, '0') + p(76, '1') + p(98, '0')
  }

  function viewFor(extMin, extMax) {
    const cx = (extMin.x + extMax.x) / 2
    const cy = (extMin.y + extMax.y) / 2
    const w = Math.max(extMax.x - extMin.x, 1e-6)
    const h = Math.max(extMax.y - extMin.y, 1e-6)
    const aspect = 4 / 3
    return { cx, cy, height: Math.max(h, w / aspect) * 1.05, aspect }
  }

  function finish(extMin, extMax) {
    const view = viewFor(extMin, extMax)
    let d = ''
    d += p(0, 'SECTION') + p(2, 'HEADER')
    d += p(9, '$ACADVER') + p(1, 'AC1015')
    d += p(9, '$HANDSEED') + p(5, '10000')
    d += p(9, '$INSUNITS') + p(70, '6')
    d += p(9, '$MEASUREMENT') + p(70, '1')
    d += p(9, '$EXTMIN') + p(10, f4(extMin.x)) + p(20, f4(extMin.y)) + p(30, '0.0')
    d += p(9, '$EXTMAX') + p(10, f4(extMax.x)) + p(20, f4(extMax.y)) + p(30, '0.0')
    d += p(9, '$LIMMIN') + p(10, f4(extMin.x)) + p(20, f4(extMin.y))
    d += p(9, '$LIMMAX') + p(10, f4(extMax.x)) + p(20, f4(extMax.y))
    d += p(9, '$VIEWCTR') + p(10, f4(view.cx)) + p(20, f4(view.cy))
    d += p(9, '$VIEWSIZE') + p(40, f4(view.height))
    d += p(0, 'ENDSEC')
    d += p(0, 'SECTION') + p(2, 'CLASSES') + p(0, 'ENDSEC')

    const table = (name, h, count, body, extra = '') =>
      p(0, 'TABLE') + p(2, name) + p(5, h) + p(330, '0') + p(100, 'AcDbSymbolTable') + p(70, String(count)) + extra + body + p(0, 'ENDTAB')
    const rec = (type, h, owner, sub, body) =>
      p(0, type) + p(5, h) + p(330, owner) + p(100, 'AcDbSymbolTableRecord') + p(100, sub) + body

    d += p(0, 'SECTION') + p(2, 'TABLES')
    d += table('VPORT', H.vportTable, 1, rec('VPORT', handle(), H.vportTable, 'AcDbViewportTableRecord',
      p(2, '*Active') + p(70, '0') + p(10, '0.0') + p(20, '0.0') + p(11, '1.0') + p(21, '1.0') +
      p(12, f4(view.cx)) + p(22, f4(view.cy)) + p(13, '0.0') + p(23, '0.0') + p(14, '1.0') + p(24, '1.0') +
      p(15, '0.0') + p(25, '0.0') + p(16, '0.0') + p(26, '0.0') + p(36, '1.0') + p(17, '0.0') + p(27, '0.0') + p(37, '0.0') +
      p(40, f4(view.height)) + p(41, f4(view.aspect)) + p(42, '50.0') + p(43, '0.0') + p(44, '0.0') + p(50, '0.0') + p(51, '0.0') +
      p(71, '0') + p(72, '100') + p(73, '1') + p(74, '3') + p(75, '0') + p(76, '0') + p(77, '0') + p(78, '0')))

    const ltRec = (name, desc, elems = [], total = 0) => rec('LTYPE', handle(), H.ltypeTable, 'AcDbLinetypeTableRecord',
      p(2, name) + p(70, '0') + p(3, desc) + p(72, '65') + p(73, String(elems.length)) + p(40, f4(total)) +
      elems.map((e) => p(49, f4(e)) + p(74, '0')).join(''))
    d += table('LTYPE', H.ltypeTable, 3 + linetypes.length,
      ltRec('ByBlock', '') + ltRec('ByLayer', '') + ltRec('Continuous', 'Solid line') +
      linetypes.map((l) => ltRec(l.name, 'Dashed', [l.on, -l.off], l.on + l.off)).join(''))

    const allLayers = layers.some((l) => l.name === '0') ? layers : [{ name: '0', color: 7 }, ...layers]
    d += table('LAYER', H.layerTable, allLayers.length, allLayers.map((l) => rec('LAYER', handle(), H.layerTable, 'AcDbLayerTableRecord',
      p(2, l.name) + p(70, '0') + p(62, String(l.color)) + p(6, 'Continuous') + p(390, H.plotStyleNormal))).join(''))

    d += table('STYLE', H.styleTable, 1, rec('STYLE', handle(), H.styleTable, 'AcDbTextStyleTableRecord',
      p(2, 'Standard') + p(70, '0') + p(40, '0.0') + p(41, '1.0') + p(50, '0.0') + p(71, '0') + p(42, '2.5') + p(3, 'txt') + p(4, '')))
    d += table('VIEW', H.viewTable, 0, '')
    d += table('UCS', H.ucsTable, 0, '')
    d += table('APPID', H.appidTable, 1, rec('APPID', handle(), H.appidTable, 'AcDbRegAppTableRecord', p(2, 'ACAD') + p(70, '0')))
    d += table('DIMSTYLE', H.dimstyleTable, 0, '', p(100, 'AcDbDimStyleTable') + p(71, '0'))
    d += table('BLOCK_RECORD', H.blockRecordTable, 2,
      rec('BLOCK_RECORD', H.modelRecord, H.blockRecordTable, 'AcDbBlockTableRecord', p(2, '*Model_Space')) +
      rec('BLOCK_RECORD', H.paperRecord, H.blockRecordTable, 'AcDbBlockTableRecord', p(2, '*Paper_Space')))
    d += p(0, 'ENDSEC')

    const block = (name, rec_, bh, eh, paper) =>
      p(0, 'BLOCK') + p(5, bh) + p(330, rec_) + p(100, 'AcDbEntity') + (paper ? p(67, '1') : '') + p(8, '0') + p(100, 'AcDbBlockBegin') +
      p(2, name) + p(70, '0') + p(10, '0.0') + p(20, '0.0') + p(30, '0.0') + p(3, name) + p(1, '') +
      p(0, 'ENDBLK') + p(5, eh) + p(330, rec_) + p(100, 'AcDbEntity') + (paper ? p(67, '1') : '') + p(8, '0') + p(100, 'AcDbBlockEnd')
    d += p(0, 'SECTION') + p(2, 'BLOCKS')
    d += block('*Model_Space', H.modelRecord, H.modelBlock, H.modelEnd, false)
    d += block('*Paper_Space', H.paperRecord, H.paperBlock, H.paperEnd, true)
    d += p(0, 'ENDSEC')

    d += p(0, 'SECTION') + p(2, 'ENTITIES') + ent + p(0, 'ENDSEC')

    d += p(0, 'SECTION') + p(2, 'OBJECTS')
    d += p(0, 'DICTIONARY') + p(5, H.rootDict) + p(330, '0') + p(100, 'AcDbDictionary') + p(281, '1') + p(3, 'ACAD_GROUP') + p(350, H.groupDict) + p(3, 'ACAD_PLOTSTYLENAME') + p(350, H.plotStyleDict)
    d += p(0, 'DICTIONARY') + p(5, H.groupDict) + p(330, H.rootDict) + p(100, 'AcDbDictionary') + p(281, '1')
    // The "Normal" plot style every layer points at (a layer record is not accepted without one).
    d += p(0, 'ACDBDICTIONARYWDFLT') + p(5, H.plotStyleDict) + p(330, H.rootDict) + p(100, 'AcDbDictionary') + p(281, '1') + p(3, 'Normal') + p(350, H.plotStyleNormal) + p(100, 'AcDbDictionaryWithDefault') + p(340, H.plotStyleNormal)
    d += p(0, 'ACDBPLACEHOLDER') + p(5, H.plotStyleNormal) + p(330, H.plotStyleDict)
    d += p(0, 'ENDSEC')
    d += p(0, 'EOF')

    d = d.replace(/°/g, '%%d')
    return Buffer.from(d, 'utf8')
  }

  return { addLine, addPolyline, addCircle, addText, addFill, addDisc, dashed, finish }
}
