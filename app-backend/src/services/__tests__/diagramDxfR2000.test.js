import { describe, test, expect, beforeAll } from '@jest/globals'
import { generateDiagramDXF } from '../diagramDxf.js'

/**
 * The diagram DXF a surveyor receives is Release 2000: it carries the road's and the figure band's EXACT
 * colour (true colour, group 420 -- the surveyor's template "lot 1 CORR" sets 255,173,92 and 94,228,129 the
 * same way), real HATCH fills and weighted polylines. These hold the file to that and to the structure
 * AutoCAD insists on; AutoCAD itself read it with no audit errors and kept both colours exactly (see
 * scripts/validateDxfInAutocad.ps1, which does that check on any DXF).
 */
const V = [[2176708.74, -103493.46], [2176762.14, -103494.14], [2176771.37, -103467.09], [2176766.70, -103457.57], [2176725.75, -103443.60]]
const options = {
  parcels: {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { id: 'S', stand: '1345', designation: 'STAND 1345', area_m2: 2225 },
      geometry: { type: 'Polygon', coordinates: [[...V, V[0]]] } }],
  },
  beacons: { type: 'FeatureCollection', features: [] },
  metadata: {
    subjectParcelId: 'S', designation: 'STAND 1345', district: 'SELUKWE', centralMeridian: 29,
    sideAnnotations: [{ side: 'DE', role: 'road', label: 'Garden Road' }, { side: 'BC', role: 'road', label: 'Road', widthM: 15 }],
  },
  projection: 'EPSG:22289', scale: '1:750', sheetSize: 'A4', orientation: 'portrait',
}
const logger = { info() {}, warn() {}, error() {} }

const pairs = (text) => {
  const rows = text.split(/\r?\n/)
  const out = []
  for (let i = 0; i + 1 < rows.length; i += 2) out.push([rows[i].trim(), rows[i + 1]])
  return out
}

let text, ps
beforeAll(async () => {
  text = (await generateDiagramDXF(options, logger)).dxfBuffer.toString('utf8')
  ps = pairs(text)
}, 60000)

describe('the diagram DXF is Release 2000', () => {
  test('declares AC1015 and has every section a Release 2000 file needs', () => {
    expect(text).toContain('AC1015')
    for (const sec of ['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']) {
      expect(ps.some(([c, v], i) => c === '2' && v === sec && ps[i - 1]?.[1] === 'SECTION')).toBe(true)
    }
    for (const t of ['VPORT', 'LTYPE', 'LAYER', 'STYLE', 'BLOCK_RECORD']) {
      expect(ps.some(([c, v], i) => c === '2' && v === t && ps[i - 1]?.[1] === 'TABLE')).toBe(true)
    }
  })

  test('every handle is unique, and every owner is a handle that exists', () => {
    const handles = ps.filter(([c]) => c === '5').map(([, v]) => v)
    expect(new Set(handles).size).toBe(handles.length)
    const set = new Set(handles)
    for (const [, v] of ps.filter(([c]) => c === '330')) if (v !== '0') expect(set.has(v)).toBe(true)
  })

  test('every layer names a plot style, which AutoCAD will not accept a layer without', () => {
    const layerRecs = ps.map(([c, v], i) => (c === '0' && v === 'LAYER' ? i : -1)).filter((i) => i >= 0)
    expect(layerRecs.length).toBeGreaterThan(10)
    for (const i of layerRecs) {
      const end = ps.findIndex(([c], k) => k > i && c === '0')
      expect(ps.slice(i, end).some(([c]) => c === '390')).toBe(true)
    }
  })

  test('the road and the figure band keep their EXACT colour, as in the surveyor\'s template', () => {
    const hatchColour = (layer) => {
      const k = ps.findIndex(([c, v], i) => c === '0' && v === 'HATCH' && ps.slice(i, i + 12).some(([cc, vv]) => cc === '8' && vv === layer))
      expect(k).toBeGreaterThanOrEqual(0)
      const end = ps.findIndex(([c], i) => i > k && c === '0')
      return Number(ps.slice(k, end).find(([c]) => c === '420')?.[1])
    }
    expect(hatchColour('DIAGRAM_ROAD')).toBe(0xFFAD5C)   // 255,173,92
    expect(hatchColour('FIGURE_BAND')).toBe(0x5EE481)    // 94,228,129
  })

  test('fills are real hatches, not triangle fans', () => {
    const count = (t) => ps.filter(([c, v]) => c === '0' && v === t).length
    expect(count('HATCH')).toBeGreaterThanOrEqual(7)      // band + road ribbons + 5 beacon discs
    expect(count('SOLID')).toBe(0)
  })

  test('the figure band is ONE hatch with the inside cut out (two boundary paths)', () => {
    const k = ps.findIndex(([c, v], i) => c === '0' && v === 'HATCH' && ps.slice(i, i + 12).some(([cc, vv]) => cc === '8' && vv === 'FIGURE_BAND'))
    const end = ps.findIndex(([c], i) => i > k && c === '0')
    expect(ps.slice(k, end).find(([c]) => c === '91')?.[1]).toBe('2')
  })

  test('lines carry their weight as a polyline width, as the PDF draws them', () => {
    // group 43 is a polyline's constant width (the viewport table has its own, unrelated, 43)
    const widths = []
    ps.forEach(([c, v], i) => {
      if (c !== '0' || v !== 'LWPOLYLINE') return
      const end = ps.findIndex(([cc], k) => k > i && cc === '0')
      const w = ps.slice(i, end).find(([cc]) => cc === '43')
      if (w) widths.push(Number(w[1]))
    })
    expect(widths.length).toBeGreaterThan(20)
    expect(Math.min(...widths)).toBeGreaterThan(0)
  })

  test('the header names a view that opens on the sheet', () => {
    expect(ps.some(([c, v]) => c === '9' && v === '$VIEWCTR')).toBe(true)
    expect(ps.some(([c, v]) => c === '2' && v === '*Active')).toBe(true)
  })
})
