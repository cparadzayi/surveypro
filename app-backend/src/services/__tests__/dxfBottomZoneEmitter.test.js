/**
 * Unit tests for dxfBottomZoneEmitter (sub-project 3-v4).
 * Run:  cd app-backend && npm test -- --testPathPatterns="dxfBottomZoneEmitter"
 */
import { describe, test, expect } from '@jest/globals'
import {
  sizeStatement,
  sizeOFDTable,
  sizeSGBox,
  sizeBeaconDescriptions,
  emitStatement,
  emitSGBox,
  emitOFDTable,
  placeBottomZoneBlocks,
} from '../dxfBottomZoneEmitter.js'

// Identity mm so tests work in raw units (paper-mm == ground-metre).
const mm = (x) => x

// Font heights typical of the integrated generator at S=1000.
const fonts = {
  hBody:   2,
  hSub:    2.5,
  rH:      3,
  ofTitleH: 3,
  ofBodyH:  2.5,
  ofRowH:   4,
  sgTitleH: 3.5,
  sgBodyH:  2.5,
}

describe('sizeStatement', () => {
  test('returns {0,0} when metadata has neither date nor surveyor', () => {
    expect(sizeStatement({}, fonts)).toEqual({ width: 0, height: 0 })
  })

  test('includes only the date row when surveyor absent', () => {
    const result = sizeStatement({ date: '2026-06-15' }, fonts)
    // Single line: "Surveyed in June 2026 by me" — no gap after it.
    expect(result.height).toBeCloseTo(fonts.hBody, 5)
    expect(result.width).toBeGreaterThan(0)
  })

  test('width tracks the longest of the three candidate lines', () => {
    const long = 'X'.repeat(120)
    const result = sizeStatement({ date: '2026', surveyor: long }, fonts)
    // Longest candidate is the surveyor name → width = 120 chars * hBody * 0.55.
    expect(result.width).toBeCloseTo(120 * fonts.hBody * 0.55, 3)
  })
})

describe('sizeOFDTable', () => {
  test('returns {0,0} when edges array is empty', () => {
    expect(sizeOFDTable({ edges: [] }, fonts, mm)).toEqual({ width: 0, height: 0 })
    expect(sizeOFDTable({}, fonts, mm)).toEqual({ width: 0, height: 0 })
    expect(sizeOFDTable(null, fonts, mm)).toEqual({ width: 0, height: 0 })
  })

  test('height scales linearly with edges.length', () => {
    const one = sizeOFDTable({ edges: [{}] }, fonts, mm)
    const ten = sizeOFDTable({ edges: Array(10).fill({}) }, fonts, mm)
    // Extra 9 rows × ofRowH.
    expect(ten.height - one.height).toBeCloseTo(9 * fonts.ofRowH, 5)
  })

  test('width equals sum(OUTSIDE_FIGURE_DATA.columns[i].width) * PT_TO_MM_GEN', () => {
    const result = sizeOFDTable({ edges: [{}] }, fonts, mm)
    // Columns: 45 + 40 + 70 + 55 + 65 + 70 = 345 pt → 121.7 mm (identity mm).
    const expectedPt = 45 + 40 + 70 + 55 + 65 + 70
    const expectedMM = expectedPt * (25.4 / 72)
    expect(result.width).toBeCloseTo(expectedMM, 3)
  })
})

describe('sizeSGBox', () => {
  test('returns SURVEYOR_GENERAL_BOX dims scaled by PT_TO_MM_GEN', () => {
    const result = sizeSGBox(mm)
    // SURVEYOR_GENERAL_BOX is 200 × 110 pt.
    expect(result.width).toBeCloseTo(200 * (25.4 / 72), 3)
    expect(result.height).toBeCloseTo(110 * (25.4 / 72), 3)
  })
})

