/**
 * Insets on the sheet: the locality diagram, and details of crowded beacons.
 *
 * A working plan draws one mark where the ground may carry two. 87D and 87DNew
 * of Brackenhurst Township are 0.061 m apart, which at 1:2000 is 0.03 mm: both
 * conventional signs land inside the same dot and both names print on the same
 * spot. A reader cannot tell there are two beacons there, let alone which is
 * which, so the pair gets an inset of its own.
 *
 * Insets are numbered in one sequence. The locality map is INSET 1 when there is
 * one; details follow. With no locality map the details start at 1, because a
 * sheet should not begin at INSET 2.
 *
 * Every inset is a MAP to a stated scale: the locality map at the finest round
 * scale at which its stations fit (1:500 000 for a spread of kilometres), and a
 * detail at the largest enlargement that separates its marks (1:1.5 for two
 * beacons 6 cm apart). Only marks recorded at one identical position cannot be
 * separated at any scale, and that detail alone is captioned NOT TO SCALE.
 */

import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan } from '../working-plan.js'
import { brackenhurstSpec } from './fixtures/brackenhurstSpec.js'

/** Every text string the DXF draws, in order. */
function texts(dxf) {
  const out = []
  const lines = dxf.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '1' && lines[i + 1] !== undefined) out.push(lines[i + 1])
  }
  return out
}

/** The caption of the inset numbered n, or undefined. */
const captionOf = (t, n) => t.find((s) => s.startsWith(`INSET ${n} (`))

/** The fixture with a second beacon exactly on top of 87DR: no scale can separate them. */
function withCoincidentPair() {
  const spec = structuredClone(brackenhurstSpec)
  const twin = spec.beacons.find((b) => b.name === '87DR')
  spec.beacons.push({ ...twin, name: '87DNew' })
  return spec
}

/** The fixture with a second beacon almost exactly on top of 87DR. */
function withCrowdedPair() {
  const spec = structuredClone(brackenhurstSpec)
  const twin = spec.beacons.find((b) => b.name === '87DR')
  spec.beacons.push({ ...twin, name: '87DNew', X: twin.X + 0.04, Y: twin.Y + 0.04 })
  return spec
}

describe('the sheet without crowding', () => {
  test('numbers the locality diagram INSET 1', () => {
    const t = texts(generateWorkingPlan(brackenhurstSpec).dxf)

    expect(t.filter((s) => s.startsWith('INSET '))).toHaveLength(1)
    expect(captionOf(t, 1)).toMatch(/^INSET 1 \(1:\d+\)$/)
  })

  test('draws the control marks to the scale its caption states', () => {
    // The locality shows the control the survey was observed from, plotted at a true scale: the finest
    // round one at which the stations and their names fit the cell. Measured off the drawing, the distance
    // between two stations on the sheet is their ground distance divided by that scale.
    const out = generateWorkingPlan(brackenhurstSpec)
    const D = +captionOf(texts(out.dxf), 1).match(/1:(\d+)\)/)[1]
    expect(D).toBeGreaterThanOrEqual(100000)

    const at = (name) => out.model.doc.ops.find((o) => o.t === 'text' && o.layer === 'INSET' && o.str === name).at
    const station = (name) => brackenhurstSpec.inset.beacons.find((b) => b.name === name)
    const a = station('49/T'), b = station('176/T')
    const eastGround = (-b.Y) - (-a.Y), northGround = (-b.X) - (-a.X)
    // DXF units are ground metres at the SHEET'S scale, so sheet mm = units * 1000 / out.scale.
    const east = ((at('176/T')[0] - at('49/T')[0]) * 1000) / out.scale
    const north = ((at('176/T')[1] - at('49/T')[1]) * 1000) / out.scale
    expect(east).toBeCloseTo((eastGround * 1000) / D, 3)
    expect(north).toBeCloseTo((northGround * 1000) / D, 3)
  })

  test('never says NOT TO SCALE on a sheet whose marks can be separated', () => {
    expect(generateWorkingPlan(brackenhurstSpec).dxf).not.toContain('NOT TO SCALE')
    expect(generateWorkingPlan(withCrowdedPair()).dxf).not.toContain('NOT TO SCALE')
  })
})

