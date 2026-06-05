/**
 * Layer 2 structural integration tests for dxfGenerator.
 * Asserts section integrity, layer presence, entity counts per layer,
 * orientation invariant, and UCS presence — without snapshotting full output.
 */
import { describe, test, expect, beforeAll } from '@jest/globals'
import { generateDXF } from '../dxfGenerator.js'
import { countLayerOnTable, entityCount, parseFirstEntityOf } from './dxfParse.js'
import { sampleFixture } from './fixtures/sampleDxfPlan.js'

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }

describe('dxfGenerator integration — developed-township planType', () => {
  test("planType='general-developed' suppresses ALL edge labels (parcel + outside-figure)", () => {
    // Baseline: sample fixture without planType emits both DISTANCES and DIRECTIONS
    // from parcel edges and from outside-figure edges.
    const base = generateDXF(sampleFixture, fakeLogger)
    const baseDist = entityCount(base.buffer.toString(), 'TEXT', 'DISTANCES')
    const baseDir  = entityCount(base.buffer.toString(), 'TEXT', 'DIRECTIONS')
    expect(baseDist).toBeGreaterThan(0)
    expect(baseDir).toBeGreaterThan(0)

    // Developed plan: BOTH parcel-edge AND outside-figure edge labels suppressed.
    // The DISTANCES + DIRECTIONS layers should be empty of TEXT entities.
    const dev = generateDXF({ ...sampleFixture, planType: 'general-developed' }, fakeLogger)
    const devDist = entityCount(dev.buffer.toString(), 'TEXT', 'DISTANCES')
    const devDir  = entityCount(dev.buffer.toString(), 'TEXT', 'DIRECTIONS')

    expect(devDist).toBe(0)
    expect(devDir).toBe(0)

    // Sanity: OUTSIDE_FIGURE_LABELS (vertex coords + tick marks) still emit —
    // only the distance/direction edge annotations are suppressed.
    expect(entityCount(dev.buffer.toString(), 'TEXT', 'OUTSIDE_FIGURE_LABELS'))
      .toBe(entityCount(base.buffer.toString(), 'TEXT', 'OUTSIDE_FIGURE_LABELS'))
  })
})

