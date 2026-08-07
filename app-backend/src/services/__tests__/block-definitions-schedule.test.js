/**
 * Unit tests for the two new shared schedule helpers exported from
 * app-shared/block-definitions.js. Run with:
 *   cd app-backend && npm test -- --testPathPatterns="block-definitions-schedule"
 */
import { describe, test, expect } from '@jest/globals'
import {
  computeScheduleColumnWidths,
  scaleColumnWidthsToTarget,
  SCHEDULE_TARGET_WIDTH_PT,
  planScheduleSplit,
  edgeDistanceMetres,
  classifyBeaconGroups,
  resolveLoSystem,
  snapScaleBarSegment,
} from '../../../../app-shared/block-definitions.js'

const beaconsFC = (...names) => ({
  features: names.map(n => ({ properties: { name: n } })),
})

/**
 * Deterministic text-width measurer for tests. Mirrors DXF's
 * (text, fontSize) => text.length * fontSize * 0.55 approximation
 * so test outputs are easy to hand-verify.
 */
const measureText = (text, fontSize) =>
  String(text).length * fontSize * 0.55

describe('computeScheduleColumnWidths', () => {
  test('returns 6 widths summing to a finite total', () => {
    const widths = computeScheduleColumnWidths({
      dataRows: [],
      headerFontSize: 6,
      bodyFontSize:   7,
      measureText,
    })
    expect(widths).toHaveLength(6)
    const total = widths.reduce((s, w) => s + w, 0)
    expect(Number.isFinite(total)).toBe(true)
    expect(total).toBeGreaterThan(0)
  })

  test('widest header token determines column when data is short', () => {
    // 'DIAGRAM' (7 chars) at headerFontSize=6 → 7*6*0.55 = 23.1 pt
    // 'GP-1' (4 chars) at bodyFontSize=7 → 4*7*0.55 = 15.4 pt
    // Header wins → raw = 23.1 + 2*4 = 31.1
    const widths = computeScheduleColumnWidths({
      dataRows: [{ stand: '1', diagram: 'GP-1' }],
      headerFontSize: 6, bodyFontSize: 7, measureText,
    })
    // diagram is column index 2 (stand, area, diagram, ...).
    expect(widths[2]).toBeCloseTo(7 * 6 * 0.55 + 8, 3)
  })

  test('widest data value determines column when it exceeds widest header', () => {
    // 'NUMBER' (6 chars) at headerFontSize=6 → 6*6*0.55 = 19.8 pt
    // 'DG-12345/2024' (13 chars) at bodyFontSize=7 → 13*7*0.55 = 50.05 pt
    // Data wins → raw = 50.05 + 8 = 58.05
    const widths = computeScheduleColumnWidths({
      dataRows: [{ stand: '1', deedNumber: 'DG-12345/2024' }],
      headerFontSize: 6, bodyFontSize: 7, measureText,
    })
    // deedNumber is column index 3.
    expect(widths[3]).toBeCloseTo(13 * 7 * 0.55 + 8, 3)
  })

  test('colMinFloor (24 pt) enforced when both header and data are narrow', () => {
    // Tiny measureText so the raw width is below colMinFloor.
    const tinyMeasure = () => 1
    const widths = computeScheduleColumnWidths({
      dataRows: [{ stand: '1' }],
      headerFontSize: 6, bodyFontSize: 7, measureText: tinyMeasure,
      colMinFloor: 24,
    })
    for (const w of widths) {
      expect(w).toBeGreaterThanOrEqual(24)
    }
  })

  test('padding adds 2 * padding to each column', () => {
    const fixedMeasure = () => 10
    const widthsPad0 = computeScheduleColumnWidths({
      dataRows: [{}],
      headerFontSize: 6, bodyFontSize: 7, measureText: fixedMeasure,
      padding: 0, colMinFloor: 0,
    })
    const widthsPad5 = computeScheduleColumnWidths({
      dataRows: [{}],
      headerFontSize: 6, bodyFontSize: 7, measureText: fixedMeasure,
      padding: 5, colMinFloor: 0,
    })
    for (let i = 0; i < 6; i++) {
      expect(widthsPad5[i] - widthsPad0[i]).toBeCloseTo(10, 5)
    }
  })

  test('injected measureText is called with (text, fontSize)', () => {
    const calls = []
    const recorder = (text, fontSize) => {
      calls.push({ text, fontSize })
      return text.length * fontSize * 0.55
    }
    computeScheduleColumnWidths({
      dataRows: [{ stand: '1' }],
      headerFontSize: 6, bodyFontSize: 7, measureText: recorder,
    })
    // At least one header call at fontSize=6.
    expect(calls.some(c => c.fontSize === 6)).toBe(true)
    // At least one data call at fontSize=7.
    expect(calls.some(c => c.fontSize === 7 && c.text === '1')).toBe(true)
  })
})