describe('the sheet with two beacons in one spot', () => {
  test('adds a second inset for the pair', () => {
    const t = texts(generateWorkingPlan(withCrowdedPair()).dxf)

    expect(captionOf(t, 1)).toMatch(/^INSET 1 \(1:\d+\)$/)
    expect(t.some((s) => s.startsWith('INSET 2'))).toBe(true)
  })

  test('draws the detail to a stated scale', () => {
    const t = texts(generateWorkingPlan(withCrowdedPair()).dxf)

    expect(captionOf(t, 2)).toMatch(/^INSET 2 \(1:[\d.]+\)$/)
    expect(t).not.toContain('INSET 2 (NOT TO SCALE)')
  })

  test('puts the two members at their true bearing and distance from each other at that scale', () => {
    const out = generateWorkingPlan(withCrowdedPair())
    const D = +captionOf(texts(out.dxf), 2).match(/1:([\d.]+)\)/)[1]
    // The beacons' signs are the closed 24-sided rings drawn on the INSET layer; the detail's two are the
    // closest pair of ring centres.
    const rings = polylineVertices(out.dxf)
      .filter((p) => p.layer === 'INSET' && p.closed && p.verts.length === 24)
      .map((p) => [p.verts.reduce((t, v) => t + v[0], 0) / 24, p.verts.reduce((t, v) => t + v[1], 0) / 24])
    // 87DNew is 0.04 m further in X and in Y than 87DR: that is 0.04 m WEST and 0.04 m SOUTH of it, so
    // 0.0566 m on a bearing of 45 degrees. Some pair of signs on the sheet must stand exactly that far apart
    // at the stated scale (in sheet millimetres), the south-west one lower down and to the left.
    const want = (Math.hypot(0.04, 0.04) * 1000) / D
    const found = []
    for (let i = 0; i < rings.length; i++) {
      for (let j = 0; j < rings.length; j++) {
        if (i === j) continue
        const dx = ((rings[j][0] - rings[i][0]) * 1000) / out.scale, dy = ((rings[j][1] - rings[i][1]) * 1000) / out.scale
        if (Math.abs(Math.hypot(dx, dy) - want) < 0.01 && dx > 0 && dy > 0 && Math.abs(dx - dy) < 0.01) found.push([i, j])
      }
    }
    expect(found.length).toBeGreaterThanOrEqual(1)
  })

  test('marks a detail whose beacons share one exact position as not to scale', () => {
    // Nothing separates them at any scale, so they are fanned out to be read and the caption says so.
    const t = texts(generateWorkingPlan(withCoincidentPair()).dxf)

    expect(t).toContain('INSET 2 (NOT TO SCALE)')
  })

  test('names both beacons in the detail', () => {
    const { dxf } = generateWorkingPlan(withCrowdedPair())
    const t = texts(dxf)

    // Each appears on the figure and again in the inset.
    expect(t.filter((s) => s === '87DR').length).toBeGreaterThanOrEqual(2)
    expect(t.filter((s) => s === '87DNew').length).toBeGreaterThanOrEqual(2)
  })

  test('points at the spot on the figure the detail enlarges', () => {
    // Without this the detail names two beacons and never says where they are.
    const t = texts(generateWorkingPlan(withCrowdedPair()).dxf)

    expect(t.filter((s) => s === 'INSET 2').length).toBeGreaterThanOrEqual(1)
  })

  test('leaves a sheet with no crowding exactly as it was', () => {
    const plain = generateWorkingPlan(brackenhurstSpec).dxf
    const again = generateWorkingPlan(brackenhurstSpec).dxf

    expect(plain).toBe(again)
    expect(captionOf(texts(plain), 1)).toMatch(/^INSET 1 \(1:\d+\)$/)
  })
})

/** INSET-layer TEXT entities, as {text, sheet mm x, sheet mm y}. */
function insetTexts(dxf, scale) {
  const lines = dxf.split(/\r?\n/)
  const pairs = []
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([lines[i].trim(), lines[i + 1]])

  const ents = []
  let cur = null
  for (const [code, val] of pairs) {
    if (code === '0') { if (cur) ents.push(cur); cur = { type: val.trim(), g: {} }; continue }
    if (cur) cur.g[code] = val.trim()
  }
  if (cur) ents.push(cur)

  const texts = ents.filter((e) => e.type === 'TEXT' && e.g['8'] === 'INSET')
  const cap = texts.find((t) => t.g['1'].startsWith('INSET 1'))
  // Sheet millimetres, measured from the INSET 1 caption, which sits 5 mm in
  // from its cell's left edge and 6 mm down from its top.
  return texts.map((t) => ({
    text: t.g['1'],
    dx: ((parseFloat(t.g['10']) - parseFloat(cap.g['10'])) / scale) * 1000,
    dy: ((parseFloat(cap.g['20']) - parseFloat(t.g['20'])) / scale) * 1000,
  }))
}

