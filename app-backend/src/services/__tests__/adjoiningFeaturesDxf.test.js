import { jest } from '@jest/globals'
import { emitSubjectAdjoiningFeaturesDxf } from '../adjoiningFeaturesDxf.js'

/** Stubs, not dashes: a dashed stub arrives as several short lines and only the
 *  first starts at the terminal it springs from. Counting lines counts dashes. */
const stubsAt = (lines, terminals) => lines.filter(
  (l) => terminals.some(([tx, ty]) => Math.hypot(l[0] - tx, l[1] - ty) < 1e-6)).length

/** The square subject's terminals for side 'AB'. */
const A = [0, 0], B = [100, 0]

function recorder() {
  const lines = []
  const texts = []
  return {
    lines,
    texts,
    addLine: (layer, x1, y1, x2, y2) => lines.push({ layer, x1, y1, x2, y2 }),
    addText: (layer, x, y, text, height, rotation) => texts.push({ layer, x, y, text, height, rotation }),
  }
}

// Unit square in DXF ground coords, letters A..D by ring index.
const square = [
  { x: 0, y: 0 },
  { x: 0, y: 10 },
  { x: 10, y: 10 },
  { x: 10, y: 0 },
]
const geo = { textHeight: 1, stubLen: 2, bandLen: 1, standoff: 0.5 }

describe('emitSubjectAdjoiningFeaturesDxf', () => {
  it('road: label only along the edge, no lines', () => {
    const r = recorder()
    emitSubjectAdjoiningFeaturesDxf({
      ...r, ptRing: square, geo, servitudeLayer: 'ADJ_S', defaultLayer: 'ADJ',
      annotations: [{ side: 'AB', role: 'road', label: 'MAIN ROAD', widthM: 12 }],
    })
    expect(r.lines).toHaveLength(0)
    expect(r.texts).toHaveLength(1)
    expect(r.texts[0].text).toBe('MAIN ROAD 12,00m')
    expect(r.texts[0].layer).toBe('ADJ')
    expect(r.texts[0].rotation).not.toBe(0) // reads along the edge
  })

  it('road with a width: label sits midway between the two reserve lines', () => {
    const r = recorder()
    emitSubjectAdjoiningFeaturesDxf({
      ...r, ptRing: square, geo, servitudeLayer: 'ADJ_S', defaultLayer: 'ADJ',
      annotations: [{ side: 'AB', role: 'road', label: 'MAIN ROAD', widthM: 12 }],
    })
    // Side AB runs up x=0; outward is -x, so the centreline is x=-6. The text
    // reads up the edge (90 deg) and its body extends toward -x from the baseline,
    // so the baseline sits just on the +x side of the centreline.
    const t = r.texts[0]
    expect(t.rotation).toBe(90)
    expect(t.x).toBeCloseTo(-6 + 0.35 * t.height, 6)
    // Centred along the edge (the text is ~half as long as the 10-unit side).
    expect(t.y).toBeLessThan(5)
  })

  it('road narrower than the type: the lettering shrinks to fit between the lines', () => {
    const r = recorder()
    emitSubjectAdjoiningFeaturesDxf({
      ...r, ptRing: square, geo, servitudeLayer: 'ADJ_S', defaultLayer: 'ADJ',
      annotations: [{ side: 'AB', role: 'road', label: 'X', widthM: 1 }],
    })
    expect(r.texts[0].height).toBeCloseTo(0.6, 6) // 60% of the 1-unit gap
  })

  it('road: sits midway to the FAR LINE actually drawn, whatever width was typed', () => {
    const r = recorder()
    // Side AB runs up x=0, road outward (-x); the road's far line is drawn at x=-8
    // although the surveyor typed 12.
    emitSubjectAdjoiningFeaturesDxf({
      ...r, ptRing: square, geo, servitudeLayer: 'ADJ_S', defaultLayer: 'ADJ',
      segments: [[[0, -5], [0, 15]], [[-8, -5], [-8, 15]]],
      annotations: [{ side: 'AB', role: 'road', label: 'ROAD', widthM: 12 }],
    })
    const t = r.texts[0]
    expect(t.x).toBeCloseTo(-4 + 0.35 * t.height, 6) // centreline x=-4
  })

  it("contiguous 'mid': no stub lines at all, only the label", () => {
    const r = recorder()
    emitSubjectAdjoiningFeaturesDxf({
      ...r, ptRing: square, geo, servitudeLayer: 'ADJ_S', defaultLayer: 'ADJ',
      annotations: [{ side: 'AB', role: 'contiguous', label: 'STAND 86', end: 'mid' }],
    })
    expect(r.lines).toHaveLength(0)
    expect(r.texts).toHaveLength(1)
    expect(r.texts[0].text).toBe('STAND 86')
  })

  it('servitude: outline quad (4 lines) on the servitude layer + label', () => {
    const r = recorder()
    emitSubjectAdjoiningFeaturesDxf({
      ...r, ptRing: square, geo, servitudeLayer: 'ADJ_S', defaultLayer: 'ADJ',
      annotations: [{ side: 'BC', role: 'servitude', label: 'SEWER', widthM: 3 }],
    })
    expect(r.lines).toHaveLength(4)
    expect(r.lines.every((l) => l.layer === 'ADJ_S')).toBe(true)
    expect(r.texts[0].text).toBe('SEWER')
    expect(r.texts[0].layer).toBe('ADJ_S')
  })

  it('contiguous: two outward stubs + label reading along the edge', () => {
    const r = recorder()
    emitSubjectAdjoiningFeaturesDxf({
      ...r, ptRing: square, geo, servitudeLayer: 'ADJ_S', defaultLayer: 'ADJ',
      annotations: [{ side: 'CD', role: 'contiguous', label: 'STAND 500' }],
    })
    // A stub is dashed, so it arrives as several short lines; only the first of
    // each sits on the terminal it springs from.
    const atTerminal = r.lines.filter((l) =>
      (l.x1 === 10 && l.y1 === 10) || (l.x1 === 10 && l.y1 === 0))
    expect(atTerminal).toHaveLength(2)
    expect(r.lines.length).toBeGreaterThan(2)          // and each one is dashed
    expect(r.lines.every((l) => l.layer === 'ADJ')).toBe(true)
    expect(r.texts[0].text).toBe('STAND 500')
    expect(r.texts[0].rotation).not.toBe(0) // reads along the edge, like road/servitude
  })

  it('unresolved side warns and draws nothing', () => {
    const r = recorder()
    const warn = jest.fn()
    emitSubjectAdjoiningFeaturesDxf({
      ...r, ptRing: square, geo, servitudeLayer: 'ADJ_S', defaultLayer: 'ADJ',
      annotations: [{ side: 'AC', role: 'road', label: 'X' }],
    }, { warn })
    expect(warn).toHaveBeenCalled()
    expect(r.lines).toHaveLength(0)
    expect(r.texts).toHaveLength(0)
  })
})

