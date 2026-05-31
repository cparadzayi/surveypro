/**
 * Unit tests for dxfGenerator pure helpers.
 * Run with:  cd app-backend && npm run test -- dxfGenerator
 */
import { describe, test, expect } from '@jest/globals'
import { countLayerOnTable, entityCount } from './dxfParse.js'
import { capeLoToDxfSouthUp, generateDXF } from '../dxfGenerator.js'

describe('dxfParse helpers (smoke)', () => {
  test('countLayerOnTable returns 0 for an empty input', () => {
    expect(countLayerOnTable('', 'NONEXISTENT')).toBe(0)
  })
})

describe('capeLoToDxfSouthUp', () => {
  // Fixtures spanning Cape Lo zones 25 (Bulawayo), 27 (Harare),
  // 29 (Mutare), 31 (eastern Zimbabwe). All Y, X positive by convention.
  const fixtures = [
    { name: 'Lo 25',  capeY:  35123.456, capeX: 1987654.321 },
    { name: 'Lo 27',  capeY:  72500.000, capeX: 2100000.000 },
    { name: 'Lo 29',  capeY:  50000.000, capeX: 2200000.000 },
    { name: 'Lo 31a', capeY:  18000.000, capeX: 2050000.000 },
    { name: 'Lo 31b', capeY: 110000.000, capeX: 2300000.000 },
    { name: 'origin', capeY:      1.000, capeX:       1.000 },
  ]
  test.each(fixtures)('$name → DXF X = capeY and DXF Y = capeX', ({ capeY, capeX }) => {
    const out = capeLoToDxfSouthUp(capeY, capeX)
    expect(out.x).toBeCloseTo(capeY, 6)
    expect(out.y).toBeCloseTo(capeX, 6)
  })
  test('regression sentinel: old (x = -y) formula would fail', () => {
    const out = capeLoToDxfSouthUp(50000, 2200000)
    expect(out.x).not.toBeLessThan(0)   // catches accidental sign-flip revert
    expect(out.y).not.toBeLessThan(0)
  })
})

describe('generateDXF return shape', () => {
  const minimalOptions = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: { surveyor: 'Test Surveyor', date: '2026-05-31' },
    projection: 'EPSG:22291',
    scale: '1:500',
    sheetSize: 'ISO_A2',
  }
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }

  test('returns { buffer, warnings } with Buffer and counters', () => {
    const result = generateDXF(minimalOptions, fakeLogger)
    expect(Buffer.isBuffer(result.buffer)).toBe(true)
    expect(typeof result.warnings).toBe('object')
    expect(result.warnings.count).toBe(0)
    expect(typeof result.warnings.summary).toBe('object')
  })

  test('returned DXF starts with HEADER and ends with EOF', () => {
    const { buffer } = generateDXF(minimalOptions, fakeLogger)
    const dxf = buffer.toString()
    expect(dxf).toMatch(/\bSECTION\b[\s\S]*?\bHEADER\b/)
    expect(dxf).toMatch(/\bEOF\b\s*$/)
  })
})

describe('generateDXF — layers + UCS table additions', () => {
  const minimalOptions = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: {},
    scale: '1:500',
    sheetSize: 'ISO_A2',
  }
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }

  test('declares the four new layers', () => {
    const { buffer } = generateDXF(minimalOptions, fakeLogger)
    const dxf = buffer.toString()
    for (const layer of ['NORTH_ARROW', 'SCALE_BAR', 'GRID', 'MARGIN_GUIDES']) {
      expect(countLayerOnTable(dxf, layer)).toBe(1)
    }
  })

  test('declares the CAD_NORTH_UP UCS entry', () => {
    const { buffer } = generateDXF(minimalOptions, fakeLogger)
    const dxf = buffer.toString()
    // UCS table must appear with the named entry inside.
    expect(dxf).toMatch(/\bTABLE\b[\s\S]*?\bUCS\b[\s\S]*?\bCAD_NORTH_UP\b[\s\S]*?\bENDTAB\b/)
  })
})

describe('generateDXF — graceful degradation on bad inputs', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }

  test('skips beacon with NaN coordinates and increments warnings.beacons', () => {
    const opts = {
      parcels: { features: [] },
      beacons: {
        features: [
          { type: 'Feature', geometry: { coordinates: [NaN, 2200000] },
            properties: { pointId: 'X1' } },
          { type: 'Feature', geometry: { coordinates: [50000, 2200000] },
            properties: { pointId: 'X2' } },
        ],
      },
      metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
    }
    const { warnings } = generateDXF(opts, fakeLogger)
    expect(warnings.summary.beacons).toBe(1)
    expect(warnings.count).toBeGreaterThanOrEqual(1)
  })

  test('skips parcel with fewer than 3 finite vertices and increments warnings.parcels', () => {
    const opts = {
      parcels: { features: [
        { type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[50000, 2200000], [50001, 2200000]]] },
          properties: { stand: 'X' } },
      ]},
      beacons: { features: [] },
      metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
    }
    const { warnings } = generateDXF(opts, fakeLogger)
    expect(warnings.summary.parcels).toBe(1)
  })
})

