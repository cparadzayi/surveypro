/**
 * Test Project Data for Elon Paradzayi - Proj4Leaflet Validation
 * Purpose: Validate Cape Lo coordinate system implementation
 * Zone: Lo29 (EPSG:22289)
 */

export interface TestCoordinate {
  id: string
  y: number  // Westing
  x: number  // Northing
  status: 'P' | 'F'  // Placed or Found
  description: string
  date: string
}

export interface TestParcel {
  designation: string
  points: string[]  // Point IDs
  expectedArea?: number  // For validation (m²)
}

export const testProjectMetadata = {
  surveyor: 'Elon Paradzayi',
  license: '294',
  client: 'MSU',
  district: 'Gwelo',
  projectName: 'Proj4Leaflet Test Project',
  expectedSrid: 22291,  // Lo31
  centralMeridian: 31,
  createdDate: new Date().toISOString(),
  purpose: 'Validate Cape Lo coordinate system with proj4leaflet'
}

// Sample coordinates from user's data - Zimbabwe P(Y,X) format
export const testCoordinates: TestCoordinate[] = [
  {
    id: 'ST1',
    y: 96649.178,
    x: 2247915,
    status: 'P',
    description: '10mm iron',
    date: '2025-01-10'
  },
  {
    id: 'ST2',
    y: 97128.263,
    x: 2248259.2,
    status: 'P',
    description: '10mm iron',
    date: '2025-01-10'
  },
  {
    id: 'P2',
    y: 97538.004,
    x: 2247107.9,
    status: 'F',
    description: '50mm Iron',
    date: '2025-01-10'
  },
  {
    id: 'ZA',
    y: 96271.08,
    x: 2247869.9,
    status: 'F',
    description: '50mm Iron',
    date: '2025-01-10'
  },
  {
    id: 'ZD',
    y: 96551.464,
    x: 2248065.6,
    status: 'F',
    description: '50mm Iron',
    date: '2025-01-10'
  },
  {
    id: 'ZE',
    y: 96649.178,
    x: 2247915,
    status: 'F',
    description: '50mm Iron',
    date: '2025-01-10'
  },
  {
    id: 'ZG',
    y: 97128.263,
    x: 2248259.2,
    status: 'F',
    description: '50mm Iron',
    date: '2025-01-10'
  },
  {
    id: '2283A',
    y: 97057.022,
    x: 2247854.4,
    status: 'P',
    description: '12mm iron',
    date: '2025-01-10'
  },
  {
    id: '2283L',
    y: 96831.6,
    x: 2248046,
    status: 'P',
    description: '12mm iron',
    date: '2025-01-10'
  },
  {
    id: '2283M',
    y: 96865.86,
    x: 2247999.3,
    status: 'P',
    description: '12mm iron',
    date: '2025-01-10'
  }
]

// Test parcels for area computation validation
export const testParcels: TestParcel[] = [
  {
    designation: 'Stand 2428',
    points: ['ST1', 'ZD', 'ZG', 'P2'],
    expectedArea: undefined  // Will be computed
  },
  {
    designation: 'Stand 2836',
    points: ['ZA', 'ZE', '2283M', '2283L'],
    expectedArea: undefined
  }
]

// Validation thresholds
export const validationCriteria = {
  maxClosureError: 0.50,  // meters (acceptable for cadastral)
  excellentClosureError: 0.05,  // meters
  coordinateRanges: {
    y: { min: -200000, max: 200000 },    // Easting/Westing (-200km to +200km from central meridian)
    x: { min: 0, max: 3000000 }          // Northing range
  },
  expectedSrid: 22291,  // Lo31
  minParcelPoints: 3,
  maxParcelPoints: 100
}

// Automated validation functions
export const validations = {
  validateCoordinateRanges: (coords: TestCoordinate[]): { valid: boolean; errors: string[] } => {
    const errors: string[] = []
    
    coords.forEach(coord => {
      const { y, x, id } = coord
      
      if (y < validationCriteria.coordinateRanges.y.min || y > validationCriteria.coordinateRanges.y.max) {
        errors.push(`${id}: Y=${y} out of range [${validationCriteria.coordinateRanges.y.min}, ${validationCriteria.coordinateRanges.y.max}]`)
      }
      
      if (x < validationCriteria.coordinateRanges.x.min || x > validationCriteria.coordinateRanges.x.max) {
        errors.push(`${id}: X=${x} out of range [${validationCriteria.coordinateRanges.x.min}, ${validationCriteria.coordinateRanges.x.max}]`)
      }
    })
    
    return { valid: errors.length === 0, errors }
  },
  
  validateSridDetection: (detectedSrid: number): { valid: boolean; message: string } => {
    const isValid = detectedSrid === validationCriteria.expectedSrid
    return {
      valid: isValid,
      message: isValid 
        ? `✅ Correct SRID detected: ${detectedSrid}` 
        : `❌ Wrong SRID: expected ${validationCriteria.expectedSrid}, got ${detectedSrid}`
    }
  },
  
  validateClosureError: (error: number): { quality: string; acceptable: boolean; message: string } => {
    if (error <= validationCriteria.excellentClosureError) {
      return { quality: 'Excellent', acceptable: true, message: `✅ Excellent closure: ${error.toFixed(3)}m` }
    } else if (error <= validationCriteria.maxClosureError) {
      return { quality: 'Acceptable', acceptable: true, message: `✅ Acceptable closure: ${error.toFixed(3)}m` }
    } else {
      return { quality: 'Poor', acceptable: false, message: `❌ Poor closure: ${error.toFixed(3)}m (max: ${validationCriteria.maxClosureError}m)` }
    }
  },
  
  validateParcel: (parcel: TestParcel): { valid: boolean; errors: string[] } => {
    const errors: string[] = []
    
    if (parcel.points.length < validationCriteria.minParcelPoints) {
      errors.push(`Parcel ${parcel.designation}: Too few points (${parcel.points.length}, min: ${validationCriteria.minParcelPoints})`)
    }
    
    if (parcel.points.length > validationCriteria.maxParcelPoints) {
      errors.push(`Parcel ${parcel.designation}: Too many points (${parcel.points.length}, max: ${validationCriteria.maxParcelPoints})`)
    }
    
    if (!parcel.designation || parcel.designation.trim() === '') {
      errors.push('Parcel designation is required')
    }
    
    return { valid: errors.length === 0, errors }
  }
}

// Export all test data
export default {
  metadata: testProjectMetadata,
  coordinates: testCoordinates,
  parcels: testParcels,
  validationCriteria,
  validations
}
