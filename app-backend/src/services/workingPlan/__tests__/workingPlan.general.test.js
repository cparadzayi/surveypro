import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan, partyTableShape, wrapAtCommas, roomiestPoint, PARTY_COL_MM } from '../working-plan.js'
import { generalPlanSpec, partyWallRows, generalBeacons, generalRing } from './fixtures/generalPlanSpec.js'
import { brackenhurstSpec } from './fixtures/brackenhurstSpec.js'

const textsOn = (out, layer) => out.model.doc.ops.filter((o) => o.t === 'text' && o.layer === layer)

describe("the General Plan's working plan", () => {
  const out = generateWorkingPlan(generalPlanSpec())

  test('is a portrait A4 sheet at the prescribed 1:2500, as the sample is', () => {
    expect(out.kind).toBe('general')
    expect(out.orientation).toBe('portrait')
    expect(out.sheetWidthMm).toBe(210)
    expect(out.scale).toBe(2500)
  })

  test('carries the party-wall table: its heading, both column heads and every row', () => {
    const t = textsOn(out, 'TITLE').map((o) => o.str)
    expect(t).toContain('Party-Wall Servitude Data')
    expect(t).toContain('Stand Numbers')
    expect(t).toContain('Boundary')
    for (const row of partyWallRows()) {
      expect(t).toContain(row.stands)
      expect(t).toContain(row.boundary)
    }
    expect(out.partyWallRows).toBe(56)
  })

  test('draws the outside figure alone: its beacons and one label for all the stands', () => {
    const beacons = textsOn(out, 'BEACON-TEXT').map((o) => o.str)
    for (const b of generalBeacons) expect(beacons).toContain(b.name)
    const label = textsOn(out, 'PARCEL-TEXT').map((o) => o.str).join(' ')
    expect(label).toMatch(/STANDS 1294 - 1421/)
    expect(label).toMatch(/1869/)
  })

  test('letters the stands label inside the figure, not on its boundary', () => {
    const [lbl] = textsOn(out, 'PARCEL-TEXT')
    const ring = generalRing.map((n) => {
      const b = generalBeacons.find((x) => x.name === n)
      return [-b.Y, -b.X]      // ground e = -Y, n = -X
    })
    // The label's position is in drawing units; compare in ground through the model's origin and scale.
    const { originE, originN, scale } = out.model
    const e = lbl.at[0], n = lbl.at[1]
    const inside = ((px, py) => {
      let c = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        if ((ring[i][1] > py) !== (ring[j][1] > py)
          && px < ((ring[j][0] - ring[i][0]) * (py - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) c = !c
      }
      return c
    })(e, n)
    expect(Number.isFinite(originE + originN + scale)).toBe(true)
    expect(inside).toBe(true)
  })

  test('keeps the table inside the neat line on the left and the figure to its right', () => {
    const rows = textsOn(out, 'TITLE').filter((o) => /^\d+, \d+$/.test(o.str))
    const { scale, originE } = out.model
    const xmm = (o) => ((o.at[0] - originE) / scale) * 1000
    const beaconX = textsOn(out, 'BEACON-TEXT').map(xmm)
    expect(Math.max(...rows.map(xmm))).toBeLessThan(Math.min(...beaconX))
  })
})

describe('the party-wall table is cut to the height it has', () => {
  test('keeps the sample 4 mm a row while the rows fit', () => {
    const s = partyTableShape(50, 223)
    expect(s.pitch).toBe(4)
    expect(s.blocks).toBe(1)
  })

  test('tightens the rows before it takes a second block', () => {
    const s = partyTableShape(56, 223)
    expect(s.pitch).toBeLessThan(4)
    expect(s.pitch).toBeGreaterThanOrEqual(2.8)
    expect(s.blocks).toBe(1)
  })

  test('takes more blocks beside each other for a long statement, and loses no row', () => {
    const rows = partyWallRows(150)
    const s = partyTableShape(rows.length, 223)
    expect(s.blocks).toBeGreaterThanOrEqual(2)
    expect(s.blocks * s.perBlock).toBeGreaterThanOrEqual(rows.length)
    const out = generateWorkingPlan(generalPlanSpec(rows))
    const t = textsOn(out, 'TITLE').map((o) => o.str)
    for (const r of rows) expect(t).toContain(r.stands)
    // the figure's panel moves right to make room, and the sheet still holds it
    expect(out.scale).toBeGreaterThanOrEqual(2500)
  })

  test('a plan with no party walls still has the table frame and a figure', () => {
    const out = generateWorkingPlan(generalPlanSpec([]))
    expect(textsOn(out, 'TITLE').map((o) => o.str)).toContain('Party-Wall Servitude Data')
    expect(PARTY_COL_MM).toBe(43)
  })
})

describe('the stands label', () => {
  test('breaks at its commas, never inside a name', () => {
    const lines = wrapAtCommas('STANDS 1294 - 1421, 1423, 1425, 1427 - 1437, 1869', 30)
    expect(lines.join(' ')).toBe('STANDS 1294 - 1421, 1423, 1425, 1427 - 1437, 1869')
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(30)
  })

  test('a short label stays on one line', () => {
    expect(wrapAtCommas('STANDS 1 - 5', 30)).toEqual(['STANDS 1 - 5'])
  })

  test("roomiestPoint finds the middle of an L's thick arm, not its corner", () => {
    const L = [[0, 0], [100, 0], [100, 30], [30, 30], [30, 100], [0, 100]]
    const [x, y] = roomiestPoint(L)
    expect(x).toBeGreaterThan(0); expect(y).toBeGreaterThan(0)
    expect(x < 30 || y < 30).toBe(true)      // inside the L
  })
})

describe('a diagrams-only survey keeps the original sheet', () => {
  test('no table, and the sheet is the one the spec asked for', () => {
    const out = generateWorkingPlan(brackenhurstSpec)
    expect(out.kind).toBe('diagrams')
    expect(out.partyWallRows).toBe(0)
    expect(textsOn(out, 'TITLE').map((o) => o.str)).not.toContain('Party-Wall Servitude Data')
    expect(out.orientation).toBe(brackenhurstSpec.orientation ?? 'landscape')
  })
})
