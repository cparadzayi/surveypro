import { describe, test, expect } from '@jest/globals'
import { getStandsInsideOutsideFigure } from '../pdfkitGeoPDF.js'

// A rectangle big enough to contain every fixture centroid below.
const outsideFigureData = {
  edges: [
    { pointId: 'A', y: 50000, x: 2200000 },
    { pointId: 'B', y: 51000, x: 2200000 },
    { pointId: 'C', y: 51000, x: 2200010 },
    { pointId: 'D', y: 50000, x: 2200010 },
  ],
}

/** A 4-metre square whose centroid sits at (y, x) in Cape Lo ground coords. */
function squareFeature(stand, y, x, designation = '') {
  const half = 2
  const ring = [
    [y - half, x - half],
    [y + half, x - half],
    [y + half, x + half],
    [y - half, x + half],
    [y - half, x - half],
  ]
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: { stand, designation },
  }
}

// Brackenhurst-shaped set: three surveyed stands, the remainder of the
// subdivided portion, the Outside Figure pseudo-parcel, and a stand whose name
// merely starts with "REM" — all drawn inside the figure so the name filter,
// not the geometry, is what does the work.
function brackenhurstParcels() {
  return {
    type: 'FeatureCollection',
    features: [
      squareFeature('403', 50100, 2200003),
      squareFeature('404', 50300, 2200003),
      squareFeature('405', 50500, 2200003),
      squareFeature('REM', 50700, 2200003, 'REM'),
      squareFeature('OUTSIDE FIGURE', 50900, 2200003, 'Outside Figure'),
      squareFeature('REMBRANDT', 50950, 2200003),
    ],
  }
}

describe('getStandsInsideOutsideFigure — remainder never enters the designation', () => {
  test('inside path: the remainder and the Outside Figure are dropped, stands kept', () => {
    const stands = getStandsInsideOutsideFigure(brackenhurstParcels(), outsideFigureData)
    expect(stands).toEqual(['403', '404', '405', 'REMBRANDT'])
    expect(stands).not.toContain('REM')
    expect(stands.map((s) => s.toLowerCase())).not.toContain('outside figure')
  })

  test('fallback path (no figure data): same exclusion as the inside path', () => {
    const stands = getStandsInsideOutsideFigure(brackenhurstParcels(), null)
    expect(stands).toEqual(['403', '404', '405', 'REMBRANDT'])
  })

  test('fallback path with empty edges: same exclusion as the inside path', () => {
    const stands = getStandsInsideOutsideFigure(brackenhurstParcels(), { edges: [] })
    expect(stands).toEqual(['403', '404', '405', 'REMBRANDT'])
  })

  test('the remainder is caught by designation too when stand is blank', () => {
    const only = {
      type: 'FeatureCollection',
      features: [
        squareFeature('403', 50100, 2200003),
        squareFeature('', 50700, 2200003, 'Remainder'),
      ],
    }
    expect(getStandsInsideOutsideFigure(only, outsideFigureData)).toEqual(['403'])
    expect(getStandsInsideOutsideFigure(only, null)).toEqual(['403'])
  })

  test('blank names are dropped from both paths', () => {
    const blanks = {
      type: 'FeatureCollection',
      features: [
        squareFeature('403', 50100, 2200003),
        squareFeature('', 50700, 2200003),
        squareFeature('   ', 50900, 2200003),
      ],
    }
    expect(getStandsInsideOutsideFigure(blanks, outsideFigureData)).toEqual(['403'])
    expect(getStandsInsideOutsideFigure(blanks, null)).toEqual(['403'])
  })

  test('no parcels at all → []', () => {
    expect(getStandsInsideOutsideFigure(null, outsideFigureData)).toEqual([])
    expect(getStandsInsideOutsideFigure({ features: [] }, null)).toEqual([])
  })
})