const ring = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
const geo2 = { textHeight: 2, stubLen: 3, bandLen: 2, standoff: 1 }

function collect(annotations) {
  const lines = [], texts = []
  emitSubjectAdjoiningFeaturesDxf({
    addLine: (layer, x1, y1, x2, y2) => lines.push([x1, y1, x2, y2]),
    addText: (layer, x, y, t) => texts.push([x, y, t]),
    ptRing: ring, annotations, geo: geo2,
    servitudeLayer: 'SERV', defaultLayer: 'DEF',
  })
  return { lines, texts }
}

describe('emitSubjectAdjoiningFeaturesDxf — contiguous terminal offsets', () => {
  test("end:'both' emits two stub lines", () => {
    expect(stubsAt(collect([{ side: 'AB', role: 'contiguous', label: 'N', end: 'both' }]).lines,
      [A, B])).toBe(2)
  })
  test('missing end emits two stub lines (back-compat)', () => {
    expect(stubsAt(collect([{ side: 'AB', role: 'contiguous', label: 'N' }]).lines,
      [A, B])).toBe(2)
  })
  test("end:'from' emits one stub line from terminal A", () => {
    const { lines } = collect([{ side: 'AB', role: 'contiguous', label: 'N', end: 'from' }])
    expect(stubsAt(lines, [A])).toBe(1)
    expect(stubsAt(lines, [B])).toBe(0)
    expect(lines[0].slice(0, 2)).toEqual([0, 0])
  })
  test("end:'to' emits one stub line from terminal B", () => {
    const { lines } = collect([{ side: 'AB', role: 'contiguous', label: 'N', end: 'to' }])
    expect(stubsAt(lines, [B])).toBe(1)
    expect(stubsAt(lines, [A])).toBe(0)
    expect(lines[0].slice(0, 2)).toEqual([100, 0])
  })
})
