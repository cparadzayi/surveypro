import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan } from '../working-plan.js'
import { brackenhurstSpec } from './fixtures/brackenhurstSpec.js'
import { generalPlanSpec } from './fixtures/generalPlanSpec.js'

/** The grid crosses as ground points, read from the GRID layer's lines (each cross is a horizontal and a vertical). */
function crosses(out) {
  const ops = out.model.doc.ops.filter((o) => o.t === 'line' && o.layer === 'GRID')
  const pts = []
  for (let i = 0; i + 1 < ops.length; i += 2) {
    const h = ops[i], v = ops[i + 1]
    pts.push([(h.a[0] + h.b[0]) / 2, (v.a[1] + v.b[1]) / 2])
  }
  return pts
}
const inPoly = ([x, y], ring) => {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if ((ring[i][1] > y) !== (ring[j][1] > y)
      && x < ((ring[j][0] - ring[i][0]) * (y - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) c = !c
  }
  return c
}
const ringsOf = (spec) => {
  const g = (n) => { const b = spec.beacons.find((q) => q.name === n); return [-b.Y, -b.X] }
  return [...spec.parcels.map((p) => p.ring), spec.remainderRing ?? []].filter((r) => r.length >= 3).map((r) => r.map(g))
}

describe('the coordinate grid stays off the outside figure', () => {
  test.each([['auto'], [1500], [2000], [2500]])('Brackenhurst at %s: no cross inside any stand or the remainder, and four or more', (scale) => {
    const spec = { ...brackenhurstSpec, scale }
    const out = generateWorkingPlan(spec)
    // the DXF's ground coordinates are the survey's own scaled by the sheet: compare through the model's origin
    const rings = ringsOf(spec)
    const pts = crosses(out)
    expect(pts.length).toBeGreaterThanOrEqual(4)
    expect(out.gridTicksInFigure).toBe(0)
    // independent check of the same rule from the drawn crosses
    for (const p of pts) expect(rings.some((r) => inPoly(p, r.map(([e, n]) => [e, n])))).toBe(false)
  })

  test('the crosses stand round the figure: in each of its four corners', () => {
    const out = generateWorkingPlan({ ...brackenhurstSpec, scale: 'auto' })
    const es = brackenhurstSpec.beacons.map((b) => -b.Y), ns = brackenhurstSpec.beacons.map((b) => -b.X)
    const fx = (Math.min(...es) + Math.max(...es)) / 2, fy = (Math.min(...ns) + Math.max(...ns)) / 2
    const q = new Set(crosses(out).map(([e, n]) => `${e < fx ? 'L' : 'R'}${n < fy ? 'B' : 'T'}`))
    expect(q.size).toBe(4)
  })

  test("a figure that fills its panel still gets four: the shortfall is made up, and it is reported", () => {
    const out = generateWorkingPlan(generalPlanSpec())
    expect(out.gridTicks).toBeGreaterThanOrEqual(4)
    expect(out.gridTicksInFigure).toBeLessThanOrEqual(out.gridTicks - 2)   // the outside ones are never given up
  })
})
