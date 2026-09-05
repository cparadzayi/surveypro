import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan, LAYOUT } from '../working-plan.js'
import { brackenhurstSpec } from './fixtures/brackenhurstSpec.js'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * dxf-r12.js and working-plan.js are vendored, and this test pins their output
 * byte for byte so no well-meant reformat can drift it.
 *
 * The fixture is NO LONGER the file the module's author shipped. That file --
 * and every build of the module before 2026-09-03 -- wrote group code 370
 * (lineweight) on each LAYER entry while declaring $ACADVER = AC1009. Group 370
 * arrived with AutoCAD 2000; in an R12 file it is invalid, and AutoCAD rejects
 * the whole drawing. Lenient parsers do not: ezdxf read the broken file with
 * zero errors and zero fixes, which is precisely why this suite, the route
 * tests and the integration test all passed while the sheet would not open.
 *
 * So dxf-r12.js is now a deliberate fork of upstream by exactly that one
 * emission, and the fixture was regenerated from the corrected module
 * (32,706 -> 32,615 bytes, the 13 removed 370 pairs). Re-syncing from upstream
 * must not reintroduce it -- the invariant test below is what guards that, and
 * it is the one that matters more than the byte comparison.
 */
describe('generateWorkingPlan — golden', () => {
  const reference = readFileSync(join(here, 'fixtures', 'Working_Plan_reference.dxf'), 'utf8')

  test('reproduces the reference sheet byte for byte', () => {
    const out = generateWorkingPlan(brackenhurstSpec)
    expect(out.dxf.length).toBe(reference.length)
    expect(out.dxf).toBe(reference)
  })

  test('reports the scale and grid the sheet was actually drawn at', () => {
    const out = generateWorkingPlan(brackenhurstSpec)
    expect(out.scale).toBe(2000)
    expect(out.gridInterval.e).toBeGreaterThan(0)
    expect(out.gridInterval.n).toBeGreaterThan(0)
  })

  test('computes an area for every parcel in the spec', () => {
    const out = generateWorkingPlan(brackenhurstSpec)
    expect(Object.keys(out.areas).sort()).toEqual(['403', '404', '405', 'Rem./'])
    for (const area of Object.values(out.areas)) {
      expect(area).toBeGreaterThan(0)
    }
  })

  test('names the offending beacon when a ring references one that does not exist', () => {
    // The surveyor can act on "unknown beacon SD9"; they cannot act on
    // "Cannot read properties of undefined".
    const spec = {
      ...brackenhurstSpec,
      parcels: [{ label: '405', ring: ['SD4', 'SD9', 'SD5'] }],
      existing: [],
      roads: [],
    }
    expect(() => generateWorkingPlan(spec)).toThrow('generateWorkingPlan: unknown beacon "SD9"')
  })

  test('emits no group code that postdates the DXF version it declares', () => {
    // The guard for the class of bug that shipped a sheet AutoCAD would not
    // open. A byte comparison only catches drift from a known-good file; this
    // catches a NEW post-R12 code even if someone regenerates the fixture to
    // match it. 370=lineweight, 390=plot style, 100=subclass, 5/330=handles,
    // 347=material -- all R13+ or later, all invalid under $ACADVER AC1009.
    const { dxf } = generateWorkingPlan(brackenhurstSpec)
    const lines = dxf.split('\n')

    expect(lines[lines.indexOf('$ACADVER') + 2]).toBe('AC1009')

    const POST_R12 = new Set(['5', '100', '330', '347', '370', '390'])
    const offenders = new Map()
    for (let i = 0; i < lines.length - 1; i += 2) {
      const code = lines[i].trim()
      if (POST_R12.has(code)) offenders.set(code, (offenders.get(code) ?? 0) + 1)
    }
    expect(Object.fromEntries(offenders)).toEqual({})
  })

  test('sets the document heading larger than the lines naming the land', () => {
    // "WORKING PLAN OF" identifies what the sheet IS and leads the title block
    // at 1.25x. The lines below it identify the land and are set uniformly.
    const { dxf } = generateWorkingPlan(brackenhurstSpec)
    const lines = dxf.split('\n')
    const heights = []
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i] === '0' && lines[i + 1] === 'TEXT') {
        let j = i + 2; const d = {}
        while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
        if ((d['8'] || [])[0] === 'TITLE' && (d['40'] || [])[0]) heights.push(Number(d['40'][0]))
      }
    }
    const tallest = Math.max(...heights)
    const body = heights.filter(h => h < tallest)
    expect(body.length).toBeGreaterThan(0)
    expect(tallest / Math.max(...body)).toBeCloseTo(1.25, 2)
  })

  test('marks an abutting neighbour the way the diagram does', () => {
    // Same helpers as diagramDxf: contiguousMarks decides which terminals get a
    // stub, edgeStrip puts it on the side away from the figure. Parity is
    // structural -- one implementation, four renderers -- not coincidence.
    const spec = {
      ...brackenhurstSpec,
      contiguous: [
        { from: 'SD4', to: '86B', end: 'both' },
        { from: '86B', to: '87B', end: 'from' },
      ],
    }
    const { dxf } = generateWorkingPlan(spec)
    const stubs = dxf.split('0\nLINE\n8\nADJOINING\n').length - 1
    expect(stubs).toBe(3)          // 'both' gives two, 'from' gives one
    expect(dxf).not.toMatch(/NaN/)
  })

  test('draws no abutment marks when none were tagged', () => {
    const { dxf } = generateWorkingPlan(brackenhurstSpec)
    expect(dxf.split('0\nLINE\n8\nADJOINING\n').length - 1).toBe(0)
  })

  test('prints the SR number lower on the sheet than anything else', () => {
    // Docket item 21, moved to the foot of the page. Ground north = -X, so
    // further down the sheet is a SMALLER value.
    const { dxf } = generateWorkingPlan({ ...brackenhurstSpec, srNumber: 'S.R. No. 12345' })
    const lines = dxf.split('\n')
    let srY = null; const ys = []
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i] === '0' && lines[i + 1] === 'TEXT') {
        let j = i + 2; const d = {}
        while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
        const y = Number((d['20'] || [])[0])
        if ((d['1'] || [])[0] === 'S.R. No. 12345') srY = y
        else if (Number.isFinite(y)) ys.push(y)
      }
    }
    expect(srY).not.toBeNull()
    expect(srY).toBeLessThan(Math.min(...ys))
  })

  test('emits nothing the declared code page cannot represent', () => {
    // R12 has no UTF-8. The file declares ANSI_1252 and the route encodes
    // latin1 to match, so a character above U+00FF would be silently mangled --
    // and the Fifth Schedule's arrow forms (U+2190/2192) are exactly that.
    const { dxf } = generateWorkingPlan({
      ...brackenhurstSpec,
      areaOfProperty: 4046.89,   // the m² here is what exercises the code page
      srNumber: 'S.R. No. 12345',
    })
    expect(dxf).toContain('ANSI_1252')
    const outside = [...dxf].filter(c => c.charCodeAt(0) > 255)
    expect([...new Set(outside)]).toEqual([])
    // No assertion on a specific character: the sheet currently emits none.
    // The guarantee that matters is that nothing ABOVE U+00FF is emitted,
    // which is what the declared code page cannot carry.
  })

  test('draws a placed beacon the same size as a found one', () => {
    // Both signs are the same diameter; only their construction differs -- one
    // circle against two concentric. A smaller placed beacon read as a lesser
    // mark rather than a different one.
    expect(LAYOUT.symbol.placedDia).toBe(LAYOUT.symbol.foundOuterDia)
  })

  test('stops each boundary at the rim of the beacon it meets', () => {
    // At 1:1000 one paper millimetre is one ground unit, so the shortfall on a
    // 100-unit side is readable directly as the two symbol radii.
    const B = (name, X, Y, symbol) => ({ name, X, Y, symbol, label: 'auto' })
    const { dxf } = generateWorkingPlan({
      scale: 1000,
      beacons: [
        B('Q1', 2144000, -85700, 'placed'), B('Q2', 2144100, -85700, 'found'),
        B('Q3', 2144100, -85600, 'rm'),     B('Q4', 2144000, -85600, 'trig'),
      ],
      parcels: [{ label: '404', ring: ['Q1', 'Q2', 'Q3', 'Q4'] }],
      title: ['WORKING PLAN OF', 'Stand 404'],
    })

    const lines = dxf.split('\n')
    const lengths = []
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i] === '0' && lines[i + 1] === 'LINE' && lines[i + 3] === 'BOUNDARY-NEW') {
        let j = i + 2; const d = {}
        while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
        lengths.push(Math.hypot(+d['11'][0] - +d['10'][0], +d['21'][0] - +d['20'][0]))
      }
    }
    expect(lengths).toHaveLength(4)          // one line per side, not a closed polyline

    const S = LAYOUT.symbol
    const triReach = Math.max(S.trigH * 0.62, Math.hypot(S.trigW / 2, S.trigH * 0.38))
    const clear = { placed: S.placedDia / 2, found: S.foundOuterDia / 2, rm: S.refMarkArm / 2, trig: triReach }
    const expected = [
      100 - clear.placed - clear.found,
      100 - clear.found - clear.rm,
      100 - clear.rm - clear.trig,
      100 - clear.trig - clear.placed,
    ]
    lengths.forEach((len, i) => expect(len).toBeCloseTo(expected[i], 3))
  })

  test('keeps the trig circle inscribed, and large enough to read', () => {
    // The circle is tangent to all three sides, so it must fit inside the
    // triangle; and at this size it is near the found beacon's own circle, which
    // is what makes it legible rather than a dot.
    const S = LAYOUT.symbol
    const w = S.trigW / 2, h = S.trigH
    const r = (w * h) / (w + Math.hypot(w, h))
    expect(2 * r).toBeLessThan(S.trigW)                    // inscribed, not circumscribed
    expect(2 * r).toBeGreaterThan(S.foundOuterDia * 0.9)   // reads at beacon weight
    expect(2 * r).toBeLessThan(S.foundOuterDia * 1.1)
  })

  test('leaves the trig circle as a hole in the fill, not a line over it', () => {
    // A circle drawn ON a filled triangle is invisible: same colour on same
    // colour. The Fifth Schedule's white inscribed circle has to be an actual
    // gap in the black, so no fill may reach inside it and no outline may sit
    // on top of it.
    const { dxf } = generateWorkingPlan(brackenhurstSpec)
    const lines = dxf.split('\n')
    const start = lines.indexOf('BCN_TRIG')
    const end = lines.indexOf('ENDBLK', start)
    expect(start).toBeGreaterThan(-1)

    const S = LAYOUT.symbol
    const w = S.trigW / 2, h = S.trigH
    const r = (w * h) / (w + Math.hypot(w, h))
    const cy = -(h * 0.38) + r

    let quads = 0, breaches = 0, outlines = 0
    for (let i = start; i < end; i++) {
      if (lines[i] === 'POLYLINE' || lines[i] === 'CIRCLE') outlines++
      if (lines[i] !== 'SOLID') continue
      quads++
      let j = i + 1; const d = {}
      while (j < end && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
      const corners = [['10', '20'], ['11', '21'], ['12', '22'], ['13', '23']]
      for (const [gx, gy] of corners) {
        const x = Number(d[gx][0]), y = Number(d[gy][0])
        if (Math.hypot(x, y - cy) < r - 0.02) breaches++
      }
    }
    expect(quads).toBeGreaterThan(8)   // a ring of fill, not one solid triangle
    expect(breaches).toBe(0)           // nothing reaches into the circle
    expect(outlines).toBe(0)           // and nothing is drawn over it
  })

  test('declares layer 0, where every block draws', () => {
    // Block geometry sits on layer 0 so it inherits the INSERT's layer. AutoCAD
    // expects the layer to exist; ours never declared it.
    const { dxf } = generateWorkingPlan(brackenhurstSpec)
    expect(dxf).toContain('0\nLAYER\n2\n0\n')
  })

  test('holes the inset trig symbols too, not just the beacon blocks', () => {
    // The blocks were fixed first and the inset was missed. That mattered more
    // than it sounds: a sheet whose beacons are all pegs and marks inserts no
    // trig block at all, so the inset was the ONLY place a trig symbol appeared
    // -- and it was still a plain filled triangle.
    const { dxf } = generateWorkingPlan(brackenhurstSpec)
    const lines = dxf.split('\n')

    let inBlock = false
    const solids = []
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i] === '0' && lines[i + 1] === 'BLOCK') inBlock = true
      if (lines[i] === '0' && lines[i + 1] === 'ENDBLK') inBlock = false
      if (inBlock || lines[i] !== '0' || lines[i + 1] !== 'SOLID') continue
      let j = i + 2; const d = {}
      while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
      if ((d['8'] || [])[0] === 'INSET') solids.push(d)
    }

    // Two trig stations in the reference inset. One filled triangle each would
    // be 2 solids; a ring of quads is many.
    expect(solids.length).toBeGreaterThan(20)
  })

  describe('label placement', () => {
    const parse = (dxf) => {
      const lines = dxf.split('\n')
      const labels = [], segs = []
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i] !== '0') continue
        const kind = lines[i + 1]
        if (kind !== 'TEXT' && kind !== 'LINE') continue
        let j = i + 2; const d = {}
        while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
        const layer = (d['8'] || [])[0]
        if (kind === 'TEXT' && layer === 'BEACON-TEXT') {
          labels.push({ t: (d['1'] || [''])[0], x: +d['10'][0], y: +d['20'][0], h: +d['40'][0], al: (d['72'] || ['0'])[0] })
        }
        if (kind === 'LINE' && layer === 'BOUNDARY-NEW') {
          segs.push([[+d['10'][0], +d['20'][0]], [+d['11'][0], +d['21'][0]]])
        }
      }
      return { labels, segs }
    }
    const rect = (l) => {
      const w = 0.63 * l.h * l.t.length
      const x0 = l.al === '1' ? l.x - w / 2 : l.al === '2' ? l.x - w : l.x
      return [x0, l.y - l.h * 0.15, x0 + w, l.y + l.h]
    }
    const crosses = (p0, q0, [x0, y0, x1, y1]) => {
      let p = p0.slice(), q = q0.slice()
      const code = ([x, y]) => (x < x0 ? 1 : 0) | (x > x1 ? 2 : 0) | (y < y0 ? 4 : 0) | (y > y1 ? 8 : 0)
      let a = code(p), b = code(q)
      for (let g = 0; g < 8; g++) {
        if (!(a | b)) return true
        if (a & b) return false
        const c = a || b
        let x, y
        if (c & 8) { x = p[0] + (q[0] - p[0]) * (y1 - p[1]) / (q[1] - p[1]); y = y1 }
        else if (c & 4) { x = p[0] + (q[0] - p[0]) * (y0 - p[1]) / (q[1] - p[1]); y = y0 }
        else if (c & 2) { y = p[1] + (q[1] - p[1]) * (x1 - p[0]) / (q[0] - p[0]); x = x1 }
        else { y = p[1] + (q[1] - p[1]) * (x0 - p[0]) / (q[0] - p[0]); x = x0 }
        if (c === a) { p = [x, y]; a = code(p) } else { q = [x, y]; b = code(q) }
      }
      return false
    }
    const audit = (dxf) => {
      const { labels, segs } = parse(dxf)
      let overlaps = 0
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          const A = rect(labels[i]), B = rect(labels[j])
          if (A[0] < B[2] && A[2] > B[0] && A[1] < B[3] && A[3] > B[1]) overlaps++
        }
      }
      const onLine = labels.filter((l) => segs.some((s) => crosses(s[0], s[1], rect(l)))).length
      return { count: labels.length, overlaps, onLine }
    }

    test('no beacon name overwrites another, or sits on a boundary', () => {
      const a = audit(generateWorkingPlan(brackenhurstSpec).dxf)
      expect(a.count).toBe(17)
      expect(a.overlaps).toBe(0)
      expect(a.onLine).toBe(0)
    })

    test('holds on a cramped figure, where the old placer gave up and overwrote', () => {
      // Fourteen beacons on a small ring with long names: every compass slot
      // around a beacon is contested. The placer walks the whole ring at one
      // distance before stepping out, so names stay near their own beacon.
      const N = 14, R = 18
      const beacons = Array.from({ length: N }, (_, i) => {
        const t = (2 * Math.PI * i) / N
        return {
          name: 'BCN' + (100 + i),
          X: 2144000 + R * Math.cos(t),
          Y: -85700 + R * Math.sin(t),
          symbol: 'placed', label: 'auto',
        }
      })
      const { dxf } = generateWorkingPlan({
        scale: 'auto', beacons,
        parcels: [{ label: '404', ring: beacons.map((b) => b.name) }],
        title: ['WORKING PLAN OF', 'Cramped'],
      })
      const a = audit(dxf)
      expect(a.count).toBe(N)
      expect(a.overlaps).toBe(0)
      expect(a.onLine).toBe(0)
    })
  })

  test('picks a scale itself when asked to', () => {
    const out = generateWorkingPlan({ ...brackenhurstSpec, scale: 'auto' })
    expect(typeof out.scale).toBe('number')
    expect(out.scale).toBeGreaterThan(0)
  })
})
