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

describe('the parcels meeting at a station of the trig map are an inset of their own, drawn to scale', () => {
  const sd5 = brackenhurstSpec.beacons.find((b) => b.name === 'SD5')
  const spec = {
    ...brackenhurstSpec,
    remainderLabel: 'Rem./',
    inset: { ...brackenhurstSpec.inset, beacons: [{ name: 'SD5', X: sd5.X, Y: sd5.Y, symbol: 'peg' }] },
  }
  const out = generateWorkingPlan(spec)
  const ops = out.model.doc.ops.filter((o) => o.layer === 'INSET')
  // In the narrow column beside the trig map a caption is set on two lines: "INSET 2" over "(1:3000)".
  const captionOf = (n) => {
    const one = ops.find((o) => o.t === 'text' && new RegExp('^INSET ' + n + ' \\(1:\\d+\\)$').test(o.str))
    if (one) return one
    const i = ops.findIndex((o) => o.t === 'text' && o.str === 'INSET ' + n)
    const sc = i >= 0 ? ops.slice(i + 1).find((o) => o.t === 'text' && /^\(1:\d+\)$/.test(o.str)) : null
    return sc ? { ...sc, str: 'INSET ' + n + ' ' + sc.str } : undefined
  }
  const caption = captionOf(2)

  test('is numbered after the trig map and states its scale', () => {
    expect(caption).toBeDefined()
    expect(captionOf(1)).toBeDefined()
    expect(out.dxf).not.toContain('NOT TO SCALE')
  })

  test('letters each abutting parcel once, and the beacon, which the trig map no longer surrounds with a diagram', () => {
    for (const label of ['405', '404', 'Rem./']) expect(ops.filter((o) => o.t === 'text' && o.str === label)).toHaveLength(1)
    // SD5 is named on the trig map and again above the circle of its own inset
    expect(ops.filter((o) => o.t === 'text' && o.str === 'SD5')).toHaveLength(2)
  })

  test('draws the real boundaries inside a circle round the beacon, at the scale the caption states', () => {
    const D = +caption.str.match(/1:(\d+)/)[1]
    // The circle: the closed 72-sided polyline; its centre is the beacon's place and its radius the reach.
    const ring = ops.find((o) => o.t === 'polyline' && o.closed && o.points.length === 72)
    expect(ring).toBeDefined()
    const cx = ring.points.reduce((t, p) => t + p[0], 0) / 72, cy = ring.points.reduce((t, p) => t + p[1], 0) / 72
    const radius = Math.hypot(ring.points[0][0] - cx, ring.points[0][1] - cy)
    const near = (p, q, tol) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tol
    const tol = out.scale * 1e-6
    // Every boundary line drawn in it lies within the circle...
    const inside = ops.filter((o) => o.t === 'line' && Math.hypot(o.a[0] - cx, o.a[1] - cy) <= radius + tol && Math.hypot(o.b[0] - cx, o.b[1] - cy) <= radius + tol)
    expect(inside.length).toBeGreaterThanOrEqual(3)
    // ...and the side from SD5 to its nearest corner, SD6, is as long as the ground says at 1:D.
    const sd6 = brackenhurstSpec.beacons.find((b) => b.name === 'SD6')
    const ground = Math.hypot(sd5.X - sd6.X, sd5.Y - sd6.Y)
    const want = (ground * out.scale) / D        // ground metres at the sheet's scale, i.e. DXF units
    const fromCentre = inside.filter((o) => near(o.a, [cx, cy], tol) || near(o.b, [cx, cy], tol))
    expect(fromCentre.some((o) => Math.abs(Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) - want) < tol)).toBe(true)
  })

  test('chooses the finest scale at which the nearest corner of its parcels is still inside the circle', () => {
    const D = +caption.str.match(/1:(\d+)/)[1]
    // The nearest corner is SD6, 18.8 m away; the circle's radius is 16 mm and the corner is to fall within 70% of it.
    const ground = Math.hypot(sd5.X - brackenhurstSpec.beacons.find((b) => b.name === 'SD6').X, sd5.Y - brackenhurstSpec.beacons.find((b) => b.name === 'SD6').Y)
    expect((ground * 1000) / D).toBeLessThanOrEqual(0.7 * 15 + 1e-9)
    // The circle is as large as its cell allows (the column beside the trig map is narrow, so its radius is 15 mm, not 16): 1:2000.
    expect(D).toBe(2000)
  })
})
