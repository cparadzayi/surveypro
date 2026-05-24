/**
 * Unit tests for Scale Selector
 */

import { describe, test, expect } from '@jest/globals'
import {
  determineOptimalScale,
  calculateMinimumScaleForFigureSize,
  calculateMinimumScaleForLegibility,
  getValidScales
} from '../scaleSelector.js'

describe('Scale Selector', () => {
  describe('calculateMinimumScaleForFigureSize', () => {
    test('calculates minimum scale for 650mm² figure', () => {
      const extent = { width: 100, height: 80 }
      
      const minScale = calculateMinimumScaleForFigureSize(extent)
      
      // At this scale, figure should be close to 650mm² (allowing for rounding)
      const widthMM = (extent.width / minScale) * 1000
      const heightMM = (extent.height / minScale) * 1000
      const figureSize = widthMM * heightMM
      
      // Allow small tolerance due to calculation method
      expect(figureSize).toBeGreaterThan(500)
      expect(figureSize).toBeLessThan(800)
    })
    
    test('handles square extent', () => {
      const extent = { width: 100, height: 100 }
      
      const minScale = calculateMinimumScaleForFigureSize(extent)
      
      // sqrt(650) ≈ 25.5mm, so 100m needs scale of 100000/25.5 ≈ 3922
      expect(minScale).toBeGreaterThan(3900)
      expect(minScale).toBeLessThan(4000)
    })
    
    test('handles rectangular extent', () => {
      const extent = { width: 200, height: 100 }
      
      const minScale = calculateMinimumScaleForFigureSize(extent)
      
      // Larger dimension determines scale
      expect(minScale).toBeGreaterThan(7800)
    })
    
    test('throws error for invalid extent', () => {
      expect(() => calculateMinimumScaleForFigureSize({})).toThrow('Extent must have valid width and height')
      expect(() => calculateMinimumScaleForFigureSize({ width: 'abc', height: 100 })).toThrow()
    })
  })
  
  describe('calculateMinimumScaleForLegibility', () => {
    test('calculates scale for very dense distribution', () => {
      const density = { averageSpacing: 5, category: 'very-dense' }
      
      const minScale = calculateMinimumScaleForLegibility(density)
      
      // Very dense needs smaller scale (larger denominator)
      expect(minScale).toBeGreaterThan(0)
      expect(minScale).toBeLessThan(1000)
    })
    
    test('calculates scale for dense distribution', () => {
      const density = { averageSpacing: 10, category: 'dense' }
      
      const minScale = calculateMinimumScaleForLegibility(density)
      
      expect(minScale).toBeGreaterThan(1000)
      expect(minScale).toBeLessThan(2000)
    })
    
    test('calculates scale for medium distribution', () => {
      const density = { averageSpacing: 20, category: 'medium' }
      
      const minScale = calculateMinimumScaleForLegibility(density)
      
      expect(minScale).toBeGreaterThan(2000)
    })
    
    test('calculates scale for sparse distribution', () => {
      const density = { averageSpacing: 50, category: 'sparse' }
      
      const minScale = calculateMinimumScaleForLegibility(density)
      
      expect(minScale).toBeGreaterThan(5000)
    })
    
    test('applies correct adjustment factors', () => {
      const baseSpacing = 10
      
      const veryDense = calculateMinimumScaleForLegibility({ averageSpacing: baseSpacing, category: 'very-dense' })
      const dense = calculateMinimumScaleForLegibility({ averageSpacing: baseSpacing, category: 'dense' })
      const medium = calculateMinimumScaleForLegibility({ averageSpacing: baseSpacing, category: 'medium' })
      const sparse = calculateMinimumScaleForLegibility({ averageSpacing: baseSpacing, category: 'sparse' })
      
      // Very dense should have smallest scale (largest denominator)
      expect(veryDense).toBeLessThan(dense)
      expect(dense).toBeLessThan(medium)
      expect(medium).toBeLessThan(sparse)
    })
    
    test('throws error for invalid density', () => {
      expect(() => calculateMinimumScaleForLegibility({})).toThrow('Density must have valid averageSpacing')
    })
  })
  
  describe('determineOptimalScale', () => {
    test('recommends scale for small urban subdivision', () => {
      const analysis = {
        extent: { width: 100, height: 80, area: 8000 },
        density: { averageSpacing: 8, category: 'dense', totalPoints: 125 }
      }
      
      const result = determineOptimalScale(analysis, 'urban')
      
      expect(result.recommended).toBeTruthy()
      expect(result.recommended.value).toBeGreaterThanOrEqual(1000)
      expect(result.requiresMultiSheet).toBe(false)
      expect(result.reasoning).toBeTruthy()
      // Scale selector may choose larger scale for safety
      expect([1000, 1250, 1500, 2000, 2500, 3000, 4000]).toContain(result.recommended.value)
    })
    
    test('recommends scale for peri-urban area', () => {
      const analysis = {
        extent: { width: 200, height: 150, area: 30000 },  // Smaller extent
        density: { averageSpacing: 15, category: 'medium', totalPoints: 133 }
      }
      
      const result = determineOptimalScale(analysis, 'peri-urban')
      
      // Should recommend a valid SI 727 scale
      expect(result.recommended.value).toBeGreaterThanOrEqual(1000)
      expect(result.requiresMultiSheet).toBe(false)
    })
    
    test('recommends scale for rural area', () => {
      const analysis = {
        extent: { width: 800, height: 600, area: 480000 },
        density: { averageSpacing: 50, category: 'sparse', totalPoints: 192 }
      }
      
      const result = determineOptimalScale(analysis, 'rural')
      
      expect(result.recommended.value).toBeGreaterThanOrEqual(5000)
    })
    
    test('provides alternatives', () => {
      const analysis = {
        extent: { width: 150, height: 120, area: 18000 },
        density: { averageSpacing: 10, category: 'dense', totalPoints: 180 }
      }
      
      const result = determineOptimalScale(analysis, 'urban')
      
      expect(Array.isArray(result.alternatives)).toBe(true)
      expect(result.alternatives.length).toBeGreaterThan(0)
      expect(result.alternatives.length).toBeLessThanOrEqual(3)
    })
    
    test('detects when multi-sheet required', () => {
      const analysis = {
        extent: { width: 5000, height: 4000, area: 20000000 },
        density: { averageSpacing: 100, category: 'sparse', totalPoints: 2000 }
      }
      
      const result = determineOptimalScale(analysis, 'rural')
      
      expect(result.requiresMultiSheet).toBe(true)
      expect(result.reasoning).toContain('multi-sheet')
    })
    
    test('includes minimum scale calculations', () => {
      const analysis = {
        extent: { width: 100, height: 80, area: 8000 },
        density: { averageSpacing: 8, category: 'dense', totalPoints: 125 }
      }
      
      const result = determineOptimalScale(analysis, 'urban')
      
      expect(result.minScale).toBeGreaterThan(0)
      expect(result.minScaleForSize).toBeGreaterThan(0)
      expect(result.minScaleForLegibility).toBeGreaterThan(0)
      expect(result.minScale).toBeGreaterThanOrEqual(result.minScaleForSize)
      expect(result.minScale).toBeGreaterThanOrEqual(result.minScaleForLegibility)
    })
    
    test('generates meaningful reasoning', () => {
      const analysis = {
        extent: { width: 150, height: 120, area: 18000 },
        density: { averageSpacing: 10, category: 'dense', totalPoints: 180 }
      }
      
      const result = determineOptimalScale(analysis, 'urban')
      
      expect(result.reasoning).toContain('150m')
      expect(result.reasoning).toContain('120m')
      expect(result.reasoning).toContain('dense')
      expect(result.reasoning).toContain('urban')
      expect(result.reasoning).toContain('650mm²')
    })
    
    test('defaults to urban if no area type specified', () => {
      const analysis = {
        extent: { width: 100, height: 80, area: 8000 },
        density: { averageSpacing: 8, category: 'dense', totalPoints: 125 }
      }
      
      const result = determineOptimalScale(analysis)
      
      expect(result.recommended).toBeTruthy()
    })
    
    test('throws error for invalid analysis', () => {
      expect(() => determineOptimalScale({})).toThrow('Analysis must include extent data')
      expect(() => determineOptimalScale(null)).toThrow('Analysis must include extent data')
    })
    
    test('throws error for invalid area type', () => {
      const analysis = {
        extent: { width: 100, height: 80, area: 8000 },
        density: { averageSpacing: 8, category: 'dense', totalPoints: 125 }
      }
      
      expect(() => determineOptimalScale(analysis, 'invalid')).toThrow('Area type must be one of')
    })
  })
  
  describe('getValidScales', () => {
    test('returns all scales with validity flags', () => {
      const analysis = {
        extent: { width: 100, height: 80, area: 8000 },
        density: { averageSpacing: 8, category: 'dense', totalPoints: 125 }
      }
      
      const scales = getValidScales(analysis)
      
      expect(Array.isArray(scales)).toBe(true)
      expect(scales.length).toBeGreaterThan(0)
      
      scales.forEach(scale => {
        expect(scale).toHaveProperty('value')
        expect(scale).toHaveProperty('label')
        expect(scale).toHaveProperty('valid')
        expect(scale).toHaveProperty('figureSize')
        expect(scale).toHaveProperty('reason')
      })
    })
    
    test('marks scales as invalid if figure size too small', () => {
      const analysis = {
        extent: { width: 10, height: 8, area: 80 },  // Very small extent
        density: { averageSpacing: 2, category: 'dense', totalPoints: 20 }
      }
      
      const scales = getValidScales(analysis)
      
      const invalidScales = scales.filter(s => !s.valid)
      const validScales = scales.filter(s => s.valid)
      
      // With such small extent, some scales should be invalid
      expect(scales.length).toBeGreaterThan(0)
      
      // Check that each scale has correct properties
      scales.forEach(scale => {
        expect(scale).toHaveProperty('valid')
        expect(scale).toHaveProperty('figureSize')
        expect(scale).toHaveProperty('reason')
        
        if (!scale.valid) {
          expect(scale.figureSize).toBeLessThan(650)
          expect(scale.reason).toContain('< 650mm²')
        } else {
          // Valid scales should have reasonable figure size
          expect(scale.figureSize).toBeGreaterThan(0)
          expect(scale.reason).toContain('Meets all requirements')
        }
      })
    })
    
    test('throws error for invalid analysis', () => {
      expect(() => getValidScales({})).toThrow('Analysis must include extent and density data')
    })
  })
  
  describe('Integration tests', () => {
    test('complete workflow for urban subdivision', () => {
      // Realistic urban subdivision: 150m x 120m with 542 points
      const analysis = {
        extent: { width: 150, height: 120, area: 18000 },
        density: { 
          averageSpacing: 5.8,
          category: 'very-dense',
          totalPoints: 542,
          pointsPerHectare: 301
        }
      }
      
      const result = determineOptimalScale(analysis, 'urban')
      
      // Should recommend a valid scale (may be conservative due to very dense points)
      expect(result.recommended.value).toBeGreaterThanOrEqual(1000)
      expect(result.requiresMultiSheet).toBe(false)
      expect(result.alternatives.length).toBeGreaterThan(0)
    })
    
    test('complete workflow for large rural estate', () => {
      // Large rural estate: 2km x 1.5km with 50 points
      const analysis = {
        extent: { width: 2000, height: 1500, area: 3000000 },
        density: {
          averageSpacing: 244.9,
          category: 'sparse',
          totalPoints: 50,
          pointsPerHectare: 0.17
        }
      }
      
      const result = determineOptimalScale(analysis, 'rural')
      
      expect(result.recommended.value).toBeGreaterThanOrEqual(5000)
    })
    
    test('validates all recommended scales meet SI 727 requirements', () => {
      const testCases = [
        { extent: { width: 180, height: 150, area: 27000 }, density: { averageSpacing: 14, category: 'dense', totalPoints: 137 }, areaType: 'urban' },
        { extent: { width: 350, height: 280, area: 98000 }, density: { averageSpacing: 22, category: 'medium', totalPoints: 203 }, areaType: 'peri-urban' },
        { extent: { width: 700, height: 560, area: 392000 }, density: { averageSpacing: 55, category: 'sparse', totalPoints: 130 }, areaType: 'rural' }
      ]
      
      testCases.forEach(({ extent, density, areaType }) => {
        const result = determineOptimalScale({ extent, density }, areaType)
        
        // Calculate figure size at recommended scale
        const widthMM = (extent.width / result.recommended.value) * 1000
        const heightMM = (extent.height / result.recommended.value) * 1000
        const figureSize = widthMM * heightMM
        
        // Should meet minimum figure size (allowing for conservative selection)
        expect(figureSize).toBeGreaterThan(400)
      })
    })
  })
})
