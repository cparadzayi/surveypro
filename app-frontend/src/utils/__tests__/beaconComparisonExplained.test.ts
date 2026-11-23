/**
 * The Beacon Comparison's comparison of co-ordinates, judged only by what SI 727 states: s.67(5) asks for the
 * schedule and sets no co-ordinate limit; Second Schedule para 7(5) limits the distance between two beacons.
 * The section explains it in plain steps, prints the para 7(5) line check, and draws its conclusion from it --
 * even for a comparison saved under the old rule (a 0.079 m "co-ordinate limit" and a 1.25 x median cut).
 */
import { describe, it, expect } from 'vitest'
import { jsPDF } from 'jspdf'
import {
  coordsComparisonExplanation, renderBeaconComparison, isCoordinateComparison, comparisonClass, comparisonMethodAnnexurePDF,
  type BeaconComparisonCursor,
} from '../beaconComparisonSection'

const OLD_SAVED = 'SI 727 §67(5) co-ordinate comparison — class B, co-ordinate limit ±0.0793 m (95% 2-D), '
  + 'two-gate consistency verdict (reject only when Δ/limit > 1.25 × network median and Δ/limit > 1)'

// Brackenhurst's saved comparison (9 found beacons): previous and survey co-ordinates.
const BRACKENHURST: [string, number, number, number, number][] = [
  ['86B', -85728.77, 2143972.22, -85728.7, 2143972.14],
  ['86C', -85633.12, 2144068.03, -85633.03, 2144068.0],
  ['87A', -85809.7, 2144070.83, -85809.64, 2144070.74],
  ['87B', -85741.48, 2143988.66, -85741.41, 2143988.59],
  ['87C', -85816.23, 2144078.31, -85816.24, 2144078.19],
  ['87D', -85730.03, 2144164.78, -85729.99, 2144164.8],
  ['88X2', -85828.08, 2144262.67, -85827.98, 2144262.64],
  ['RM16', -85623.8, 2144100.63, -85623.73, 2144100.56],
  ['RM7', -85905.9, 2144178.63, -85905.84, 2144178.57],
]
const beacons = (rows = BRACKENHURST) => rows.map(([beaconId, yH, xH, yS, xS]) => ({
  beaconId, status: 'found',
  originalData: { coordinates: { y: yH, x: xH } },
  currentCoordinates: { y: yS, x: xS },
  discrepancy: { dy: yS - yH, dx: xS - xH },
}))

function render(rows = BRACKENHURST, comparison: any = { method: 'tabulation', currentSRNumber: 'This Survey', adjustmentSummary: OLD_SAVED, conclusion: 'saved conclusion' }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const lines: number[] = []
  const texts: { s: string; y: number }[] = []
  const line = doc.line.bind(doc)
  const text = doc.text.bind(doc)
  ;(doc as any).line = (x1: number, y1: number, x2: number, y2: number) => { lines.push(y1); return line(x1, y1, x2, y2) }
  ;(doc as any).text = (s: any, x: number, y: number, o?: any) => { [].concat(s).forEach((t: any) => texts.push({ s: String(t), y })); return text(s, x, y, o) }
  const cursor: BeaconComparisonCursor = { doc, margin: 20, lineHeight: 6, pageWidth: 210, pageHeight: 297, y: 30 }
  renderBeaconComparison(cursor, { beacons: beacons(rows), beaconComparison: comparison } as any)
  return { lines, texts, all: texts.map((t) => t.s).join('\n') }
}

describe('which comparisons are comparisons of co-ordinates', () => {
  it('reads the saved check, or an older save by its summary', () => {
    expect(isCoordinateComparison({ checkMethod: 'coords' })).toBe(true)
    // The edge check decides by para 7(5) too (Nov 2026), so its saves print the para 7(5) verdict.
    expect(isCoordinateComparison({ checkMethod: 'edges', adjustmentSummary: OLD_SAVED })).toBe(true)
    expect(isCoordinateComparison({ checkMethod: 'wtest', adjustmentSummary: OLD_SAVED })).toBe(false)
    expect(isCoordinateComparison({ adjustmentSummary: OLD_SAVED })).toBe(true)
    expect(isCoordinateComparison({ adjustmentSummary: '4-parameter Helmert least-squares' })).toBe(false)
    expect(comparisonClass({ adjustmentSummary: OLD_SAVED })).toBe('B')
    expect(comparisonClass({ surveyClass: 'C' })).toBe('C')
  })
})

