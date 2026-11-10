import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan } from '../working-plan.js'
import { brackenhurstSpec } from './fixtures/brackenhurstSpec.js'
import { generalPlanSpec } from './fixtures/generalPlanSpec.js'

/** Every TEXT entity in a DXF, as its group-code pairs. */
function textEntities(dxf) {
  const L = dxf.split(/\r?\n/).map((l) => l.trim())
  const out = []
  for (let i = 0; i + 1 < L.length; i++) {
    if (L[i] !== '0' || L[i + 1] !== 'TEXT') continue
    const g = {}
    let j = i + 2
    while (j + 1 < L.length && L[j] !== '0') { (g[L[j]] ||= []).push(L[j + 1]); j += 2 }
    out.push(g)
  }
  return out
}

describe('working plan lettering is monochrome', () => {
  test.each([['diagrams', brackenhurstSpec], ['general plan', generalPlanSpec()]])('every %s text entity is colour 7, on whatever layer', (_, spec) => {
    const texts = textEntities(generateWorkingPlan(spec).dxf)
    expect(texts.length).toBeGreaterThan(20)
    const layers = new Set(texts.map((t) => t['8'][0]))
    expect(layers.size).toBeGreaterThan(4)                         // blue, olive, teal, grey layers among them
    for (const t of texts) expect(t['62']).toEqual(['7'])
  })

  test('the layers keep their colours, for the lines they draw', () => {
    const dxf = generateWorkingPlan(brackenhurstSpec).dxf
    // PARCEL-TEXT is layer colour 5 (blue): the layer table still says so, only its text overrides it
    const i = dxf.split(/\r?\n/).findIndex((l, k, a) => l.trim() === 'PARCEL-TEXT' && a[k - 1]?.trim() === '2')
    expect(i).toBeGreaterThan(0)
  })
})