describe('dxfGenerator integration — sample fixture', () => {
  let dxf, warnings
  beforeAll(() => {
    const r = generateDXF(sampleFixture, fakeLogger)
    dxf = r.buffer.toString()
    warnings = r.warnings
  })

  test('overall section integrity (HEADER … ENTITIES … EOF)', () => {
    expect(dxf).toMatch(/\bSECTION\b[\s\S]*?\bHEADER\b/)
    expect(dxf).toMatch(/\bSECTION\b[\s\S]*?\bENTITIES\b/)
    expect(dxf).toMatch(/\bEOF\b\s*$/)
  })

  test('all 13 required layers are declared exactly once', () => {
    const required = [
      'OUTSIDE_FIGURE', 'OUTSIDE_FIGURE_LABELS', 'PARCELS', 'BEACONS', 'BEACON_LABELS',
      'DISTANCES', 'DIRECTIONS', 'STAND_NUMBERS', 'TITLE_BLOCK',
      'NORTH_ARROW', 'SCALE_BAR', 'GRID', 'MARGIN_GUIDES',
    ]
    for (const l of required) {
      expect(countLayerOnTable(dxf, l)).toBe(1)
    }
  })

  test('emits 4 vertex coord TEXT entities on OUTSIDE_FIGURE_LABELS', () => {
    expect(entityCount(dxf, 'TEXT', 'OUTSIDE_FIGURE_LABELS')).toBe(4)
  })

  test('emits 4 tick LINE entities on OUTSIDE_FIGURE_LABELS', () => {
    expect(entityCount(dxf, 'LINE', 'OUTSIDE_FIGURE_LABELS')).toBe(4)
  })

  test('outside-figure edges contribute distance + bearing on the existing layers', () => {
    // Pre-OF-annotation: parcel edges emitted 7 TEXTs each on DISTANCES and
    // DIRECTIONS. The 4 OF edges add one of each per edge, total 11+11.
    expect(entityCount(dxf, 'TEXT', 'DISTANCES')).toBe(11)
    expect(entityCount(dxf, 'TEXT', 'DIRECTIONS')).toBe(11)
  })

  test('vertex labels contain the Cape Lo coordinates from the fixture', () => {
    for (const v of sampleFixture.outsideFigureData.edges) {
      expect(dxf).toMatch(new RegExp(`Y=${Math.round(v.y)}.*?X=${Math.round(v.x)}`))
    }
  })

  test('every beacon has a label on BEACON_LABELS sourced from properties.pointId', () => {
    // The fixture's beacons use properties.pointId ('A', 'B', …) — the only ID
    // field most production GeoJSON sources populate. The generator must read
    // from pointId (with name / beacon_name as fallbacks) so labels actually
    // appear next to each beacon symbol.
    expect(entityCount(dxf, 'TEXT', 'BEACON_LABELS'))
      .toBe(sampleFixture.beacons.features.length)
    for (const b of sampleFixture.beacons.features) {
      expect(dxf).toMatch(new RegExp(`\\b8\\s*\\n\\s*BEACON_LABELS\\b[\\s\\S]*?\\b1\\s*\\n\\s*${b.properties.pointId}\\b`))
    }
  })

  test('edge labels render distance and direction on DISTANCES / DIRECTIONS even when props.edges is missing', () => {
    // The fixture's parcels carry only stand + area_m2; properties.edges is
    // intentionally omitted (most callers don't pre-compute it). The generator
    // must derive distances and South-oriented bearings from the polygon's
    // vertex pairs so the labels still appear.
    expect(entityCount(dxf, 'TEXT', 'DISTANCES')).toBeGreaterThan(0)
    expect(entityCount(dxf, 'TEXT', 'DIRECTIONS')).toBeGreaterThan(0)
  })

  test('entity counts on key layers match the fixture', () => {
    expect(entityCount(dxf, 'POLYLINE', 'PARCELS'))
      .toBe(sampleFixture.parcels.features.length)
    expect(entityCount(dxf, 'CIRCLE', 'BEACONS'))
      .toBe(sampleFixture.beacons.features.length)
    expect(entityCount(dxf, 'LINE', 'NORTH_ARROW')).toBeGreaterThanOrEqual(3)
    expect(entityCount(dxf, 'LINE', 'SCALE_BAR')).toBeGreaterThanOrEqual(7)
    expect(entityCount(dxf, 'LINE', 'GRID')).toBeGreaterThan(0)
    expect(entityCount(dxf, 'LINE', 'MARGIN_GUIDES')).toBeGreaterThanOrEqual(16)
    expect(entityCount(dxf, 'TEXT', 'TITLE_BLOCK')).toBeGreaterThanOrEqual(8)
  })

  test('orientation invariant — DXF X = Cape Lo Y, DXF Y = Cape Lo X', () => {
    const beacon = parseFirstEntityOf(dxf, 'CIRCLE', 'BEACONS')
    expect(beacon).not.toBeNull()
    expect(beacon.x).toBeCloseTo(sampleFixture.beacons.features[0].geometry.coordinates[0], 3)
    expect(beacon.y).toBeCloseTo(sampleFixture.beacons.features[0].geometry.coordinates[1], 3)
  })

  test('UCS table contains CAD_NORTH_UP entry', () => {
    expect(dxf).toMatch(/\bUCS\b[\s\S]{0,500}\bCAD_NORTH_UP\b/)
  })

  test('endorsement block, beacon descriptions, and prior diagrams all rendered', () => {
    expect(dxf).toMatch(/APPROVED FOR LODGEMENT/)
    expect(dxf).toMatch(/Dispensation Certificate/)
    expect(dxf).toMatch(/BEACON DESCRIPTIONS/)
    expect(dxf).toMatch(/Permanent concrete pillars/)
    expect(dxf).toMatch(/Diagram-GP No\. 4567/)
    expect(dxf).toMatch(/certify this plan correct/)
  })

  test('clean fixture produces zero warnings', () => {
    expect(warnings.count).toBe(0)
  })
})

