/**
 * Layer 1 unit tests for the Schedule of Areas helpers.
 * Run with:  cd app-backend && npm run test -- dxfGenerator.scheduleOfAreas
 */
import { describe, test, expect } from '@jest/globals'
import { nextLargerSheet, extractScheduleRow, computeScheduleLayout, addScheduleTable } from '../dxfGenerator.js'

describe('nextLargerSheet', () => {
  test.each([
    ['ISO_A2', 'ISO_A1'],
    ['ISO_A1', 'ISO_A0'],
    ['ISO_A0', 'multi-sheet-required'],
  ])('%s → %s', (input, expected) => {
    expect(nextLargerSheet(input)).toBe(expected)
  })

  test('unknown sheet size → "multi-sheet-required" (defensive)', () => {
    expect(nextLargerSheet('ISO_A4')).toBe('multi-sheet-required')
    expect(nextLargerSheet('unknown')).toBe('multi-sheet-required')
    expect(nextLargerSheet(null)).toBe('multi-sheet-required')
    expect(nextLargerSheet(undefined)).toBe('multi-sheet-required')
  })
})

describe('extractScheduleRow', () => {
  test('happy path — all properties populated → all six string fields', () => {
    const f = { properties: {
      stand: '123', area_m2: 1234.7,
      diagram: 'Diagram-GP 4567', deedNumber: '12/2024', deedDate: '2024-01-15', surveyor: 'J.K. Doe',
    }}
    expect(extractScheduleRow(f)).toEqual({
      stand: '123', area: '1235',
      diagram: 'Diagram-GP 4567', deedNumber: '12/2024', deedDate: '2024-01-15', surveyor: 'J.K. Doe',
    })
  })

  test('all optional fields absent → blank strings (not undefined/null)', () => {
    const f = { properties: { stand: '7', area_m2: 200 } }
    expect(extractScheduleRow(f)).toEqual({
      stand: '7', area: '200',
      diagram: '', deedNumber: '', deedDate: '', surveyor: '',
    })
  })

  test('null and undefined values → blank strings', () => {
    const f = { properties: {
      stand: '7', area_m2: 100,
      diagram: null, deedNumber: undefined, deedDate: null, surveyor: undefined,
    }}
    const row = extractScheduleRow(f)
    expect(row.diagram).toBe('')
    expect(row.deedNumber).toBe('')
    expect(row.deedDate).toBe('')
    expect(row.surveyor).toBe('')
  })

  test('numeric diagram is stringified', () => {
    const f = { properties: { stand: '7', area_m2: 100, diagram: 1234 } }
    expect(extractScheduleRow(f).diagram).toBe('1234')
  })

  test('missing properties.stand → stand: "" (defensive)', () => {
    const f = { properties: { area_m2: 100 } }
    expect(extractScheduleRow(f).stand).toBe('')
  })

  test('area_m2: 9999.7 → area: "10000" (rounding)', () => {
    const f = { properties: { stand: '7', area_m2: 9999.7 } }
    expect(extractScheduleRow(f).area).toBe('10000')
  })

  test('area_m2: 0 → area: "0" (not blank)', () => {
    const f = { properties: { stand: '7', area_m2: 0 } }
    expect(extractScheduleRow(f).area).toBe('0')
  })

  test('area_m2 missing → area: "0" (matches existing default)', () => {
    const f = { properties: { stand: '7' } }
    expect(extractScheduleRow(f).area).toBe('0')
  })

  test('parcelFeature with missing properties → all blank/zero (no throw)', () => {
    const f = {}
    expect(extractScheduleRow(f)).toEqual({
      stand: '', area: '0',
      diagram: '', deedNumber: '', deedDate: '', surveyor: '',
    })
  })

  test('null or undefined parcelFeature → no throw, all blank/zero', () => {
    expect(() => extractScheduleRow(null)).not.toThrow()
    expect(() => extractScheduleRow(undefined)).not.toThrow()
    expect(extractScheduleRow(null)).toEqual({
      stand: '', area: '0',
      diagram: '', deedNumber: '', deedDate: '', surveyor: '',
    })
    expect(extractScheduleRow(undefined)).toEqual({
      stand: '', area: '0',
      diagram: '', deedNumber: '', deedDate: '', surveyor: '',
    })
  })
})

