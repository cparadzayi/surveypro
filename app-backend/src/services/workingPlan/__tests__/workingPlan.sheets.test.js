import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan } from '../working-plan.js'
import { maglasTwoSheetSpec } from './fixtures/maglasTwoSheetSpec.js'

const inPoly = ([x, y], ring) => {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if ((ring[i][1] > y) !== (ring[j][1] > y)
      && x < ((ring[j][0] - ring[i][0]) * (y - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) c = !c
  }
  return c
}
const ground = (p) => [-p.Y, -p.X]
const touch = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]

describe("a multi-sheet General Plan's working plan (Maglas, two sheets)", () => {
  const spec = maglasTwoSheetSpec()
  const out = generateWorkingPlan(spec)
  const texts = out.model.doc.ops.filter((o) => o.t === 'text')
  const lines = out.model.doc.ops.filter((o) => o.t === 'line' && o.layer === 'ADJOINING')

  test('draws the split line along CP3, CP2, CP1 to M27', () => {
    const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 12
    const pts = ['CP3', 'CP2', 'CP1', 'M27'].map((n) => ground(spec.beacons.find((b) => b.name === n)))
    // each leg of the cut has a dashed line from near one named point to near the next
    for (let i = 0; i + 1 < pts.length; i++) {
      expect(lines.some((l) => (near(l.a, pts[i]) && near(l.b, pts[i + 1])) || (near(l.b, pts[i]) && near(l.a, pts[i + 1])))).toBe(true)
    }
    expect(lines.length).toBeGreaterThanOrEqual(3)
  })

  test('the split line is on the black, dashed ADJOINING layer', () => {
    const L = out.dxf.split(/\r?\n/).map((l) => l.trim())
    const i = L.findIndex((l, k) => l === 'ADJOINING' && L[k - 1] === '2')
    expect(L[i + 4]).toBe('7')                                  // colour 7: black
    expect(L[i + 6]).toBe('PLANDASH')                           // dashed
  })

  test('letters each sheet with its number and its own stands, and not the one label for all', () => {
    const strs = texts.map((t) => t.str)
    expect(strs).toContain('SHEET 1')
    expect(strs).toContain('SHEET 2')
    expect(strs.join(' ')).toMatch(/STANDS 1665 - 1685/)         // sheet 1's stands
    expect(strs.join(' ')).toMatch(/1686 - 1737/)                // sheet 2's
    expect(texts.filter((t) => t.layer === 'PARCEL-TEXT' && /^STANDS 1213/.test(t.str))).toHaveLength(1)   // the whole range is not lettered on the figure: only sheet 2's own start
  })

  test("each sheet's label lies inside that sheet's part of the figure", () => {
    for (const sh of spec.sheets) {
      const poly = sh.polygon.map(ground)
      const head = texts.find((t) => t.str === `SHEET ${sh.number}`)
      expect(head).toBeDefined()
      expect(inPoly(head.at, poly)).toBe(true)
    }
  })

  test('no lettering overwrites any other', () => {
    const boxes = texts.filter((t) => ['GRID-TEXT', 'PARCEL-TEXT', 'BEACON-TEXT', 'ROAD-TEXT'].includes(t.layer)).map((o) => {
      const w = 0.62 * o.height * String(o.str).length, h = o.height
      const x0 = o.align === 'center' ? o.at[0] - w / 2 : o.align === 'right' ? o.at[0] - w : o.at[0]
      const r = ((o.rotation ?? 0) * Math.PI) / 180
      const c = [[0, 0], [w, 0], [w, h], [0, h]].map(([u, v]) => [x0 + u * Math.cos(r) - v * Math.sin(r), o.at[1] + u * Math.sin(r) + v * Math.cos(r)])
      return { str: o.str, box: [Math.min(...c.map((p) => p[0])), Math.min(...c.map((p) => p[1])), Math.max(...c.map((p) => p[0])), Math.max(...c.map((p) => p[1]))] }
    })
    const clashes = []
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (touch(boxes[i].box, boxes[j].box)) clashes.push(`${boxes[i].str} <-> ${boxes[j].str}`)
    expect(clashes).toEqual([])
  })

  test('the grid is a framework of at most eight crosses, none inside the figure', () => {
    expect(out.gridTicks).toBeGreaterThanOrEqual(4)
    expect(out.gridTicks).toBeLessThanOrEqual(8)
    expect(out.gridTicksInFigure).toBe(0)
  })

  test('a single-sheet plan is untouched: no split line, no sheet numbers', () => {
    const one = generateWorkingPlan({ ...spec, sheets: undefined, splitLines: undefined })
    const strs = one.model.doc.ops.filter((o) => o.t === 'text').map((o) => o.str)
    expect(strs.some((s) => /^SHEET /.test(s))).toBe(false)
    expect(one.model.doc.ops.filter((o) => o.t === 'line' && o.layer === 'ADJOINING')).toHaveLength(0)
  })
})