describe('dxfGenerator integration — graceful degradation', () => {
  test('one bad beacon + one bad parcel ⇒ warnings.count === 2, no throw', () => {
    const bad = JSON.parse(JSON.stringify(sampleFixture))
    bad.beacons.features.push({
      type: 'Feature',
      geometry: { coordinates: [NaN, NaN] },
      properties: { pointId: 'BAD', type: 'placed' },
    })
    bad.parcels.features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[50000, 2200000], [50001, 2200000]]] },
      properties: { stand: 'BAD' },
    })
    const { buffer, warnings } = generateDXF(bad, fakeLogger)
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(warnings.count).toBe(2)
    expect(warnings.summary.beacons).toBe(1)
    expect(warnings.summary.parcels).toBe(1)
  })

  test('NaN OF vertex bumps warnings.summary.outsideFigureVertices and does not throw', () => {
    const bad = JSON.parse(JSON.stringify(sampleFixture))
    bad.outsideFigureData.edges[1].y = NaN
    const { buffer, warnings } = generateDXF(bad, fakeLogger)
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(warnings.summary.outsideFigureVertices).toBe(1)
    expect(warnings.count).toBeGreaterThanOrEqual(1)
  })

  test('OF edge labels reflect actual geometry when a vertex is filtered (no shifted metadata)', () => {
    // When edges[1].y is NaN (vertex B), vertices is filtered to [A, C, D, A_dup].
    // The fixture's OF is 200 m × 100 m (A=(50000,2200000), B=(50200,2200000),
    // C=(50200,2200100), D=(50000,2200100)). After filtering B, the polygon edges
    // become A→C (diagonal ~223.6 m), C→D (200 m, intact metadata), D→A (100 m,
    // intact metadata).
    //
    // Pre-fix bug: edges[i] was indexed positionally, so the bridged A→C edge
    // read edges[0].distance (200 m — original A→B metadata) — silently wrong
    // for the actual 223.6 m diagonal. Post-fix: bridged edges have no intact
    // metadata and fall back to geometry, producing 223.61 m.
    //
    // Assertion: at least one DISTANCES TEXT label must show a value > 200 m
    // (the diagonal). If the bug returns, the bridged edge would label 200 m
    // (or any other intact-edge value) instead.
    const bad = JSON.parse(JSON.stringify(sampleFixture))
    bad.outsideFigureData.edges[1].y = NaN
    const { buffer } = generateDXF(bad, fakeLogger)
    // Walk the DXF line-pair stream and collect TEXT values on DISTANCES layer.
    const lines = buffer.toString().split('\n')
    const distances = []
    let i = 0, currentType = null, currentLayer = null
    while (i < lines.length - 1) {
      const code = lines[i].trim(); const value = lines[i + 1].trim()
      i += 2
      if (code === '0' && /^[A-Z]+$/.test(value)) {
        currentType = value; currentLayer = null
      } else if (code === '8' && currentType === 'TEXT') {
        currentLayer = value
      } else if (code === '1' && currentType === 'TEXT' && currentLayer === 'DISTANCES') {
        distances.push(parseFloat(value))
      }
    }
    const diagonal = distances.filter(d => d > 200 && d < 250)
    expect(diagonal.length).toBeGreaterThanOrEqual(1)
  })
})

describe('dxfGenerator integration — SI 727 title-block lines', () => {
  test('figure-description sentence is emitted on TITLE_BLOCK', () => {
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const dxf = buffer.toString()
    // The opening "The figure ... represents ... comprising N stands" is
    // distinctive enough that no other line can match it.
    expect(dxf).toMatch(/The figure [A-Z, ]+ represents .+? comprising \d+ stands/)
  })

  test('Vide line is emitted on TITLE_BLOCK', () => {
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const dxf = buffer.toString()
    expect(dxf).toMatch(/Vide diagram S\.G\. No\./)
  })

  test('figure-description and Vide lines live on the TITLE_BLOCK layer', () => {
    // Walk the DXF line-pair stream and collect TEXT values per layer.
    // Mirrors the walker pattern already used by the OF edge-metadata test
    // at the bottom of "graceful degradation".
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const dxf = buffer.toString()
    const lines = dxf.split('\n')
    const titleBlockTexts = []
    let i = 0, currentType = null, currentLayer = null
    while (i < lines.length - 1) {
      const code = lines[i].trim(), value = lines[i + 1].trim()
      i += 2
      if (code === '0' && /^[A-Z_]+$/.test(value)) { currentType = value; currentLayer = null }
      else if (code === '8' && currentType === 'TEXT') currentLayer = value
      else if (code === '1' && currentType === 'TEXT' && currentLayer === 'TITLE_BLOCK') {
        titleBlockTexts.push(value)
      }
    }
    expect(titleBlockTexts.some(t => /The figure .+ represents/.test(t))).toBe(true)
    expect(titleBlockTexts.some(t => /Vide diagram S\.G\. No\./.test(t))).toBe(true)
  })

  test('no SHEET N label when sheetInfo is absent (single-sheet default)', () => {
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const dxf = buffer.toString()
    expect(dxf).not.toMatch(/\b1\s*\n\s*SHEET \d+\b/)
  })

  test('SHEET 1 label present when sheetInfo signals multi-sheet', () => {
    const withMultiSheet = { ...sampleFixture, sheetInfo: { sheetNumber: 1, totalSheets: 3 } }
    const { buffer } = generateDXF(withMultiSheet, fakeLogger)
    const dxf = buffer.toString()
    // Group code 1 is the text value; preceding context confirms it's a
    // TEXT entity on TITLE_BLOCK.
    expect(dxf).toMatch(/\b8\s*\n\s*TITLE_BLOCK\b[\s\S]*?\b1\s*\n\s*SHEET 1\b/)
  })

  test('SHEET 2 label when sheetNumber: 2', () => {
    const sheet2 = { ...sampleFixture, sheetInfo: { sheetNumber: 2, totalSheets: 5 } }
    const { buffer } = generateDXF(sheet2, fakeLogger)
    expect(buffer.toString()).toMatch(/\b8\s*\n\s*TITLE_BLOCK\b[\s\S]*?\b1\s*\n\s*SHEET 2\b/)
  })

  test('clean sampleFixture still produces zero warnings after title-block changes', () => {
    const { warnings } = generateDXF(sampleFixture, fakeLogger)
    expect(warnings.count).toBe(0)
  })
})