describe('the explanation', () => {
  it('states para 7(5) with the class K and no co-ordinate limit, in characters the PDF font can print', () => {
    const e = coordsComparisonExplanation('B')
    const all = [e.heading, ...e.steps].join(' ')
    expect(all).toContain('0,04 x square root of (0,075f + 0,000 15f squared)')
    expect(all).toContain('Section 67(5) sets no limit on dY and dX')
    expect(all).not.toMatch(/0\.079|1\.25|median|95/)
    for (const s of [e.heading, ...e.steps]) expect(s).toMatch(/^[\x20-\x7E]*$/)
    expect(coordsComparisonExplanation('C').steps.join(' ')).toContain('0,06 x square root')
  })
})

describe('the section, on Brackenhurst', () => {
  it('prints all 36 lines within para 7(5), adopts every beacon, and keeps no trace of the old limit', () => {
    const { all } = render()
    expect(all).toContain('How the found beacons were checked')
    expect(all).toContain('Second Schedule para 7(5), class B: distances between the found beacons')
    expect(all).toContain('36 of 36 lines within the limit; no beacon set aside.')
    expect(all).toContain('From the above comparison, I adopt the positions of all found beacons.')
    expect(all).not.toContain('saved conclusion')
    expect(all).not.toMatch(/0\.0793|two-gate|network median/)
    // the common shift, for information
    expect(all).toMatch(/sits \+0\.061 m in Y and -0\.059 m in X/)
  })

  it('adds the Residual column and keeps the first row clear of the rule under the header', () => {
    const { lines, texts } = render()
    expect(texts.some((t) => t.s === 'Residual (m)')).toBe(true)
    const firstRow = texts.find((t) => t.s === '86B')!
    const rule = Math.max(...lines.filter((y) => y < firstRow.y))
    expect(firstRow.y - rule).toBeGreaterThanOrEqual(4)
  })

  it('sets aside a beacon moved 0.3 m and names it in the conclusion', () => {
    const moved = BRACKENHURST.map((r) => (r[0] === '87C' ? [r[0], r[1], r[2], r[3] + 0.3, r[4]] : r)) as typeof BRACKENHURST
    const all = render(moved).all.replace(/\s+/g, ' ')   // the conclusion is wrapped across printed lines
    expect(all).toContain('set aside: 87C.')
    expect(all).toContain('except 87C, whose distances to the other beacons do not agree with the original data within SI 727 Second Schedule para 7(5).')
  })

  it('leaves another method as it was saved', () => {
    const { all } = render(BRACKENHURST, { method: 'tabulation', adjustmentSummary: '4-parameter Helmert least-squares', conclusion: 'saved conclusion' })
    expect(all).toContain('4-parameter Helmert least-squares')
    expect(all).toContain('saved conclusion')
    expect(all).not.toContain('Second Schedule para 7(5), class')
  })
})

describe('the method as an annexure of the record', () => {
  it('the section points to the annexure instead of setting out the steps', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const texts: string[] = []
    const text = doc.text.bind(doc)
    ;(doc as any).text = (s: any, x: number, y: number, o?: any) => { [].concat(s).forEach((t: any) => texts.push(String(t))); return text(s, x, y, o) }
    renderBeaconComparison({ doc, margin: 20, lineHeight: 6, pageWidth: 210, pageHeight: 297, y: 30 },
      { beacons: beacons(), beaconComparison: { method: 'tabulation', adjustmentSummary: OLD_SAVED } } as any,
      { methodInAnnexure: 'Annexure A' })
    const all = texts.join(' ').replace(/\s+/g, ' ')
    expect(all).toContain('see Annexure A at the end of this record')
    expect(all).not.toContain('Section 67(5) sets no limit on dY and dX')
    // the line check and conclusion stay in the section
    expect(all).toContain('36 of 36 lines within the limit')
  })

  it('the annexure carries the heading and every step, on a page of its own', async () => {
    const blob = await comparisonMethodAnnexurePDF({ beacons: beacons(), beaconComparison: { method: 'tabulation', adjustmentSummary: OLD_SAVED } } as any)
    const raw = Buffer.from(new Uint8Array(await blob!.arrayBuffer())).toString('latin1')
    expect(raw).toContain('(ANNEXURE A: METHOD OF THE BEACON COMPARISON) Tj')
    expect(raw).toContain('(1.) Tj')
    expect(raw).toContain('(5.) Tj')
    expect((raw.match(/\/Type \/Page\b/g) || []).length).toBe(1)
  })

  it('there is no annexure for another method', async () => {
    expect(await comparisonMethodAnnexurePDF({ beacons: beacons(), beaconComparison: { method: 'tabulation', adjustmentSummary: '4-parameter Helmert least-squares' } } as any)).toBeNull()
  })
})