describe('an inset stays inside the cell it was given', () => {
  test('the locality diagram is redrawn to fit a half-width cell', () => {
    // The spec's inset scale is chosen against the FULL 129 mm box. Splitting
    // the box in two and drawing the same content unchanged put RM7 24 mm to
    // the LEFT of its own cell -- out of the box entirely and into the figure
    // panel -- and 50/T 19 mm past the right edge.
    const out = generateWorkingPlan(withCrowdedPair())
    const CELL_W = (291.97 - 162.9 - 2) / 2
    const CAPTION_INSET = 5

    const locality = insetTexts(out.dxf, out.scale)
      .filter((t) => !t.text.startsWith('INSET ') && t.dx < CELL_W)

    expect(locality.length).toBeGreaterThan(0)
    for (const t of locality) {
      expect(t.dx).toBeGreaterThanOrEqual(-CAPTION_INSET)
      expect(t.dx).toBeLessThanOrEqual(CELL_W - CAPTION_INSET)
    }
  })
})

/** Every entity, as {type, group codes}. */
function entities(dxf) {
  const lines = dxf.split(/\r?\n/)
  const pairs = []
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([lines[i].trim(), lines[i + 1]])

  const out = []
  let cur = null
  for (const [code, val] of pairs) {
    if (code === '0') { if (cur) out.push(cur); cur = { type: val.trim(), g: {} }; continue }
    if (cur) cur.g[code] = val.trim()
  }
  if (cur) out.push(cur)
  return out
}

/**
 * Closed runs of vertices on a layer, as {layer, closed, verts}. A POLYLINE's
 * vertices are separate VERTEX records followed by SEQEND, and an R12 polyline
 * header carries a dummy 10/20 of its own -- so the real points are only read
 * while inside a VERTEX body.
 */
function polylineVertices(dxf) {
  const lines = dxf.split(/\r?\n/)
  const out = []
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] !== '0' || lines[i + 1] !== 'POLYLINE') continue
    let layer = null
    for (let j = i + 2; j < i + 20; j++) {
      if (lines[j] === '0') break
      if (lines[j] === '8') { layer = lines[j + 1]; break }
    }
    let closed = false, inVertex = false, verts = []
    for (let j = i + 2; j < lines.length - 1; j++) {
      if (lines[j] === '0') {
        if (lines[j + 1] === 'SEQEND') break
        inVertex = lines[j + 1] === 'VERTEX'
        continue
      }
      if (lines[j] === '70' && !inVertex) closed = lines[j + 1] === '1'
      if (inVertex && lines[j] === '10') verts.push([+lines[j + 1], +lines[j + 3]])
    }
    out.push({ layer, closed, verts })
  }
  return out
}

/** The fixture plus a superseded mark 6 cm from the beacon that replaced it. */
function withSupersededMark() {
  const spec = structuredClone(brackenhurstSpec)
  const twin = spec.beacons.find((b) => b.name === '87DR')
  spec.beacons.push({
    ...twin, name: '87Dold', X: twin.X + 0.04, Y: twin.Y + 0.04,
    symbol: 'foundNotAdopted',
  })
  return spec
}

describe('an inset caption fits the cell it titles', () => {
  test('is lettered one ISO rank below the sheet captions', () => {
    const out = generateWorkingPlan(withCrowdedPair())
    const caption = entities(out.dxf)
      .find((e) => e.type === 'TEXT' && (e.g['1'] ?? '').startsWith('INSET 2 ('))

    // "INSET 2 (NOT TO SCALE)" is 22 characters. At 3.5 mm it ran about 69 mm,
    // past the 58.5 mm a half-width cell leaves beside its frame.
    expect(parseFloat(caption.g['40']) / out.scale * 1000).toBeCloseTo(2.5, 6)
  })
})

describe('every inset carries a north point', () => {
  test('one for the sheet and one for each inset', () => {
    const out = generateWorkingPlan(withCrowdedPair())
    // Each arrow letters T and N, one pair apiece.
    const letters = entities(out.dxf).filter(
      (e) => e.type === 'TEXT' && e.g['8'] === 'NORTH-ARROW' && ['T', 'N'].includes(e.g['1']),
    )

    expect(letters.length / 2).toBe(3)   // sheet + locality + detail
  })
})

