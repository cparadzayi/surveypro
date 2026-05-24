/**
 * Coordinate Transformation Service for Cape Lo Transverse Mercator System
 * Handles Zimbabwe cadastral coordinates with proj4leaflet integration
 */

import proj4 from 'proj4'
import 'proj4leaflet'
import L from 'leaflet'

// Cape Lo projection zones for Zimbabwe
// Based on actual Zimbabwe cadastral survey data and conventions
export const CAPE_LO_ZONES = {
  LO25: { 
    srid: 2051, 
    centralMeridian: 25, 
    name: 'Hartebeesthoek94 Lo25',
    description: 'Zimbabwe Western Zone',
    // Y = Easting/Westing (-200km to +200km from central meridian), X = Northing (0-3000km)
    coordinateRange: { y: [-200000, 200000], x: [0, 3000000] }
  },
  LO27: { 
    srid: 2052, 
    centralMeridian: 27, 
    name: 'Hartebeesthoek94 Lo27',
    description: 'Zimbabwe Central Western Zone',
    coordinateRange: { y: [-200000, 200000], x: [0, 3000000] }
  },
  LO29: { 
    srid: 2054, 
    centralMeridian: 29, 
    name: 'Hartebeesthoek94 Lo29',
    description: 'Zimbabwe Central Zone',
    coordinateRange: { y: [-200000, 200000], x: [0, 3000000] }
  },
  LO31: { 
    srid: 2053, 
    centralMeridian: 31, 
    name: 'Hartebeesthoek94 Lo31',
    description: 'Zimbabwe Central Eastern Zone',
    coordinateRange: { y: [-200000, 200000], x: [0, 3000000] }
  },
  LO33: { 
    srid: 2055, 
    centralMeridian: 33, 
    name: 'Hartebeesthoek94 Lo33',
    description: 'Zimbabwe Eastern Zone',
    coordinateRange: { y: [-200000, 200000], x: [0, 3000000] }
  }
}

// Proj4 definition for Cape Datum Lo (Clarke 1880 Arc ellipsoid, south-oriented).
// Uses the correct ellipsoid and TOWGS84 datum shift for Cape Datum → WGS84.
// Note: coordinates are passed as [Easting, Northing] = [-Westing, -Southing]
// to match the north-oriented TM convention (axis adjustment done by callers).
export const CAPE_LO_PROJ4_DEF = (centralMeridian: number) =>
  `+proj=tmerc +lat_0=0 +lon_0=${centralMeridian} +k=1 +x_0=0 +y_0=0 +a=6378249.14533 +b=6356514.96672 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs`

// Coordinate validation utilities
export const validateCoordinate = (coord: number): boolean => {
  return isFinite(coord) && !isNaN(coord) && coord !== null && coord !== undefined
}

export const validatePoint = (point: { x: number; y: number }): boolean => {
  return validateCoordinate(point.x) && validateCoordinate(point.y)
}

