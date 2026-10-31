import { describe, test, expect, beforeAll } from '@jest/globals'
import { generateDXF } from '../dxfGenerator.js'

/**
 * A General Plan's DXF is written as AutoCAD Release 2000 (AutoCAD reads it with no audit errors, and the
 * file opens on the sheet). The generator still builds its drawing as Release 12 text, so what matters is
 * that nothing is lost or moved in the conversion: the Release 2000 file must hold, entity for entity, what
 * the Release 12 one does.
 */
const stands = {
  type: 'FeatureCollection',
  features: [0, 1, 2, 3].map((i) => ({
    type: 'Feature',
    properties: { stand: String(100 + i), area_m2: 4000 },
    geometry: { type: 'Polygon', coordinates: [[[i * 80, 0], [i * 80 + 80, 0], [i * 80 + 80, 50], [i * 80, 50], [i * 80, 0]]] },
  })),
}
const logger = { info() {}, warn() {}, error() {}, debug() {} }
const input = {
  parcels: stands, beacons: { features: [] }, outsideFigureData: null,
  planType: 'general-undeveloped', sheetSize: 'SI727_800x500', scale: '1:1000',
  metadata: { gpSheetNumbers: { 1: '123/2026' }, srNo: '156/2026', compilation: '1827C4,D3', designation: 'LOTS 1-4 OF TEST TOWNSHIP' },
}

const pairs = (text) => {
  const rows = text.split(/\r?\n/)
  const out = []
  for (let i = 0; i + 1 < rows.length; i += 2) out.push([rows[i].trim(), rows[i + 1]])
  return out
}
const entitiesBody = (text) => {
  const ps = pairs(text)
  const a = ps.findIndex(([c, v], i) => c === '2' && v === 'ENTITIES' && ps[i - 1]?.[1] === 'SECTION')
  const b = ps.findIndex(([c, v], i) => i > a && c === '0' && v === 'ENDSEC')
  return ps.slice(a + 1, b)
}
const r = (v) => Number(v).toFixed(4)

/** Entities as plain, comparable strings: type, layer and the numbers that place them. */
function normalise(text) {
  const ps = entitiesBody(text)
  const ents = []
  let cur = null
  for (const [c, v] of ps) { if (c === '0') { cur = { type: v, g: [] }; ents.push(cur) } else cur?.g.push([c, v]) }
  const get = (e, c, d) => { const x = e.g.find((q) => q[0] === String(c)); return x ? x[1] : d }
  const out = []
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i]
    const L = get(e, 8, '0')
    if (e.type === 'LINE') out.push(['LINE', L, r(get(e, 10)), r(get(e, 20)), r(get(e, 11)), r(get(e, 21))].join('|'))
    else if (e.type === 'CIRCLE') out.push(['CIRCLE', L, r(get(e, 10)), r(get(e, 20)), r(get(e, 40))].join('|'))
    else if (e.type === 'TEXT') {
      const al = get(e, 72, '0')
      out.push(['TEXT', L, get(e, 1), r(al === '0' ? get(e, 10) : get(e, 11)), r(al === '0' ? get(e, 20) : get(e, 21)), r(get(e, 40)), r(get(e, 50, 0)), r(get(e, 41, 0.55)), al, (get(e, 7) || '').toUpperCase()].join('|'))
    } else if (e.type === 'SOLID') out.push(['SOLID', L, ...[0, 1, 2, 3].flatMap((k) => [r(get(e, 10 + k)), r(get(e, 20 + k))])].join('|'))
    else if (e.type === 'POLYLINE') {
      const verts = []
      let j = i + 1
      while (ents[j]?.type === 'VERTEX') { verts.push(r(get(ents[j], 10)) + ',' + r(get(ents[j], 20))); j++ }
      i = j
      out.push(['POLY', L, (parseInt(get(e, 70, '0'), 10) & 1) === 1 ? 'closed' : 'open', verts.join(';')].join('|'))
    } else if (e.type === 'LWPOLYLINE') {
      const xs = e.g.filter(([c]) => c === '10').map(([, v]) => v), ys = e.g.filter(([c]) => c === '20').map(([, v]) => v)
      out.push(['POLY', L, (parseInt(get(e, 70, '0'), 10) & 1) === 1 ? 'closed' : 'open', xs.map((x, k) => r(x) + ',' + r(ys[k])).join(';')].join('|'))
    } else if (e.type !== 'VERTEX' && e.type !== 'SEQEND') out.push(`UNKNOWN ${e.type}`)
  }
  return out
}

let r12, r2000
beforeAll(() => {
  r12 = generateDXF({ ...input, dxfVersion: 'r12' }, logger)
  r2000 = generateDXF({ ...input, dxfVersion: 'r2000' }, logger)
}, 120000)

describe('a General Plan DXF as Release 2000', () => {
  test('is Release 2000, the plan is the same plan, and it opens on the sheet', () => {
    const t = r2000.buffer.toString('utf8')
    expect(t).toContain('AC1015')
    expect(r12.buffer.toString('utf8')).toContain('AC1009')
    expect(r2000.scale).toBe(r12.scale)
    expect(r2000.sheetSize).toBe(r12.sheetSize)
    expect(t).toContain('$VIEWCTR')
    expect(t).toContain('*Active')
  })

  test('holds, entity for entity, exactly what the Release 12 file holds', () => {
    const a = normalise(r12.buffer.toString('utf8')).sort()
    const b = normalise(r2000.buffer.toString('utf8')).sort()
    expect(a.length).toBeGreaterThan(100)
    expect(b).toEqual(a)
  })

  test('nothing in the plan is of a kind the conversion does not know', () => {
    expect(normalise(r2000.buffer.toString('utf8')).filter((e) => e.startsWith('UNKNOWN'))).toEqual([])
  })

  test('the same layers and text styles are declared', () => {
    // the name of every LAYER record: the first group 2 after its '0 LAYER' header
    const layerNames = (t) => {
      const ps = pairs(t)
      return ps.flatMap(([c, v], i) => {
        if (c !== '0' || v !== 'LAYER') return []
        const nameAt = ps.findIndex(([cc], k) => k > i && cc === '2')
        return [ps[nameAt][1]]
      })
    }
    const layers12 = layerNames(r12.buffer.toString('utf8'))
    const layers2000 = layerNames(r2000.buffer.toString('utf8'))
    expect(layers12.length).toBeGreaterThan(10)
    expect(layers2000.filter((n) => n !== '0').sort()).toEqual([...layers12].sort())
    const text = r2000.buffer.toString('utf8')
    expect(text).toMatch(/\n {2}2\nBOLD\n/)
  })

  test('every handle is unique and every owner exists', () => {
    const ps = pairs(r2000.buffer.toString('utf8'))
    const handles = ps.filter(([c]) => c === '5').map(([, v]) => v)
    expect(new Set(handles).size).toBe(handles.length)
    const set = new Set(handles)
    for (const [, v] of ps.filter(([c]) => c === '330')) if (v !== '0') expect(set.has(v)).toBe(true)
  })
})