describe('a superseded mark', () => {
  test('is left off the figure, which the inset now carries', () => {
    const names = entities(generateWorkingPlan(withSupersededMark()).dxf)
      .filter((e) => e.type === 'TEXT' && e.g['8'] === 'BEACON-TEXT')
      .map((e) => e.g['1'])

    expect(names).not.toContain('87Dold')
    // The beacon that replaced it stays: the ring marker must point at something.
    expect(names).toContain('87DR')
  })

  test('is drawn in the inset struck through, as BCN_FOUND_NA draws it', () => {
    const ents = entities(generateWorkingPlan(withSupersededMark()).dxf)

    expect(ents.filter((e) => e.type === 'TEXT' && e.g['8'] === 'INSET')
      .map((e) => e.g['1'])).toContain('87Dold')
    // The figure no longer places the block at all.
    expect(ents.filter((e) => e.type === 'INSERT' && e.g['2'] === 'BCN_FOUND_NA')).toHaveLength(0)
  })

  test('is kept on the figure when a parcel ring is built from it', () => {
    // Dropping a corner would leave a boundary that does not close, whatever
    // the beacon's status says.
    const spec = withSupersededMark()
    spec.parcels[0].ring = [...spec.parcels[0].ring, '87Dold']

    const names = entities(generateWorkingPlan(spec).dxf)
      .filter((e) => e.type === 'TEXT' && e.g['8'] === 'BEACON-TEXT')
      .map((e) => e.g['1'])

    expect(names).toContain('87Dold')
  })
})

describe('the detail inset', () => {
  test('marks no centre, only leaders from the members', () => {
    // A cross at the middle read as a third mark. The leaders already say the
    // members share one position, and nothing but those leaders leaves it.
    // (Only a pair at one exact position is fanned out; a separable pair is drawn to scale, with no leaders.)
    const lines = entities(generateWorkingPlan(withCoincidentPair()).dxf)
      .filter((e) => e.type === 'LINE' && e.g['8'] === 'INSET')
    const perStart = lines.reduce((m, l) => {
      const s = `${+l.g['10']},${+l.g['20']}`
      m[s] = (m[s] ?? 0) + 1
      return m
    }, {})

    // One start shared by exactly the two member leaders; every other INSET
    // line -- the mark crosses and the figure's shaft -- leaves its own point.
    const shared = Object.entries(perStart).filter(([, n]) => n > 1)
    expect(shared).toHaveLength(1)
    expect(shared[0][1]).toBe(2)
  })

  test('a separable pair has no leaders at all: it is a map, not a fan', () => {
    const lines = entities(generateWorkingPlan(withCrowdedPair()).dxf)
      .filter((e) => e.type === 'LINE' && e.g['8'] === 'INSET')
    const perStart = lines.reduce((m, l) => {
      const s = `${+l.g['10']},${+l.g['20']}`
      m[s] = (m[s] ?? 0) + 1
      return m
    }, {})
    expect(Object.values(perStart).filter((n) => n > 1)).toEqual([])
  })
})

