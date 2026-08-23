import { describe, test, expect } from '@jest/globals'
import { chooseTickIntervalMetres, computeTickGrid, formatTickLabel, TICK_GEOMETRY_MM } from '../../../../app-shared/tickMarks.js'

// Every expectation here is measured off the Surveyor-General reference plan
// (mag1sh1a.dxf, Maglas/Shabani), not chosen: a 100m grid at 1:1000, crosses
// with 4mm arms and 2.5mm labels, and labels written "X = +2247100".

describe('chooseTickIntervalMetres', () => {
  test('1:1000 picks the reference plan\'s own 100m grid', () => {
    expect(chooseTickIntervalMetres(1000)).toBe(100)
  })

  test('paper spacing stays ruler-checkable at every scale', () => {
    for (const scale of [250, 500, 750, 1000, 1500, 2000, 2500, 5000, 10000]) {
      const paperMm = (chooseTickIntervalMetres(scale) * 1000) / scale
      expect(paperMm).toBeLessThanOrEqual(100)
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
    expect(intervalM).toBe(100)
    const ys = [...new Set(nodes.map(n => n.y))].sort((a, b) => a - b)
    const xs = [...new Set(nodes.map(n => n.x))].sort((a, b) => a - b)
    // Outward: 97383 -> 97300 below, 97901 -> 98000 above.
    expect(ys[0]).toBe(97300)
    expect(ys[ys.length - 1]).toBe(98000)
    expect(xs[0]).toBe(2247100)
    expect(xs[xs.length - 1]).toBe(2247700)
  })

  test('returns every intersection, interior nodes included', () => {
    // The reference carries crosses inside the figure, so the grid must offer
    // interior nodes; which ones get drawn is the renderer's clearance test.
    const { nodes } = computeTickGrid({
      yMin: 0, yMax: 200, xMin: 0, xMax: 200, scaleDenominator: 1000,
    })
    expect(nodes).toHaveLength(9)   // 3 x 3, not just the 8 perimeter points
    expect(nodes).toContainEqual({ y: 100, x: 100 })  // the interior node
  })

  test('every node is a whole multiple of the interval', () => {
    const { intervalM, nodes } = computeTickGrid({
      yMin: 97368.92, yMax: 97720.42, xMin: 2247108.72, xMax: 2247428.84, scaleDenominator: 1000,
    })
    for (const n of nodes) {
      expect(n.y % intervalM).toBeCloseTo(0, 6)
      expect(n.x % intervalM).toBeCloseTo(0, 6)
    }
  })
})

describe('TICK_GEOMETRY_MM', () => {
  test('matches the reference cross: 4mm arms, 2.5mm labels', () => {
    expect(TICK_GEOMETRY_MM.armHalfLength).toBe(4)
    expect(TICK_GEOMETRY_MM.labelHeight).toBe(2.5)
  })
})
