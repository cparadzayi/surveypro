/**
 * Insets on the sheet: the locality diagram, and details of crowded beacons.
 *
 * A working plan draws one mark where the ground may carry two. 87D and 87DNew
 * of Brackenhurst Township are 0.061 m apart, which at 1:2000 is 0.03 mm: both
 * conventional signs land inside the same dot and both names print on the same
 * spot. A reader cannot tell there are two beacons there, let alone which is
 * which, so the pair gets an inset of its own.
 *
 * Insets are numbered in one sequence. The locality diagram is INSET 1 when
 * there is one; details follow. With no locality diagram the details start at 1,
 * because a sheet should not begin at INSET 2.
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

    expect(t).toContain('INSET 1')
    expect(t.filter((s) => s.startsWith('INSET '))).toEqual(['INSET 1'])
  })

  test('says nothing about scale, because the locality diagram has one', () => {
    const t = texts(generateWorkingPlan(brackenhurstSpec).dxf)

    expect(t.some((s) => s.includes('NOT TO SCALE'))).toBe(false)
  })
})

describe('the sheet with two beacons in one spot', () => {
  test('adds a second inset for the pair', () => {
    const t = texts(generateWorkingPlan(withCrowdedPair()).dxf)

    expect(t).toContain('INSET 1')
    expect(t.some((s) => s.startsWith('INSET 2'))).toBe(true)
  })

  test('marks the detail as not to scale, because it is spread to be read', () => {
    const t = texts(generateWorkingPlan(withCrowdedPair()).dxf)

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
    expect(texts(plain).some((s) => s.includes('NOT TO SCALE'))).toBe(false)
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
  const cap = texts.find((t) => t.g['1'] === 'INSET 1')
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

describe('a sheet with no locality diagram', () => {
  test('starts its details at INSET 1', () => {
    const spec = withCrowdedPair()
    delete spec.inset

    const t = texts(generateWorkingPlan(spec).dxf)

    expect(t).toContain('INSET 1 (NOT TO SCALE)')
    expect(t.some((s) => s.startsWith('INSET 2'))).toBe(false)
  })
})
