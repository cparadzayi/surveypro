import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan } from '../working-plan.js'
import { workingPlanDxf2000 } from '../working-plan-r2000.js'
import { brackenhurstSpec } from './fixtures/brackenhurstSpec.js'
import { generalPlanSpec } from './fixtures/generalPlanSpec.js'

/** The entities of an ENTITIES section, as { type, g: [[code, value]] }. */
function entitiesOf(dxf) {
  const rows = dxf.split(/\r?\n/)
  const start = rows.findIndex((r, i) => r.trim() === '2' && rows[i + 1] === 'ENTITIES' && rows[i - 1]?.trim() === '0' && rows[i - 2] === undefined ? false : r.trim() === '2' && rows[i + 1] === 'ENTITIES')
  const out = []
  let cur = null
  for (let i = start + 2; i + 1 < rows.length; i += 2) {
    const c = rows[i].trim(), v = rows[i + 1]
    if (c === '0') {
      if (v === 'ENDSEC') break
      cur = { type: v, g: [] }; out.push(cur)
    } else if (cur) cur.g.push([c, v])
  }
  return out
}
const get = (e, code) => e.g.find((q) => q[0] === String(code))?.[1]

describe.each([['the diagrams sheet', brackenhurstSpec], ['a General Plan', generalPlanSpec()]])('the working plan as Release 2000: %s', (_name, spec) => {
  const out = generateWorkingPlan(spec)
  const buf = workingPlanDxf2000(out.model)
  const dxf = buf.toString('utf8')
  const ents = entitiesOf(dxf)
  const count = (type) => ents.filter((e) => e.type === type).length
  const textOps = out.model.doc.ops.filter((o) => o.t === 'text')

  test('is an AutoCAD Release 2000 file', () => {
    expect(dxf).toContain('AC1015')
    expect(dxf).not.toContain('AC1009')
    expect(dxf.split(/\r?\n/).length % 2).toBe(1)          // group-code / value pairs, and a trailing newline
  })

  test('every entity has its own handle', () => {
    const handles = ents.map((e) => get(e, 5))
    expect(handles.every(Boolean)).toBe(true)
    expect(new Set(handles).size).toBe(handles.length)
  })

  test('letters every text of the plan, once, with the plan\'s own string', () => {
    expect(count('TEXT')).toBe(textOps.length)
    const written = ents.filter((e) => e.type === 'TEXT').map((e) => get(e, 1)).sort()
    expect(written).toEqual(textOps.map((o) => String(o.str).replace(/[–—]/g, '-')).sort())
  })

  test('flattens the beacon signs: there are no block inserts left, and the signs\' shapes are there', () => {
    expect(count('INSERT')).toBe(0)
    expect(count('SOLID') + count('LWPOLYLINE') + count('LINE') + count('CIRCLE')).toBeGreaterThan(0)
    // where the plan inserts signs, their solid fills (the trig and station signs) are written out in place
    const inserts = out.model.doc.ops.filter((o) => o.t === 'insert').length
    if (inserts > 0) expect(count('SOLID')).toBeGreaterThan(0)
  })

  test('keeps the dashed boundaries and the dotted leaders dashed, entity by entity', () => {
    const dashed = ents.filter((e) => /^DASH\d+$/.test(get(e, 6) ?? ''))
    expect(dashed.length).toBeGreaterThan(0)
    for (const name of new Set(dashed.map((e) => get(e, 6)))) expect(dxf).toContain(name)   // the linetype is in the table
  })

  test('lettering is Arial / Arial Bold / Times as TrueType styles, at colour 7', () => {
    expect(dxf).toContain('arial.ttf')
    expect(dxf).toContain('arialbd.ttf')
    for (const t of ents.filter((e) => e.type === 'TEXT')) {
      expect(['ARIAL', 'ARIAL-BOLD', 'SERIF']).toContain(get(t, 7))
      expect(get(t, 62)).toBe('7')
    }
  })

  test('every layer the drawing uses is in the layer table', () => {
    const table = new Set()
    const rows = dxf.split(/\r?\n/)
    let inLayerTable = false
    for (let i = 0; i + 1 < rows.length; i += 2) {
      if (rows[i].trim() === '2' && rows[i + 1] === 'LAYER' && rows[i - 2]?.trim() === '0' && rows[i - 1] === 'TABLE') inLayerTable = true
      else if (rows[i].trim() === '0' && rows[i + 1] === 'ENDTAB') inLayerTable = false
      else if (inLayerTable && rows[i].trim() === '2') table.add(rows[i + 1])
    }
    for (const layer of new Set(ents.map((e) => get(e, 8)))) expect(table.has(layer)).toBe(true)
  })

  test('is pure ASCII: no character can be misread in the code page', () => {
    expect([...buf].every((b) => b < 0x80)).toBe(true)
  })
})

describe('the Release 2000 working plan carries the same drawing as the Release 12 file', () => {
  test('its text, layer by layer, is the Release 12 file\'s text', () => {
    const out = generateWorkingPlan(brackenhurstSpec)
    const r12 = out.dxf.split(/\r?\n/)
    const r12Texts = []
    for (let i = 0; i + 1 < r12.length; i++) {
      if (r12[i].trim() === '0' && r12[i + 1] === 'TEXT') {
        let j = i + 2; let layer, str
        while (j + 1 < r12.length && r12[j].trim() !== '0') { if (r12[j].trim() === '8') layer = r12[j + 1]; if (r12[j].trim() === '1') str = r12[j + 1]; j += 2 }
        r12Texts.push(`${layer}:${str}`)
      }
    }
    const r2000 = entitiesOf(workingPlanDxf2000(out.model).toString('utf8')).filter((e) => e.type === 'TEXT').map((e) => `${get(e, 8)}:${get(e, 1)}`)
    expect(r2000.sort()).toEqual(r12Texts.sort())
  })
})
