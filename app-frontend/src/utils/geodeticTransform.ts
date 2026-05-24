/**
 * Geodetic ↔ Plane Coordinate Transformation Utilities
 * Based on CDNGI Coordinate Conversion Utility v1 Sep 2009
 * 
 * Supports:
 * - Cape Datum (Modified Clarke 1880 ellipsoid) ↔ WGS84
 * - Cape Feet (C) ↔ Meters ↔ International Feet (I)
 * - All Zimbabwe Lo zones: 25, 27, 29, 31, 33
 * - Gauss-Conformal projection with south-oriented axes
 */

import proj4 from 'proj4';

// Cape Feet to Meters conversion factor (SI 727 of 1979: Cape Foot = 0.314855575 m)
export const CAPE_FOOT_METERS = 0.314855575;
// International (English) Foot to Meters (SI 727 of 1979: exact 0.304799472 m)
export const INTERNATIONAL_FOOT_METERS = 0.304799472;

// Define all Cape Lo projections using CORRECT EPSG codes.
// All use Clarke 1880 (Arc) ellipsoid and Cape Datum (towgs84=-136,-108,-292).
//
// NOTE: +axis=wsu is intentionally OMITTED.  proj4js 2.x only applies axis
// adjustment when enforceAxis=true is explicitly passed to transform().
// Since we never pass enforceAxis, keeping +axis=wsu in the definition would
// have no effect on output but would cause double-negation if a caller ever
// enables enforceAxis.  Instead, the axis convention is handled explicitly in
// capeToWGS84() and wgs84ToCape() by negating coordinates before/after proj4
// calls (converting between south-oriented Cape Lo and north-oriented TM).
proj4.defs('EPSG:22285', // Cape / Lo25
  '+proj=tmerc +lat_0=0 +lon_0=25 +k=1 +x_0=0 +y_0=0 +a=6378249.14533 +b=6356514.96672 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs'
);

proj4.defs('EPSG:22287', // Cape / Lo27
  '+proj=tmerc +lat_0=0 +lon_0=27 +k=1 +x_0=0 +y_0=0 +a=6378249.14533 +b=6356514.96672 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs'
);

proj4.defs('EPSG:22289', // Cape / Lo29
  '+proj=tmerc +lat_0=0 +lon_0=29 +k=1 +x_0=0 +y_0=0 +a=6378249.14533 +b=6356514.96672 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs'
);

proj4.defs('EPSG:22291', // Cape / Lo31
  '+proj=tmerc +lat_0=0 +lon_0=31 +k=1 +x_0=0 +y_0=0 +a=6378249.14533 +b=6356514.96672 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs'
);

proj4.defs('EPSG:22293', // Cape / Lo33
  '+proj=tmerc +lat_0=0 +lon_0=33 +k=1 +x_0=0 +y_0=0 +a=6378249.14533 +b=6356514.96672 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs'
);

// WGS84 (standard GPS coordinates)
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

export type MeasurementUnit = 'C' | 'I' | 'M';
export type LoZone = 25 | 27 | 29 | 31 | 33;

export interface CapeCoordinate {
  id: string;
  y: number;  // Westing (positive west in Cape Lo)
  x: number;  // Southing (positive south in Cape Lo)
  sr_num?: string;
  description?: string;
  survey_date?: string;
  system: string;  // e.g., "Lo 33"
  unit: MeasurementUnit;
}

export interface WGS84Coordinate {
  id: string;
  lng: number;  // Longitude
  lat: number;  // Latitude
  elevation?: number;
  description?: string;
}

export interface TransformedPoint {
  original: CapeCoordinate;
  wgs84: WGS84Coordinate;
  // Additional metadata
  loZone: LoZone;
  convertedToMeters: boolean;
  conversionFactor: number;
}

/**
 * Convert measurement unit to meters
 * @param value Value in original unit
 * @param unit 'C' = Cape Feet, 'I' = International Feet, 'M' = Meters
 */
export function convertToMeters(value: number, unit: MeasurementUnit): number {
  switch (unit) {
    case 'C':
      return value * CAPE_FOOT_METERS;
    case 'I':
      return value * INTERNATIONAL_FOOT_METERS;
    case 'M':
      return value;
    default:
      console.warn(`Unknown unit: ${unit}, assuming meters`);
      return value;
  }
}

/**
 * Convert meters to specified unit
 * @param meters Value in meters
 * @param unit 'C' = Cape Feet, 'I' = International Feet, 'M' = Meters
 */