describe('scaleColumnWidthsToTarget', () => {
  test('scales widths up proportionally to reach the target', () => {
    const widths = [10, 20, 10, 10, 10, 20] // sum 80
    const scaled = scaleColumnWidthsToTarget(widths, 160)
    expect(scaled.reduce((a, b) => a + b, 0)).toBeCloseTo(160, 5)
    for (let i = 0; i < widths.length; i++) {
      expect(scaled[i]).toBeCloseTo(widths[i] * 2, 5)
    }
  })

  test('does not shrink widths that already meet or exceed the target', () => {
    const widths = [50, 60, 40, 40, 35, 50] // sum 275
    const scaled = scaleColumnWidthsToTarget(widths, 200)
    expect(scaled).toEqual(widths)
  })

  test('widths summing exactly to the target are returned unchanged', () => {
    const widths = [40, 40] // sum 80
    const scaled = scaleColumnWidthsToTarget(widths, 80)
    expect(scaled).toEqual(widths)
  })

  test('SCHEDULE_TARGET_WIDTH_PT is 15cm in PDF points', () => {
    expect(SCHEDULE_TARGET_WIDTH_PT).toBeCloseTo(150 * 72 / 25.4, 5)
  })
})

describe('planScheduleSplit', () => {
  test('all rows fit in one gap → plan has 1 entry, no continuation, no residual', () => {
    const result = planScheduleSplit({
      totalRows: 5,
      availableGaps: [{ x: 0, y: 0, width: 100, height: 200 }],
      tableWidth:   50,
      headerHeight: 30,
      rowHeight:    15,
    })
    expect(result.plan).toHaveLength(1)
    expect(result.plan[0].gapIndex).toBe(0)
    expect(result.plan[0].startRow).toBe(0)
    expect(result.plan[0].rowCount).toBe(5)
    expect(result.plan[0].isContinuation).toBe(false)
    expect(result.residualRows).toBe(0)
  })

  test('rows distributed across gaps in descending capacity order', () => {
    // gap[0] holds 2 rows; gap[1] holds 10 rows; gap[2] holds 4 rows.
    // Largest-first → gap[1] first (rows 0-9), then gap[2] (rows 10-13), then gap[0] skipped (capacity < min).
    const result = planScheduleSplit({
      totalRows: 14,
      availableGaps: [
        { x: 0, y: 0,  width: 50, height:  60 },  // (60-30)/15 = 2  → skipped (< minRowsPerTable=3)
        { x: 0, y: 70, width: 50, height: 180 },  // (180-30)/15 = 10
        { x: 0, y:260, width: 50, height:  90 },  // (90-30)/15 = 4
      ],
      tableWidth: 50, headerHeight: 30, rowHeight: 15,
    })
    expect(result.plan).toHaveLength(2)
    expect(result.plan[0].gapIndex).toBe(1)
    expect(result.plan[0].rowCount).toBe(10)
    expect(result.plan[0].startRow).toBe(0)
    expect(result.plan[1].gapIndex).toBe(2)
    expect(result.plan[1].rowCount).toBe(4)
    expect(result.plan[1].startRow).toBe(10)
    expect(result.plan[1].isContinuation).toBe(true)
    expect(result.residualRows).toBe(0)
  })

  test('residualRows tracks unplaceable rows when gap capacity runs out', () => {
    const result = planScheduleSplit({
      totalRows: 20,
      availableGaps: [{ x: 0, y: 0, width: 50, height: 105 }], // capacity = (105-30)/15 = 5
      tableWidth: 50, headerHeight: 30, rowHeight: 15,
    })
    expect(result.plan).toHaveLength(1)
    expect(result.plan[0].rowCount).toBe(5)
    expect(result.residualRows).toBe(15)
  })

  test('gap narrower than tableWidth is skipped', () => {
    const result = planScheduleSplit({
      totalRows: 5,
      availableGaps: [{ x: 0, y: 0, width: 30, height: 200 }], // width 30 < tableWidth 50 → skip
      tableWidth: 50, headerHeight: 30, rowHeight: 15,
    })
    expect(result.plan).toHaveLength(0)
    expect(result.residualRows).toBe(5)
  })

  test('totalRows < minRowsPerTable → single entry with all rows', () => {
    // Plan with only 2 stands. Even a small gap should hold them.
    const result = planScheduleSplit({
      totalRows: 2,
      availableGaps: [{ x: 0, y: 0, width: 50, height: 60 }], // capacity (60-30)/15 = 2
      tableWidth: 50, headerHeight: 30, rowHeight: 15,
    })
    expect(result.plan).toHaveLength(1)
    expect(result.plan[0].rowCount).toBe(2)
    expect(result.residualRows).toBe(0)
  })

  test('stand row order preserved across sub-tables (startRow monotonically increases)', () => {
    const result = planScheduleSplit({
      totalRows: 12,
      availableGaps: [
        { x: 0, y: 0,   width: 50, height:  75 },  // 3 rows
        { x: 0, y: 100, width: 50, height: 105 },  // 5 rows
        { x: 0, y: 220, width: 50, height:  90 },  // 4 rows
      ],
      tableWidth: 50, headerHeight: 30, rowHeight: 15,
    })
    // Largest first: gap[1] (5 rows), then gap[2] (4 rows), then gap[0] (3 rows).
    let prevEnd = 0
    for (const p of result.plan) {
      expect(p.startRow).toBe(prevEnd)
      prevEnd = p.startRow + p.rowCount
    }
    expect(prevEnd).toBe(12)
    expect(result.residualRows).toBe(0)
  })

  test('availableGaps empty → returns plan:[], residualRows:totalRows', () => {
    const result = planScheduleSplit({
      totalRows: 10,
      availableGaps: [],
      tableWidth: 50, headerHeight: 30, rowHeight: 15,
    })
    expect(result.plan).toHaveLength(0)
    expect(result.residualRows).toBe(10)
  })
})

