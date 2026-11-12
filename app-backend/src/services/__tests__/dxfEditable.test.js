/**
 * What makes the Release 2000 DXF editable in CAD, not merely valid.
 *
 * The General Plan's DXF reproduces the PDF, and a PDF's habits are poor ones in a drawing: a white fill behind
 * every stand and every beacon (1,318 of them on one Maglas sheet, drawn over the neighbouring stands' edges and
 * picked ahead of the line beneath), line weight written as a constant polyline width (a band of fixed ground
 * size), a corner shared by four stands carrying four circles, and text, circles and fills mixed on every layer.
 */
import { describe, test, expect } from '@jest/globals'
import { opsToDxf } from '../diagram/opsToDxf.js'

const ground = { center: { x: 0, y: 0 }, figCenterPx: 0, figCenterPy: 0, perPt: 1, page: { width: 100, height: 100 } }
const layers = [
  { name: 'PAPER', color: 255 }, { name: 'SHEET_EDGE', color: 8 }, { name: 'PARCELS', color: 7 }, { name: 'BEACONS', color: 3 },
]
const WHITE = '#ffffff'
const square = (x, y, s = 10) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]

const ops = [
  { type: 'fill', layer: 'PARCELS', rings: [square(10, 10)], rule: 'nonzero', color: WHITE },
  { type: 'fill', layer: 'PARCELS', rings: [square(30, 10)], rule: 'nonzero', color: '#ff0000' },
  // the beacon's white disc is drawn first, then its circle (as the renderer does)
  { type: 'discFill', layer: 'BEACONS', cx: 20, cy: 20, r: 1, color: WHITE },
  { type: 'stroke', layer: 'PARCELS', pts: [...square(10, 10), [10, 10]], width: 0.4, color: '#000000', closed: true },
  // the same corner, as four stands that share it each draw it
  { type: 'circle', layer: 'PARCELS', cx: 20, cy: 20, r: 1, color: '#000000' },
  { type: 'circle', layer: 'PARCELS', cx: 20, cy: 20, r: 1, color: '#000000' },
  { type: 'circle', layer: 'PARCELS', cx: 20, cy: 20, r: 1, color: '#000000' },
  { type: 'text', layer: 'PARCELS', text: '1665', x: 15, y: 15, size: 8, width: 20, rotation: 0, font: 'Helvetica', color: '#000000' },
  { type: 'text', layer: 'BEACONS', text: 'A', x: 21, y: 21, size: 6, width: 5, rotation: 0, font: 'Helvetica', color: '#000000' },
]

/** [code, value] pairs of the DXF. */
const pairs = (buf) => {
  const r = buf.toString('utf8').split(/\r?\n/); const out = []
  for (let i = 0; i + 1 < r.length; i += 2) out.push([r[i].trim(), r[i + 1]])
  return out
}
/** The entities of one type: each as its [code, value] list. */
const entities = (ps, type) => {
  const out = []
  ps.forEach(([c, v], i) => {
    if (c === '0' && v === type) { const end = ps.findIndex(([cc], k) => k > i && cc === '0'); out.push(ps.slice(i, end)) }
  })
  return out
}
const layerOf = (e) => e.find(([c]) => c === '8')?.[1]
/** The layer table: name -> its flags (group 70; bit 4 is "locked"). */
const layerTable = (ps) => {
  const out = new Map()
  ps.forEach(([c, v], i) => {
    if (c !== '0' || v !== 'LAYER') return
    const end = ps.findIndex(([cc], k) => k > i && cc === '0')
    const rec = ps.slice(i, end)
    out.set(rec.find(([cc]) => cc === '2')[1], rec.find(([cc]) => cc === '70')[1])
  })
  return out
}

describe('the editable Release 2000 General Plan DXF', () => {
  const dxf = opsToDxf(ops, ground, { version: 'r2000', layers, dropWhiteFills: true }).dxfBuffer
  const ps = pairs(dxf)

  test('writes no white fill behind a stand or a beacon, and none over the sheet, but keeps a coloured fill', () => {
    const hatches = entities(ps, 'HATCH')
    expect(hatches.map(layerOf)).toEqual(['PARCELS'])            // no PAPER hatch: it hid everything from the cursor
    const parcelHatch = hatches[0]
    expect(parcelHatch.find(([c]) => c === '420')[1]).toBe(String(0xff0000))   // the red one, not the white
  })

  test('without the option the white fills are written, as the PDF has them', () => {
    const all = entities(pairs(opsToDxf(ops, ground, { version: 'r2000', layers }).dxfBuffer), 'HATCH')
    expect(all.length).toBe(4)   // the sheet, two stands' fills, the beacon disc
    expect(all.map(layerOf)).toContain('PAPER')
  })

  test('writes a line weight as a lineweight, not as a polyline width', () => {
    const polys = entities(ps, 'LWPOLYLINE').filter((p) => layerOf(p) === 'PARCELS')
    expect(polys).toHaveLength(1)
    expect(polys[0].find(([c]) => c === '370')[1]).toBe('15')       // 0.4 pt = 0.141 mm -> the nearest weight, 0.15 mm
    expect(polys[0].some(([c]) => c === '43')).toBe(false)
  })

  test('writes a corner shared by several stands once', () => {
    expect(entities(ps, 'CIRCLE').filter((c) => layerOf(c) === 'PARCELS')).toHaveLength(1)
  })

  test('puts the lettering on a layer of its own beside each layer that has any', () => {
    expect(entities(ps, 'TEXT').map(layerOf).sort()).toEqual(['BEACONS_TEXT', 'PARCELS_TEXT'])
    const table = [...layerTable(ps).keys()]
    for (const l of ['PARCELS_TEXT', 'BEACONS_TEXT', 'PARCELS', 'BEACONS']) expect(table).toContain(l)
    expect(table).not.toContain('PAPER_TEXT')                       // only a layer that has lettering gets a text layer
  })

  test('the General Plan has no PAPER layer at all, and still marks the sheet\'s edge', () => {
    const table = layerTable(ps)
    expect(table.has('PAPER')).toBe(false)
    expect(entities(ps, 'LWPOLYLINE').map(layerOf)).toContain('SHEET_EDGE')
    expect(table.get('PARCELS')).toBe('0')
    expect(table.get('PARCELS_TEXT')).toBe('0')
  })

  test('where the sheet fill is kept (the diagram), its layer is locked', () => {
    const kept = layerTable(pairs(opsToDxf(ops, ground, { version: 'r2000', layers }).dxfBuffer))
    expect(kept.get('PAPER')).toBe('4')                              // bit 4: locked
  })
})

