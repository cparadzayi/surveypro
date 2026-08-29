/**
 * Smoke Test for Coordinate List Generation
 * 
 * Tests basic functionality to ensure the generator works correctly
 */

import { setActivePinia, createPinia } from 'pinia'
import { CoordinateListGenerator } from '../coordinate-list'
import type { AdjustedCoordinate } from '../../types/adjusted-coordinates'
import type { SurveyorInfo } from '../coordinate-list'

describe('CoordinateListGenerator - Smoke Test', () => {
  let generator: CoordinateListGenerator

  beforeEach(() => {
    // generateCoordinateListPDF reaches for useSurveyLookupStore() (coordinate-list.ts),
    // which needs an active Pinia. The app installs one via app.use(pinia) at startup;
    // outside a component there is none unless a test sets it, so do that here. A fresh
    // Pinia per test also keeps store state from leaking between cases.
    setActivePinia(createPinia())
    generator = new CoordinateListGenerator()
  })
  
  // Sample test data
  const createTestCoordinates = (count: number): AdjustedCoordinate[] => {
    const coords: AdjustedCoordinate[] = []
    
    for (let i = 1; i <= count; i++) {
      coords.push({
        pointId: `P${i}`,
        y: 500000 + i * 10,
        x: 2000000 + i * 10,
        status: i % 3 === 0 ? 'F' : 'P',
        description: i % 2 === 0 ? 'Iron Peg' : 'Iron Pipe',
        surveyDate: '2025-10-25',
        fieldBookPage: `E${Math.ceil(i / 27)}`,
        calculationsPage: 116 + Math.floor((i - 1) / 35),
        adjustment: {
          isDuplicate: false,
          observationCount: 1,
          method: 'single'
        }
      })
    }
    
    return coords
  }
  
  const testSurveyorInfo: SurveyorInfo = {
    name: 'Test Surveyor',
    licenseNumber: 'LS001',
    firm: 'Test Firm',
    address: '123 Test Street',
    surveyDate: 'October 2025',
    projectTitle: 'Test Survey Project',
    district: 'Test District'
  }
  
  test('should create generator instance', () => {
    expect(generator).toBeDefined()
    expect(generator).toBeInstanceOf(CoordinateListGenerator)
  })
  
  test('should calculate page count for small dataset', () => {
    const coords = createTestCoordinates(50)
    const pageCount = generator.calculatePageCount(coords)
    
    // 50 points = 1 cover page + ~2 data pages (35 points per page)
    expect(pageCount).toBeGreaterThan(1)
    expect(pageCount).toBeLessThan(10)
  })
  
  test('should calculate page count for large dataset', () => {
    const coords = createTestCoordinates(541)
    const pageCount = generator.calculatePageCount(coords)
    
    // 541 points = 1 cover page + ~16 data pages
    expect(pageCount).toBeGreaterThan(10)
    expect(pageCount).toBeLessThan(30)
  })
  
  test('should generate PDF for small dataset', async () => {
    const coords = createTestCoordinates(10)
    
    const result = await generator.generateCoordinateListPDF(
      coords,
      testSurveyorInfo
    )
    
    expect(result).toBeDefined()
    expect(result.pdf).toBeDefined()
    expect(result.pageCount).toBeGreaterThan(0)
  })
  
  test('should generate PDF for medium dataset', async () => {
    const coords = createTestCoordinates(100)
    
    const result = await generator.generateCoordinateListPDF(
      coords,
      testSurveyorInfo
    )
    
    expect(result).toBeDefined()
    expect(result.pdf).toBeDefined()
    expect(result.pageCount).toBeGreaterThan(1)
  })
  
  test('should include calculations page references', async () => {
    const coords = createTestCoordinates(50)
    
    // Verify coordinates have calculationsPage values
    coords.forEach(coord => {
      expect(coord.calculationsPage).toBeDefined()
      expect(coord.calculationsPage).toBeGreaterThan(0)
    })
    
    const result = await generator.generateCoordinateListPDF(
      coords,
      testSurveyorInfo
    )
    
    expect(result).toBeDefined()
    expect(result.pdf).toBeDefined()
  })
  
  test('should handle different point types', async () => {
    const coords: AdjustedCoordinate[] = [
      {
        pointId: 'TRIG1',
        y: 500000,
        x: 2000000,
        status: 'F',
        description: 'Trig Beacon',
        surveyDate: '2025-10-25',
        fieldBookPage: 'E1',
        calculationsPage: 116,
        adjustment: { isDuplicate: false, observationCount: 1, method: 'single' }
      },
      {
        pointId: 'WS1',
        y: 500010,
        x: 2000010,
        status: 'F',
        description: 'Working Station',
        surveyDate: '2025-10-25',
        fieldBookPage: 'E1',
        calculationsPage: 116,
        adjustment: { isDuplicate: false, observationCount: 1, method: 'single' }
      },
      {
        pointId: 'FB1',
        y: 500020,
        x: 2000020,
        status: 'F',
        description: 'Found Beacon',
        surveyDate: '2025-10-25',
        fieldBookPage: 'E1',
        calculationsPage: 116,
        adjustment: { isDuplicate: false, observationCount: 1, method: 'single' }
      },
      {
        pointId: 'PB1',
        y: 500030,
        x: 2000030,
        status: 'P',
        description: 'Placed Beacon',
        surveyDate: '2025-10-25',
        fieldBookPage: 'E1',
        calculationsPage: 116,
        adjustment: { isDuplicate: false, observationCount: 1, method: 'single' }
      }
    ]
    
    const result = await generator.generateCoordinateListPDF(
      coords,
      testSurveyorInfo
    )
    
    expect(result).toBeDefined()
    expect(result.pdf).toBeDefined()
    expect(result.pageCount).toBeGreaterThan(0)
  })
  
  test('should handle empty dataset gracefully', async () => {
    const coords: AdjustedCoordinate[] = []
    
    const result = await generator.generateCoordinateListPDF(
      coords,
      testSurveyorInfo
    )
    
    expect(result).toBeDefined()
    expect(result.pdf).toBeDefined()
    // Should at least have cover page
    expect(result.pageCount).toBeGreaterThanOrEqual(1)
  })
})
