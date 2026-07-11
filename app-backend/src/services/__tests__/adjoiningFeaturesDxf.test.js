import { jest } from '@jest/globals'
import { emitSubjectAdjoiningFeaturesDxf } from '../adjoiningFeaturesDxf.js'

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

  it('contiguous: two outward stubs + horizontal label', () => {
    const r = recorder()
    emitSubjectAdjoiningFeaturesDxf({
      ...r, ptRing: square, geo, servitudeLayer: 'ADJ_S', defaultLayer: 'ADJ',
      annotations: [{ side: 'CD', role: 'contiguous', label: 'STAND 500' }],
    })
    expect(r.lines).toHaveLength(2)
    expect(r.lines.every((l) => l.layer === 'ADJ')).toBe(true)
    expect(r.texts[0].text).toBe('STAND 500')
    expect(r.texts[0].rotation).toBe(0) // horizontal
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
