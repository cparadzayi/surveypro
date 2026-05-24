import { test } from 'node:test'
import { strictEqual, ok } from 'node:assert'
import { geodeticToGrid, gridToGeodetic, findCentralMeridian } from '../utils/coordinateSystem.js'

test('Zimbabwe coordinate system conversions', async () => {
  // Test coordinates from Harare area (around 31°E, 17.8°S)
  const lat = -17.8251  // Harare latitude (negative = south)
  const lon = 31.0335   // Harare longitude (positive = east)

  console.log('Testing coordinate conversion for Harare area...')
  console.log(`Input: Lat=${lat}°, Lon=${lon}°`)

  // Test geodetic to grid conversion
  const gridResult = geodeticToGrid(lat, lon)
  console.log('Grid coordinates:', gridResult)

  // Verify central meridian selection
  const expectedMeridian = findCentralMeridian(lon)
  strictEqual(gridResult.centralMeridian, expectedMeridian, 'Central meridian should match expected')

  // Test reverse conversion
  const geodeticResult = gridToGeodetic(gridResult.y, gridResult.x, gridResult.centralMeridian)
  console.log('Back to geodetic:', geodeticResult)

  // Verify round-trip accuracy (should be within 0.000001 degrees)
  const latDiff = Math.abs(geodeticResult.lat - lat)
  const lonDiff = Math.abs(geodeticResult.lon - lon)
  
  ok(latDiff < 0.000001, `Latitude round-trip error too large: ${latDiff}`)
  ok(lonDiff < 0.000001, `Longitude round-trip error too large: ${lonDiff}`)

  console.log('✓ Coordinate system tests passed')
})

test('CSV data format validation', async () => {
  // Test data format from the sample CSV
  const sampleData = [
    { Point: '419/S', Y: 33332.88, X: 1860173, Status: '', 'Calcs Page': '', Description: 'KAPIRO', 'Date of survey': '9/12/2025' },
    { Point: 'ST1', Y: 25426.06, X: 1869672, Status: 'F', 'Calcs Page': '', Description: '12mm iron peg and 35mm iron pipe in masonry cairn', 'Date of survey': '9/12/2025' }
  ]

  sampleData.forEach((record, index) => {
    console.log(`Validating record ${index + 1}: ${record.Point}`)
    
    // Check required fields
    ok(record.Point, 'Point name is required')
    ok(typeof record.Y === 'number', 'Y coordinate must be numeric')
    ok(typeof record.X === 'number', 'X coordinate must be numeric')
    
    // Verify coordinate ranges for Zimbabwe
    ok(record.Y >= 0 && record.Y <= 50000, 'Y coordinate should be within Zimbabwe bounds')
    ok(record.X >= 1800000 && record.X <= 2000000, 'X coordinate should be within Zimbabwe bounds')
    
    console.log(`  Y=${record.Y} (Westing), X=${record.X} (Southing)`)
    console.log(`  Status=${record.Status || 'Not set'}, Description=${record.Description}`)
  })

  console.log('✓ CSV data format validation passed')
})

// Run the tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running SurveyPro validation tests...\n')
}