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

describe('capeLoToDxfSouthUp (north-up east-right after 2026-06-05 flip)', () => {
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
  test.each(fixtures)('$name → DXF X = -capeY (easting) and DXF Y = -capeX (northing)', ({ capeY, capeX }) => {
    const out = capeLoToDxfSouthUp(capeY, capeX)
    expect(out.x).toBeCloseTo(-capeY, 6)
    expect(out.y).toBeCloseTo(-capeX, 6)
  })
  test('regression sentinel: typical Cape Lo input produces negative DXF coordinates', () => {
    // Post-flip: Cape Lo (Y>0, X>0) → DXF (x<0, y<0) by design (negate both axes).
    // This sentinel catches an accidental revert to the old south-up (x=y, y=x) form.
    const out = capeLoToDxfSouthUp(50000, 2200000)
    expect(out.x).toBeLessThan(0)
    expect(out.y).toBeLessThan(0)
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

  test('skips parcel with mixed NaN+finite vertices (no NaN VERTEX in output)', () => {
    const opts = {
      parcels: { features: [
        { type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[50000, 2200000], [50100, 2200000], [NaN, NaN], [50000, 2200000]]] },
          properties: { stand: 'MIXED' } },
      ]},
      beacons: { features: [] },
      metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
    }
    const { buffer, warnings } = generateDXF(opts, fakeLogger)
    expect(warnings.summary.parcels).toBe(1)
    // The DXF text must not contain the literal string "NaN" inside a VERTEX entity.
    expect(buffer.toString()).not.toMatch(/\bVERTEX\b[\s\S]{0,200}NaN/)
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
  test('every beacon emits a plain open CIRCLE with no radial/cross LINEs', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    // One open CIRCLE per beacon on the BEACONS layer (SI 727 open-circle convention)
    expect(entityCount(dxf, 'CIRCLE', 'BEACONS')).toBe(2)
    // No radial "fill" or crossing "+" LINEs — the symbol is a clean open circle
    // (the placed/found differentiation by symbol was removed to match the ideal).
    expect(entityCount(dxf, 'LINE', 'BEACONS')).toBe(0)
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
  test('emits the PDF-style compass rose on NORTH_ARROW layer', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    // 8 triangular points (3 LINEs each = 24) + 4 double N–S axis lines = 28.
    expect(entityCount(dxf, 'LINE', 'NORTH_ARROW')).toBe(28)
    // N and S main points are SOLID-filled.
    expect(entityCount(dxf, 'SOLID', 'NORTH_ARROW')).toBe(2)
    // White centre hub circle.
    expect(entityCount(dxf, 'CIRCLE', 'NORTH_ARROW')).toBe(1)
    // "TN" (true north) label.
    expect(entityCount(dxf, 'TEXT', 'NORTH_ARROW')).toBe(1)
    expect(dxf).toMatch(/\bNORTH_ARROW\b[\s\S]*?\bTN\b/)
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

  test('scale-bar physical width matches the labelled ground length', () => {
    // The bar is now fitted to the planner's reserved scale-bar slot (so it can
    // never overflow into the schedule placed beside it), so its labelled length
    // is the largest "nice" length that fits the slot — not a fixed 50 m. What
    // must always hold is dimensional honesty: the bar's physical ground width
    // equals its rightmost tick label. We assert that invariant.
    // A real outside figure is required so the page layout has finite coordinates.
    const optsWithGeom = {
      ...opts,
      outsideFigureData: {
        edges: [
          { side: 'A-B', distance: 200, direction: '90°00\'00"', pointId: 'A', y: 50000, x: 2200000 },
          { side: 'B-C', distance: 200, direction: '180°00\'00"', pointId: 'B', y: 50200, x: 2200000 },
          { side: 'C-D', distance: 200, direction: '270°00\'00"', pointId: 'C', y: 50200, x: 2200200 },
          { side: 'D-A', distance: 200, direction: '0°00\'00"',   pointId: 'D', y: 50000, x: 2200200 },
        ],
      },
    }
    const { buffer } = generateDXF(optsWithGeom, fakeLogger)
    const dxf = buffer.toString()
    // The 4 ticks are at f = 0, 0.25, 0.5, 1 of the bar width.
    // Extract their x-coordinates by walking SCALE_BAR LINEs that are vertical
    // (i.e., x1 === x2). The leftmost x is f=0, the rightmost is f=1; their
    // difference is the bar's ground width.
    const tickXs = []
    const tickLabels = []
    const entRe = /\b0\s*\n\s*(LINE|TEXT)\b([\s\S]*?)(?=\b0\s*\n\s*[A-Z]+\b)/g
    for (const m of dxf.matchAll(entRe)) {
      const body = m[2]
      if (!/\b8\s*\n\s*SCALE_BAR\b/.test(body)) continue
      if (m[1] === 'LINE') {
        const x1 = parseFloat((body.match(/\b10\s*\n\s*(-?[\d.]+)/) || [])[1])
        const y1 = parseFloat((body.match(/\b20\s*\n\s*(-?[\d.]+)/) || [])[1])
        const x2 = parseFloat((body.match(/\b11\s*\n\s*(-?[\d.]+)/) || [])[1])
        const y2 = parseFloat((body.match(/\b21\s*\n\s*(-?[\d.]+)/) || [])[1])
        if (Math.abs(x1 - x2) < 1e-6 && Math.abs(y1 - y2) > 1) tickXs.push(x1)   // vertical
      } else {
        // TEXT: collect the pure-number tick labels (exclude the "1:<scale>" footer).
        const t = ((body.match(/\b1\s*\n\s*(.+)/) || [])[1] || '').trim()
        if (/^\d+$/.test(t)) tickLabels.push(parseInt(t, 10))
      }
    }
    tickXs.sort((a, b) => a - b)
    expect(tickXs.length).toBeGreaterThanOrEqual(2)
    const barWidth = tickXs[tickXs.length - 1] - tickXs[0]
    // Dimensional honesty: physical width == the largest (rightmost) tick label.
    const maxLabel = Math.max(...tickLabels)
    expect(barWidth).toBeCloseTo(maxLabel, 0)
    // And the bar is slot-fitted, so it never exceeds the un-capped picker length.
    expect(barWidth).toBeLessThanOrEqual(50)
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

  test('renders 4 corner reference crosses with Y= / X= coordinate labels (PDF parity)', () => {
    // Ports the PDF's renderOutsideFigureTickMarks: a "+" at each of the figure's
    // four coordinate corners (8 arm LINEs) labelled Y=<westing> / X=<southing>,
    // instead of scattered single-value edge ticks that float for diagonal figures.
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    // 4 crosses × 2 arms = 8 GRID LINEs.
    expect(entityCount(dxf, 'LINE', 'GRID')).toBe(8)
    // Collect GRID-layer TEXT labels.
    const labels = []
    const parts = dxf.split(/^\s*0\s*\r?\n/m)
    for (const e of parts) {
      if (!/^\s*TEXT/.test(e)) continue
      if (!/^\s*8\r?\n\s*GRID\b/m.test(e)) continue
      const t = (e.match(/^\s*1\r?\n\s*([^\r\n]+)/m) || [])[1]
      if (t) labels.push(t.trim())
    }
    // Each cross has a Y= and an X= label → 4 of each.
    expect(labels.filter(t => /^Y=-?\d+$/.test(t))).toHaveLength(4)
    expect(labels.filter(t => /^X=-?\d+$/.test(t))).toHaveLength(4)
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

describe('generateDXF — outside-figure annotation foundation', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  const opts = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
  }
  test('declares the OUTSIDE_FIGURE_LABELS layer', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    expect(countLayerOnTable(buffer.toString(), 'OUTSIDE_FIGURE_LABELS')).toBe(1)
  })
  test('warnings.summary includes outsideFigureVertices counter at zero', () => {
    const { warnings } = generateDXF(opts, fakeLogger)
    expect(warnings.summary.outsideFigureVertices).toBe(0)
  })
})

describe('generateDXF — title block (PDF-matched, SI 727)', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  const opts = {
    parcels: { features: [
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[50000, 2200000], [50050, 2200000], [50050, 2200050], [50000, 2200050], [50000, 2200000]]] }, properties: { stand: '123', area_m2: 1000 } },
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[50050, 2200050], [50100, 2200050], [50100, 2200100], [50050, 2200100], [50050, 2200050]]] }, properties: { stand: '124', area_m2: 1000 } },
    ] },
    beacons: { features: [] },
    outsideFigureData: {
      edges: [
        { side: 'AB', y: 50000, x: 2200000 }, { side: 'BC', y: 50200, x: 2200000 },
        { side: 'CD', y: 50200, x: 2200100 }, { side: 'DA', y: 50000, x: 2200100 },
      ],
      coordinates: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
    },
    metadata: {
      designation: 'STAND 123 BORROWDALE',
      surveyOf: 'Borrowdale',
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

  test('heading mirrors the PDF: "GENERAL PLAN" / "of" / "Stands … Township"', () => {
    const dxf = generateDXF(opts, fakeLogger).buffer.toString()
    expect(dxf).toMatch(/\bGENERAL PLAN\b/)
    expect(dxf).toMatch(/Stands 123 - 124 Borrowdale/)
  })

  test('omits surveyor firm & licence — SI 727 does not require them on General Plans', () => {
    const dxf = generateDXF(opts, fakeLogger).buffer.toString()
    expect(dxf).not.toMatch(/Acme Surveying & Mapping/)
    expect(dxf).not.toMatch(/PLS 1234/)
  })

  test('whole-portion / parent property / district appear via the figure-description sentence', () => {
    const dxf = generateDXF(opts, fakeLogger).buffer.toString()
    expect(dxf).toMatch(/being a portion of Borrowdale of Shabani Mine Surface Rights A/)
    expect(dxf).toMatch(/situate in the district of Harare/)
  })
})

