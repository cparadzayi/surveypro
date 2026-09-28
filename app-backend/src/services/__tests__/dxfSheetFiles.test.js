/**
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfSheetFiles
 *
 * generateSheetedDXF renders one DXF per SheetPayload (task 5 of the
 * multi-sheet-rendering plan). Spec Part 1: in PDF the plan is one document with
 * a page per sheet; in DXF each sheet is its own file.
 *
 * The DXF generator already takes `sheetInfo` and already draws a "SHEET N" line
 * from it (formatSheetLabel, dxfGenerator.js:130), so this is about invoking it
 * once per payload and naming the files -- not about its drawing code.
 */
import { describe, test, expect } from '@jest/globals'
import { generateSheetedDXF } from '../dxfGenerator.js'

const P = (y, x) => ({ y, x })
const box = (y0, x0, y1, x1) => [P(y0, x0), P(y1, x0), P(y1, x1), P(y0, x1)]

/** The group-code-1 strings: every TEXT value in the file, in order. */
const dxfText = (dxf) => [...dxf.matchAll(/\n  1\n([^\n]*)\n/g)].map((m) => m[1])

/**
 * Edges as a payload carries them, so the sheet HAS a beacon sequence and the
 * title block actually states a figure — an empty `edges` array silently omits
 * the figure description, which would make any assertion about its wording
 * vacuous.
 */
const edges = (x0) => [
  { pointId: 'A', y: x0, x: 0 },
  { pointId: 'B', y: x0 + 50, x: 0 },
  { pointId: 'C', y: x0 + 50, x: 100 },
  { pointId: 'D', y: x0, x: 100 },
]

const sheet = (n, total, stands) => ({
  sheetNumber: n, totalSheets: total,
  figureLabel: total > 1 ? `Outside Figure Sheet ${n}` : 'Outside Figure',
  otherSheets: total > 1 ? `Sheet ${3 - n}` : '',
  ring: [P(0, 0), P(100, 0), P(100, 100), P(0, 100)],
  stands,
  parcels: stands.map((name, i) => ({ name, ring: box(10 + 40 * i, 10, 40 + 40 * i, 40), area_m2: 1000 })),
  vertices: [], edges: edges(n === 1 ? 0 : 500), constants: { pointId: 'A', y: 0, x: 0 },
  servitudeRows: [], standRange: '1686 to 1687', totalStandCount: 2, newPoints: [],
})

const metadata = { township: 'borrowdale', district: 'harare', designation: 'Stands 1686 to 1687' }

describe('generateSheetedDXF', () => {
  test('one file per sheet, numbered in the filename', () => {
    const out = generateSheetedDXF({ sheets: [sheet(1, 2, ['1686']), sheet(2, 2, ['1687'])] })
    expect(out).toHaveLength(2)
    expect(out[0].filename).toMatch(/-sheet-1-of-2\.dxf$/)
    expect(out[1].filename).toMatch(/-sheet-2-of-2\.dxf$/)
  })

  test('a single-sheet plan keeps its plain filename', () => {
    const out = generateSheetedDXF({ sheets: [sheet(1, 1, ['1686'])] })
    expect(out).toHaveLength(1)
    expect(out[0].filename).not.toMatch(/sheet/i)
  })

  test('each file carries its own sheet label and its own stands', () => {
    // The brief asserted `not.toContain('1687')` on the whole file, which is the
    // wrong claim and would forbid the correct behaviour: the Seventh Schedule
    // sentence states what the sheets TOGETHER represent, so the whole plan's
    // stand range belongs on every sheet. What must not leak is another sheet's
    // stand as a row of THIS sheet's schedule -- and in the schedule a stand is
    // its own TEXT entity, whereas in the sentence it is part of a longer line.
    // That distinction is the assertion.
    const out = generateSheetedDXF({
      sheets: [sheet(1, 2, ['1686']), sheet(2, 2, ['1687'])], metadata,
    })
    expect(out[0].dxf).toContain('SHEET 1')
    const ownSheet1 = dxfText(out[0].dxf)
    const ownSheet2 = dxfText(out[1].dxf)
    expect(ownSheet1).toContain('1686')
    expect(ownSheet2).toContain('1687')
    expect(ownSheet1).not.toContain('1687')
    expect(ownSheet2).not.toContain('1686')
    // ...while the range both represent is on both, as the sentence states it.
    expect(ownSheet1.join(' ')).toContain('1686 to 1687')
    expect(ownSheet2.join(' ')).toContain('1686 to 1687')
  })

  test('a single sheet gets no SHEET line at all', () => {
    const out = generateSheetedDXF({ sheets: [sheet(1, 1, ['1686'])] })
    expect(out[0].dxf).not.toContain('SHEET 1')
  })

  test('every file is a complete DXF, not a fragment', () => {
    // A file that parses is a file that draws. Cheap proxy: the section spine of
    // this generator's own output (there is no BLOCKS section -- verified
    // against a single-plan DXF too, so it is the generator's shape and not
    // something the per-sheet path drops), and exactly one end marker -- a
    // truncated second sheet would still contain 'SHEET 2' and still pass the
    // test above.
    const out = generateSheetedDXF({ sheets: [sheet(1, 2, ['1686']), sheet(2, 2, ['1687'])] })
    for (const file of out) {
      for (const section of ['HEADER', 'TABLES', 'ENTITIES']) {
        expect(file.dxf).toContain(`\n  2\n${section}\n`)
      }
      expect(file.dxf.trimEnd().endsWith('EOF')).toBe(true)
      expect(file.dxf.match(/\n  0\nEOF\n?$/g)).toHaveLength(1)
    }
  })

  test('sheets come back in sheetNumber order whatever order they arrive in', () => {
    const out = generateSheetedDXF({ sheets: [sheet(2, 2, ['1687']), sheet(1, 2, ['1686'])] })
    expect(out.map((f) => f.sheetNumber)).toEqual([1, 2])
  })

  test('refuses an empty sheet list rather than returning nothing', () => {
    expect(() => generateSheetedDXF({ sheets: [] })).toThrow(/sheets/i)
    expect(() => generateSheetedDXF({})).toThrow(/sheets/i)
  })

  test('the Seventh Schedule sentence reaches the file, naming the other sheet', () => {
    // A sheeted DXF must be described by the multi-sheet template: it says what
    // THIS sheet's figure is and which sheet it is read with, and what the two
    // together represent. The DXF only had the single-sheet template before
    // task 5, so it would have described one part as if it were the survey.
    //
    // Asserted on the joined TEXT values, because splitToWidth wraps the sentence
    // over several lines -- but only ever at a space, so joining the runs with a
    // single space puts it back together exactly.
    const out = generateSheetedDXF({
      sheets: [sheet(1, 2, ['1686']), sheet(2, 2, ['1687'])], metadata,
    })
    expect(dxfText(out[0].dxf).join(' ')).toContain('together with the figures on Sheet 2')
    expect(dxfText(out[1].dxf).join(' ')).toContain('together with the figures on Sheet 1')
    // ...and the whole plan's count and range, not the one stand on the sheet.
    expect(dxfText(out[0].dxf).join(' ')).toContain('2 stands numbered 1686 to 1687')
  })

  test('a single sheet states the plain single-sheet sentence', () => {
    // otherSheets is '' here, and the multi-sheet template would read "the
    // figures on , represents" -- lodged as written.
    const out = generateSheetedDXF({ sheets: [sheet(1, 1, ['1686'])], metadata })
    const said = dxfText(out[0].dxf).join(' ')
    expect(said).toContain('The figure A.B.C.D.A represents')
    expect(said).not.toContain('the figures on')
  })
})