describe('generateDXF — beacon symbol differentiation', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  const opts = {
    parcels: { features: [] },
    beacons: { features: [
      { type: 'Feature', geometry: { coordinates: [50000, 2200000] },
        properties: { pointId: 'P1', type: 'placed' } },
      { type: 'Feature', geometry: { coordinates: [50050, 2200050] },
        properties: { pointId: 'F1', type: 'found' } },
    ] },
    outsideFigureData: null,
    metadata: {},
    scale: '1:500',
    sheetSize: 'ISO_A2',
  }
  test('placed beacon emits CIRCLE + 8 radial LINEs', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    // 2 CIRCLE entities total (one per beacon), both on BEACONS layer
    expect(entityCount(dxf, 'CIRCLE', 'BEACONS')).toBe(2)
    // 8 LINEs for the placed fill + 2 LINEs for the found cross = 10 BEACONS lines
    expect(entityCount(dxf, 'LINE', 'BEACONS')).toBe(10)
  })
})

describe('generateDXF — north arrow', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  const opts = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
  }
  test('emits 3 LINEs and 1 TEXT on NORTH_ARROW layer', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    expect(entityCount(dxf, 'LINE', 'NORTH_ARROW')).toBe(3)   // arrowhead triangle
    expect(entityCount(dxf, 'TEXT', 'NORTH_ARROW')).toBe(1)   // "S" label
  })
})

describe('generateDXF — scale bar', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  const opts = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
  }
  test('emits centreline + tick LINEs and metre labels on SCALE_BAR', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    // Outer rect (2 LINEs) + centreline (1) + 4 tick verticals = 7 LINEs
    expect(entityCount(dxf, 'LINE', 'SCALE_BAR')).toBeGreaterThanOrEqual(7)
    // Tick labels (4) + "1:<scale>" footer (1) = 5 TEXT entities
    expect(entityCount(dxf, 'TEXT', 'SCALE_BAR')).toBeGreaterThanOrEqual(5)
  })
})

describe('generateDXF — coordinate grid ticks', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  // Fixture with an outside figure spanning a 200 m × 200 m area at 1:500.
  // Should produce grid ticks at 50 m intervals along the four borders.
  const opts = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: {
      edges: [
        { side: 'A-B', distance: 200, direction: '90°00\'00"', pointId: 'A', y: 50000, x: 2200000 },
        { side: 'B-C', distance: 200, direction: '180°00\'00"', pointId: 'B', y: 50200, x: 2200000 },
        { side: 'C-D', distance: 200, direction: '270°00\'00"', pointId: 'C', y: 50200, x: 2200200 },
        { side: 'D-A', distance: 200, direction: '0°00\'00"',   pointId: 'D', y: 50000, x: 2200200 },
      ],
      constants: { pointId: 'A', y: 50000, x: 2200000 },
    },
    metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
  }
  test('emits at least some tick LINEs and coordinate labels on GRID layer', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    expect(entityCount(dxf, 'LINE', 'GRID')).toBeGreaterThan(0)
    expect(entityCount(dxf, 'TEXT', 'GRID')).toBeGreaterThan(0)
  })
})

describe('generateDXF — margin guides', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  const opts = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
  }
  test('emits corner tick + crop-mark LINEs on MARGIN_GUIDES', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    // 4 corners × 2 ticks (one X-axis tick + one Y-axis tick) = 8 content-corner LINEs
    // 4 page corners × 2 crop-mark legs = 8 crop-mark LINEs
    // Total >= 16
    expect(entityCount(dxf, 'LINE', 'MARGIN_GUIDES')).toBeGreaterThanOrEqual(16)
  })
})

describe('generateDXF — beacon description block', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  const opts = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
    beaconGroups: [
      { points: 'BM 001–BM 003', description: 'Permanent concrete pillars' },
      { points: 'BM 004–BM 008', description: 'Iron pegs with cement collar' },
    ],
  }
  test('emits header + per-group TEXT entities on TITLE_BLOCK layer', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    expect(dxf).toMatch(/BEACON DESCRIPTIONS/)
    expect(dxf).toMatch(/Permanent concrete pillars/)
    expect(dxf).toMatch(/Iron pegs/)
  })
})

describe('generateDXF — title block field completion', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  const opts = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: {
      designation: 'STAND 123 BORROWDALE',
      surveyOf: 'A portion of Stand 456 Borrowdale',
      township: 'Borrowdale',
      firm: 'Acme Surveying & Mapping (Pvt) Ltd',
      licenseNumber: 'PLS 1234',
      parentProperty: 'Shabani Mine Surface Rights A',
      wholePortion: 'a portion',
      district: 'Harare',
      surveyor: 'J. Doe',
      date: '2026-05-31',
    },
    scale: '1:500', sheetSize: 'ISO_A2',
  }
  test('renders firm, license, parent property, whole/portion, district in the title block', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    expect(dxf).toMatch(/Acme Surveying & Mapping/)
    expect(dxf).toMatch(/PLS 1234/)
    expect(dxf).toMatch(/Shabani Mine Surface Rights A/)
    expect(dxf).toMatch(/a portion/)
    expect(dxf).toMatch(/Harare/)
  })
})
