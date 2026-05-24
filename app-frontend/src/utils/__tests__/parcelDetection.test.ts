/**
 * Parcel Detection Tests
 * 
 * Tests the automated parcel detection system with real training data
 */

import { describe, it, expect } from 'vitest'
import { ParcelTrainingDataParser } from '../parcelTrainingDataParser'
import { AutomatedParcelDetector } from '../automatedParcelDetector'
import type { AdjustedCoordinate } from '@/types/adjusted-coordinates'

// Sample training data (STAND 1439)
const sampleTrainingData = `
STAND 1439

Name    Y         X         DIST    DIRN      dy    dx
1439A   97384.41  2247857.59
1438A   97373.29  2247864.36  13.02  301:20:40  0.00  0.00
1457A   97385.59  2247885.51  24.47  30:11:10   0.00  0.00
1456A   97396.77  2247878.83  13.02  120:51:40  0.00  0.00
1439A   97384.41  2247857.59  24.58  210:10:40  0.00  0.00

AREA    319       Sq. M
`

// Convert training data to AdjustedCoordinate format
const sampleCoordinates: AdjustedCoordinate[] = [
  { pointId: '1439A', y: 97384.41, x: 2247857.59, description: 'STAND 1439 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' },
  { pointId: '1438A', y: 97373.29, x: 2247864.36, description: 'STAND 1439 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' },
  { pointId: '1457A', y: 97385.59, x: 2247885.51, description: 'STAND 1439 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E2' },
  { pointId: '1456A', y: 97396.77, x: 2247878.83, description: 'STAND 1439 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E2' }
]

describe('ParcelTrainingDataParser', () => {
  it('should parse training data correctly', () => {
    const parser = new ParcelTrainingDataParser()
    const parcels = parser.parse(sampleTrainingData)
    
    expect(parcels).toHaveLength(1)
    expect(parcels[0].designation).toBe('STAND 1439')
    expect(parcels[0].designationType).toBe('STAND')
    expect(parcels[0].designationNumber).toBe('1439')
    expect(parcels[0].area).toBe(319)
    expect(parcels[0].boundaryPoints).toHaveLength(5) // Including closure point
  })
  
  it('should extract points with coordinates', () => {
    const parser = new ParcelTrainingDataParser()
    const parcels = parser.parse(sampleTrainingData)
    
    const points = parcels[0].boundaryPoints
    expect(points[0].name).toBe('1439A')
    expect(points[0].y).toBe(97384.41)
    expect(points[0].x).toBe(2247857.59)
  })
  
  it('should parse bearings and distances', () => {
    const parser = new ParcelTrainingDataParser()
    const parcels = parser.parse(sampleTrainingData)
    
    const points = parcels[0].boundaryPoints
    expect(points[1].distance).toBe(13.02)
    expect(points[1].bearing).toBeCloseTo(301.344, 2) // 301:20:40 in decimal
  })
  
  it('should compute area accurately', () => {
    const parser = new ParcelTrainingDataParser()
    const parcels = parser.parse(sampleTrainingData)
    
    // Compute area using Shoelace formula
    const points = parcels[0].boundaryPoints
    let area = 0
    for (let i = 0; i < points.length - 1; i++) {
      area += points[i].y * points[i + 1].x
      area -= points[i + 1].y * points[i].x
    }
    area = Math.abs(area) / 2
    
    // Should match known area within 1%
    expect(area).toBeCloseTo(319, 0)
  })
})

