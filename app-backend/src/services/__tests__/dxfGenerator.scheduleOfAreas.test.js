/**
 * Layer 1 unit tests for the Schedule of Areas helpers.
 * Run with:  cd app-backend && npm run test -- dxfGenerator.scheduleOfAreas
 */
import { describe, test, expect } from '@jest/globals'
import { nextLargerSheet, extractScheduleRow, computeScheduleLayout } from '../dxfGenerator.js'

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

  test('returns numeric (not null) for the recommendedSheetSize on fit=true', () => {
    // Spec says only failure has recommendedSheetSize; success omits it.
    const out = computeScheduleLayout({ ...base, rowCount: 5 })
    expect(out.recommendedSheetSize).toBeUndefined()
  })
})