describe('the figure marker', () => {
  test('is a leader arrow to the crowd, not a ring around it', () => {
    const out = generateWorkingPlan(withCrowdedPair())
    const ents = entities(out.dxf)

    // The crowd's figure position, read off the sheet: the two members are
    // inserted there, a sign's width apart. The marker must point at the
    // middle of them.
    const inserts = ents.filter((e) => e.type === 'INSERT' && e.g['8'] === 'BEACONS')
      .map((e) => [+e.g['10'], +e.g['20']])
    let pair = null, best = Infinity
    for (let i = 0; i < inserts.length; i++) {
      for (let j = i + 1; j < inserts.length; j++) {
        const d = Math.hypot(inserts[i][0] - inserts[j][0], inserts[i][1] - inserts[j][1])
        if (d < best) { best = d; pair = [inserts[i], inserts[j]] }
      }
    }
    expect(best).toBeLessThan(8)           // a genuinely crowded pair exists
    const spot = [(pair[0][0] + pair[1][0]) / 2, (pair[0][1] + pair[1][1]) / 2]

    // The arrowhead: a filled INSET triangle whose tip sits ON the spot.
    const tips = ents.filter((e) => e.type === 'SOLID' && e.g['8'] === 'INSET')
      .map((e) => [+e.g['10'], +e.g['20']])
    expect(tips.some((t) => Math.hypot(t[0] - spot[0], t[1] - spot[1]) < 2)).toBe(true)

    // A shaft runs up to it, ending where the arrowhead begins.
    const shafts = ents.filter((e) => e.type === 'LINE' && e.g['8'] === 'INSET'
      && Math.hypot(+e.g['11'] - spot[0], +e.g['21'] - spot[1]) < 8)
    expect(shafts.length).toBeGreaterThanOrEqual(1)

    // And nothing rings the spot. The two inset FRAMES are the only closed
    // four-sided INSET polylines; the round signs' 24-sided rings must not
    // come anywhere near the crowd's figure position.
    const polys = polylineVertices(out.dxf).filter((p) => p.layer === 'INSET')
    expect(polys.filter((p) => p.closed && p.verts.length === 4)).toHaveLength(2)
    const rings = polys.filter((p) => p.closed && p.verts.length > 10)
      .filter((p) => p.verts.some((v) => Math.hypot(v[0] - spot[0], v[1] - spot[1]) < 15))
    expect(rings).toEqual([])
  })

  test('keeps its shaft off the figure lines and away from other signs', () => {
    const spec = withCrowdedPair()
    const out = generateWorkingPlan(spec)
    const ents = entities(out.dxf)
    const units = out.scale / 1000                        // ground units per mm

    // Locate the arrow exactly as the crowd test does.
    const inserts = ents.filter((e) => e.type === 'INSERT' && e.g['8'] === 'BEACONS')
      .map((e) => [+e.g['10'], +e.g['20']])
    let pair = null, best = Infinity
    for (let i = 0; i < inserts.length; i++) {
      for (let j = i + 1; j < inserts.length; j++) {
        const d = Math.hypot(inserts[i][0] - inserts[j][0], inserts[i][1] - inserts[j][1])
        if (d < best) { best = d; pair = [inserts[i], inserts[j]] }
      }
    }
    const spot = [(pair[0][0] + pair[1][0]) / 2, (pair[0][1] + pair[1][1]) / 2]
    // The arrow's target members: the two beacons standing at the spot.
    const members = new Set(spec.beacons
      .filter((b) => Math.hypot(-b.Y - spot[0], -b.X - spot[1]) < best / 2 + 1)
      .map((b) => b.name))
    const shaft = ents.filter((e) => e.type === 'LINE' && e.g['8'] === 'INSET'
      && Math.hypot(+e.g['11'] - spot[0], +e.g['21'] - spot[1]) < 8)[0]
    expect(shaft).toBeDefined()
    const a = [+shaft.g['10'], +shaft.g['20']]
    const b = [+shaft.g['11'], +shaft.g['21']]

    const distToSeg = (p) => {
      const ux = b[0] - a[0], uy = b[1] - a[1]
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / (ux * ux + uy * uy || 1)))
      return Math.hypot(p[0] - (a[0] + ux * t), p[1] - (a[1] + uy * t))
    }
    // Full segment-to-segment distance: shaft endpoints to the line and the
    // line's endpoints to the shaft cover every closest-point arrangement.
    const distSegSeg = ([x0, y0], [x1, y1]) => {
      const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
      if (o(a, b, [x0, y0]) * o(a, b, [x1, y1]) < 0 && o([x0, y0], [x1, y1], a) * o([x0, y0], [x1, y1], b) < 0) return 0
      return Math.min(distToSeg([x0, y0]), distToSeg([x1, y1]))
    }

    // 0.8 mm of clear space must stand between the shaft and every drawn line:
    // a leader that lies along the very boundary it labels is an error.
    const lines = ents.filter((e) => e.type === 'LINE' && ['BOUNDARY-NEW', 'BOUNDARY-EXIST', 'ADJOINING'].includes(e.g['8']))
    for (const line of lines) {
      const d = distSegSeg([+line.g['10'], +line.g['20']], [+line.g['11'], +line.g['21']])
      expect(d).toBeGreaterThan(0.8 * units)
    }

    // And it must keep out of every OTHER beacon's sign: the search pads each
    // sign by 0.4 mm beyond its symbol reach.
    for (const beacon of spec.beacons.filter((bl) => !members.has(bl.name))) {
      expect(distToSeg([-beacon.Y, -beacon.X])).toBeGreaterThan(0.4 * units)
    }
  })
})

describe('a sheet with no locality diagram', () => {
  test('starts its details at INSET 1', () => {
    const spec = withCrowdedPair()
    delete spec.inset

    const t = texts(generateWorkingPlan(spec).dxf)

    expect(captionOf(t, 1)).toMatch(/^INSET 1 \(1:[\d.]+\)$/)
    expect(t.some((s) => s.startsWith('INSET 2'))).toBe(false)
  })
})