describe('generateDXF — endorsement zone (PDF-aligned table)', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  const opts = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: {
      surveyor: 'J. Doe',
      licenseNumber: 'PLS 1234',
    },
    scale: '1:500', sheetSize: 'ISO_A2',
  }
  test('emits the ENDORSEMENTS table (No./STATEMENT/Date/Surveyor-General) + Dispensation row', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    expect(dxf).toMatch(/ENDORSEMENTS/)
    expect(dxf).toMatch(/\bSTATEMENT\b/)            // table column header (PDF parity)
    expect(dxf).toMatch(/Surveyor-General/)         // table column header
    // The statement wraps across TEXT entities, so assert wrap-independent tokens.
    expect(dxf).toMatch(/Dispensation Certificate No\./)
    expect(dxf).toMatch(/\brelates\b/)
  })

  test('omits the old field-label layout (PDF carries none of these)', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    expect(dxf).not.toMatch(/APPROVED FOR LODGEMENT/)
    expect(dxf).not.toMatch(/Reference:/)
    expect(dxf).not.toMatch(/Plan No\.:/)
    expect(dxf).not.toMatch(/Prior diagrams/)
    // The PDF emits no surveyor-certification line either.
    expect(dxf).not.toMatch(/certify this plan correct/)
  })
})

import { computeOutsideFigureVertices } from '../dxfGenerator.js'

