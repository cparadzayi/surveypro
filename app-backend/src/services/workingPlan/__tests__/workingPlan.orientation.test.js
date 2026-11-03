import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan, layoutFor, PRINT_MARGIN_MM, LAYOUT, SHEET } from '../working-plan.js'
import { brackenhurstSpec } from './fixtures/brackenhurstSpec.js'

/**
 * A working plan is A4, landscape or portrait, with its neat line inside the printer's unprintable band.
 * The first measured sheet drew the neat line 0.5 mm in from the edge, which a desktop printer cuts off.
 */
const ORIENTATIONS = {
  landscape: { width: 297, height: 210 },
  portrait: { width: 210, height: 297 },
}

/** The SHEET-BORDER polyline's extent, in ground units. */
function borderExtent(dxf) {
  const lines = dxf.split('\n')
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] !== '0' || lines[i + 1] !== 'POLYLINE') continue
    let layer = null
    for (let j = i + 2; j < i + 20; j++) { if (lines[j] === '0') break; if (lines[j] === '8') { layer = lines[j + 1]; break } }
    if (layer !== 'SHEET-BORDER') continue
    const xs = [], ys = []
    let inVertex = false
    for (let j = i + 2; j < lines.length - 1; j++) {
      if (lines[j] === '0') { if (lines[j + 1] === 'SEQEND') break; inVertex = lines[j + 1] === 'VERTEX' }
      if (inVertex && lines[j] === '10') { xs.push(+lines[j + 1]); ys.push(+lines[j + 3]) }
    }
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  }
  return null
}

describe('working plan sheet', () => {
  test('landscape is the default and the exported SHEET', () => {
    expect(SHEET).toEqual(ORIENTATIONS.landscape)
    const out = generateWorkingPlan(brackenhurstSpec)
    expect([out.orientation, out.sheetWidthMm, out.sheetHeightMm]).toEqual(['landscape', 297, 210])
    expect(layoutFor(undefined).layout).toEqual(LAYOUT)
  })

  for (const [orientation, dims] of Object.entries(ORIENTATIONS)) {
    describe(orientation, () => {
      const out = generateWorkingPlan({ ...brackenhurstSpec, orientation })
      const { layout: L } = layoutFor(orientation)

      test('reports the A4 sheet it was drawn for', () => {
        expect([out.sheetSize, out.orientation, out.sheetWidthMm, out.sheetHeightMm])
          .toEqual(['A4', orientation, dims.width, dims.height])
      })

      test('stands the neat line the printable margin in from every edge', () => {
        const e = borderExtent(out.dxf)
        const k = out.scale / 1000                      // paper mm -> ground m
        expect(e.w / k).toBeCloseTo(dims.width - 2 * PRINT_MARGIN_MM, 2)
        expect(e.h / k).toBeCloseTo(dims.height - 2 * PRINT_MARGIN_MM, 2)
        expect(L.border).toEqual({
          x0: PRINT_MARGIN_MM, y0: PRINT_MARGIN_MM, x1: dims.width - PRINT_MARGIN_MM, y1: dims.height - PRINT_MARGIN_MM,
        })
      })

      test('keeps every block inside the neat line and clear of the others', () => {
        const inside = (r) => r.x0 >= L.border.x0 && r.y0 >= L.border.y0 && r.x1 <= L.border.x1 && r.y1 <= L.border.y1
        const apart = (a, b) => a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0
        const blocks = { panel: L.panel, approval: L.approval.box, inset: L.inset.box }
        for (const [name, r] of Object.entries(blocks)) expect([name, inside(r)]).toEqual([name, true])
        expect(apart(L.panel, L.approval.box)).toBe(true)
        expect(apart(L.panel, L.inset.box)).toBe(true)
        expect(apart(L.approval.box, L.inset.box)).toBe(true)
        // the lettering stands inside too
        expect(L.srNumber.baseline).toBeLessThanOrEqual(L.border.y1)
        expect(L.certificate.line2.baseline).toBeLessThanOrEqual(L.border.y1)
        expect(L.title.baselines[0] - L.text.title * L.text.titleLeadFactor).toBeGreaterThanOrEqual(L.border.y0)
      })

      test('draws the figure at the same scale, with a coordinate grid', () => {
        expect(out.scale).toBe(2000)
        expect(out.gridTicks).toBeGreaterThanOrEqual(4)
      })
    })
  }

  test('portrait puts the title above the drawing and the drawing above the foot blocks', () => {
    const { layout: L } = layoutFor('portrait')
    expect(L.title.scaleBaseline).toBeLessThan(L.panel.y0)
    expect(L.certificate.line1.baseline).toBeGreaterThan(L.panel.y1)
    expect(L.inset.box.y0).toBeGreaterThan(L.certificate.line2.baseline)
    expect(L.approval.box.y1).toBeLessThanOrEqual(L.srNumber.baseline)
  })

  test('anything but portrait is landscape', () => {
    expect(layoutFor('upside-down').orientation).toBe('landscape')
  })
})
