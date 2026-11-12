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
  { type: 'stroke', layer: 'PARCELS', pts: [...square(10, 10), [10, 10]], width: 0.4, color: '#000000', closed: true },
  // the same corner, as four stands that share it each draw it
  { type: 'circle', layer: 'PARCELS', cx: 20, cy: 20, r: 1, color: '#000000' },
  { type: 'circle', layer: 'PARCELS', cx: 20, cy: 20, r: 1, color: '#000000' },
  { type: 'circle', layer: 'PARCELS', cx: 20, cy: 20, r: 1, color: '#000000' },
  { type: 'discFill', layer: 'BEACONS', cx: 20, cy: 20, r: 1, color: WHITE },
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

  test('writes no white fill behind a stand or a beacon, and keeps a coloured fill and the sheet', () => {
    const hatches = entities(ps, 'HATCH')
    expect(hatches.map(layerOf).sort()).toEqual(['PAPER', 'PARCELS'])
    const parcelHatch = hatches.find((h) => layerOf(h) === 'PARCELS')
    expect(parcelHatch.find(([c]) => c === '420')[1]).toBe(String(0xff0000))   // the red one, not the white
  })

  test('without the option the white fills are written, as the PDF has them', () => {
    const all = entities(pairs(opsToDxf(ops, ground, { version: 'r2000', layers }).dxfBuffer), 'HATCH')
    expect(all.length).toBe(4)   // the sheet, two stands' fills, the beacon disc
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

  test('locks the PAPER layer, so a click in the drawing never picks the sheet', () => {
    const flags = layerTable(ps)
    expect(flags.get('PAPER')).toBe('4')                             // bit 4: locked
    expect(flags.get('PARCELS')).toBe('0')
    expect(flags.get('PARCELS_TEXT')).toBe('0')
  })
})

describe('Release 12 is left as it was', () => {
  test('keeps its polyline width and its single layer per drawing layer', () => {
    const t = opsToDxf(ops, ground, { version: 'r12', layers }).dxfBuffer.toString('utf8')
    expect(t).not.toContain('PARCELS_TEXT')
    expect(t).not.toContain('\n370\n')
  })
})
