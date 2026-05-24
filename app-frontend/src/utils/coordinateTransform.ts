/**
 * Compatibility wrappers for cadastral callers.
 *
 * The transformation core lives in `geodeticTransform.ts`.
 * This file keeps the existing cadastral API shape intact.
 */

import {
  calculateBounds,
  capeToWGS84,
  getLoEPSG as getGeodeticLoEPSG,
  type CapeCoordinate,
  type LoZone
} from './geodeticTransform';

export interface CapeLoPoint {
  id: string;
  x: number;  // Southing (Cape Lo)
  y: number;  // Westing (Cape Lo)
  status?: string;
  description?: string;  // Trig beacon name or point description
}

export interface WGS84Point {
  id: string;
  lng: number;  // Longitude
  lat: number;  // Latitude
  status?: string;
  description?: string;  // Trig beacon name or point description
}

const VALID_LO_ZONES: ReadonlySet<LoZone> = new Set([25, 27, 29, 31, 33]);

function normalizeLoZone(loZone: number | string): LoZone {
  const normalized = typeof loZone === 'string' ? Number(loZone.trim()) : loZone;

  if (!Number.isFinite(normalized) || !VALID_LO_ZONES.has(normalized as LoZone)) {
    throw new Error(`Invalid Lo zone: ${loZone}. Must be 25, 27, 29, 31, or 33`);
  }

  return normalized as LoZone;
}

/**
 * Get EPSG code for a given Lo zone
 * @param loZone - Central meridian (25, 27, 29, 31, or 33)
 * @returns EPSG code string
 */
export function getLoEPSG(loZone: number | string): string {
  return getGeodeticLoEPSG(normalizeLoZone(loZone));
}

/**
 * Convert GeoJSON [x, y] coordinates to Cape Lo { y, x }.
 */
export function geoJsonToCapeLoPoint(
  geoJsonCoords: [number, number],
  id?: string
): { y: number; x: number; id?: string } {
  return {
    y: geoJsonCoords[1],  // GeoJSON [1] = Westing → Cape Lo y
    x: geoJsonCoords[0],  // GeoJSON [0] = Southing → Cape Lo x
    ...(id && { id })
  };
}

/**
 * Convert Cape Lo { y, x } to GeoJSON [x, y].
 */
export function capeLoPointToGeoJson(
  capeLoPoint: { y: number; x: number }
): [number, number] {
  return [
    capeLoPoint.x,  // Cape Lo x (Southing) → GeoJSON [0]
    capeLoPoint.y   // Cape Lo y (Westing) → GeoJSON [1]
  ];
}

/**
 * Transform Cape Lo coordinates to WGS84 (for MapLibre/satellite overlay)
 * @param point Cape Lo point with P(Y, X) format
 * @param loZone Central meridian (25, 27, 29, 31, or 33). Defaults to 31.
 * @returns WGS84 coordinates [longitude, latitude]
 */
export function capeLoToWGS84(point: CapeLoPoint, loZone: number | string = 31): WGS84Point {
  try {
    const zone = normalizeLoZone(loZone);
    const capePoint: CapeCoordinate = {
      id: point.id,
      y: point.y,
      x: point.x,
      system: `Lo ${zone}`,
      unit: 'M',
      description: point.description
    };
    const transformed = capeToWGS84(capePoint, zone);

    return {
      id: point.id,
      lng: transformed.lng,
      lat: transformed.lat,
      status: point.status,
      description: transformed.description ?? point.description
    };
  } catch (error) {
    console.error(`[CoordTransform] Error transforming point ${point.id}:`, error);
    throw new Error(`Failed to transform coordinates for point ${point.id}`);
  }
}

/**
 * Transform multiple Cape Lo points to WGS84
 * @param points Array of Cape Lo points
 * @param loZone Central meridian (25, 27, 29, 31, or 33). Defaults to 31.
 */
export function capeLoArrayToWGS84(points: CapeLoPoint[], loZone: number | string = 31): WGS84Point[] {
  // Only log batch transforms (>1 point) to avoid per-vertex spam
  if (points.length > 1) {
    const sourceEPSG = getLoEPSG(loZone);
    console.log(`[CoordinateTransform] Batch transforming ${points.length} points from ${sourceEPSG} to EPSG:4326`);
  }
  
  return points.map(point => capeLoToWGS84(point, loZone));
}

/**
 * Calculate bounds for WGS84 points
 */
export function calculateWGS84Bounds(points: WGS84Point[]): {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
  center: [number, number];
} {
  const bounds = calculateBounds(points);

  return {
    minLng: bounds.minLng,
    maxLng: bounds.maxLng,
    minLat: bounds.minLat,
    maxLat: bounds.maxLat,
    center: bounds.center
  };
}
