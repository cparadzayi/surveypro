import { describe, test, expect } from '@jest/globals'
import { chooseTickIntervalMetres, computeTickGrid, axisTickValues, tickRungLadder, formatTickLabel, TICK_GEOMETRY_MM } from '../../../../app-shared/tickMarks.js'

// Every expectation here is measured off the Surveyor-General reference plan
// (mag1sh1a.dxf, Maglas/Shabani), not chosen: crosses with 4mm arms and 2.5mm
// labels, and labels written "X = +2247100". The grid spacing is the surveyor's
// rule: 300mm of paper between crosses (300m at 1:1000, 150m at 1:500).

describe('chooseTickIntervalMetres', () => {
  test('300m at 1:1000 and 150m at 1:500 (300mm of paper)', () => {
    expect(chooseTickIntervalMetres(1000)).toBe(300)
    expect(chooseTickIntervalMetres(500)).toBe(150)
    expect(chooseTickIntervalMetres(2000)).toBe(600)
  })

  test('the figure size does not shrink the interval', () => {
    expect(chooseTickIntervalMetres(1000, undefined, 276)).toBe(300)
  })

  test('paper spacing never exceeds 300mm at any scale', () => {
    for (const scale of [250, 500, 750, 1000, 1500, 2000, 2500, 5000, 10000]) {
      const paperMm = (chooseTickIntervalMetres(scale) * 1000) / scale
      expect(paperMm).toBeLessThanOrEqual(300)
      expect(paperMm).toBeGreaterThan(0)
    }
  })

  test('a looser target picks a coarser interval', () => {
    expect(chooseTickIntervalMetres(1000, 250)).toBe(200)
  })
})

describe('formatTickLabel', () => {
  test('matches the reference exactly — signed, no thousands separators', () => {
    expect(formatTickLabel('X', 2247100)).toBe('X = +2247100')
    expect(formatTickLabel('Y', 97700)).toBe('Y = +97700')
  })

  test('negative coordinates carry an explicit minus', () => {
    expect(formatTickLabel('Y', -1234)).toBe('Y = -1234')
  })

  test('does NOT group thousands (the reference groups nothing)', () => {
    expect(formatTickLabel('X', 2247100)).not.toContain(' 247')
    expect(formatTickLabel('X', 2247100)).not.toContain(',')
  })
})

describe('computeTickGrid', () => {
  test('snaps outward so the grid spans the whole figure', () => {
    const { intervalM, nodes } = computeTickGrid({
      yMin: 97383, yMax: 97901, xMin: 2247113, xMax: 2247612, scaleDenominator: 1000,
    })
    expect(intervalM).toBe(150)
    const ys = [...new Set(nodes.map(n => n.y))].sort((a, b) => a - b)
    const xs = [...new Set(nodes.map(n => n.x))].sort((a, b) => a - b)
    // 300m would end 88m past the X maximum, so the next spacing down is used.
    // Y starts outside (97383 -> 97350) and ends outside (97901 -> 97950); X
    // cannot do both at 150m, so it starts and ends 37m / 12m inside.
    expect(ys[0]).toBe(97350)
    expect(ys[ys.length - 1]).toBe(97950)
    expect(xs[0]).toBe(2247150)
    expect(xs[xs.length - 1]).toBe(2247600)
  })

  test('returns every intersection, interior nodes included', () => {
    // The reference carries crosses inside the figure, so the grid must offer
    // interior nodes; which ones get drawn is the renderer's clearance test.
    //
    const { intervalM, nodes } = computeTickGrid({
      yMin: 0, yMax: 600, xMin: 0, xMax: 600, scaleDenominator: 1000,
    })
    expect(intervalM).toBe(300)
    expect(nodes).toHaveLength(9)   // 3 x 3, not just the 8 perimeter nodes
    expect(nodes).toContainEqual({ y: 300, x: 300 })  // an interior node
  })

  test('every coordinate is a whole multiple of 50m, evenly spaced by the interval', () => {
    const { intervalM, nodes } = computeTickGrid({
      yMin: 97368.92, yMax: 97720.42, xMin: 2247108.72, xMax: 2247428.84, scaleDenominator: 1000,
    })
    for (const n of nodes) {
      expect(n.y % 50).toBeCloseTo(0, 6)
      expect(n.x % 50).toBeCloseTo(0, 6)
    }
    const ys = [...new Set(nodes.map(n => n.y))].sort((a, b) => a - b)
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBe(intervalM)
  })
})

