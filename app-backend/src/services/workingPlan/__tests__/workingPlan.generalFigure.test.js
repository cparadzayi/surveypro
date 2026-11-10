import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan } from '../working-plan.js'
import { maglasNoInsetSpec, generalPlanSpec } from './fixtures/generalPlanSpec.js'

const inPoly = ([x, y], ring) => {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if ((ring[i][1] > y) !== (ring[j][1] > y)
      && x < ((ring[j][0] - ring[i][0]) * (y - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) c = !c
  }
  return c
}
const ringPts = (spec) => spec.parcels[0].ring.map((n) => { const b = spec.beacons.find((q) => q.name === n); return [-b.Y, -b.X] })

/** Approximate box of every text op, in ground units: width 0.62 of the height a character, turned by its rotation. */
function textBoxes(out) {
  return out.model.doc.ops.filter((o) => o.t === 'text').map((o) => {
    const w = 0.62 * o.height * String(o.str).length, h = o.height
    const x0 = o.align === 'center' ? o.at[0] - w / 2 : o.align === 'right' ? o.at[0] - w : o.at[0]
    const rad = ((o.rotation ?? 0) * Math.PI) / 180
    const c = [[0, 0], [w, 0], [w, h], [0, h]].map(([u, v]) => [o.at[0] + (x0 - o.at[0]) + u * Math.cos(rad) - v * Math.sin(rad),
      o.at[1] + u * Math.sin(rad) + v * Math.cos(rad)])
    return { str: o.str, layer: o.layer, box: [Math.min(...c.map((p) => p[0])), Math.min(...c.map((p) => p[1])), Math.max(...c.map((p) => p[0])), Math.max(...c.map((p) => p[1]))] }
  })
}
const touch = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]

describe("the General Plan's working plan, a real project's (Maglas, no inset)", () => {
  const spec = maglasNoInsetSpec()
  const out = generateWorkingPlan(spec)

  test('draws the outside figure in black', () => {
    const layers = out.dxf.split(/\r?\n/).map((l) => l.trim())
    const i = layers.findIndex((l, k) => l === 'BOUNDARY-NEW' && layers[k - 1] === '2')
    expect(layers[i + 4]).toBe('7')                           // LAYER: name(2), flags(70), colour(62)
    // and the diagrams sheet keeps its red stands
    const dxf = generateWorkingPlan({ ...spec, kind: undefined, partyWalls: undefined, orientation: 'landscape', parcels: spec.parcels, notes: [] }).dxf
    const l2 = dxf.split(/\r?\n/).map((l) => l.trim())
    const j = l2.findIndex((l, k) => l === 'BOUNDARY-NEW' && l2[k - 1] === '2')
    expect(l2[j + 4]).toBe('1')
  })

  test('no grid cross stands inside the outside figure, and there are at least four', () => {
    expect(out.gridTicks).toBeGreaterThanOrEqual(4)
    expect(out.gridTicksInFigure).toBe(0)
  })

  test("the stands label lies wholly inside the figure's outline", () => {
    const ring = ringPts(spec)
    const lines = textBoxes(out).filter((t) => t.layer === 'PARCEL-TEXT' && /STANDS|^\d|,/.test(t.str) && !/^Road$/.test(t.str))
    expect(lines.length).toBeGreaterThanOrEqual(2)           // wrapped
    for (const t of lines) {
      const [x0, y0, x1, y1] = t.box
      for (const p of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) expect(inPoly(p, ring)).toBe(true)
    }
  })

  test('no block of lettering overwrites another: grid figures, road name, stands label and beacon names', () => {
    const boxes = textBoxes(out).filter((t) => ['GRID-TEXT', 'PARCEL-TEXT', 'BEACON-TEXT', 'ROAD-TEXT'].includes(t.layer))
    const clashes = []
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      if (touch(boxes[i].box, boxes[j].box)) clashes.push(`${boxes[i].str} <-> ${boxes[j].str}`)
    }
    expect(clashes).toEqual([])
  })

  test('with no inset the figure has the paper under the title, so it is drawn larger than with one', () => {
    const without = generateWorkingPlan(spec)
    const withInset = generateWorkingPlan({ ...spec, inset: { scale: 25000, beacons: [{ name: 'ST1', X: 2246800, Y: 97900, symbol: 'ws' }] } })
    expect(without.scale).toBeLessThanOrEqual(withInset.scale)
    expect(without.gridTicksInFigure).toBeLessThanOrEqual(withInset.gridTicksInFigure)
  })

  test('a sheet that turns out to need an inset after all keeps the inset\u2019s room', () => {
    const base = generalPlanSpec()
    const o = generateWorkingPlan(base)                      // spec.inset given: room kept
    expect(Object.keys(o.insetTicks).length).toBeGreaterThanOrEqual(1)
  })
})

describe('a General Plan sheet that needs an inset it was not told about', () => {
  test('is drawn again with the inset’s room, and the inset is there', () => {
    const spec = maglasNoInsetSpec()
    const m21 = spec.beacons.find((b) => b.name === 'M21')
    // a second mark 3 cm from M21: the two plot on top of each other, so the sheet gets a detail inset
    const crowded = { ...spec, beacons: [...spec.beacons, { ...m21, name: 'M21X', X: m21.X + 0.03 }] }
    const out = generateWorkingPlan(crowded)
    expect(out.insetCount).toBeGreaterThanOrEqual(1)
    expect(Object.keys(out.insetTicks).length).toBeGreaterThanOrEqual(1)
    // laid out with the inset box reserved: its room is not given to the figure
    const plain = generateWorkingPlan(spec)
    expect(out.scale).toBeGreaterThanOrEqual(plain.scale)
  })
})
