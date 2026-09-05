import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan, LAYOUT, LINETYPES, SHEET } from '../working-plan.js'
import { SI727_SCALE_LADDER } from '../../../../../app-shared/si727Scales.js'
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

  test('keeps the stubs and the remainder sides out of the beacon signs too', () => {
    // Only the new boundaries were clipped. The remainder's own sides and the
    // abutment stubs were drawn from the beacon CENTRE, straight through the
    // mark sitting there. At 1:1000 a paper millimetre is a ground unit, so the
    // clearances read directly.
    const B = (name, X, Y, symbol) => ({ name, X, Y, symbol, label: 'auto' })
    const { dxf } = generateWorkingPlan({
      scale: 1000,
      beacons: [
        B('Q1', 2144000, -85700, 'placed'), B('Q2', 2144100, -85700, 'found'),
        B('Q3', 2144100, -85600, 'rm'), B('Q4', 2144000, -85600, 'trig'),
        B('R1', 2144200, -85700, 'found'), B('R2', 2144200, -85600, 'rm'),
      ],
      parcels: [{ label: '404', ring: ['Q1', 'Q2', 'Q3', 'Q4'] }],
      contiguous: [{ from: 'Q1', to: 'Q2', end: 'both' }],
      remainderBoundary: [{ from: 'Q2', to: 'R1' }, { from: 'R1', to: 'R2' }, { from: 'R2', to: 'Q3' }],
      remainderRing: ['Q2', 'R1', 'R2', 'Q3'],
      remainderLabel: 'REM',
      title: ['WORKING PLAN OF', 'Stand 404'],
    })

    const lines = dxf.split('\n')
    const drawn = []
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i] !== '0' || lines[i + 1] !== 'LINE') continue
      let j = i + 2; const d = {}
      while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
      const layer = (d['8'] || [])[0]
      if (layer === 'BOUNDARY-EXIST' || layer === 'ADJOINING') {
        drawn.push({ layer, a: [+d['10'][0], +d['20'][0]], b: [+d['11'][0], +d['21'][0]] })
      }
    }
    expect(drawn.filter((l) => l.layer === 'BOUNDARY-EXIST')).toHaveLength(3)
    expect(drawn.filter((l) => l.layer === 'ADJOINING')).toHaveLength(2)

    // Every beacon centre, in the sheet's own coordinates: easting = -Y,
    // northing = -X. Nothing on these two layers may come within its sign.
    const centres = [
      { c: [85700, -2144000], r: LAYOUT.symbol.placedDia / 2 },
      { c: [85700, -2144100], r: LAYOUT.symbol.foundOuterDia / 2 },
      { c: [85600, -2144100], r: LAYOUT.symbol.refMarkArm / 2 },
      { c: [85700, -2144200], r: LAYOUT.symbol.foundOuterDia / 2 },
      { c: [85600, -2144200], r: LAYOUT.symbol.refMarkArm / 2 },
    ]
    const near = []
    for (const l of drawn) {
      for (const { c, r } of centres) {
        for (const end of [l.a, l.b]) {
          const gap = Math.hypot(end[0] - c[0], end[1] - c[1])
          // an end either belongs to this beacon (and must stand off) or is
          // nowhere near it
          if (gap < r * 0.999) near.push(`${l.layer} end ${gap.toFixed(2)} inside r=${r}`)
        }
      }
    }
    expect(near).toEqual([])

    // and the stub keeps its full length -- shifted out, not shortened, so it
    // still carries the three dashes that make it read as an abutment.
    for (const l of drawn.filter((x) => x.layer === 'ADJOINING')) {
      expect(Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1])).toBeCloseTo(LAYOUT.contiguousStub, 3)
    }
  })

  test('breaks a parent boundary around the beacons it runs through', () => {
    // A parent boundary does not stop at its corner beacon, it carries on past
    // it, so the mark sits in the MIDDLE of the line. Pulling the ends back
    // cannot help; the line has to be drawn in two pieces with a gap at the
    // beacon. At 1:1000 a paper millimetre is a ground unit.
    const B = (name, X, Y, symbol) => ({ name, X, Y, symbol, label: 'auto' })
    const { dxf } = generateWorkingPlan({
      scale: 1000,
      beacons: [
        B('Q1', 2144000, -85700, 'placed'), B('Q2', 2144100, -85700, 'found'),
        B('Q3', 2144100, -85600, 'rm'), B('Q4', 2144000, -85600, 'placed'),
      ],
      parcels: [{ label: '404', ring: ['Q1', 'Q2', 'Q3', 'Q4'] }],
      // runs from 20 before Q2 to 20 past Q3, so both beacons are interior
      existing: [{ from: 'Q2', to: 'Q3', extendFrom: 20, extendTo: 20 }],
      title: ['WORKING PLAN OF', 'Stand 404'],
    })

    const lines = dxf.split('\n')
    const segs = []
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i] !== '0' || lines[i + 1] !== 'LINE') continue
      let j = i + 2; const d = {}
      while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
      if ((d['8'] || [])[0] === 'BOUNDARY-EXIST') {
        segs.push([[+d['10'][0], +d['20'][0]], [+d['11'][0], +d['21'][0]]])
      }
    }
    // one span, two beacons in the middle of it: three pieces
    expect(segs).toHaveLength(3)

    // no piece may come inside either sign
    const marks = [
      { c: [85700, -2144100], r: LAYOUT.symbol.foundOuterDia / 2 },
      { c: [85600, -2144100], r: LAYOUT.symbol.refMarkArm / 2 },
    ]
    for (const sg of segs) {
      for (const { c, r } of marks) {
        for (const end of sg) {
          const gap = Math.hypot(end[0] - c[0], end[1] - c[1])
          expect(gap).toBeGreaterThan(r * 0.999)
        }
      }
    }
    // and the boundary still spans everything it did before: 20 + 100 + 20,
    // less the two gaps it now leaves
    const drawn = segs.reduce((t, sg) => t + Math.hypot(sg[1][0] - sg[0][0], sg[1][1] - sg[0][1]), 0)
    const cut = LAYOUT.symbol.foundOuterDia + LAYOUT.symbol.refMarkArm
    expect(drawn).toBeCloseTo(140 - cut, 3)
  })

  test('marks an abutment on a side only the remaining extent holds', () => {
    // The remainder's sides are annotated like any other parcel's, and its
    // boundary is drawn, so its neighbours must be marked. This mark's two
    // beacons belong to NO drawn stand -- the ring lookup failed and the mark
    // was skipped, which is what took the offshoot off beacon 87C.
    const B = (name, X, Y) => ({ name, X, Y, symbol: 'placed', label: 'auto' })
    const { dxf } = generateWorkingPlan({
      scale: 'auto',
      beacons: [
        B('Q1', 2144000, -85700), B('Q2', 2144100, -85700),
        B('Q3', 2144100, -85600), B('Q4', 2144000, -85600),
        B('R1', 2144200, -85700), B('R2', 2144200, -85600),
      ],
      parcels: [{ label: '404', ring: ['Q1', 'Q2', 'Q3', 'Q4'] }],
      remainderRing: ['Q2', 'R1', 'R2', 'Q3'],
      remainderBoundary: [{ from: 'Q2', to: 'R1' }, { from: 'R1', to: 'R2' }, { from: 'R2', to: 'Q3' }],
      remainderLabel: 'REM',
      // R1-R2 is a side of the remainder alone; no stand contains both
      contiguous: [{ from: 'R1', to: 'R2', end: 'from' }],
      title: ['WORKING PLAN OF', 'Stand 404'],
    })
    expect(dxf.split('0\nLINE\n8\nADJOINING\n').length - 1).toBeGreaterThan(0)
  })

  test('gives the inset the sheet’s own north arrow, drawn small', () => {
    // The inset is a locality map in its own right and cannot be read without a
    // north point. It carries the SHEET'S meridian arrow at a fraction of its
    // size -- one symbol drawn twice, not a second symbol that could drift from
    // it -- so both have the same eight rays and the same T and N.
    const { dxf } = generateWorkingPlan({
      ...brackenhurstSpec,
      inset: { scale: 250000, beacons: [
        { name: 'T1', X: 2160000, Y: -88000, symbol: 'trig' },
        { name: 'F1', X: 2144000, Y: -85700, symbol: 'found' },
      ] },
    })
    const lines = dxf.split('\n')

    /** Closed runs of vertices on a layer: [layer, [[x,y]...]]. */
    const polys = []
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i] !== '0' || lines[i + 1] !== 'POLYLINE') continue
      let layer = null
      for (let j = i + 2; j < i + 20; j++) {
        if (lines[j] === '0') break
        if (lines[j] === '8') { layer = lines[j + 1]; break }
      }
      const v = []
      let inVertex = false
      for (let j = i + 2; j < lines.length - 1; j++) {
        if (lines[j] === '0') {
          if (lines[j + 1] === 'SEQEND') break
          inVertex = lines[j + 1] === 'VERTEX'
        }
        if (inVertex && lines[j] === '10') v.push([+lines[j + 1], +lines[j + 3]])
      }
      polys.push([layer, v])
    }
    const frame = polys.find(([l, v]) => l === 'INSET' && v.length === 4)[1]
    const fx = frame.map((q) => q[0]), fy = frame.map((q) => q[1])
    const within = ([x, y]) => x > Math.min(...fx) && x < Math.max(...fx)
      && y > Math.min(...fy) && y < Math.max(...fy)

    const rays = polys.filter(([l]) => l === 'NORTH-ARROW')
    const inset = rays.filter(([, v]) => v.every(within))
    const sheet = rays.filter(([, v]) => !v.some(within))

    // the same construction, both of them
    expect(sheet).toHaveLength(8)
    expect(inset).toHaveLength(8)

    // and the same letters, the inset's inside its frame
    const letters = []
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i] !== '0' || lines[i + 1] !== 'TEXT') continue
      let j = i + 2; const d = {}
      while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
      if ((d['8'] || [])[0] === 'NORTH-ARROW') {
        letters.push({ t: (d['1'] || [''])[0], at: [+d['10'][0], +d['20'][0]], h: +d['40'][0] })
      }
    }
    expect(letters.filter((c) => within(c.at)).map((c) => c.t).sort()).toEqual(['N', 'T'])

    // smaller, in the same proportion as its rays
    const span = (g) => {
      const ys = g.flatMap(([, v]) => v.map((q) => q[1]))
      return Math.max(...ys) - Math.min(...ys)
    }
    expect(span(inset) / span(sheet)).toBeCloseTo(LAYOUT.inset.north.scale, 2)
    const h = (g) => letters.filter((c) => (g === 'in' ? within(c.at) : !within(c.at)))[0].h
    expect(h('in')).toBeLessThan(h('out'))
  })

  test('draws the trig sign as a true equilateral triangle', () => {
    // The Fifth Schedule's sign is equilateral. It was drawn with a base of
    // 4.595 against sides of 4.225 -- wider than it was long -- which reads as
    // a triangle bulging sideways.
    const S = LAYOUT.symbol
    const base = S.trigW
    const slant = Math.hypot(S.trigW / 2, S.trigH)
    expect(slant).toBeCloseTo(base, 3)
    // and the same relation stated the other way, so a future edit to either
    // number has to satisfy both
    expect(S.trigH).toBeCloseTo((S.trigW * Math.sqrt(3)) / 2, 3)
  })

  test('draws the trig circle at exactly a found beacon, not near it', () => {
    // The circle is tangent to all three sides, so it must fit inside the
    // triangle -- and it is drawn at the found beacon's own diameter, so the two
    // marks read at the same size and only the triangle tells them apart. This
    // used to allow anything within 10%, and sat 3% under; the inset, which had
    // its own numbers, sat 36% under and that is the one surveyors saw.
    const S = LAYOUT.symbol
    const w = S.trigW / 2, h = S.trigH
    const r = (w * h) / (w + Math.hypot(w, h))
    expect(2 * r).toBeLessThan(S.trigW)                    // inscribed, not circumscribed
    expect(2 * r).toBeCloseTo(S.foundOuterDia, 2)
  })

  test('draws the inset trig at the same proportions as the figure', () => {
    // Trig and OCP appear ONLY in the inset on a sheet whose beacons are all
    // pegs and marks -- the ordinary case -- so the inset is where this shows.
    // Measured off the drawn geometry, not off the constants, so the two cannot
    // silently drift apart again.
    const { dxf } = generateWorkingPlan({
      ...brackenhurstSpec,
      inset: {
        scale: 250000,
        beacons: [
          { name: 'T1', X: 2160000, Y: -88000, symbol: 'trig' },
          { name: 'F1', X: 2144000, Y: -85700, symbol: 'found' },
        ],
      },
    })
    const lines = dxf.split('\n')
    const ents = (kind) => {
      const out = []
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i] !== '0' || lines[i + 1] !== kind) continue
        let j = i + 2; const d = {}
        while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
        if ((d['8'] || [])[0] === 'INSET') out.push(d)
      }
      return out
    }
    // The trig is the only thing in the inset drawn as fill.
    const pts = ents('SOLID').flatMap((d) => [0, 1, 2, 3]
      .map((k) => [+(d[10 + k] || [])[0], +(d[20 + k] || [])[0]])
      .filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1])))
    expect(pts.length).toBeGreaterThan(0)

    // Its three corners are the extremes of the fill; the incircle follows.
    const apex = pts.reduce((a, b) => (b[1] > a[1] ? b : a))
    const left = pts.reduce((a, b) => (b[0] < a[0] ? b : a))
    const right = pts.reduce((a, b) => (b[0] > a[0] ? b : a))
    const side = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1])
    const A = side(left, right), Bs = side(left, apex), C = side(right, apex)
    const sHalf = (A + Bs + C) / 2
    const area = Math.abs((right[0] - left[0]) * (apex[1] - left[1])
      - (apex[0] - left[0]) * (right[1] - left[1])) / 2
    const rIn = area / sHalf

    // The found beacon's rings, on the inset layer only -- the beacon BLOCKS
    // carry circles of their own, at the figure's size, and picking one of those
    // up would compare the inset against the wrong thing.
    const rings = []
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i] !== '0' || lines[i + 1] !== 'POLYLINE') continue
      let layer = null
      for (let j = i + 2; j < i + 20 && j < lines.length - 1; j++) {
        if (lines[j] === '0') break
        if (lines[j] === '8') { layer = lines[j + 1]; break }
      }
      // Only inside a VERTEX: an R12 POLYLINE header carries a dummy 10/20 pair
      // of its own, and counting it puts a point at the origin.
      const v = []
      let inVertex = false
      for (let j = i + 2; j < lines.length - 1; j++) {
        if (lines[j] === '0') {
          if (lines[j + 1] === 'SEQEND') break
          inVertex = lines[j + 1] === 'VERTEX'
        }
        if (inVertex && lines[j] === '10') v.push([+lines[j + 1], +lines[j + 3]])
      }
      if (layer !== 'INSET' || v.length < 20) continue      // circles, not the box
      const xs = v.map((q) => q[0]), ys = v.map((q) => q[1])
      rings.push(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)))
    }
    expect(rings.length).toBeGreaterThanOrEqual(2)          // the found beacon is concentric
    const foundDia = Math.max(...rings)

    // Measured off the drawn fill, whose 24 segments clip the triangle's corners
    // slightly, so this is a proportion check rather than an identity. It is far
    // tighter than the fault it guards: the inset drew this circle at 64% of the
    // found beacon it sits beside.
    expect(2 * rIn / foundDia).toBeGreaterThan(0.95)
    expect(2 * rIn / foundDia).toBeLessThan(1.05)
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
    /** Every TEXT on the sheet, boxed -- rotated labels included. */
    const auditAll = (dxf) => {
      const lines = dxf.split('\n')
      const T = []
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i] !== '0' || lines[i + 1] !== 'TEXT') continue
        let j = i + 2; const d = {}
        while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
        T.push({
          layer: (d['8'] || ['?'])[0], t: (d['1'] || [''])[0],
          x: +d['10'][0], y: +d['20'][0], h: +(d['40'] || [1])[0],
          al: (d['72'] || ['0'])[0], rot: +(d['50'] || [0])[0], wf: +(d['41'] || [1])[0],
        })
      }
      const box = (t) => {
        const w = 0.63 * t.h * t.wf * t.t.length
        if (Math.abs(t.rot) > 0.5) {
          const a = (t.rot * Math.PI) / 180
          const P = [[0, 0], [w, 0], [w, t.h], [0, t.h]].map(([u, v]) => [
            t.x + u * Math.cos(a) - v * Math.sin(a),
            t.y + u * Math.sin(a) + v * Math.cos(a)])
          return [Math.min(...P.map((q) => q[0])), Math.min(...P.map((q) => q[1])),
            Math.max(...P.map((q) => q[0])), Math.max(...P.map((q) => q[1]))]
        }
        const x0 = t.al === '1' ? t.x - w / 2 : t.al === '2' ? t.x - w : t.x
        return [x0, t.y - t.h * 0.15, x0 + w, t.y + t.h]
      }
      const overlaps = []
      for (let i = 0; i < T.length; i++) {
        for (let j = i + 1; j < T.length; j++) {
          const A = box(T[i]), B = box(T[j])
          if (A[0] < B[2] && A[2] > B[0] && A[1] < B[3] && A[3] > B[1]) {
            overlaps.push(`${T[i].layer}:${T[i].t} <-> ${T[j].layer}:${T[j].t}`)
          }
        }
      }
      return { overlaps }
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

    test('no text on the sheet overwrites any other, on any layer', () => {
      // The earlier version of this audited BEACON-TEXT only, and passed while
      // six pairs overlapped: road names against beacon names, a stand number
      // and a grid label. Every layer is audited now, which is the guard that
      // would have caught it.
      const a = auditAll(generateWorkingPlan(brackenhurstSpec).dxf)
      expect(a.overlaps).toEqual([])
    })

    test('no beacon name overwrites another, or sits on a boundary', () => {
      const a = audit(generateWorkingPlan(brackenhurstSpec).dxf)
      expect(a.count).toBe(17)
      expect(a.overlaps).toBe(0)
      expect(a.onLine).toBe(0)
    })

    /** How a surveyor actually letters a road: spaced out, per the Fifth
     *  Schedule. It more than doubles the character count, and that is the
     *  whole of this bug. */
    const spaced = (s) => s.split('').join('  ')

    test('a real letter-spaced road annotation overwrites nothing', () => {
      // The fixture letters its roads 'Main Road' and 'Klein Road 25.19 m'.
      // Real ones arrive as 'K  L  E  I  N   R  O  A  D' with the width glued
      // on: 40 characters, which at this scale is 68% of the whole figure's
      // width. That gap between the fixture and the data is why this suite read
      // clean while the sheet the surveyor opened had three labels written
      // through each other. The name and the width are separate labels now, so
      // each is small enough to be placed on its own merits.
      // At the scale the renderer CHOOSES, not the fixture's pinned 1:2000.
      // Now that the figure extent covers every beacon it draws, this sheet
      // auto-fits at 1:2500, and 1:2000 is a sheet the renderer would never
      // produce for it -- too cramped to hold a 21-character road name outside
      // the figure at all.
      const { dxf } = generateWorkingPlan({
        ...brackenhurstSpec,
        scale: 'auto',
        roads: [
          { name: spaced('MAIN ROAD'), from: 'SD1', to: '87CR', offset: 9.5, along: -3 },
          { name: spaced('KLEIN ROAD'), from: '86C', to: '87DR', offset: 9.0, along: 5 },
          { name: '25,19m', from: '86C', to: '87DR', offset: 9.0, along: 5 },
        ],
      })
      expect(auditAll(dxf).overlaps).toEqual([])
    })

    test('a label too big for any gap lands where it costs least, not first', () => {
      // Some labels cannot be placed at all: no candidate is clear at any
      // distance, at any scale. Where such a label goes is then decided entirely
      // by the fallback -- and every search here used to fall back to candidate
      // one, the preferred closest-in spot, which on a crowded sheet is the most
      // congested spot on it. This exact label landed across stand 403 and two
      // beacon names: three overwrites, all of them avoidable.
      const { dxf } = generateWorkingPlan({
        ...brackenhurstSpec,
        scale: 'auto',
        roads: [
          { name: spaced('MAIN ROAD'), from: 'SD1', to: '87CR', offset: 9.5, along: -3 },
          { name: spaced('KLEIN ROAD 25.19m'), from: '86C', to: '87DR', offset: 9.0, along: 5 },
        ],
      })
      const { overlaps } = auditAll(dxf)
      // A stand number is the one label on the sheet that cannot be moved out of
      // the way, so it is the one that must never be written over.
      expect(overlaps.filter((o) => o.includes('PARCEL-TEXT'))).toEqual([])
      expect(overlaps.length).toBeLessThan(3)          // measured at 3 before
    })

    test('holds a name off by its own sign, not by the biggest on the sheet', () => {
      // Clearance used to be the largest sign anywhere on the sheet applied to
      // every beacon, so all four of these names sat at exactly the same
      // distance -- an unmarked station's 1.05mm dot held its name as far off as
      // a trig triangle holds its own. Ground reserved for nothing pushes names
      // away from the marks they belong to.
      const B = (name, X, Y, symbol) => ({ name, X, Y, symbol, label: 'E' })
      const { dxf } = generateWorkingPlan({
        scale: 1000,
        beacons: [
          B('W1', 2144000, -85700, 'wsu'), B('P1', 2144000, -85600, 'placed'),
          B('M1', 2144000, -85500, 'rm'), B('T1', 2144000, -85400, 'trig'),
        ],
        parcels: [{ label: '404', ring: ['W1', 'P1', 'M1', 'T1'] }],
        title: ['WORKING PLAN OF', 'Stand 404'],
      })
      const lines = dxf.split('\n')
      const at = {}
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i] !== '0' || lines[i + 1] !== 'TEXT') continue
        let j = i + 2; const d = {}
        while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
        if ((d['8'] || [])[0] === 'BEACON-TEXT') at[(d['1'] || [''])[0]] = [+d['10'][0], +d['20'][0]]
      }
      // easting = -Y, northing = -X; at 1:1000 a paper millimetre is a unit
      const gapOf = (name, X, Y) => Math.hypot(at[name][0] - -Y, at[name][1] - -X)
      const g = {
        W1: gapOf('W1', 2144000, -85700), P1: gapOf('P1', 2144000, -85600),
        M1: gapOf('M1', 2144000, -85500), T1: gapOf('T1', 2144000, -85400),
      }
      // ordered by how far each sign actually reaches
      expect(g.W1).toBeLessThan(g.P1)
      expect(g.P1).toBeLessThan(g.M1)
      expect(g.M1).toBeLessThan(g.T1)
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

  test('draws the remainder boundary dashed, and the subdivisions solid', () => {
    // The remainder's own sides are pre-existing parent boundary, so they take
    // the dashed line; the new stands are solid. Shared sides never reach here
    // -- the adapter drops them, because the stand already draws them solid.
    const B = (name, X, Y) => ({ name, X, Y, symbol: 'placed', label: 'auto' })
    const { dxf } = generateWorkingPlan({
      scale: 'auto',
      beacons: [
        B('Q1', 2144000, -85700), B('Q2', 2144100, -85700),
        B('Q3', 2144100, -85600), B('Q4', 2144000, -85600),
        B('R1', 2144200, -85700), B('R2', 2144200, -85600),
      ],
      parcels: [{ label: '404', ring: ['Q1', 'Q2', 'Q3', 'Q4'] }],
      remainderBoundary: [{ from: 'Q2', to: 'R1' }, { from: 'R1', to: 'R2' }, { from: 'R2', to: 'Q3' }],
      title: ['WORKING PLAN OF', 'Stand 404'],
    })
    const count = (layer) => dxf.split('0\nLINE\n8\n' + layer + '\n').length - 1
    expect(count('BOUNDARY-EXIST')).toBe(3)
    expect(count('BOUNDARY-NEW')).toBe(4)
    // and that layer really is the dashed one
    const lines = dxf.split('\n')
    const at = lines.indexOf('BOUNDARY-EXIST')
    expect(lines.slice(at, at + 12)).toContain('PLANDASH')
  })

  test('letters the remainder inside itself, not in the stand it wraps around', () => {
    // A remainder left by a subdivision is often a U wrapped around the new
    // stands, and a U's centroid is in the hollow -- which is the stand's
    // ground, not the remainder's. The name was written blind at a centre
    // derived from the remainder's unshared sides alone, so on this shape it
    // landed inside stand 404 and across the dashed boundary.
    //
    // Laid out in sheet terms and converted, since that is how the shape reads:
    // easting = -Y, northing = -X. A 100 x 100 U with 20-wide walls, hollow
    // 60 x 80, and stand 404 filling the hollow.
    const P = {
      A: [85600, -2144100], B: [85700, -2144100], C: [85700, -2144000],
      D: [85680, -2144000], E: [85680, -2144080], F: [85620, -2144080],
      G: [85620, -2144000], H: [85600, -2144000],
    }
    const B = (name) => ({ name, X: -P[name][1], Y: -P[name][0], symbol: 'placed', label: 'auto' })
    const { dxf } = generateWorkingPlan({
      scale: 'auto',
      beacons: Object.keys(P).map(B),
      // the stand fills the hollow, so three of the U's sides are shared
      parcels: [{ label: '404', ring: ['D', 'E', 'F', 'G'] }],
      remainderBoundary: [
        { from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'D' },
        { from: 'G', to: 'H' }, { from: 'H', to: 'A' },
      ],
      remainderRing: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      remainderLabel: 'REM',
      title: ['WORKING PLAN OF', 'Stand 404'],
    })

    const lines = dxf.split('\n')
    const read = (kind, keep) => {
      const out = []
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i] !== '0' || lines[i + 1] !== kind) continue
        let j = i + 2; const d = {}
        while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
        const v = keep(d)
        if (v) out.push(v)
      }
      return out
    }
    const rem = read('TEXT', (d) => ((d['1'] || [''])[0] === 'REM'
      ? { x: +d['10'][0], y: +d['20'][0], h: +d['40'][0] } : null))[0]
    expect(rem).toBeDefined()
    const cx = rem.x, cy = rem.y + rem.h / 2

    // Stand 404 is the hollow, and its outline is on the sheet in the drawing's
    // own units -- so no scale arithmetic is needed to ask the question.
    const solid = read('LINE', (d) => ((d['8'] || [])[0] === 'BOUNDARY-NEW'
      ? [[+d['10'][0], +d['20'][0]], [+d['11'][0], +d['21'][0]]] : null))
    expect(solid).toHaveLength(4)
    const ex = solid.flatMap((sg) => [sg[0][0], sg[1][0]])
    const ey = solid.flatMap((sg) => [sg[0][1], sg[1][1]])
    const inStand = cx > Math.min(...ex) && cx < Math.max(...ex)
      && cy > Math.min(...ey) && cy < Math.max(...ey)
    expect(inStand).toBe(false)

    // and clear of its own dashed boundary
    const dashed = read('LINE', (d) => ((d['8'] || [])[0] === 'BOUNDARY-EXIST'
      ? [[+d['10'][0], +d['20'][0]], [+d['11'][0], +d['21'][0]]] : null))
    expect(dashed).toHaveLength(5)
    const w = 0.63 * rem.h * 'REM'.length
    const box = [rem.x - w / 2, rem.y - rem.h * 0.15, rem.x + w / 2, rem.y + rem.h]
    const hitsBox = ([px, py], [qx, qy]) => {
      for (let t = 0; t <= 1; t += 0.002) {
        const x = px + (qx - px) * t, y = py + (qy - py) * t
        if (x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]) return true
      }
      return false
    }
    expect(dashed.filter((sg) => hitsBox(sg[0], sg[1]))).toEqual([])
  })

  test('marks everything adjoining the survey with one linetype', () => {
    // The abutment stubs and the remainder's own boundary both mark land that
    // ADJOINS the survey rather than land being surveyed, so they share a
    // linetype; only the new boundaries are solid. The stubs were briefly
    // dotted, which read as a third category that does not exist.
    const { dxf } = generateWorkingPlan(brackenhurstSpec)
    const lines = dxf.split('\n')
    const linetypeOf = (layer) => {
      const at = lines.indexOf(layer)
      for (let i = at; i < at + 12; i++) if (lines[i] === '6') return lines[i + 1]
      return null
    }
    expect(linetypeOf('ADJOINING')).toBe(linetypeOf('BOUNDARY-EXIST'))
    expect(linetypeOf('ADJOINING')).toBe('PLANDASH')
    expect(linetypeOf('BOUNDARY-NEW')).toBe('CONTINUOUS')
  })

  test('gives an abutment stub at least three dashes', () => {
    // A stub too short for its linetype reads as a solid tick or a single dash,
    // which is exactly what it must not look like. The check is arithmetic on
    // the pattern rather than a hardcoded length, so retuning either the stub or
    // PLANDASH keeps it honest.
    const { on, off } = LINETYPES.PLANDASH
    const stub = LAYOUT.contiguousStub
    const dashes = Math.floor((stub + off) / (on + off))
    expect(dashes).toBeGreaterThanOrEqual(3)
    // and the minimum that three dashes actually occupy
    expect(stub).toBeGreaterThanOrEqual(3 * on + 2 * off)
  })

  test('draws every beacon inside the sheet, not past its own margin', () => {
    // The extent was the ring vertices alone, "so stray RMs don't blow it up".
    // But the sheet still DREW those points -- it just stopped sizing itself to
    // them -- so a reference mark outside the ring extent went past the panel
    // and, at a fine enough scale, off the sheet. On the Brackenhurst plan at
    // 1:1500 that was 88X2, over the border and simply gone. A coarser scale
    // costs a little room; a beacon off the margin costs the surveyor the
    // point, and nothing on the sheet reveals it.
    const { dxf } = generateWorkingPlan({ ...brackenhurstSpec, scale: 'auto' })
    const lines = dxf.split('\n')
    const read = (kind) => {
      const out = []
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i] !== '0' || lines[i + 1] !== kind) continue
        let j = i + 2; const d = {}
        while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
        out.push(d)
      }
      return out
    }
    const beacons = read('INSERT').map((d) => [+d['10'][0], +d['20'][0]])
    expect(beacons).toHaveLength(brackenhurstSpec.beacons.length)

    // the sheet border, read off the drawing
    let border = null
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i] !== '0' || lines[i + 1] !== 'POLYLINE') continue
      let layer = null
      for (let j = i + 2; j < i + 20; j++) {
        if (lines[j] === '0') break
        if (lines[j] === '8') { layer = lines[j + 1]; break }
      }
      if (layer !== 'SHEET-BORDER') continue
      const v = []
      let inVertex = false
      for (let j = i + 2; j < lines.length - 1; j++) {
        if (lines[j] === '0') {
          if (lines[j + 1] === 'SEQEND') break
          inVertex = lines[j + 1] === 'VERTEX'
        }
        if (inVertex && lines[j] === '10') v.push([+lines[j + 1], +lines[j + 3]])
      }
      border = v
      break
    }
    expect(border).not.toBeNull()
    const bx = border.map((q) => q[0]), by = border.map((q) => q[1])
    const outside = beacons.filter((p) => p[0] < Math.min(...bx) || p[0] > Math.max(...bx)
      || p[1] < Math.min(...by) || p[1] > Math.max(...by))
    expect(outside).toEqual([])
  })

  describe('the coordinate grid', () => {
    /** Cross centres and their label texts, off the sheet. */
    const grid = (dxf) => {
      const lines = dxf.split('\n')
      const pts = [], labels = []
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i] !== '0') continue
        const kind = lines[i + 1]
        if (kind !== 'LINE' && kind !== 'TEXT') continue
        let j = i + 2; const d = {}
        while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
        const layer = (d['8'] || [])[0]
        if (kind === 'LINE' && layer === 'GRID') {
          const x = (+d['10'][0] + +d['11'][0]) / 2, y = (+d['20'][0] + +d['21'][0]) / 2
          if (!pts.some((p) => Math.hypot(p[0] - x, p[1] - y) < 1e-6)) pts.push([x, y])
        }
        if (kind === 'TEXT' && layer === 'GRID-TEXT') labels.push((d['1'] || [''])[0])
      }
      return { pts, labels }
    }

    test('carries at least four ticks at every scale it draws at', () => {
      // A grid is a framework, not a reference point. One cross cannot even
      // show which way the grid runs -- and one is what a 1:1500 sheet had.
      for (const scale of [500, 1000, 1250, 1500, 2000, 2500, 5000]) {
        const { pts, labels } = grid(generateWorkingPlan({ ...brackenhurstSpec, scale }).dxf)
        expect([scale, pts.length >= 4]).toEqual([scale, true])
        expect(labels).toHaveLength(pts.length * 2)      // an X and a Y for each
      }
    })

    test('spreads them across the figure rather than clustering', () => {
      // Four in one corner would satisfy a count and help nobody: a reader
      // interpolates BETWEEN ticks, so they have to span the drawing.
      for (const scale of [1000, 1500]) {
        const { pts } = grid(generateWorkingPlan({ ...brackenhurstSpec, scale }).dxf)
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
        const cx = (Math.max(...xs) + Math.min(...xs)) / 2
        const cy = (Math.max(...ys) + Math.min(...ys)) / 2
        const quadrants = new Set(pts.map((p) => `${p[0] < cx ? 'L' : 'R'}${p[1] < cy ? 'B' : 'T'}`))
        expect([scale, quadrants.size]).toEqual([scale, 4])
      }
    })

    test('finds them with a finer interval, never by drawing over the figure', () => {
      // The count must come from MORE CANDIDATES, not a weaker clearance: a
      // tick sitting on the boundary it references would be worse than a
      // missing one.
      const { pts } = grid(generateWorkingPlan({ ...brackenhurstSpec, scale: 1500 }).dxf)
      const ring = brackenhurstSpec.parcels.flatMap((p) => p.ring.map((n) => {
        const b = brackenhurstSpec.beacons.find((x) => x.name === n)
        return [-b.Y, -b.X]
      }))
      const segs = brackenhurstSpec.parcels.flatMap((p) => p.ring.map((n, i) => {
        const at = (k) => {
          const b = brackenhurstSpec.beacons.find((x) => x.name === p.ring[k])
          return [-b.Y, -b.X]
        }
        return [at(i), at((i + 1) % p.ring.length)]
      }))
      void ring
      const dist = (p, a, b) => {
        const vx = b[0] - a[0], vy = b[1] - a[1]
        const L2 = vx * vx + vy * vy || 1
        let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2
        t = Math.max(0, Math.min(1, t))
        return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy))
      }
      // 7 mm of paper at 1:1500 is 10.5 ground units -- the clearance the
      // placer applies, unchanged.
      for (const p of pts) {
        expect(Math.min(...segs.map((sg) => dist(p, sg[0], sg[1])))).toBeGreaterThan(10.5)
      }
    })

    test('keeps the ticks far enough apart to read as a framework', () => {
      for (const scale of [500, 1000, 1500, 2000, 5000]) {
        const r = generateWorkingPlan({ ...brackenhurstSpec, scale })
        expect([scale, (r.gridInterval.e / scale) * 1000 >= 15]).toEqual([scale, true])
      }
    })

    test('honours an interval it is given, without hunting for a better one', () => {
      const r = generateWorkingPlan({ ...brackenhurstSpec, scale: 1500, gridInterval: 200 })
      expect(r.gridInterval).toEqual({ e: 200, n: 200 })
    })
  })

  describe('paper and scale', () => {
    test('is drawn on ISO A4, the paper a surveyor carries', () => {
      expect(SHEET).toEqual({ width: 297, height: 210 })
      const r = generateWorkingPlan(brackenhurstSpec)
      expect([r.sheetSize, r.sheetWidthMm, r.sheetHeightMm]).toEqual(['A4', 297, 210])
    })

    test('escalates through the SI 727 prescribed scales, not a list of its own', () => {
      // Reg 32(2)'s scales, from the shared table every other plan type already
      // resolves against. This used to be a hand-written subset missing 1:150,
      // 1:300, 1:400, 1:600, 1:750, 1:1500 and 1:3000, so a figure needing
      // 1:1300 was drawn at 1:2000 where the regulation offers 1:1500 --
      // coarser than the law allows, off a list nobody meant as law.
      const B = (name, X, Y) => ({ name, X, Y, symbol: 'placed', label: 'auto' })
      const at = (m) => generateWorkingPlan({
        scale: 'auto',
        beacons: [B('Q1', 2144000, -85700), B('Q2', 2144000 + m, -85700),
          B('Q3', 2144000 + m, -85700 + m), B('Q4', 2144000, -85700 + m)],
        parcels: [{ label: '404', ring: ['Q1', 'Q2', 'Q3', 'Q4'] }],
        title: ['WORKING PLAN OF', 'Stand 404'],
      }).scale

      // every scale it can choose is one the regulation prescribes
      for (const m of [20, 50, 100, 200, 400, 800, 1600]) {
        expect(SI727_SCALE_LADDER).toContain(at(m))
      }
      // and it escalates: more ground, a coarser scale, never finer
      const ladder = [20, 50, 100, 200, 400, 800, 1600].map(at)
      for (let i = 1; i < ladder.length; i++) {
        expect(ladder[i]).toBeGreaterThanOrEqual(ladder[i - 1])
      }
    })

    test('reaches a prescribed scale the old list could not offer', () => {
      // A figure that needs finer than 1:2000 but coarser than 1:1250 now gets
      // 1:1500, which the hand-written list did not contain at all.
      const B = (name, X, Y) => ({ name, X, Y, symbol: 'placed', label: 'auto' })
      const m = 180                                  // 180 m across a 146 mm panel
      const r = generateWorkingPlan({
        scale: 'auto',
        beacons: [B('Q1', 2144000, -85700), B('Q2', 2144000 + m, -85700),
          B('Q3', 2144000 + m, -85700 + m), B('Q4', 2144000, -85700 + m)],
        parcels: [{ label: '404', ring: ['Q1', 'Q2', 'Q3', 'Q4'] }],
        title: ['WORKING PLAN OF', 'Stand 404'],
      })
      expect(SI727_SCALE_LADDER).toContain(r.scale)
      expect(r.scale).toBe(1500)
    })

    test('takes the finest prescribed scale that fits, not merely one that does', () => {
      const B = (name, X, Y) => ({ name, X, Y, symbol: 'placed', label: 'auto' })
      const m = 180
      const spec = {
        scale: 'auto',
        beacons: [B('Q1', 2144000, -85700), B('Q2', 2144000 + m, -85700),
          B('Q3', 2144000 + m, -85700 + m), B('Q4', 2144000, -85700 + m)],
        parcels: [{ label: '404', ring: ['Q1', 'Q2', 'Q3', 'Q4'] }],
        title: ['WORKING PLAN OF', 'Stand 404'],
      }
      const chosen = generateWorkingPlan(spec).scale
      const panel = Math.min(LAYOUT.panel.x1 - LAYOUT.panel.x0,
        LAYOUT.panel.y1 - LAYOUT.panel.y0)
      // paper millimetres the figure occupies at a scale, with the placer's
      // own 15% breathing room
      const drawn = (sc) => (m * 1000 * 1.15) / sc
      expect(drawn(chosen)).toBeLessThanOrEqual(panel)

      const finer = SI727_SCALE_LADDER.filter((sc) => sc < chosen).pop()
      expect(drawn(finer)).toBeGreaterThan(panel)     // the next one over-runs
    })
  })

  test('picks a scale itself when asked to', () => {
    const out = generateWorkingPlan({ ...brackenhurstSpec, scale: 'auto' })
    expect(typeof out.scale).toBe('number')
    expect(out.scale).toBeGreaterThan(0)
  })
})