describe('computeScheduleLayout', () => {
  // Block-definitions:
  // singleColumn widths: 45+60+50+50+45+60 = 310mm
  // multiColumn widths : 35+42+38+38+32+45 = 230mm  spacing: 8mm
  // Defaults used to make assertions concrete; mirror the DXF zone math.
  const base = {
    zoneWidth:  110,          // typical A2 col1 zone
    zoneHeight: 150,
    rowHeight:  6,            // ≈ pt(7) * 1.6 in mm
    headerHeight: 12,
    currentSheetSize: 'ISO_A2',
  }

  test('rowCount: 0 → fits single, rowsPerTable: 0, columnWidths sum to zoneWidth', () => {
    const out = computeScheduleLayout({ ...base, rowCount: 0 })
    expect(out.fits).toBe(true)
    expect(out.numTables).toBe(1)
    expect(out.rowsPerTable).toBe(0)
    const sum = out.columnWidths.reduce((s, w) => s + w, 0)
    expect(sum).toBeLessThanOrEqual(base.zoneWidth + 0.01)
    expect(out.columnWidths).toHaveLength(6)
  })

  test('small rowCount fits single-column', () => {
    // rowsPerColumn = floor((150 - 12) / 6) = 23
    const out = computeScheduleLayout({ ...base, rowCount: 20 })
    expect(out.fits).toBe(true)
    expect(out.numTables).toBe(1)
    expect(out.rowsPerTable).toBe(20)
    expect(out.columnWidths).toHaveLength(6)
  })

  test('exactly at single-column budget fits single', () => {
    const out = computeScheduleLayout({ ...base, rowCount: 23 })
    expect(out.fits).toBe(true)
    expect(out.numTables).toBe(1)
    expect(out.rowsPerTable).toBe(23)
  })

  test('rowCount just over single-column budget at wider zone → multi (2 tables)', () => {
    // Need a zone wide enough for 2 multi-tables: 2*230 + 8 = 468mm
    const out = computeScheduleLayout({
      ...base,
      zoneWidth: 500,    // wide enough for 2 multi-tables
      rowCount: 30,       // 30 > 23 rowsPerColumn → needs 2 tables
    })
    expect(out.fits).toBe(true)
    expect(out.numTables).toBe(2)
    expect(out.rowsPerTable).toBe(23)
    expect(out.columnWidths).toHaveLength(6)
    // Multi-mode column widths sum to ≤ subTableWidth (230mm) per table
    const sum = out.columnWidths.reduce((s, w) => s + w, 0)
    expect(sum).toBeLessThanOrEqual(230 + 0.01)
  })

  test('overflow at A2 → not-fits, recommendedSheetSize ISO_A1', () => {
    // Narrow zone + many rows → cant fit even 2 multi-tables
    const out = computeScheduleLayout({
      ...base,
      zoneWidth: 110,
      rowCount: 200,    // 200 / 23 = 9 tables; need ~9 * 230 + 8*8 = 2134mm
    })
    expect(out.fits).toBe(false)
    expect(out.recommendedSheetSize).toBe('ISO_A1')
  })

  test('overflow at A1 → ISO_A0', () => {
    const out = computeScheduleLayout({
      ...base,
      zoneWidth: 110,
      rowCount: 200,
      currentSheetSize: 'ISO_A1',
    })
    expect(out.fits).toBe(false)
    expect(out.recommendedSheetSize).toBe('ISO_A0')
  })

  test('overflow at A0 → multi-sheet-required', () => {
    const out = computeScheduleLayout({
      ...base,
      zoneWidth: 110,
      rowCount: 500,
      currentSheetSize: 'ISO_A0',
    })
    expect(out.fits).toBe(false)
    expect(out.recommendedSheetSize).toBe('multi-sheet-required')
  })

  test('unknown currentSheetSize → multi-sheet-required (defensive)', () => {
    const out = computeScheduleLayout({
      ...base,
      zoneWidth: 110,
      rowCount: 200,
      currentSheetSize: 'ISO_A4',
    })
    expect(out.fits).toBe(false)
    expect(out.recommendedSheetSize).toBe('multi-sheet-required')
  })

  test('zero zoneHeight → rowsPerColumn 0 → empty rowCount fits, any positive rowCount overflows', () => {
    const empty = computeScheduleLayout({ ...base, zoneHeight: 0, rowCount: 0 })
    expect(empty.fits).toBe(true)
    expect(empty.rowsPerTable).toBe(0)

    const some = computeScheduleLayout({ ...base, zoneHeight: 0, rowCount: 5 })
    expect(some.fits).toBe(false)
  })

  test('rowCount fits single-column even on narrow zone (scales columns to zoneWidth)', () => {
    // 100mm zone is narrower than 310mm singleTableWidth; columns scale down.
    const out = computeScheduleLayout({ ...base, zoneWidth: 100, rowCount: 5 })
    expect(out.fits).toBe(true)
    expect(out.numTables).toBe(1)
    const sum = out.columnWidths.reduce((s, w) => s + w, 0)
    expect(sum).toBeLessThanOrEqual(100 + 0.01)
    // Proportions preserved — STAND col is the narrowest of 45/60/50/50/45/60.
    expect(out.columnWidths[0]).toBeLessThan(out.columnWidths[1]) // STAND < AREAS
  })

  test('fits: true layout omits recommendedSheetSize entirely', () => {
    // Spec union: success branch returns { fits, numTables, rowsPerTable,
    // columnWidths } only; recommendedSheetSize is exclusive to failure.
    const out = computeScheduleLayout({ ...base, rowCount: 5 })
    expect(out.recommendedSheetSize).toBeUndefined()
  })

  test('narrow zone in multi-column mode → overflow rather than unreadable scaling', () => {
    // zoneWidth=50 is narrower than subTableWidth=230 — even one
    // natural-width sub-table cannot fit. Should overflow to a larger
    // sheet rather than silently shrink columns to ~22%.
    const out = computeScheduleLayout({ ...base, zoneWidth: 50, rowCount: 30 })
    expect(out.fits).toBe(false)
    expect(out.recommendedSheetSize).toBe('ISO_A1')
  })

  test('rowCount requiring 3 tables that fit width-wise → fits with numTables: 3', () => {
    // Need a zone wide enough for 3 multi-tables: 3*230 + 2*8 = 706mm
    const out = computeScheduleLayout({
      ...base,
      zoneWidth: 750,    // wide enough for 3 multi-tables
      rowCount: 60,       // 60 / 23 rowsPerColumn = ceil(2.6) = 3 tables
    })
    expect(out.fits).toBe(true)
    expect(out.numTables).toBe(3)
    expect(out.rowsPerTable).toBe(23)
    expect(out.columnWidths).toHaveLength(6)
  })

  test('rowCount: 1 → fits single-column with one row', () => {
    const out = computeScheduleLayout({ ...base, rowCount: 1 })
    expect(out.fits).toBe(true)
    expect(out.numTables).toBe(1)
    expect(out.rowsPerTable).toBe(1)
  })
})

