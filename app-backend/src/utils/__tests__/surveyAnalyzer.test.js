/**
 * Unit tests for Survey Analyzer
 */

import { describe, test, expect } from '@jest/globals'
import {
  analyzeSurvey,
  calculateExtent,
  calculateDensity,
  analyzeParcels
} from '../surveyAnalyzer.js'

describe('Survey Analyzer', () => {
  describe('calculateExtent', () => {
    test('calculates extent for simple square', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ]
      
      const extent = calculateExtent(points)
      
      expect(extent.minX).toBe(0)
      expect(extent.maxX).toBe(100)
      expect(extent.minY).toBe(0)
      expect(extent.maxY).toBe(100)
      expect(extent.width).toBe(100)
      expect(extent.height).toBe(100)
      expect(extent.area).toBe(10000)
      expect(extent.center).toEqual({ x: 50, y: 50 })
    })
    
    test('calculates extent for rectangle', () => {
      const points = [
        { x: 10, y: 20 },
        { x: 110, y: 20 },
        { x: 110, y: 70 },
        { x: 10, y: 70 }
      ]
      
      const extent = calculateExtent(points)
      
      expect(extent.width).toBe(100)
      expect(extent.height).toBe(50)
      expect(extent.area).toBe(5000)
      expect(extent.center).toEqual({ x: 60, y: 45 })
    })
    
    test('handles negative coordinates', () => {
      const points = [
        { x: -50, y: -30 },
        { x: 50, y: 30 }
      ]
      
      const extent = calculateExtent(points)
      
      expect(extent.minX).toBe(-50)
      expect(extent.maxX).toBe(50)
      expect(extent.width).toBe(100)
      expect(extent.height).toBe(60)
    })
    
    test('handles single point', () => {
      const points = [{ x: 100, y: 200 }]
      
      const extent = calculateExtent(points)
      
      expect(extent.width).toBe(0)
      expect(extent.height).toBe(0)
      expect(extent.area).toBe(0)
      expect(extent.center).toEqual({ x: 100, y: 200 })
    })
    
    test('throws error for empty array', () => {
      expect(() => calculateExtent([])).toThrow('Points must be a non-empty array')
    })
    
    test('throws error for invalid points', () => {
      expect(() => calculateExtent([{ x: 'abc', y: 0 }])).toThrow('All points must have valid x coordinate')
      expect(() => calculateExtent([{ x: 0, y: 'abc' }])).toThrow('All points must have valid y coordinate')
    })
  })
  
  describe('calculateDensity', () => {
    test('calculates density for sparse distribution', () => {
      const points = Array(10).fill(null).map((_, i) => ({ x: i * 10, y: 0 }))
      const extent = { area: 10000, width: 100, height: 100 }  // 1 hectare
      
      const density = calculateDensity(points, extent)
      
      expect(density.totalPoints).toBe(10)
      expect(density.pointsPerHectare).toBe(10)
      expect(density.category).toBe('sparse')
    })
    
    test('calculates density for medium distribution', () => {
      const points = Array(30).fill(null).map((_, i) => ({ x: i, y: 0 }))
      const extent = { area: 10000 }  // 1 hectare
      
      const density = calculateDensity(points, extent)
      
      expect(density.totalPoints).toBe(30)
      expect(density.pointsPerHectare).toBe(30)
      expect(density.category).toBe('medium')
    })
    
    test('calculates density for dense distribution', () => {
      const points = Array(60).fill(null).map((_, i) => ({ x: i, y: 0 }))
      const extent = { area: 10000 }
      
      const density = calculateDensity(points, extent)
      
      expect(density.pointsPerHectare).toBe(60)
      expect(density.category).toBe('dense')
    })
    
    test('calculates density for very dense distribution', () => {
      const points = Array(150).fill(null).map((_, i) => ({ x: i, y: 0 }))
      const extent = { area: 10000 }
      
      const density = calculateDensity(points, extent)
      
      expect(density.pointsPerHectare).toBe(150)
      expect(density.category).toBe('very-dense')
    })
    
    test('calculates average spacing', () => {
      const points = Array(100).fill(null).map((_, i) => ({ x: i, y: 0 }))
      const extent = { area: 10000 }  // 100m x 100m
      
      const density = calculateDensity(points, extent)
      
      // sqrt(10000 / 100) = 10m average spacing
      expect(density.averageSpacing).toBe(10)
    })
    
    test('includes description', () => {
      const points = Array(10).fill(null).map((_, i) => ({ x: i, y: 0 }))
      const extent = { area: 10000 }
      
      const density = calculateDensity(points, extent)
      
      expect(density.description).toBeTruthy()
      expect(typeof density.description).toBe('string')
    })
    
    test('throws error for empty points', () => {
      expect(() => calculateDensity([], { area: 1000 })).toThrow('Points must be a non-empty array')
    })
    
    test('throws error for invalid extent', () => {
      const points = [{ x: 0, y: 0 }]
      expect(() => calculateDensity(points, {})).toThrow('Extent must have valid area')
    })
  })
  
  describe('analyzeParcels', () => {
    test('analyzes parcel statistics', () => {
      const parcels = [
        { area_m2: 1000 },
        { area_m2: 2000 },
        { area_m2: 3000 },
        { area_m2: 4000 },
        { area_m2: 5000 }
      ]
      
      const analysis = analyzeParcels(parcels)
      
      expect(analysis.count).toBe(5)
      expect(analysis.totalArea).toBe(15000)
      expect(analysis.averageArea).toBe(3000)
      expect(analysis.medianArea).toBe(3000)
      expect(analysis.smallestParcel).toBe(1000)
      expect(analysis.largestParcel).toBe(5000)
      expect(analysis.range).toBe(4000)
    })
    
    test('calculates median for even number of parcels', () => {
      const parcels = [
        { area_m2: 1000 },
        { area_m2: 2000 },
        { area_m2: 3000 },
        { area_m2: 4000 }
      ]
      
      const analysis = analyzeParcels(parcels)
      
      expect(analysis.medianArea).toBe(2500)  // (2000 + 3000) / 2
    })
    
    test('handles single parcel', () => {
      const parcels = [{ area_m2: 5000 }]
      
      const analysis = analyzeParcels(parcels)
      
      expect(analysis.count).toBe(1)
      expect(analysis.averageArea).toBe(5000)
      expect(analysis.medianArea).toBe(5000)
      expect(analysis.range).toBe(0)
    })
    
    test('rounds values to 2 decimals', () => {
      const parcels = [
        { area_m2: 1234.567 },
        { area_m2: 2345.678 }
      ]
      
      const analysis = analyzeParcels(parcels)
      
      expect(analysis.averageArea).toBe(1790.12)
      expect(analysis.smallestParcel).toBe(1234.57)
      expect(analysis.largestParcel).toBe(2345.68)
    })
    
    test('throws error for empty parcels', () => {
      expect(() => analyzeParcels([])).toThrow('Parcels must be a non-empty array')
    })
    
    test('throws error for invalid area', () => {
      expect(() => analyzeParcels([{ area_m2: 'abc' }])).toThrow('All parcels must have valid area_m2')
      expect(() => analyzeParcels([{ area_m2: -100 }])).toThrow('All parcels must have valid area_m2')
    })
  })
  
  describe('analyzeSurvey', () => {
    test('performs complete survey analysis', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ]
      
      const parcels = [
        { area_m2: 2500 },
        { area_m2: 2500 },
        { area_m2: 2500 },
        { area_m2: 2500 }
      ]
      
      const analysis = analyzeSurvey(points, parcels)
      
      expect(analysis).toHaveProperty('extent')
      expect(analysis).toHaveProperty('density')
      expect(analysis).toHaveProperty('parcels')
      expect(analysis).toHaveProperty('summary')
      
      expect(analysis.extent.width).toBe(100)
      expect(analysis.density.totalPoints).toBe(4)
      expect(analysis.parcels.count).toBe(4)
      expect(typeof analysis.summary).toBe('string')
    })
    
    test('handles survey without parcels', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 100, y: 100 }
      ]
      
      const analysis = analyzeSurvey(points)
      
      expect(analysis.extent).toBeTruthy()
      expect(analysis.density).toBeTruthy()
      expect(analysis.parcels).toBeNull()
      expect(analysis.summary).toBeTruthy()
    })
    
    test('generates meaningful summary', () => {
      const points = Array(50).fill(null).map((_, i) => ({ x: i * 2, y: 0 }))
      const parcels = [
        { area_m2: 5000 },
        { area_m2: 6000 }
      ]
      
      const analysis = analyzeSurvey(points, parcels)
      
      expect(analysis.summary).toContain('50 survey points')
      expect(analysis.summary).toContain('2 parcels')
      expect(analysis.summary).toContain('m')
      expect(analysis.summary).toContain('ha')
    })
    
    test('throws error for invalid points', () => {
      expect(() => analyzeSurvey([])).toThrow('Coordinate points must be a non-empty array')
      expect(() => analyzeSurvey('not an array')).toThrow('Coordinate points must be a non-empty array')
    })
    
    test('throws error for invalid parcels', () => {
      const points = [{ x: 0, y: 0 }]
      expect(() => analyzeSurvey(points, 'not an array')).toThrow('Parcels must be an array')
    })
  })
  
  describe('Integration tests', () => {
    test('analyzes realistic urban subdivision', () => {
      // 150m x 120m subdivision with 542 points
      const points = Array(542).fill(null).map((_, i) => ({
        x: (i % 30) * 5,
        y: Math.floor(i / 30) * 6
      }))
      
      const parcels = Array(12).fill(null).map((_, i) => ({
        area_m2: 1500 + i * 100
      }))
      
      const analysis = analyzeSurvey(points, parcels)
      
      expect(analysis.extent.width).toBeGreaterThan(0)
      expect(analysis.extent.height).toBeGreaterThan(0)
      expect(analysis.density.category).toBe('very-dense')
      expect(analysis.parcels.count).toBe(12)
      expect(analysis.summary).toContain('542 survey points')
    })
    
    test('analyzes sparse rural survey', () => {
      // Large area with few points
      const points = [
        { x: 0, y: 0 },
        { x: 500, y: 0 },
        { x: 500, y: 400 },
        { x: 0, y: 400 },
        { x: 250, y: 200 }
      ]
      
      const parcels = [
        { area_m2: 50000 },
        { area_m2: 150000 }
      ]
      
      const analysis = analyzeSurvey(points, parcels)
      
      expect(analysis.density.category).toBe('sparse')
      expect(analysis.parcels.averageArea).toBe(100000)
    })
  })
})
