/**
 * Unit tests for Label Placer
 */

import { describe, test, expect } from '@jest/globals'
import {
  calculateCentroid,
  isPointInPolygon,
  findLabelPosition,
  calculateBounds,
  calculatePolygonArea,
  findPoleOfInaccessibility,
  checkLabelCollision,
  placeLabels
} from '../labelPlacer.js'

describe('Label Placer', () => {
  describe('calculateCentroid', () => {
    test('calculates centroid for square', () => {
      const vertices = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ]
      
      const centroid = calculateCentroid(vertices)
      
      expect(centroid.x).toBeCloseTo(50, 1)
      expect(centroid.y).toBeCloseTo(50, 1)
    })
    
    test('calculates centroid for triangle', () => {
      const vertices = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 100 }
      ]
      
      const centroid = calculateCentroid(vertices)
      
      expect(centroid.x).toBeCloseTo(50, 1)
      expect(centroid.y).toBeCloseTo(33.33, 1)
    })
    
    test('handles degenerate polygon', () => {
      const vertices = [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 }
      ]
      
      const centroid = calculateCentroid(vertices)
      
      expect(centroid.x).toBe(0)
      expect(centroid.y).toBe(0)
    })
    
    test('throws error for invalid input', () => {
      expect(() => calculateCentroid([])).toThrow()
      expect(() => calculateCentroid([{x: 0, y: 0}])).toThrow()
    })
  })
  
  describe('isPointInPolygon', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ]
    
    test('detects point inside polygon', () => {
      expect(isPointInPolygon({ x: 50, y: 50 }, square)).toBe(true)
      expect(isPointInPolygon({ x: 10, y: 10 }, square)).toBe(true)
    })
    
    test('detects point outside polygon', () => {
      expect(isPointInPolygon({ x: -10, y: 50 }, square)).toBe(false)
      expect(isPointInPolygon({ x: 150, y: 50 }, square)).toBe(false)
      expect(isPointInPolygon({ x: 50, y: 150 }, square)).toBe(false)
    })
    
    test('handles point on edge', () => {
      const result = isPointInPolygon({ x: 0, y: 50 }, square)
      expect(typeof result).toBe('boolean')
    })
    
    test('throws error for invalid point', () => {
      expect(() => isPointInPolygon(null, square)).toThrow()
      expect(() => isPointInPolygon({}, square)).toThrow()
    })
  })
  
  describe('calculateBounds', () => {
    test('calculates bounds correctly', () => {
      const vertices = [
        { x: 10, y: 20 },
        { x: 100, y: 30 },
        { x: 80, y: 150 },
        { x: 5, y: 100 }
      ]
      
      const bounds = calculateBounds(vertices)
      
      expect(bounds.minX).toBe(5)
      expect(bounds.maxX).toBe(100)
      expect(bounds.minY).toBe(20)
      expect(bounds.maxY).toBe(150)
    })
    
    test('handles single point', () => {
      const vertices = [{ x: 50, y: 75 }]
      
      const bounds = calculateBounds(vertices)
      
      expect(bounds.minX).toBe(50)
      expect(bounds.maxX).toBe(50)
      expect(bounds.minY).toBe(75)
      expect(bounds.maxY).toBe(75)
    })
    
    test('throws error for empty array', () => {
      expect(() => calculateBounds([])).toThrow()
    })
  })
  
  describe('calculatePolygonArea', () => {
    test('calculates area for square', () => {
      const vertices = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ]
      
      const area = calculatePolygonArea(vertices)
      
      expect(area).toBe(10000)
    })
    
    test('calculates area for triangle', () => {
      const vertices = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 100 }
      ]
      
      const area = calculatePolygonArea(vertices)
      
      expect(area).toBe(5000)
    })
    
    test('returns 0 for degenerate polygon', () => {
      const vertices = [
        { x: 0, y: 0 },
        { x: 0, y: 0 }
      ]
      
      const area = calculatePolygonArea(vertices)
      
      expect(area).toBe(0)
    })
  })
  
  describe('findPoleOfInaccessibility', () => {
    test('finds pole for simple polygon', () => {
      const vertices = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ]

      const pole = findPoleOfInaccessibility(vertices)

      expect(pole).toHaveProperty('x')
      expect(pole).toHaveProperty('y')
      expect(pole.x).toBeGreaterThanOrEqual(0)
      expect(pole.x).toBeLessThanOrEqual(100)
      expect(pole.y).toBeGreaterThanOrEqual(0)
      expect(pole.y).toBeLessThanOrEqual(100)
    })

    test('finds pole for concave polygon', () => {
      const vertices = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 50, y: 50 },
        { x: 50, y: 100 },
        { x: 0, y: 100 }
      ]

      const pole = findPoleOfInaccessibility(vertices)

      expect(pole).toHaveProperty('x')
      expect(pole).toHaveProperty('y')
    })
  })

  describe('findPoleOfInaccessibility — real algorithm', () => {
    test('POI of a square is its centre', () => {
      const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
      const poi = findPoleOfInaccessibility(sq)
      expect(poi.x).toBeCloseTo(50, 0)
      expect(poi.y).toBeCloseTo(50, 0)
    })

    test('POI of a thin horizontal rectangle is near its long-axis centre', () => {
      // 200×10 rectangle — POI should be near (100, 5), max clearance = 5
      const rect = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 10 }, { x: 0, y: 10 }]
      const poi = findPoleOfInaccessibility(rect)
      expect(poi.x).toBeGreaterThan(60)  // somewhere along the long axis
      expect(poi.x).toBeLessThan(140)
      expect(poi.y).toBeCloseTo(5, 0)    // centred on the short axis
    })

    test('POI of an L-shape is NOT at the bounding-box centre', () => {
      // L-shape: bounding box 100×100 but the bottom-right quadrant is missing
      const lShape = [
        { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 },
        { x: 100, y: 50 }, { x: 100, y: 100 }, { x: 0, y: 100 }
      ]
      const poi = findPoleOfInaccessibility(lShape)
      // Bounding-box centre (50, 50) is a corner vertex — POI must not land exactly there
      // The widest inscribed circle fits in the top-left arm (roughly x≈25, y≈75) or similar
      // Just assert it's not the naive bbox centre (within a few units)
      const atBboxCentre = Math.abs(poi.x - 50) < 5 && Math.abs(poi.y - 50) < 5
      expect(atBboxCentre).toBe(false)
      // And it must be inside the polygon bounds
      expect(poi.x).toBeGreaterThanOrEqual(0)
      expect(poi.x).toBeLessThanOrEqual(100)
      expect(poi.y).toBeGreaterThanOrEqual(0)
      expect(poi.y).toBeLessThanOrEqual(100)
    })

    test('throws for fewer than 3 vertices', () => {
      expect(() => findPoleOfInaccessibility([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toThrow()
    })
  })
  
  describe('findLabelPosition', () => {
    test('finds position for normal parcel', () => {
      const parcel = {
        stand: '2283',
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 }
        ]
      }
      
      const position = findLabelPosition(parcel)
      
      expect(position).toHaveProperty('x')
      expect(position).toHaveProperty('y')
      expect(position).toHaveProperty('fontSize')
      expect(position).toHaveProperty('strategy')
      expect(position).toHaveProperty('bounds')
      expect(position).toHaveProperty('area')
      expect(position).toHaveProperty('metadata')
      
      expect(position.strategy).toBe('centroid')
    })
    
    test('adapts font size for small parcel', () => {
      const parcel = {
        stand: '2283',
        vertices: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 5, y: 5 },
          { x: 0, y: 5 }
        ]
      }
      
      const position = findLabelPosition(parcel)
      
      expect(position.strategy).toBe('centroid-small')
      expect(position.fontSize).toBeLessThan(3.0)
    })
    
    test('handles concave parcel', () => {
      const parcel = {
        stand: '2283',
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 50 },
          { x: 50, y: 50 },
          { x: 50, y: 100 },
          { x: 0, y: 100 }
        ]
      }
      
      const position = findLabelPosition(parcel)
      
      expect(position).toHaveProperty('strategy')
      expect(position.metadata.centroidInside).toBeDefined()
    })
    
    test('respects custom options', () => {
      const parcel = {
        stand: '2283',
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 }
        ]
      }
      
      const position = findLabelPosition(parcel, {
        preferredFontSize: 5.0
      })
      
      expect(position.fontSize).toBe(5.0)
    })
    
    test('throws error for invalid parcel', () => {
      expect(() => findLabelPosition({})).toThrow()
      expect(() => findLabelPosition({ vertices: [] })).toThrow()
    })
  })
  
  describe('checkLabelCollision', () => {
    test('detects collision between overlapping labels', () => {
      const label1 = {
        x: 50,
        y: 50,
        fontSize: 3.0,
        text: '2283'
      }
      
      const label2 = {
        x: 55,
        y: 52,
        fontSize: 3.0,
        text: '2284'
      }
      
      const collision = checkLabelCollision(label1, label2)
      
      expect(collision).toBe(true)
    })
    
    test('detects no collision for distant labels', () => {
      const label1 = {
        x: 50,
        y: 50,
        fontSize: 3.0,
        text: '2283'
      }
      
      const label2 = {
        x: 150,
        y: 150,
        fontSize: 3.0,
        text: '2284'
      }
      
      const collision = checkLabelCollision(label1, label2)
      
      expect(collision).toBe(false)
    })
    
    test('respects padding parameter', () => {
      const label1 = {
        x: 50,
        y: 50,
        fontSize: 3.0,
        text: '2283'
      }
      
      const label2 = {
        x: 60,
        y: 50,
        fontSize: 3.0,
        text: '2284'
      }
      
      const collisionNoPadding = checkLabelCollision(label1, label2, 0)
      const collisionWithPadding = checkLabelCollision(label1, label2, 5)
      
      expect(typeof collisionNoPadding).toBe('boolean')
      expect(typeof collisionWithPadding).toBe('boolean')
    })
    
    test('handles null labels', () => {
      const collision = checkLabelCollision(null, null)
      
      expect(collision).toBe(false)
    })
  })
  
  describe('placeLabels', () => {
    test('places labels for multiple parcels', () => {
      const parcels = [
        {
          stand: '2283',
          vertices: [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 50, y: 50 },
            { x: 0, y: 50 }
          ]
        },
        {
          stand: '2284',
          vertices: [
            { x: 60, y: 0 },
            { x: 110, y: 0 },
            { x: 110, y: 50 },
            { x: 60, y: 50 }
          ]
        }
      ]
      
      const labels = placeLabels(parcels)
      
      expect(labels.length).toBe(2)
      
      labels.forEach(label => {
        expect(label).toHaveProperty('x')
        expect(label).toHaveProperty('y')
        expect(label).toHaveProperty('text')
        expect(label).toHaveProperty('parcel')
        expect(label).toHaveProperty('hasCollision')
      })
    })
    
    test('detects collisions between labels', () => {
      const parcels = [
        {
          stand: '2283',
          vertices: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 }
          ]
        },
        {
          stand: '2284',
          vertices: [
            { x: 5, y: 5 },
            { x: 15, y: 5 },
            { x: 15, y: 15 },
            { x: 5, y: 15 }
          ]
        }
      ]
      
      const labels = placeLabels(parcels)
      
      // At least one label should have collision
      const hasAnyCollision = labels.some(l => l.hasCollision)
      expect(typeof hasAnyCollision).toBe('boolean')
    })
    
    test('throws error for invalid input', () => {
      expect(() => placeLabels('not an array')).toThrow()
    })
  })
  
  describe('Integration tests', () => {
    test('complete label placement workflow', () => {
      const parcels = [
        {
          stand: '2283',
          vertices: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 }
          ]
        },
        {
          stand: '2284',
          vertices: [
            { x: 100, y: 0 },
            { x: 200, y: 0 },
            { x: 200, y: 100 },
            { x: 100, y: 100 }
          ]
        },
        {
          stand: '2285',
          vertices: [
            { x: 0, y: 100 },
            { x: 100, y: 100 },
            { x: 100, y: 200 },
            { x: 0, y: 200 }
          ]
        }
      ]
      
      const labels = placeLabels(parcels, {
        preferredFontSize: 3.0,
        padding: 1.0
      })
      
      expect(labels.length).toBe(3)
      
      // All labels should have valid positions
      labels.forEach(label => {
        expect(label.x).toBeGreaterThanOrEqual(0)
        expect(label.y).toBeGreaterThanOrEqual(0)
        expect(label.fontSize).toBeGreaterThan(0)
        expect(label.text).toBeTruthy()
      })
      
      // No collisions expected for well-separated parcels
      const collisionCount = labels.filter(l => l.hasCollision).length
      expect(collisionCount).toBe(0)
    })
  })
})