export function convertFromMeters(meters: number, unit: MeasurementUnit): number {
  switch (unit) {
    case 'C':
      return meters / CAPE_FOOT_METERS;
    case 'I':
      return meters / INTERNATIONAL_FOOT_METERS;
    case 'M':
      return meters;
    default:
      return meters;
  }
}

/**
 * Get EPSG code for a given Lo zone
 * @param loZone - Central meridian (25, 27, 29, 31, or 33)
 */
export function getLoEPSG(loZone: LoZone): string {
  const epsgMap: Record<LoZone, string> = {
    25: 'EPSG:22285',
    27: 'EPSG:22287',
    29: 'EPSG:22289',
    31: 'EPSG:22291',
    33: 'EPSG:22293'
  };
  
  const epsg = epsgMap[loZone];
  if (!epsg) {
    throw new Error(`Invalid Lo zone: ${loZone}. Must be 25, 27, 29, 31, or 33`);
  }
  
  return epsg;
}

/**
 * Parse Lo zone from system string (e.g., "Lo 33" → 33)
 * @param system System string like "Lo 33" or "Lo33"
 */
export function parseLoZone(system: string): LoZone {
  const match = system.match(/Lo\s*(\d+)/i);
  if (match) {
    const zone = parseInt(match[1], 10) as LoZone;
    if ([25, 27, 29, 31, 33].includes(zone)) {
      return zone;
    }
  }
  // Default to Lo 31 if not found
  console.warn(`Could not parse Lo zone from "${system}", defaulting to Lo 31`);
  return 31;
}

/**
 * Transform Cape Datum coordinates to WGS84
 * @param point Cape coordinate with Y (Westing), X (Southing)
 * @param loZone Lo zone (25, 27, 29, 31, 33)
 * @param unit Measurement unit - will be converted to meters for transformation
 */
export function capeToWGS84(
  point: CapeCoordinate,
  loZone?: LoZone
): WGS84Coordinate {
  const zone = loZone || parseLoZone(point.system);
  const sourceEPSG = getLoEPSG(zone);
  
  // Convert to meters if needed
  const yMeters = convertToMeters(point.y, point.unit);
  const xMeters = convertToMeters(point.x, point.unit);
  
  try {
    // Cape Lo is south-orientated: +axis=wsu (West-South-Up)
    // In Cape Lo: Y=Westing (positive west), X=Southing (positive south)
    // For Proj4 with +axis=wsu, we need to pass: [Easting, Northing]
    // Therefore: Easting = -Y (negate westing), Northing = -X (negate southing)
    const [lng, lat] = proj4(sourceEPSG, 'EPSG:4326', [-yMeters, -xMeters]);
    
    return {
      id: point.id,
      lng,
      lat,
      description: point.description
    };
  } catch (error) {
    console.error(`[GeodeticTransform] Error transforming point ${point.id}:`, error);
    throw new Error(`Failed to transform coordinates for point ${point.id}`);
  }
}

/**
 * Transform WGS84 coordinates to Cape Datum (inverse transformation)
 * @param lng Longitude
 * @param lat Latitude
 * @param loZone Lo zone for target projection
 * @param unit Target measurement unit for output
 * @param pointId Point identifier
 */
export function wgs84ToCape(
  lng: number,
  lat: number,
  loZone: LoZone = 31,
  unit: MeasurementUnit = 'M',
  pointId?: string
): CapeCoordinate {
  const targetEPSG = getLoEPSG(loZone);
  
  try {
    // Transform to Cape Lo (returns [Easting, Northing])
    const [easting, northing] = proj4('EPSG:4326', targetEPSG, [lng, lat]);
    
    // Convert to Cape Lo convention: Westing = -Easting, Southing = -Northing
    const westing = -easting;
    const southing = -northing;
    
    // Convert from meters to target unit
    const y = convertFromMeters(westing, unit);
    const x = convertFromMeters(southing, unit);
    
    return {
      id: pointId || `PT_${Date.now()}`,
      y,
      x,
      system: `Lo ${loZone}`,
      unit
    };
  } catch (error) {
    console.error(`[GeodeticTransform] Error in inverse transformation:`, error);
    throw new Error(`Failed to transform WGS84 to Cape Lo ${loZone}`);
  }
}

/**
 * Batch transform multiple Cape coordinates to WGS84
 * @param points Array of Cape coordinates
 */
export function batchCapeToWGS84(points: CapeCoordinate[]): TransformedPoint[] {
  return points.map(point => {
    const loZone = parseLoZone(point.system);
    const wgs84 = capeToWGS84(point, loZone);
    
    return {
      original: point,
      wgs84,
      loZone,
      convertedToMeters: point.unit !== 'M',
      conversionFactor: point.unit === 'C' ? CAPE_FOOT_METERS : 
                       point.unit === 'I' ? INTERNATIONAL_FOOT_METERS : 1
    };
  });
}

