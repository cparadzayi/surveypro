/**
 * A control point's monument NAME lettered on the sheet.
 *
 * SI 727 working plans name the mark as well as designate it: the code "170/P"
 * sits ABOVE the trig triangle, and the monument name "Mnyami" sits centred
 * BELOW it. The spec may carry the monument name on a control point
 * (symbols `trig` and `ocp`) as `cpName`. The renderer draws the designation
 * above and the monument name below -- on the figure under the beacon,
 * and in the locality inset the same way. Both cleared of the sign by 0.5 mm.
 */

import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan, LAYOUT } from '../working-plan.js'
import { brackenhurstSpec } from './fixtures/brackenhurstSpec.js'

/** TEXT entities parsed from the DXF, as { text, layer, x, y, h, align }. */
function texts(dxf) {
  const lines = dxf.split(/\r?\n/)
  const out = []
  for (let i = 0; i + 1 < lines.length; i++) {
    if (lines[i] !== '0' || lines[i + 1] !== 'TEXT') continue
    let j = i + 2
    const d = {}
    while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
    out.push({
      text: (d['1'] || [''])[0],
      layer: (d['8'] || [''])[0],
      x: +(d['10'] || [NaN])[0],
      y: +(d['20'] || [NaN])[0],
      h: +(d['40'] || [NaN])[0],
      align: (d['72'] || ['0'])[0],
    })
  }
  return out
}

/** The fixture with one trig beacon added to the figure, carrying its name. */
function withFigureTrig(symbol = 'trig') {
  const spec = structuredClone(brackenhurstSpec)
  spec.beacons.push({
    name: '170/P', X: 2144098.0, Y: -85726.0,
    symbol, label: 'E', cpName: 'MNYAMI',
  })
  return spec
}

describe('control point names — the figure', () => {
  test('letters the monument name centred below the trig triangle', () => {
    const out = generateWorkingPlan(withFigureTrig())
    const t = texts(out.dxf).find((e) => e.layer === 'BEACON-TEXT' && e.text === 'MNYAMI')

    expect(t).toBeDefined()
    expect(t.align).toBe('1')                      // centred
    expect(t.h).toBeCloseTo(LAYOUT.text.beacon * out.scale / 1000, 6)   // same rank as a beacon name

    // Beacon at X=2144098 (southing), Y=-85726 (westing): the sheet draws
    // easting = -Y, northing = -X, so the sign sits at (85726, -2144098).
    // The name baseline clears the triangle's base -- trigH*0.38 below centre --
    // a 0.6 mm gap, then the letter height.
    const down = LAYOUT.symbol.trigH * 0.38 * out.scale / 1000
      + 0.6 * out.scale / 1000 + LAYOUT.text.beacon * out.scale / 1000
    expect(t.x).toBeCloseTo(85726, 6)
    expect(t.y).toBeCloseTo(-2144098 - down, 6)
  })

  test('lowers the name past an inverted official control point', () => {
    // The OCP triangle points DOWN, so its apex -- trigH*0.62 below centre --
    // reaches further than the trig's base. The name starts below whichever
    // part the sign presents to the south.
    const trig = generateWorkingPlan(withFigureTrig('trig'))
    const ocp = generateWorkingPlan(withFigureTrig('ocp'))
    const fromDoubles = (dxf, text) => texts(dxf).find((e) => e.layer === 'BEACON-TEXT' && e.text === text)

    const trigName = fromDoubles(trig.dxf, 'MNYAMI')
    const ocpName = fromDoubles(ocp.dxf, 'MNYAMI')
    expect(ocpName.y).toBeLessThan(trigName.y)
    expect(trigName.x).toBe(ocpName.x)
  })

  test('leaves the sheet exactly as it was when no control point is named', () => {
    // `cpName` is optional; every plan already in the wild carries none, and an
    // absent field must not move a single token of the output.
    const out = generateWorkingPlan(brackenhurstSpec)
    expect(texts(out.dxf).some((e) => e.layer === 'BEACON-TEXT' && e.text === 'MNYAMI')).toBe(false)
  })
})