describe('edgeDistanceMetres — accepts both `distance` and `metres`', () => {
  test('reads numeric `distance`', () => {
    expect(edgeDistanceMetres({ distance: 138.24 })).toBe(138.24)
  })

  test('reads numeric `metres` when `distance` is absent', () => {
    expect(edgeDistanceMetres({ metres: 300 })).toBe(300)
  })

  test('parses string values', () => {
    expect(edgeDistanceMetres({ distance: '138.24' })).toBe(138.24)
    expect(edgeDistanceMetres({ metres: '300.000' })).toBe(300)
  })

  test('`distance` takes precedence over `metres`', () => {
    expect(edgeDistanceMetres({ distance: 100, metres: 999 })).toBe(100)
  })

  test('returns null when neither field is present or parseable', () => {
    expect(edgeDistanceMetres({})).toBeNull()
    expect(edgeDistanceMetres({ distance: 'abc' })).toBeNull()
    expect(edgeDistanceMetres(null)).toBeNull()
    expect(edgeDistanceMetres(undefined)).toBeNull()
  })
})

describe('snapScaleBarSegment — shared scale-bar graduation (DXF/PDF parity)', () => {
  test('snaps to the first nice number ≥ half the raw segment', () => {
    // raw 8 → half 4 → first nice ≥ 4 is 5
    expect(snapScaleBarSegment(8)).toBe(5)
    // raw 20 → half 10 → 10
    expect(snapScaleBarSegment(20)).toBe(10)
    // raw 0.04 * 500 = 20 → 10  (a 1:500 plan graduates 0,10,20,30)
    expect(snapScaleBarSegment(0.04 * 500)).toBe(10)
  })

  test('tiny raw value floors at 1', () => {
    expect(snapScaleBarSegment(0.5)).toBe(1)
  })

  test('enormous raw value falls back to 100', () => {
    expect(snapScaleBarSegment(1e9)).toBe(100)
  })
})