describe('dxfGenerator integration — Schedule of Areas SI 727 columns', () => {
  function collectTextsByLayer(dxf, layer) {
    const lines = dxf.split('\n')
    const texts = []
    let i = 0, currentType = null, currentLayer = null
    while (i < lines.length - 1) {
      const code = lines[i].trim(), value = lines[i + 1].trim()
      i += 2
      if (code === '0' && /^[A-Z_]+$/.test(value)) { currentType = value; currentLayer = null }
      else if (code === '8' && currentType === 'TEXT') currentLayer = value
      else if (code === '1' && currentType === 'TEXT' && currentLayer === layer) {
        texts.push(value)
      }
    }
    return texts
  }

  test('schedule title "SCHEDULE OF AREAS" is emitted on TITLE_BLOCK', () => {
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const titleBlockTexts = collectTextsByLayer(buffer.toString(), 'TITLE_BLOCK')
    expect(titleBlockTexts).toContain('SCHEDULE OF AREAS')
  })

  test('all six SI 727 column headers appear as TEXT entities on TITLE_BLOCK', () => {
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const titleBlockTexts = collectTextsByLayer(buffer.toString(), 'TITLE_BLOCK')
    // singleColumn labels: 'STAND\nNo.', 'AREAS\nSQUARE\nMETRES',
    // 'DIAGRAM\nNUMBER', 'NUMBER', 'DATE', 'SURVEYOR-\nGENERAL'.
    // Each \n token becomes its own TEXT entity.
    expect(titleBlockTexts).toContain('STAND')
    expect(titleBlockTexts).toContain('AREAS')
    expect(titleBlockTexts).toContain('DIAGRAM')
    expect(titleBlockTexts).toContain('NUMBER')
    expect(titleBlockTexts).toContain('DATE')
    expect(titleBlockTexts.some(t => t.startsWith('SURVEYOR'))).toBe(true)
  })

  test('DEED parent header is emitted as a separate TEXT entity', () => {
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const titleBlockTexts = collectTextsByLayer(buffer.toString(), 'TITLE_BLOCK')
    expect(titleBlockTexts).toContain('DEED')
  })

  test('both stand numbers from the sample fixture appear on TITLE_BLOCK', () => {
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const titleBlockTexts = collectTextsByLayer(buffer.toString(), 'TITLE_BLOCK')
    expect(titleBlockTexts).toContain('123')
    expect(titleBlockTexts).toContain('124')
  })

  test('no TEXT entity on TITLE_BLOCK contains the literal "undefined" or "null"', () => {
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const titleBlockTexts = collectTextsByLayer(buffer.toString(), 'TITLE_BLOCK')
    for (const t of titleBlockTexts) {
      expect(t).not.toBe('undefined')
      expect(t).not.toBe('null')
    }
  })

  test('clean sampleFixture still produces zero warnings + scheduleOverflow null', () => {
    const { warnings } = generateDXF(sampleFixture, fakeLogger)
    expect(warnings.count).toBe(0)
    expect(warnings.summary.scheduleOverflow).toBeNull()
  })

  test('overflow fixture (200 parcels at A2) emits structured scheduleOverflow warning', () => {
    // Build a synthetic fixture with enough parcels to exceed the
    // single-zone budget at A2. The narrow col1 (~104mm) can fit at most
    // one multi-sub-table at A2 → any rowCount past rowsPerColumn overflows.
    const manyParcels = []
    for (let i = 1; i <= 200; i++) {
      manyParcels.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[
          [50000, 2200000], [50001, 2200000], [50001, 2200001], [50000, 2200001], [50000, 2200000],
        ]]},
        properties: { stand: String(i), area_m2: 100 + i },
      })
    }
    const overflowFixture = { ...sampleFixture, parcels: { features: manyParcels } }
    const { warnings } = generateDXF(overflowFixture, fakeLogger)
    expect(warnings.summary.scheduleOverflow).not.toBeNull()
    expect(warnings.summary.scheduleOverflow.atSheetSize).toBe('ISO_A2')
    expect(warnings.summary.scheduleOverflow.standCount).toBe(200)
    // requiredSheetSize is one of the ladder entries or 'multi-sheet-required'
    expect(['ISO_A1', 'ISO_A0', 'multi-sheet-required'])
      .toContain(warnings.summary.scheduleOverflow.requiredSheetSize)
  })
})