/**
 * Calculate bounds for WGS84 points
 */
export function calculateBounds(points: WGS84Coordinate[]): {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
  center: [number, number];
  widthKm: number;
  heightKm: number;
} {
  if (points.length === 0) {
    return {
      minLng: 0, maxLng: 0, minLat: 0, maxLat: 0,
      center: [0, 0],
      widthKm: 0, heightKm: 0
    };
  }
  
  const lngs = points.map(p => p.lng);
  const lats = points.map(p => p.lat);
  
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  
  const centerLng = (minLng + maxLng) / 2;
  const centerLat = (minLat + maxLat) / 2;
  
  // Approximate width/height in km (rough calculation)
  const kmPerDegreeLng = 111.32 * Math.cos(centerLat * Math.PI / 180);
  const kmPerDegreeLat = 111.32;
  
  const widthKm = (maxLng - minLng) * kmPerDegreeLng;
  const heightKm = (maxLat - minLat) * kmPerDegreeLat;
  
  return {
    minLng,
    maxLng,
    minLat,
    maxLat,
    center: [centerLng, centerLat],
    widthKm,
    heightKm
  };
}

/**
 * Generate Google Maps URL for a single point
 * @param point WGS84 coordinate
 */
export function getGoogleMapsUrl(point: WGS84Coordinate): string {
  return `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`;
}

/**
 * Generate Google Maps URL for multiple points (directions view)
 * @param points Array of WGS84 coordinates
 */
export function getGoogleMapsDirectionsUrl(points: WGS84Coordinate[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return getGoogleMapsUrl(points[0]);
  
  const origin = `${points[0].lat},${points[0].lng}`;
  const destination = `${points[points.length - 1].lat},${points[points.length - 1].lng}`;
  
  if (points.length === 2) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
  }
  
  // Add waypoints for intermediate points
  const waypoints = points.slice(1, -1)
    .map(p => `${p.lat},${p.lng}`)
    .join('|');
  
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${waypoints}`;
}

/**
 * Generate WhatsApp location share URL
 * @param point WGS84 coordinate
 * @param label Optional label for the location
 */
export function getWhatsAppShareUrl(point: WGS84Coordinate, label?: string): string {
  const mapsUrl = getGoogleMapsUrl(point);
  const message = label 
    ? `Location: ${label}\n${mapsUrl}`
    : `Location: ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}\n${mapsUrl}`;
  
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/**
 * Generate KML file content for points and polygons
 * @param points Array of WGS84 coordinates
 * @param polygons Optional array of polygons (arrays of WGS84 coordinates)
 * @param title Document title
 */
export function generateKML(
  points: WGS84Coordinate[],
  polygons: WGS84Coordinate[][] = [],
  title: string = 'SurveyPro Geodetic Transform'
): string {
  const timestamp = new Date().toISOString();
  
  let placemarks = points.map(point => `
    <Placemark>
      <name>${point.id}</name>
      <description>${point.description || ''}</description>
      <Point>
        <coordinates>${point.lng},${point.lat},0</coordinates>
      </Point>
    </Placemark>
  `).join('');
  
  const polygonPlacemarks = polygons.map((polygon, index) => {
    const coords = polygon.map(p => `${p.lng},${p.lat},0`).join(' ');
    // Close the polygon by repeating the first point
    const closedCoords = coords + ` ${polygon[0].lng},${polygon[0].lat},0`;
    
    return `
    <Placemark>
      <name>Polygon ${index + 1}</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${closedCoords}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  `;
  }).join('');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${title}</name>
    <description>Generated by SurveyPro on ${timestamp}</description>
    ${placemarks}
    ${polygonPlacemarks}
  </Document>
</kml>`;
}

/**
 * Generate KMZ content (zipped KML - returns base64 string)
 * In browser environment, we can only provide the KML content
 * The user would need to zip it to create KMZ
 */
export function generateKMZData(
  points: WGS84Coordinate[],
  polygons: WGS84Coordinate[][] = [],
  title: string = 'SurveyPro Geodetic Transform'
): { kml: string; filename: string } {
  return {
    kml: generateKML(points, polygons, title),
    filename: `${title.replace(/\s+/g, '_')}.kml`
  };
}

/**
 * Download content as file
 * @param content File content
 * @param filename Filename with extension
 * @param mimeType MIME type
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