describe('resolveLoSystem — shared OFD meridian label (DXF/PDF parity)', () => {
  test('1. explicit loSystem string in constants wins over everything', () => {
    expect(resolveLoSystem(
      { constants: { loSystem: 'Lo 27' } },
      { centralMeridian: 29 },
      'EPSG:22291',
    )).toBe('Lo 27')
  })

  test('2. derives from the project central meridian (metadata.centralMeridian)', () => {
    expect(resolveLoSystem({}, { centralMeridian: 29 })).toBe('Lo 29')
    expect(resolveLoSystem({}, { centralMeridian: '29' })).toBe('Lo 29')
    // metadata meridian beats the projection hint
    expect(resolveLoSystem({}, { centralMeridian: 29 }, 'EPSG:22291')).toBe('Lo 29')
  })

  test('3. derives from the projection when no meridian is supplied', () => {
    expect(resolveLoSystem({}, null, 'EPSG:22289')).toBe('Lo 29') // 22289 − 22260
    expect(resolveLoSystem({}, null, 'Cape Lo 31')).toBe('Lo 31')
  })

  test('4. falls back to the SI 727 default Lo 31 only as a last resort', () => {
    expect(resolveLoSystem({ constants: {} })).toBe('Lo 31')
    expect(resolveLoSystem({})).toBe('Lo 31')
    expect(resolveLoSystem(null)).toBe('Lo 31')
    expect(resolveLoSystem(undefined)).toBe('Lo 31')
  })
})

describe('classifyBeaconGroups — SI 727 beacon description grouping', () => {
  test('empty / missing beacons → []', () => {
    expect(classifyBeaconGroups({ features: [] })).toEqual([])
    expect(classifyBeaconGroups(null)).toEqual([])
  })

  test('Sebanga case: letter codes → 50mm pipe, numeric-suffix → Others (12mm)', () => {
    // 12mm group is the clear majority (5 > 3), so it rolls up as "Others".
    const groups = classifyBeaconGroups(beaconsFC('REMA', 'SCENIC', 'SLE', '96C', '101B', '100B', '102C', '97Z'))
    expect(groups).toEqual([
      { points: 'REMA, SCENIC, SLE', description: '50mm Iron Pipe in Concrete' },
      { points: 'Others', description: '12mm iron peg in concrete' },
    ])
  })

  test('"Not beaconed" (M-series) sorts first, "Others" last', () => {
    const groups = classifyBeaconGroups(beaconsFC('M5', 'M6', 'REMA', 'SCENIC', '12A', '13B', '14C'))
    expect(groups.map(g => g.description)).toEqual([
      'Not beaconed', '50mm Iron Pipe in Concrete', '12mm iron peg in concrete',
    ])
    expect(groups[0].points).toBe('M5, M6')
    expect(groups[groups.length - 1].points).toBe('Others')
  })

  test('reads name | id | pointId | beacon_name', () => {
    // 4 numeric (12mm) beacons make 12mm the majority so the 50mm group is listed.
    const fc = { features: [
      { properties: { pointId: 'REMA' } },
      { properties: { beacon_name: 'SCENIC' } },
      { properties: { id: 'SLE' } },
      { properties: { name: '10A' } },
      { properties: { name: '11B' } },
      { properties: { name: '12C' } },
      { properties: { name: '13D' } },
    ] }
    expect(classifyBeaconGroups(fc)).toEqual([
      { points: 'REMA, SCENIC, SLE', description: '50mm Iron Pipe in Concrete' },
      { points: 'Others', description: '12mm iron peg in concrete' },
    ])
  })
})