describe('sizeBeaconDescriptions', () => {
  test('returns {0,0} when beaconGroups is empty or missing', () => {
    expect(sizeBeaconDescriptions([], fonts, mm)).toEqual({ width: 0, height: 0 })
    expect(sizeBeaconDescriptions(null, fonts, mm)).toEqual({ width: 0, height: 0 })
    expect(sizeBeaconDescriptions(undefined, fonts, mm)).toEqual({ width: 0, height: 0 })
  })

  test('height grows linearly with total beacon row count', () => {
    const small = [{ points: 'A', description: 'iron peg' }]
    const big   = Array(20).fill({ points: 'A', description: 'iron peg' })
    const smallH = sizeBeaconDescriptions(small, fonts, mm).height
    const bigH   = sizeBeaconDescriptions(big,   fonts, mm).height
    // The current addBeaconDescription emits a header + one row per group.
    // big has 19 more rows → height delta = 19 * rH * 1.2.
    expect(bigH - smallH).toBeCloseTo(19 * fonts.rH * 1.2, 3)
  })
})

describe('emitStatement', () => {
  const makeRecorder = () => {
    const calls = { addText: [] }
    return {
      addText: (...args) => calls.addText.push(args),
      calls,
    }
  }

  test('records expected addText calls at the given top-left position', () => {
    const r = makeRecorder()
    // Mid-month date avoids timezone-driven month boundaries in the formatter.
    const metadata = { date: '2026-06-15', surveyor: 'John Doe' }
    const position = { x: 100, y: 200 }   // top-left of bbox (south-up: high y)
    emitStatement(r.addText, position, metadata, fonts, 'TITLE_BLOCK')

    // Expect 3 addText calls: date line, surveyor (bold), '(Land Surveyor, Zim)'.
    expect(r.calls.addText).toHaveLength(3)
    expect(r.calls.addText[0]).toEqual(['TITLE_BLOCK', 100, 200, 'Surveyed in June 2026 by me', fonts.hBody, 0, undefined])
    expect(r.calls.addText[1][3]).toBe('John Doe')
    expect(r.calls.addText[1][6]).toBe('BOLD')          // surveyor row is bold
    expect(r.calls.addText[2][3]).toBe('(Land Surveyor, Zim)')
  })

  test('records nothing when metadata has neither date nor surveyor', () => {
    const r = makeRecorder()
    emitStatement(r.addText, { x: 0, y: 0 }, {}, fonts, 'TITLE_BLOCK')
    expect(r.calls.addText).toHaveLength(0)
  })
})

describe('emitSGBox', () => {
  const makeRecorder = () => {
    const calls = { addText: [], addLine: [], addRect: [] }
    return {
      addText: (...args) => calls.addText.push(args),
      addLine: (...args) => calls.addLine.push(args),
      addRect: (...args) => calls.addRect.push(args),
      calls,
    }
  }

  test('records 1 rect, 4 text, 1 line at the given top-left position', () => {
    const r = makeRecorder()
    const position = { x: 100, y: 200 }                 // top-left
    const size     = sizeSGBox(mm)                      // ~70.6 × ~28.2
    emitSGBox(r.addText, r.addLine, r.addRect, position, size, fonts, mm, 'TITLE_BLOCK')

    // Box rectangle: 1 addRect from (x, y-height) to (x+width, y).
    expect(r.calls.addRect).toHaveLength(1)
    expect(r.calls.addRect[0]).toEqual(['TITLE_BLOCK', 100, 200 - size.height, 100 + size.width, 200])

    // Text rows: "Approved", "For Surveyor General", date text — three text lines.
    expect(r.calls.addText.length).toBeGreaterThanOrEqual(3)

    // Signature line — exactly one horizontal line inside the box.
    expect(r.calls.addLine).toHaveLength(1)
  })
})