export const sanitizeCoordinates = (points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> => {
  return points.filter(point => {
    const isValid = validatePoint(point)
    if (!isValid) {
      console.warn('🚨 Invalid coordinate filtered out:', point)
    }
    return isValid
  })
}

// SRID detection based on coordinate ranges
export const detectSridFromCoordinates = (points: Array<{ x: number; y: number }>): number => {
  if (points.length === 0) {
    console.warn('⚠️ No coordinates provided for SRID detection, defaulting to Lo29')
    return 2054
  }

  const validPoints = sanitizeCoordinates(points)
  if (validPoints.length === 0) {
    console.error('❌ No valid coordinates for SRID detection')
    return 2054
  }

  // Use average coordinates for detection
  const avgX = validPoints.reduce((sum, p) => sum + p.x, 0) / validPoints.length
  const avgY = validPoints.reduce((sum, p) => sum + p.y, 0) / validPoints.length

  console.log(`📍 Average coordinates: X=${avgX.toFixed(0)}, Y=${avgY.toFixed(0)}`)

  // Check each zone's coordinate range
  for (const [zoneName, zone] of Object.entries(CAPE_LO_ZONES)) {
    const { x: [xMin, xMax], y: [yMin, yMax] } = zone.coordinateRange
    
    if (avgX >= xMin && avgX <= xMax && avgY >= yMin && avgY <= yMax) {
      console.log(`✅ Detected zone: ${zoneName} (${zone.name}) - SRID: ${zone.srid}`)
      return zone.srid
    }
  }

  console.warn(`⚠️ Coordinates outside expected ranges, defaulting to Lo29 (SRID: 2054)`)
  return 2054
}

// Create proj4leaflet CRS for Cape Lo zones
export const createCapeLoCRS = (srid: number): any => {
  const zone = Object.values(CAPE_LO_ZONES).find(z => z.srid === srid)
  
  if (!zone) {
    console.warn(`⚠️ Unknown SRID ${srid}, falling back to Lo29`)
    return createCapeLoCRS(2054)
  }

  const proj4def = CAPE_LO_PROJ4_DEF(zone.centralMeridian)
  
  console.log(`🌍 Creating CRS for ${zone.name} (EPSG:${srid})`)
  console.log(`📐 Proj4 definition: ${proj4def}`)

  return new (L as any).Proj.CRS(`EPSG:${srid}`, proj4def, {
    resolutions: [
      8192, 4096, 2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25
    ],
    origin: [0, 0],
    bounds: (L as any).bounds(
      [-5000000, -5000000],
      [5000000, 5000000]
    )
  })
}

// Transform coordinates from Zimbabwe P(Y,X) to Leaflet LatLng format
// CRITICAL: Cape Lo South-Orientated system (EPSG:22291) uses:
//   Y = Westing (direction: west, perpendicular to meridian)
//   X = Southing (direction: south, along meridian)
// With +axis=wsu, Proj4 handles the axis conversion automatically
export const transformToLatLng = (
  points: Array<{ x: number; y: number }>, 
  crs: any
): Array<[number, number]> => {
  if (!points || points.length === 0) {
    console.warn('⚠️ No points to transform');
    return [];
  }

  const validPoints = sanitizeCoordinates(points);
  if (validPoints.length === 0) {
    console.error('❌ No valid points to transform');
    return [];
  }

  const usesProj4CRS = crs && crs.code && crs.code.startsWith('EPSG:');
  
  console.log(`🔄 Transforming ${validPoints.length} points`);
  console.log(`🔍 CRS: ${crs?.code}, usesProj4: ${usesProj4CRS}`);

  let result: Array<[number, number]>;
  
  if (usesProj4CRS) {
    // Cape Lo South-Orientated system: P(Y, X) where:
    //   Y = Westing (direction: west, perpendicular to meridian) ~ 0-200,000m
    //   X = Southing (direction: south, along meridian) ~ 0-3,000,000m
    // 
    // CRITICAL: Even with +axis=wsu, Leaflet LatLng expects [lat, lng] = [Northing, Easting]
    // For Cape Lo South-Orientated:
    //   - Leaflet "latitude" = X (Southing coordinate, large value ~2.2M)
    //   - Leaflet "longitude" = Y (Westing coordinate, small value ~97k)
    // So we pass [X, Y] to Leaflet, and Proj4 +axis=wsu handles the south-orientated projection
    console.log('✅ Using Proj4 with Cape Lo South-Orientated (+axis=wsu)');
    
    if (validPoints.length > 0) {
      console.log(`📍 Sample: P(Y=${validPoints[0].y}, X=${validPoints[0].x}) → Leaflet.LatLng([${validPoints[0].x}, ${validPoints[0].y}])`);
    }
    
    // CRITICAL: Pass as [X, Y] for Leaflet LatLng (lat=X/Southing, lng=Y/Westing)
    // Proj4 +axis=wsu will correctly handle the south-orientated transformation
    result = validPoints.map(p => [p.x, p.y]);
  } else {
    // Legacy L.CRS.Simple uses negated coordinates
    console.log('🔄 Using legacy coordinate order: [-X, -Y]');
    result = validPoints.map(p => [-p.x, -p.y]);
  }

  // Validate transformed coordinates
  const hasInvalid = result.some(coord => !coord.every(validateCoordinate));
  if (hasInvalid) {
    console.error('❌ Transformation produced invalid coordinates');
    return [];
  }

  return result;
}

// Transform from projected coordinates to WGS84 (for basemap display)
export const transformToWGS84 = (
  points: Array<{ x: number; y: number }>, 
  sourceSrid: number
): Array<{ lat: number; lng: number }> => {
  try {
    const zone = Object.values(CAPE_LO_ZONES).find(z => z.srid === sourceSrid)
    if (!zone) {
      console.warn(`⚠️ Unknown source SRID ${sourceSrid}`)
      return []
    }

    const sourceDef = CAPE_LO_PROJ4_DEF(zone.centralMeridian)
    const wgs84Def = '+proj=longlat +datum=WGS84 +no_defs'
    
    console.log(`🌍 Transforming ${points.length} points from EPSG:${sourceSrid} to WGS84`)
    
    return points.map(point => {
      if (!validatePoint(point)) {
        console.warn('⚠️ Skipping invalid point:', point)
        return null
      }

      // Transform from projected to geographic
      // Zimbabwe P(Y,X) where Y=Westing, X=Northing -> pass as [Y, X]
      const [lng, lat] = proj4(sourceDef, wgs84Def, [point.y, point.x])
      
      return {
        lat: lat,
        lng: lng
      }
    }).filter(Boolean) as Array<{ lat: number; lng: number }>
    
  } catch (error) {
    console.error('❌ Error transforming to WGS84:', error)
    return []
  }
}

// Calculate bounds for a set of points
export const calculateBounds = (points: Array<[number, number]>): L.LatLngBounds | null => {
  if (points.length === 0) {
    console.warn('⚠️ No points to calculate bounds')
    return null
  }

  try {
    const bounds = L.latLngBounds(points as any)
    
    if (!bounds.isValid()) {
      console.warn('⚠️ Calculated bounds are invalid')
      return null
    }

    console.log(`📐 Bounds: N=${bounds.getNorth().toFixed(0)}, S=${bounds.getSouth().toFixed(0)}, E=${bounds.getEast().toFixed(0)}, W=${bounds.getWest().toFixed(0)}`)
    return bounds
    
  } catch (error) {
    console.error('❌ Error calculating bounds:', error)
    return null
  }
}

// Main coordinate transformation service
export class CoordinateTransformService {
  private currentSrid: number = 22289
  private currentCRS: any = null

  constructor() {
    console.log('🚀 Initializing Coordinate Transform Service')
  }

  // Set the current projection based on coordinates or explicit SRID
  setProjection(srid?: number, coordinates?: Array<{ x: number; y: number }>): void {
    if (srid) {
      this.currentSrid = srid
    } else if (coordinates) {
      this.currentSrid = detectSridFromCoordinates(coordinates)
    } else {
      console.warn('⚠️ No SRID or coordinates provided, using default Lo29')
      this.currentSrid = 22289
    }

    this.currentCRS = createCapeLoCRS(this.currentSrid)
    console.log(`✅ Projection set to EPSG:${this.currentSrid}`)
  }

  // Detect SRID from coordinates (wrapper for standalone function)
  detectSridFromCoordinates(coordinates: Array<{ x: number; y: number }>): number {
    return detectSridFromCoordinates(coordinates)
  }

  // Get current CRS
  getCRS(): any {
    return this.currentCRS
  }

  // Get current SRID
  getSRID(): number {
    return this.currentSrid
  }

  // Transform points for Leaflet display
  transformForLeaflet(points: Array<{ x: number; y: number }>): Array<[number, number]> {
    if (!this.currentCRS) {
      console.error('❌ CRS not initialized, call setProjection() first')
      return []
    }

    return transformToLatLng(points, this.currentCRS)
  }

  // Transform points to WGS84 for basemap
  transformToWGS84(points: Array<{ x: number; y: number }>): Array<{ lat: number; lng: number }> {
    return transformToWGS84(points, this.currentSrid)
  }

  // Calculate bounds for transformed points
  calculateBounds(points: Array<{ x: number; y: number }>): L.LatLngBounds | null {
    const transformedPoints = this.transformForLeaflet(points)
    return calculateBounds(transformedPoints)
  }

  // Get zone information
  getZoneInfo(srid?: number): any {
    const targetSrid = srid || this.currentSrid
    return Object.values(CAPE_LO_ZONES).find(z => z.srid === targetSrid)
  }
}

// Export singleton instance
export const coordinateTransform = new CoordinateTransformService()