describe('addScheduleTable', () => {
  // Capture all calls to addText / addLine for inspection.
  function mockPrimitives() {
    const textCalls = []
    const lineCalls = []
    const addText = (layer, x, y, text, h, rotation, style) =>
      textCalls.push({ layer, x, y, text, h, rotation, style })
    const addLine = (layer, x1, y1, x2, y2) =>
      lineCalls.push({ layer, x1, y1, x2, y2 })
    return { textCalls, lineCalls, addText, addLine }
  }

  const defaultArgs = (overrides = {}) => ({
    layer: 'TITLE_BLOCK',
    x: 0,
    y: 1000,
    dataRows: [],
    columnWidths: [10, 12, 10, 10, 10, 12],   // sum 64 (arbitrary test units)
    titleText: 'SCHEDULE OF AREAS',
    hHead: 1.5,
    hBody: 1.0,
    rH: 1.6,
    addText: () => {},
    addLine: () => {},
    ...overrides,
  })

  test('emits the title with BOLD style at (x, y)', () => {
    const { textCalls, addText, addLine } = mockPrimitives()
    addScheduleTable({ ...defaultArgs({ addText, addLine }) })
    const titleCalls = textCalls.filter(c => c.text === 'SCHEDULE OF AREAS')
    expect(titleCalls).toHaveLength(1)
    expect(titleCalls[0].style).toBe('BOLD')
    expect(titleCalls[0].x).toBe(0)
    expect(titleCalls[0].y).toBe(1000)
  })

  test('emits the (cont\'d) title when titleText is "SCHEDULE OF AREAS (cont\'d)"', () => {
    const { textCalls, addText, addLine } = mockPrimitives()
    addScheduleTable({ ...defaultArgs({ addText, addLine, titleText: "SCHEDULE OF AREAS (cont'd)" }) })
    expect(textCalls.some(c => c.text === "SCHEDULE OF AREAS (cont'd)")).toBe(true)
  })

  test('emits all six SI 727 column headers', () => {
    const { textCalls, addText, addLine } = mockPrimitives()
    addScheduleTable({ ...defaultArgs({ addText, addLine }) })
    const texts = textCalls.map(c => c.text)
    // singleColumn label values are "STAND\nNo.", "AREAS\nSQUARE\nMETRES", etc.
    // The header emission splits \n-separated tokens onto sub-lines.
    expect(texts).toEqual(expect.arrayContaining(['STAND', 'No.']))
    expect(texts).toEqual(expect.arrayContaining(['AREAS']))
    expect(texts).toEqual(expect.arrayContaining(['DIAGRAM']))
    expect(texts).toEqual(expect.arrayContaining(['NUMBER']))
    expect(texts).toEqual(expect.arrayContaining(['DATE']))
    expect(texts.some(t => t.startsWith('SURVEYOR'))).toBe(true)
  })

  test('emits the DEED parent header centered above NUMBER + DATE', () => {
    const { textCalls, addText, addLine } = mockPrimitives()
    const args = defaultArgs({ addText, addLine })
    addScheduleTable(args)
    const deedCall = textCalls.find(c => c.text === 'DEED')
    expect(deedCall).toBeDefined()
    // Column offsets cumulative from args.x = 0 with widths [10,12,10,10,10,12]:
    // colX = [0, 10, 22, 32, 42, 52]; col 3 = NUMBER (x=32), col 4 = DATE (x=42, w=10).
    // Span: [32, 52]; midpoint = 42.
    // DEED width ≈ 4 chars × hBody=1.0 × 0.6 = 2.4; half = 1.2.
    // Expected anchor: 42 - 1.2 = 40.8.
    const expectedAnchor = 42 - ('DEED'.length * args.hBody * 0.6) / 2
    expect(deedCall.x).toBeCloseTo(expectedAnchor, 4)
    // The visible text span [anchor, anchor + width] must fall inside the
    // NUMBER+DATE column span [colX[3], colX[4] + widths[4]] = [32, 52].
    const textWidth = 'DEED'.length * args.hBody * 0.6
    expect(deedCall.x).toBeGreaterThanOrEqual(32)
    expect(deedCall.x + textWidth).toBeLessThanOrEqual(52)
  })

  test('emits a header underline LINE', () => {
    const { lineCalls, addText, addLine } = mockPrimitives()
    addScheduleTable({ ...defaultArgs({ addText, addLine }) })
    expect(lineCalls.length).toBeGreaterThanOrEqual(1)
  })

  test('emits one TEXT per cell per data row', () => {
    const { textCalls, addText, addLine } = mockPrimitives()
    const dataRows = [
      { stand: '1', area: '100', diagram: 'D1', deedNumber: '12/24', deedDate: '2024-01', surveyor: 'A' },
      { stand: '2', area: '200', diagram: '',   deedNumber: '',       deedDate: '',       surveyor: ''  },
    ]
    addScheduleTable({ ...defaultArgs({ addText, addLine, dataRows }) })
    // Verify each non-blank cell value appears as a TEXT entry.
    const texts = textCalls.map(c => c.text)
    expect(texts).toEqual(expect.arrayContaining(['1', '100', 'D1', '12/24', '2024-01', 'A']))
    expect(texts).toEqual(expect.arrayContaining(['2', '200']))
  })

  test('blank-cell values are skipped (no empty-string TEXTs emitted)', () => {
    const { textCalls, addText, addLine } = mockPrimitives()
    const dataRows = [
      { stand: '1', area: '100', diagram: '', deedNumber: '', deedDate: '', surveyor: '' },
    ]
    addScheduleTable({ ...defaultArgs({ addText, addLine, dataRows }) })
    // Empty-string TEXT entries are noise and may produce empty DXF labels.
    expect(textCalls.every(c => c.text !== '')).toBe(true)
  })

  test('returns the final y coordinate (≤ y - rows consumed)', () => {
    const { addText, addLine } = mockPrimitives()
    const dataRows = [
      { stand: '1', area: '100', diagram: '', deedNumber: '', deedDate: '', surveyor: '' },
      { stand: '2', area: '200', diagram: '', deedNumber: '', deedDate: '', surveyor: '' },
      { stand: '3', area: '300', diagram: '', deedNumber: '', deedDate: '', surveyor: '' },
    ]
    const startY = 1000
    const out = addScheduleTable({ ...defaultArgs({ addText, addLine, dataRows, y: startY, rH: 2 }) })
    expect(typeof out).toBe('number')
    // Y decreases as we go down; 3 rows of rH=2 + header consumption → at least 6 below startY.
    expect(out).toBeLessThan(startY)
  })
})