describe('computeOutsideFigureVertices', () => {
  test('walks edges in order and returns the closing duplicate', () => {
    const ofd = {
      edges: [
        { pointId: 'A', y: 50000, x: 2200000 },
        { pointId: 'B', y: 50100, x: 2200000 },
        { pointId: 'C', y: 50100, x: 2200100 },
        { pointId: 'D', y: 50000, x: 2200100 },
      ],
      constants: { pointId: 'A', y: 50000, x: 2200000 },
    }
    const result = computeOutsideFigureVertices(ofd)
    expect(result.vertices).toHaveLength(5)
    expect(result.vertices.map(v => v.pointId)).toEqual(['A', 'B', 'C', 'D', 'A'])
    expect(result.skippedCount).toBe(0)
  })

  test('returns { vertices: [], skippedCount: 0 } when edges missing', () => {
    expect(computeOutsideFigureVertices({})).toEqual({ vertices: [], skippedCount: 0 })
    expect(computeOutsideFigureVertices({ edges: [] })).toEqual({ vertices: [], skippedCount: 0 })
    expect(computeOutsideFigureVertices(null)).toEqual({ vertices: [], skippedCount: 0 })
  })

  test('filters non-finite vertices and counts them in skippedCount', () => {
    const ofd = {
      edges: [
        { pointId: 'A', y: 50000, x: 2200000 },
        { pointId: 'B', y: NaN,   x: 2200000 },
        { pointId: 'C', y: 50100, x: Infinity },
        { pointId: 'D', y: 50000, x: 2200100 },
      ],
      constants: { pointId: 'A', y: 50000, x: 2200000 },
    }
    const result = computeOutsideFigureVertices(ofd)
    expect(result.vertices.map(v => v.pointId)).toEqual(['A', 'D', 'A'])
    expect(result.skippedCount).toBe(2)
  })

  test('filters vertices with coordinate magnitudes above 1e7', () => {
    const ofd = {
      edges: [
        { pointId: 'A', y: 50000, x: 2200000 },
        { pointId: 'X', y: 5e7, x: 2200000 },  // implausibly large westing
      ],
      constants: { pointId: 'A', y: 50000, x: 2200000 },
    }
    const result = computeOutsideFigureVertices(ofd)
    expect(result.vertices.find(v => v.pointId === 'X')).toBeUndefined()
    expect(result.skippedCount).toBe(1)
  })
})