describe('AutomatedParcelDetector', () => {
  it('should detect parcels from coordinates', () => {
    const detector = new AutomatedParcelDetector()
    const parcels = detector.detectParcels(sampleCoordinates)
    
    expect(parcels).toHaveLength(1)
    expect(parcels[0].designation).toBe('STAND 1439')
  })
  
  it('should compute area correctly', () => {
    const detector = new AutomatedParcelDetector()
    const parcels = detector.detectParcels(sampleCoordinates)
    
    // Area should be ~319 m²
    expect(parcels[0].area).toBeGreaterThan(300)
    expect(parcels[0].area).toBeLessThan(340)
  })
  
  it('should order points correctly', () => {
    const detector = new AutomatedParcelDetector()
    const parcels = detector.detectParcels(sampleCoordinates)
    
    expect(parcels[0].boundaryPoints).toHaveLength(4)
    expect(parcels[0].coordinates).toHaveLength(4)
  })
  
  it('should compute confidence score', () => {
    const detector = new AutomatedParcelDetector()
    const parcels = detector.detectParcels(sampleCoordinates)
    
    expect(parcels[0].confidence).toBeGreaterThan(0)
    expect(parcels[0].confidence).toBeLessThanOrEqual(1)
  })
  
  it('should format area correctly', () => {
    const detector = new AutomatedParcelDetector()
    const parcels = detector.detectParcels(sampleCoordinates)
    
    // Should be in m² format (< 10,000 m²)
    expect(parcels[0].areaFormatted).toMatch(/^\d+ m²$/)
  })
  
  it('should format large areas in hectares', () => {
    // Create large parcel (> 10,000 m²)
    const largeCoordinates: AdjustedCoordinate[] = [
      { pointId: 'F1A', y: 0, x: 0, description: 'FARM 1 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' },
      { pointId: 'F1B', y: 0, x: 100, description: 'FARM 1 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' },
      { pointId: 'F1C', y: 100, x: 100, description: 'FARM 1 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E2' },
      { pointId: 'F1D', y: 100, x: 0, description: 'FARM 1 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E2' }
    ]
    
    const detector = new AutomatedParcelDetector()
    const parcels = detector.detectParcels(largeCoordinates)
    
    // Should be in ha format (≥ 10,000 m²)
    expect(parcels[0].areaFormatted).toMatch(/^\d+\.\d{4} ha$/)
  })
  
  it('should handle minimum points validation', () => {
    const detector = new AutomatedParcelDetector({ minPoints: 3 })
    
    // Only 2 points - should not detect
    const twoPoints: AdjustedCoordinate[] = [
      { pointId: 'P1', y: 0, x: 0, description: 'STAND 1 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' },
      { pointId: 'P2', y: 10, x: 10, description: 'STAND 1 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' }
    ]
    
    const parcels = detector.detectParcels(twoPoints)
    expect(parcels).toHaveLength(0)
  })
  
  it('should detect multiple parcels', () => {
    const multipleCoordinates: AdjustedCoordinate[] = [
      // STAND 1
      { pointId: 'S1A', y: 0, x: 0, description: 'STAND 1 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' },
      { pointId: 'S1B', y: 0, x: 10, description: 'STAND 1 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' },
      { pointId: 'S1C', y: 10, x: 10, description: 'STAND 1 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' },
      { pointId: 'S1D', y: 10, x: 0, description: 'STAND 1 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' },
      // STAND 2
      { pointId: 'S2A', y: 20, x: 0, description: 'STAND 2 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E2' },
      { pointId: 'S2B', y: 20, x: 10, description: 'STAND 2 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E2' },
      { pointId: 'S2C', y: 30, x: 10, description: 'STAND 2 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E2' },
      { pointId: 'S2D', y: 30, x: 0, description: 'STAND 2 CORNER', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E2' }
    ]
    
    const detector = new AutomatedParcelDetector()
    const parcels = detector.detectParcels(multipleCoordinates)
    
    expect(parcels).toHaveLength(2)
    expect(parcels[0].designation).toBe('STAND 1')
    expect(parcels[1].designation).toBe('STAND 2')
  })
})

describe('Area Formatting', () => {
  it('should format small areas in m²', () => {
    const detector = new AutomatedParcelDetector()
    
    // 10m × 10m = 100 m²
    const coords: AdjustedCoordinate[] = [
      { pointId: 'P1', y: 0, x: 0, description: 'STAND 1', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' },
      { pointId: 'P2', y: 0, x: 10, description: 'STAND 1', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' },
      { pointId: 'P3', y: 10, x: 10, description: 'STAND 1', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' },
      { pointId: 'P4', y: 10, x: 0, description: 'STAND 1', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' }
    ]
    
    const parcels = detector.detectParcels(coords)
    expect(parcels[0].areaFormatted).toBe('100 m²')
  })
  
  it('should format large areas in ha', () => {
    const detector = new AutomatedParcelDetector()
    
    // 100m × 100m = 10,000 m² = 1.0000 ha
    const coords: AdjustedCoordinate[] = [
      { pointId: 'P1', y: 0, x: 0, description: 'FARM 1', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' },
      { pointId: 'P2', y: 0, x: 100, description: 'FARM 1', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' },
      { pointId: 'P3', y: 100, x: 100, description: 'FARM 1', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' },
      { pointId: 'P4', y: 100, x: 0, description: 'FARM 1', status: 'F', surveyDate: '2025-01-01', calculationsPage: 0, fieldBookPage: 'E1' }
    ]
    
    const parcels = detector.detectParcels(coords)
    expect(parcels[0].areaFormatted).toBe('1.0000 ha')
  })
})