describe('axisTickValues — the end rule', () => {
  test('starts within 50m of the minimum and ends within 50m of the maximum', () => {
    for (const [min, max] of [[97183, 97420], [97383, 97901], [2247113, 2247612], [100, 130], [-340, 910]]) {
      for (const spacing of [50, 100, 150, 200, 300, 600]) {
        const v = axisTickValues(min, max, spacing)
        if (v === null) continue
        expect(Math.abs(v[0] - min)).toBeLessThanOrEqual(50)
        expect(Math.abs(v[v.length - 1] - max)).toBeLessThanOrEqual(50)
        for (const c of v) expect(c % 50).toBeCloseTo(0, 6)
      }
    }
  })

  test('prefers a cross beyond the extreme (outside the figure) to one inside it', () => {
    // 97383 -> 97350 (outside), not 97400 (inside); 97901 -> 97950, not 97900.
    expect(axisTickValues(97383, 97901, 300)).toEqual([97350, 97650, 97950])
  })

  test('is null when the spacing cannot end within reach of the maximum', () => {
    // From 2247100 or 2247150, 300m steps land 88m / 150m past 2247612.
    expect(axisTickValues(2247113, 2247612, 300)).toBeNull()
  })

  test('the ladder offers only spacings both axes can satisfy, and 50m always is', () => {
    const rungs = tickRungLadder({ yMin: 97383, yMax: 97901, xMin: 2247113, xMax: 2247612, scaleDenominator: 1000 })
    expect(rungs[0]).toBe(150)
    expect(rungs).not.toContain(300)
    expect(rungs[rungs.length - 1]).toBe(50)
  })
})

describe('TICK_GEOMETRY_MM', () => {
  test('matches the reference cross: 4mm arms, 2.5mm labels', () => {
    expect(TICK_GEOMETRY_MM.armHalfLength).toBe(4)
    expect(TICK_GEOMETRY_MM.labelHeight).toBe(2.5)
  })
})

// ── PDF/DXF clearance parity ────────────────────────────────────────────────
// The PDF renderer must reject a candidate cross for the same reason the DXF
// one does: it lies across drawn detail. Both apply this rectangle-vs-segment
// test, so a cross rejected in one format is rejected in the other.
import { _hitsSegments } from '../pdfkitGeoPDF.js'

describe('_hitsSegments — the shared clearance rule', () => {
  const rect = { x: 100, y: 100, width: 20, height: 20 }

  test('a boundary crossing the mark is rejected', () => {
    // Vertical parcel edge straight through the middle of the cross.
    expect(_hitsSegments(rect, [{ x1: 110, y1: 50, x2: 110, y2: 200 }])).toBe(true)
  })

  test('a boundary clipping one corner is rejected', () => {
    expect(_hitsSegments(rect, [{ x1: 90, y1: 110, x2: 110, y2: 90 }])).toBe(true)
  })

  test('a mark wholly inside a parcel is ALLOWED — the reference places these', () => {
    // Parcel edges well clear on every side: the cross sits in open interior.
    const farEdges = [
      { x1: 0, y1: 0, x2: 500, y2: 0 },
      { x1: 500, y1: 0, x2: 500, y2: 500 },
      { x1: 500, y1: 500, x2: 0, y2: 500 },
      { x1: 0, y1: 500, x2: 0, y2: 0 },
    ]
    expect(_hitsSegments(rect, farEdges)).toBe(false)
  })

  test('a boundary passing nearby but not touching is allowed', () => {
    expect(_hitsSegments(rect, [{ x1: 130, y1: 50, x2: 130, y2: 200 }])).toBe(false)
  })

  test('no segments supplied means nothing to avoid', () => {
    expect(_hitsSegments(rect, [])).toBe(false)
    expect(_hitsSegments(rect, undefined)).toBe(false)
  })
})

import { _hitsRects } from '../pdfkitGeoPDF.js'

describe('_hitsRects — stand-number clearance', () => {
  const rect = { x: 100, y: 100, width: 20, height: 20 }

  test('a stand number under the mark is rejected', () => {
    expect(_hitsRects(rect, [{ x: 110, y: 110, width: 30, height: 10 }])).toBe(true)
  })

  test('a stand number merely touching the edge is rejected', () => {
    expect(_hitsRects(rect, [{ x: 118, y: 118, width: 5, height: 5 }])).toBe(true)
  })

  test('a stand number clear of the mark is allowed', () => {
    expect(_hitsRects(rect, [{ x: 200, y: 200, width: 30, height: 10 }])).toBe(false)
  })

  test('no rects supplied means nothing to avoid', () => {
    expect(_hitsRects(rect, [])).toBe(false)
    expect(_hitsRects(rect, undefined)).toBe(false)
  })
})