describe('control point names — the locality inset', () => {
  function withInsetName(name = '170/T', cpName = 'MNYAMI') {
    const spec = structuredClone(brackenhurstSpec)
    spec.inset.beacons = spec.inset.beacons.map((b) =>
      b.name === name ? (cpName ? { ...b, cpName } : b) : b)
    return spec
  }

  /** The drawn extent of a beacon's sign at inset column `x`:
   *  returns { top, bottom } -- highest and lowest northing of the sign.
   *  Reads SOLID fills (trig/ocp) and round POLYLINEs (rm, etc.). */
  function signExtent(dxf, x) {
    const lines = dxf.split(/\r?\n/)
    let lo = null, hi = null
    const absorb = (g) => {
      const cx = (Math.min(...g.map((q) => q[0])) + Math.max(...g.map((q) => q[0]))) / 2
      if (Math.abs(cx - x) > 2.5) return
      lo = Math.min(lo ?? Infinity, ...g.map((q) => q[1]))
      hi = Math.max(hi ?? -Infinity, ...g.map((q) => q[1]))
    }
    for (let i = 0; i + 1 < lines.length; i++) {
      if (lines[i] !== '0' || lines[i + 1] !== 'SOLID') continue
      let j = i + 2; const d = {}
      while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
      if ((d['8'] || [''])[0] !== 'INSET') continue
      absorb([['10', '20'], ['11', '21'], ['12', '22'], ['13', '23']]
        .map(([gx, gy]) => [+d[gx][0], +d[gy][0]])
        .filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1])))
    }
    // Reference marks are drawn as rings around the centre, not fills: step
    // each INSET polyline, keep only the round ones (12+ vertices means a
    // circle, not the frame), and let their vertices compete.
    for (let i = 0; i + 1 < lines.length; i++) {
      if (lines[i] !== '0' || lines[i + 1] !== 'POLYLINE') continue
      let layer = null
      for (let j = i + 2; j < i + 20 && j < lines.length - 1; j++) {
        if (lines[j] === '0') break
        if (lines[j] === '8') { layer = lines[j + 1]; break }
      }
      if (layer !== 'INSET') continue
      const v = []
      let inVertex = false
      for (let j = i + 2; j < lines.length - 1; j++) {
        if (lines[j] === '0') {
          if (lines[j + 1] === 'SEQEND') break
          inVertex = lines[j + 1] === 'VERTEX'
        }
        if (inVertex && lines[j] === '10') v.push([+lines[j + 1], +lines[j + 3]])
      }
      if (v.length >= 12) absorb(v)
    }
    return { top: hi, bottom: lo }
  }

  test('letters the designation above the symbol, the monument name below', () => {
    const out = generateWorkingPlan(withInsetName())
    const insetTexts = texts(out.dxf).filter((e) => e.layer === 'INSET')

    const designation = insetTexts.find((e) => e.text === '170/T')
    const name = insetTexts.find((e) => e.text === 'MNYAMI')
    expect(designation).toBeDefined()
    expect(name).toBeDefined()
    expect(name.x).toBe(designation.x)          // both centred on the mark

    const mm = out.scale / 1000
    const h = LAYOUT.text.insetLabel * mm

    // The designation baseline clears the trig's apex (top of sign) by 0.5 mm.
    // The monument name's glyph top clears the trig's base (bottom of sign) by 0.5 mm.
    const { top, bottom } = signExtent(out.dxf, designation.x)
    expect(top).not.toBeNull()
    expect(bottom).not.toBeNull()

    expect(designation.y).toBeCloseTo(top + 0.5 * mm, 4)      // designation baseline
    const nameGlyphTop = name.y + h
    expect(nameGlyphTop).toBeCloseTo(bottom - 0.5 * mm, 4)    // name sits below

    // The name is BELOW the designation on the sheet (smaller northing).
    expect(name.y).toBeLessThan(designation.y)
  })

  test('letters the OCP designation above its inverted triangle', () => {
    // OCP triangle points down: its top is the flat base (trigH*0.38 above centre),
    // its bottom is the apex (trigH*0.62 below centre). The designation still reads above.
    const spec = structuredClone(brackenhurstSpec)
    // Inject an OCP into the locality inset (pick the first beacon there)
    const localName = spec.inset.beacons[0]?.name
    spec.inset.beacons = spec.inset.beacons.map((b) =>
      b.name === localName ? { ...b, symbol: 'ocp', cpName: 'MNYAMI' } : b)
    const out = generateWorkingPlan(spec)
    const insetTexts = texts(out.dxf).filter((e) => e.layer === 'INSET')
    const designation = insetTexts.find((e) => e.text === localName)
    const name = insetTexts.find((e) => e.text === 'MNYAMI')
    expect(designation).toBeDefined()
    expect(name).toBeDefined()

    const mm = out.scale / 1000
    const h = LAYOUT.text.insetLabel * mm
    const { top, bottom } = signExtent(out.dxf, designation.x)
    expect(top).not.toBeNull()
    expect(bottom).not.toBeNull()

    // OCP top is its flat base; designation baseline clears it by 0.5 mm.
    expect(designation.y).toBeCloseTo(top + 0.5 * mm, 4)
    // Name below clears the apex (bottom) by 0.5 mm.
    const nameGlyphTop = name.y + h
    expect(nameGlyphTop).toBeCloseTo(bottom - 0.5 * mm, 4)
    expect(name.y).toBeLessThan(designation.y)
  })

  test('letters a plain mark\'s designation ABOVE its sign', () => {
    // Every inset beacon is named ABOVE its symbol, cleared by the same half-millimetre.
    // RM7 is a reference mark -- a ring with cross arms reaching 1.2 mm above centre.
    // The designation baseline clears the arms' top by 0.5 mm.
    // signExtent reads the ring (POLYLINE) top = iRing (0.85 mm), not the LINE arms.
    // So the measured gap = 1.2 - 0.85 + 0.5 = 0.85 mm above the ring top.
    const out = generateWorkingPlan(brackenhurstSpec)
    const insetTexts = texts(out.dxf).filter((e) => e.layer === 'INSET')
    const rm = insetTexts.find((e) => e.text === 'RM7')
    expect(rm).toBeDefined()

    const mm = out.scale / 1000
    const { top } = signExtent(out.dxf, rm.x)
    expect(top).not.toBeNull()

    expect(rm.y).toBeCloseTo(top + 0.85 * mm, 4)
  })

  test('draws nothing extra for a control point with no registry name', () => {
    const out = generateWorkingPlan(brackenhurstSpec)
    const insetTexts = texts(out.dxf).filter((e) => e.layer === 'INSET')
    expect(insetTexts.some((e) => e.text === 'MNYAMI')).toBe(false)
  })
})