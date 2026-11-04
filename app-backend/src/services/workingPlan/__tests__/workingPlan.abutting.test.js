import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan } from '../working-plan.js'
import { brackenhurstSpec } from './fixtures/brackenhurstSpec.js'

/** Text entities of a layer, in order. */
function textsOn(dxf, layer) {
  const L = dxf.split('\n').map((l) => l.trim())
  const out = []
  for (let i = 0; i < L.length - 1; i++) {
    if (L[i] !== '0' || L[i + 1] !== 'TEXT') continue
    let lay = null, txt = null
    for (let j = i + 2; j < L.length - 1 && L[j] !== '0'; j += 2) {
      if (L[j] === '8') lay = L[j + 1]
      if (L[j] === '1') txt = L[j + 1]
    }
    if (lay === layer) out.push(txt)
  }
  return out
}

const withSymbols = (symbols) => ({
  ...brackenhurstSpec,
  beacons: brackenhurstSpec.beacons.map((b) => (symbols[b.name] ? { ...b, symbol: symbols[b.name] } : b)),
})

describe('abutting properties', () => {
  test('a found beacon on no ring names its stand from its own name (88X2 -> 88)', () => {
    const before = textsOn(generateWorkingPlan(brackenhurstSpec).dxf, 'PARCEL-TEXT').filter((t) => t === '88').length
    const after = textsOn(generateWorkingPlan(withSymbols({ '88X2': 'found' })).dxf, 'PARCEL-TEXT').filter((t) => t === '88').length
    expect(after).toBe(before + 1)
  })

  test('a reference mark states no abutter', () => {
    const rm = textsOn(generateWorkingPlan(withSymbols({ '88X2': 'rm' })).dxf, 'PARCEL-TEXT')
    const found = textsOn(generateWorkingPlan(withSymbols({ '88X2': 'found' })).dxf, 'PARCEL-TEXT')
    expect(found.length).toBe(rm.length + 1)
  })

  test('the site beacon in the inset letters its three properties', () => {
    const sd5 = brackenhurstSpec.beacons.find((b) => b.name === 'SD5')
    const spec = { ...brackenhurstSpec, inset: { ...brackenhurstSpec.inset,
      beacons: [...brackenhurstSpec.inset.beacons, { name: 'SD5', X: sd5.X, Y: sd5.Y, symbol: 'peg' }] } }
    const inset = textsOn(generateWorkingPlan(spec).dxf, 'INSET')
    for (const label of ['405', '404', 'Rem./']) expect(inset).toContain(label)
  })
})

describe('a splay point abuts its stand and the roads it stands on', () => {
  test('88X2 on the Main Road line is lettered with its stand and that road', () => {
    const a = brackenhurstSpec.beacons.find((b) => b.name === 'SD1')
    const z = brackenhurstSpec.beacons.find((b) => b.name === '87CR')
    const splay = { name: '88X2', X: (a.X + z.X) / 2, Y: (a.Y + z.Y) / 2, symbol: 'peg', label: 'N' }
    const spec = { ...brackenhurstSpec, beacons: [...brackenhurstSpec.beacons.filter((b) => b.name !== '88X2'), splay] }
    expect(textsOn(generateWorkingPlan(spec).dxf, 'PARCEL-TEXT')).toContain('88, Main Road')
  })

  test('a width or destination label is not an abutter', () => {
    const a = brackenhurstSpec.beacons.find((b) => b.name === 'SD1')
    const z = brackenhurstSpec.beacons.find((b) => b.name === '87CR')
    const splay = { name: '88X2', X: (a.X + z.X) / 2, Y: (a.Y + z.Y) / 2, symbol: 'peg', label: 'N' }
    const spec = {
      ...brackenhurstSpec,
      beacons: [...brackenhurstSpec.beacons.filter((b) => b.name !== '88X2'), splay],
      roads: [...brackenhurstSpec.roads, { name: '20m', from: 'SD1', to: '87CR', part: 'width' }],
    }
    const t = textsOn(generateWorkingPlan(spec).dxf, 'PARCEL-TEXT')
    expect(t).toContain('88, Main Road')
    expect(t.some((x) => x.includes('20m'))).toBe(false)
  })
})

describe('abutters around an inset sign do not overlap', () => {
  test('405, 404 and Rem./ around SD5 are drawn clear of each other and of the name', () => {
    const sd5 = brackenhurstSpec.beacons.find((b) => b.name === 'SD5')
    const spec = {
      ...brackenhurstSpec,
      remainderLabel: 'Rem./',
      inset: { ...brackenhurstSpec.inset,
        beacons: [{ name: 'SD5', X: sd5.X, Y: sd5.Y, symbol: 'peg' }] },
    }
    const ops = generateWorkingPlan(spec).model.doc.ops.filter((o) => o.t === 'text' && o.layer === 'INSET')
    const boxes = ['SD5', '405', '404', 'Rem./'].map((s) => {
      const o = ops.find((t) => t.str === s)
      expect(o).toBeDefined()
      const w = 0.55 * o.height * o.str.length * 1.1   // Arial's digits run to about 0.56 of the height
      const x0 = o.align === 'center' ? o.at[0] - w / 2 : o.align === 'right' ? o.at[0] - w : o.at[0]
      return [x0, o.at[1], x0 + w, o.at[1] + o.height]
    })
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]]
        const overlap = a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]
        expect([i, j, overlap]).toEqual([i, j, false])
      }
    }
  })
})

describe('the parcels meeting at an inset beacon are drawn as a wedge diagram', () => {
  const sd5 = brackenhurstSpec.beacons.find((b) => b.name === 'SD5')
  const spec = {
    ...brackenhurstSpec,
    remainderLabel: 'Rem./',
    inset: { ...brackenhurstSpec.inset, beacons: [{ name: 'SD5', X: sd5.X, Y: sd5.Y, symbol: 'peg' }] },
  }
  const ops = generateWorkingPlan(spec).model.doc.ops.filter((o) => o.layer === 'INSET')

  test('each abutting parcel is lettered once, inside the circle, not around the sign', () => {
    const names = ops.find((o) => o.t === 'text' && o.str === 'SD5')
    for (const label of ['405', '404', 'Rem./']) expect(ops.filter((o) => o.t === 'text' && o.str === label)).toHaveLength(1)
    // every label sits nearer the sign than the designation, which stands above the diagram
    const dist = (o) => Math.hypot(o.at[0] - names.at[0], o.at[1] - (names.at[1] - 0))
    for (const label of ['405', '404', 'Rem./']) {
      const o = ops.find((t) => t.t === 'text' && t.str === label)
      expect(o.at[1]).toBeLessThan(names.at[1])
      expect(dist(o)).toBeGreaterThan(0)
    }
  })

  test('the wedges are bounded by one outer arc per parcel and a ray for each ring side, shared sides once', () => {
    const arcs = ops.filter((o) => o.t === 'polyline' && !o.closed && o.points.length > 3)
    expect(arcs).toHaveLength(3)
    // 405, 404 and Rem. meet at SD5 along three distinct sides
    const rays = ops.filter((o) => o.t === 'line' && Math.hypot(o.a[0] - o.b[0], o.a[1] - o.b[1]) > 1)
    expect(rays).toHaveLength(3)
  })
})
