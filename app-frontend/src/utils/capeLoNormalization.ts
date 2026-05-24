/**
 * Cape Lo Coordinate Normalization for PDF Generation
 * 
 * Transforms Cape Lo coordinates (south-oriented, Y=Westing, X=Southing)
 * to a normalized north-oriented system for straightforward PDF rendering.
 * 
 * This ensures the PDF backend receives coordinates in a standard orientation
 * that can be rendered without complex transformations.
 */

export interface CapeLoExtent {
  minY: number
  maxY: number
  minX: number
  maxX: number
}

export interface NormalizedCoordinates {
  x: number // Normalized easting (0 to width)
  y: number // Normalized northing (0 to height)
}

/**
 * Transform Cape Lo coordinates to normalized north-oriented coordinates
 * 
 * Cape Lo: Y=Westing (positive west), X=Southing (positive south)
 * Output: x=Easting (0=west, max=east), y=Northing (0=south, max=north)
 * 
 * This matches how MapLibre displays the coordinates after proj4 transformation.
 */
export function normalizeCapeLoCoordinates(
  y: number,
  x: number,
  extent: CapeLoExtent
): NormalizedCoordinates {
  // Step 1: Negate coordinates to convert from south-oriented to north-oriented
  // Y (Westing) → -Y (Easting)
  // X (Southing) → -X (Northing)
  const easting = -y
  const northing = -x
  
  // Step 2: Calculate extent in north-oriented system (min/max swap when negating)
  const eastingMin = -extent.maxY
  const eastingMax = -extent.minY
  const northingMin = -extent.maxX
  const northingMax = -extent.minX
  
  // Step 3: Calculate 0-based offsets
  // Subtract the minimum to get coordinates starting from 0
  const normalizedX = easting - eastingMin  // 0 at west edge
  const normalizedY = northing - northingMin // 0 at south edge
  
  return {
    x: normalizedX,
    y: normalizedY
  }
}

/**
 * Transform a GeoJSON Point geometry from Cape Lo to normalized coordinates
 */
export function normalizeGeoJSONPoint(
  coordinates: [number, number],
  extent: CapeLoExtent
): [number, number] {
  // GeoJSON from this codebase stores [Southing, Westing] (coord[0]=Southing, coord[1]=Westing).
  // normalizeCapeLoCoordinates expects (y=Westing, x=Southing).
  const [southing, westing] = coordinates
  const normalized = normalizeCapeLoCoordinates(westing, southing, extent)
  
  // Debug first call
  if (!(normalizeGeoJSONPoint as any)._debugged) {
    console.log('[normalizeGeoJSONPoint] DEBUG:', {
      input: { y, x },
      extent,
      output: { x: normalized.x, y: normalized.y }
    });
    (normalizeGeoJSONPoint as any)._debugged = true;
  }
  
  return [normalized.x, normalized.y]
}

/**
 * Transform a GeoJSON LineString geometry from Cape Lo to normalized coordinates
 */
export function normalizeGeoJSONLineString(
  coordinates: [number, number][],
  extent: CapeLoExtent
): [number, number][] {
  return coordinates.map(coord => normalizeGeoJSONPoint(coord, extent))
}

/**
 * Transform a GeoJSON Polygon geometry from Cape Lo to normalized coordinates
 */
export function normalizeGeoJSONPolygon(
  coordinates: [number, number][][],
  extent: CapeLoExtent
): [number, number][][] {
  return coordinates.map(ring => normalizeGeoJSONLineString(ring, extent))
}

/**
 * Transform an entire GeoJSON FeatureCollection from Cape Lo to normalized coordinates
 * This is the main function to use before sending data to the PDF backend.
 */
export function normalizeGeoJSONFeatureCollection(
  featureCollection: GeoJSON.FeatureCollection,
  extent: CapeLoExtent
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: featureCollection.features.map(feature => {
      const geometry = feature.geometry
      let normalizedGeometry: GeoJSON.Geometry
      
      switch (geometry.type) {
        case 'Point':
          normalizedGeometry = {
            type: 'Point',
            coordinates: normalizeGeoJSONPoint(geometry.coordinates as [number, number], extent)
          }
          break
          
        case 'LineString':
          normalizedGeometry = {
            type: 'LineString',
            coordinates: normalizeGeoJSONLineString(geometry.coordinates as [number, number][], extent)
          }
          break
          
        case 'Polygon':
          normalizedGeometry = {
            type: 'Polygon',
            coordinates: normalizeGeoJSONPolygon(geometry.coordinates as [number, number][][], extent)
          }
          break
          
        default:
          console.warn(`[CapeLoNormalization] Unsupported geometry type: ${geometry.type}`)
          normalizedGeometry = geometry
      }
      
      return {
        ...feature,
        geometry: normalizedGeometry
      }
    })
  }
}

/**
 * Calculate normalized extent dimensions
 */
export function calculateNormalizedExtent(extent: CapeLoExtent): {
  width: number
  height: number
  minX: number
  maxX: number
  minY: number
  maxY: number
} {
  // Convert to north-oriented
  const eastingMin = -extent.maxY
  const eastingMax = -extent.minY
  const northingMin = -extent.maxX
  const northingMax = -extent.minX
  
  return {
    width: eastingMax - eastingMin,
    height: northingMax - northingMin,
    minX: 0,
    maxX: eastingMax - eastingMin,
    minY: 0,
    maxY: northingMax - northingMin
  }
}