describe('Release 12 is left as it was', () => {
  test('keeps its polyline width and its single layer per drawing layer', () => {
    const t = opsToDxf(ops, ground, { version: 'r12', layers }).dxfBuffer.toString('utf8')
    expect(t).not.toContain('PARCELS_TEXT')
    expect(t).not.toContain('\n370\n')
  })
})

describe('black is colour 7, so the General Plan reads on a dark or a white CAD background', () => {
  // A true-colour black (group 420 = 0) overrides colour 7 and is invisible on AutoCAD's dark background; the
  // working plan writes plain colour 7 and reads on either.
  const out = pairs(opsToDxf(ops, ground, { version: 'r2000', layers, dropWhiteFills: true, autoContrastBlack: true }).dxfBuffer)
  const colourOf = (e) => ({ aci: e.find(([c]) => c === '62')?.[1], rgb: e.find(([c]) => c === '420')?.[1] })

  test('black text, lines and circles carry colour 7 and no true colour', () => {
    for (const type of ['TEXT', 'LWPOLYLINE', 'CIRCLE']) {
      for (const e of entities(out, type).filter((x) => !['SHEET_EDGE'].includes(layerOf(x)))) {
        expect(colourOf(e)).toEqual({ aci: '7', rgb: undefined })
      }
    }
  })

  test('a coloured object keeps its exact colour', () => {
    const red = entities(out, 'HATCH')[0]
    expect(colourOf(red).rgb).toBe(String(0xff0000))
  })

  test('without the option black keeps its true colour (the diagram, as it was)', () => {
    const plain = pairs(opsToDxf(ops, ground, { version: 'r2000', layers }).dxfBuffer)
    const circle = entities(plain, 'CIRCLE')[0]
    expect(colourOf(circle).rgb).toBe('0')
  })
});

describe('near-black lettering is contrast colour too', () => {
  test('slate beacon letters are plain colour 7, so they show on a dark CAD background; a real colour keeps its RGB', () => {
    const o = (color) => ({ type: 'text', layer: 'BEACONS', text: 'A', x: 1, y: 1, size: 6, width: 5, rotation: 0, font: 'Helvetica', color })
    const ps = pairs(opsToDxf([o('#1e293b'), o('#ff0000')], ground, { version: 'r2000', layers, dropWhiteFills: true, autoContrastBlack: true }).dxfBuffer)
    const [slate, red] = entities(ps, 'TEXT')
    expect(slate.some(([c]) => c === '420')).toBe(false)
    expect(slate.find(([c]) => c === '62')[1]).toBe('7')
    expect(red.find(([c]) => c === '420')[1]).toBe(String(0xff0000))
  })
})

describe('what the PDF hides under a white fill is not in the DXF either', () => {
  const run = (list) => pairs(opsToDxf(list, ground, { version: 'r2000', layers, dropWhiteFills: true }).dxfBuffer)
  const white = (x, y, s) => ({ type: 'fill', layer: 'PARCELS', rings: [square(x, y, s)], rule: 'nonzero', color: WHITE })

  test('a line drawn earlier is cut where a later white fill covers it, and the rest stays', () => {
    const ps = run([
      { type: 'stroke', layer: 'PARCELS', pts: [[0, 50], [100, 50]], width: 0.4, color: '#000000', closed: false },
      white(40, 40, 20),                                   // covers x 40..60 of that line
    ])
    const polys = entities(ps, 'LWPOLYLINE').filter((p) => layerOf(p) === 'PARCELS')
    expect(polys).toHaveLength(2)
    const xs = polys.map((p) => p.filter(([c]) => c === '10').map(([, v]) => Number(v))).sort((a, b) => a[0] - b[0])
    expect(xs[0]).toEqual([0, 40])
    expect(xs[1]).toEqual([60, 100])
  })

  test('a line along the edge of a later fill is not hidden by it', () => {
    const ps = run([
      { type: 'stroke', layer: 'PARCELS', pts: [[40, 40], [60, 40]], width: 0.4, color: '#000000', closed: false },
      white(40, 40, 20),
    ])
    expect(entities(ps, 'LWPOLYLINE').filter((p) => layerOf(p) === 'PARCELS')).toHaveLength(1)
  })

  test('a line drawn after the fill is untouched, and a circle under a later fill is dropped', () => {
    const ps = run([
      { type: 'circle', layer: 'PARCELS', cx: 50, cy: 50, r: 1, color: '#000000' },
      white(40, 40, 20),
      { type: 'stroke', layer: 'PARCELS', pts: [[0, 50], [100, 50]], width: 0.4, color: '#000000', closed: false },
      { type: 'circle', layer: 'PARCELS', cx: 5, cy: 5, r: 1, color: '#000000' },
    ])
    expect(entities(ps, 'LWPOLYLINE').filter((p) => layerOf(p) === 'PARCELS')).toHaveLength(1)
    expect(entities(ps, 'CIRCLE')).toHaveLength(1)
  })
})