describe('emitOFDTable — System meridian label (DXF/PDF parity)', () => {
  const ofdFonts = { ofTitleH: 3, ofBodyH: 2.5, ofRowH: 4 }
  const baseOFD = {
    edges: [{ side: 'AB', distance: 10, direction: 'N 00°00\'00"', pointId: 'P1', y: 1, x: 2 }],
  }
  const systemLine = (texts) => texts.find(t => t.startsWith('System :'))

  test('falls back to "Lo 31°" (SI 727 default) when no loSystem is carried', () => {
    const texts = []
    emitOFDTable(
      (layer, x, y, text) => texts.push(String(text)),
      () => {}, { x: 0, y: 0 }, baseOFD, ofdFonts, mm, 'TITLE_BLOCK')
    expect(systemLine(texts)).toBe('System : Lo 31°')
  })

  test('uses the loSystem carried in outside-figure constants when present', () => {
    const texts = []
    emitOFDTable(
      (layer, x, y, text) => texts.push(String(text)),
      () => {}, { x: 0, y: 0 },
      { ...baseOFD, constants: { loSystem: 'Lo 29' } }, ofdFonts, mm, 'TITLE_BLOCK')
    expect(systemLine(texts)).toBe('System : Lo 29°')
  })
})

describe('placeBottomZoneBlocks orchestrator', () => {
  // Mock schedule emitter returns a single placed table at a known position.
  const mockScheduleEmitter = ({ drawingZone }) => ({
    placedTables: [{ x: drawingZone.x + 10, y: drawingZone.y + 10, width: 20, height: 10, rowCount: 5, isContinuation: false }],
    placedStandCount: 5,
    missingStandCount: 0,
    southmostY: drawingZone.y + 10,
  })

  const baseInput = () => ({
    // Keep contentArea small to bound findBlockPosition's candidate count
    // (scanStep is mm(5) = 5 with identity mm, so a 250×120 area generates
    // ~1200 candidates per call — fast enough for 4 calls per test).
    // OFD width = 345 pt × 25.4/72 ≈ 121.7 mm fits inside 250.
    contentArea: { x: 0, y: 0, width: 250, height: 120 },
    polygon: null,
    obstacles: [],
    statementFallbackY: 60,
    surveyedFeatures: [{ properties: { stand: '1', area_m2: 100 } }],
    outsideFigureData: { edges: [{ side: 'AB', distance: 10, direction: 'N', pointId: 'P1', y: 1, x: 2 }] },
    beaconGroups: [{ points: 'A', description: 'iron peg' }],
    metadata: { date: '2026-01-01', surveyor: 'John Doe' },
    sheetSize: 'SI727_500x400',
    fonts: { hBody: 2, hSub: 2.5, rH: 3, hHead: 2.5,
             ofTitleH: 3, ofBodyH: 2.5, ofRowH: 4,
             sgTitleH: 3.5, sgBodyH: 2.5 },
    helpers: { mm: (x) => x, addBeaconDescription: (...args) => {}, scheduleEmitter: mockScheduleEmitter },
    layer: 'TITLE_BLOCK',
    addText: () => {}, addLine: () => {}, addRect: () => {},
    warn: () => {}, logger: { info: () => {}, warn: () => {}, error: () => {} },
  })

  test('places blocks in PDF order: OFD → schedule → beacon → statement → SG', () => {
    const callOrder = []
    const input = baseInput()
    input.helpers.scheduleEmitter = (args) => {
      callOrder.push('schedule')
      return mockScheduleEmitter(args)
    }
    input.helpers.addBeaconDescription = () => { callOrder.push('beacon') }
    // Tag each emission category by inspecting addText calls.
    input.addText = (layer, x, y, text) => {
      if (text === 'OUTSIDE FIGURE DATA')      callOrder.push('ofd')
      else if (text === 'Approved')            callOrder.push('sg')
      else if (text && text.startsWith('Surveyed in')) callOrder.push('statement')
    }

    placeBottomZoneBlocks(input)

    expect(callOrder.indexOf('ofd')).toBeLessThan(callOrder.indexOf('schedule'))
    expect(callOrder.indexOf('schedule')).toBeLessThan(callOrder.indexOf('beacon'))
    expect(callOrder.indexOf('beacon')).toBeLessThan(callOrder.indexOf('statement'))
    expect(callOrder.indexOf('statement')).toBeLessThan(callOrder.indexOf('sg'))
  })

  test('pre-seeded obstacles excluded from candidate positions', () => {
    const input = baseInput()
    // Upper half (y in [60, 120]) is an obstacle. All non-schedule blocks
    // must land entirely in the lower half (top-left y ≤ 60).
    input.obstacles = [{ name: 'title', x: 0, y: 60, width: 250, height: 60 }]
    const placements = []
    input.addText = (layer, x, y, text) => {
      if (text === 'OUTSIDE FIGURE DATA' || text === 'Approved' ||
          (text && text.startsWith('Surveyed in'))) {
        placements.push({ text, y })
      }
    }
    placeBottomZoneBlocks(input)
    for (const p of placements) {
      // Block top-left y is the bbox top; obstacle starts at y=60.
      expect(p.y).toBeLessThanOrEqual(60 + 1e-6)
    }
  })

  test('OFD overflow → ofdOverflow warn + bottom-left fallback', () => {
    const input = baseInput()
    // Fill the entire content area with one giant obstacle so OFD cannot fit.
    input.obstacles = [{ name: 'occupier', x: 0, y: 0, width: 250, height: 120 }]
    const warnings = []
    input.warn = (cat, payload) => warnings.push({ cat, payload })
    let ofdEmittedAt = null
    input.addText = (layer, x, y, text) => {
      if (text === 'OUTSIDE FIGURE DATA') ofdEmittedAt = { x, y }
    }
    placeBottomZoneBlocks(input)

    expect(warnings.find(w => w.cat === 'ofdOverflow')).toBeTruthy()
    expect(ofdEmittedAt).not.toBeNull()
    // Bottom-left fallback: the table's left edge is cntL + 3 (= 3). The
    // "OUTSIDE FIGURE DATA" title is centred within the left section of the
    // table, so it sits at/after the table left and within that section.
    expect(ofdEmittedAt.x).toBeGreaterThanOrEqual(3)
    expect(ofdEmittedAt.x).toBeLessThan(3 + 80)
  })

  test('SG overflow → sgOverflow warn + bottom-right fallback', () => {
    const input = baseInput()
    input.obstacles = [{ name: 'occupier', x: 0, y: 0, width: 250, height: 120 }]
    const warnings = []
    input.warn = (cat, payload) => warnings.push({ cat, payload })
    let sgEmittedAt = null
    input.addText = (layer, x, y, text) => {
      if (text === 'Approved') sgEmittedAt = { x, y }
    }
    placeBottomZoneBlocks(input)

    expect(warnings.find(w => w.cat === 'sgOverflow')).toBeTruthy()
    expect(sgEmittedAt).not.toBeNull()
    // SG box width ≈ 70.6 mm. Bottom-right top-left x = cntR - 3 - width.
    // aCX = (sgBoxL + sgBoxR)/2 = cntR - 3 - width/2. "Approved" is centred ON aCX
    // by shifting its baseline-left insertion left by half the estimated width
    // (len * height * 0.55; sgTitleH = 3.5).
    const aCX = 250 - 3 - (200 * (25.4 / 72)) / 2
    const expectedTitleX = aCX - ('Approved'.length * 3.5 * 0.55) / 2
    expect(sgEmittedAt.x).toBeCloseTo(expectedTitleX, 1)
  })

  test('returned placedBlocks contains every successfully placed block by name', () => {
    const input = baseInput()
    input.obstacles = [{ name: 'title', x: 0, y: 90, width: 250, height: 30 }]
    const result = placeBottomZoneBlocks(input)

    const names = result.placedBlocks.map(b => b.name)
    expect(names).toContain('title')      // pre-seeded obstacle survives
    expect(names).toContain('ofd')
    expect(names).toContain('schedule')
    expect(names).toContain('beacon')
    expect(names).toContain('statement')
    expect(names).toContain('sg')
  })
})
