/**
 * Shared utility for computing parcel metadata on-the-fly from geometry
 * This ensures consistent coordinate handling across all PDF generators
 */

import { geoJsonToCapeLoPoint } from './coordinateTransform';
import { listCoordinatePoints } from '../services/spatial';

export interface CapeLoPoint {
  id: string;
  y: number; // Westing
  x: number; // Southing
  status?: string;
  description?: string;
}

export interface ParcelWithGeometry {
  stand: string;
  project_id: number;
  geom?: any;
  geometry?: any;
  metadata?: any;
}

/**
 * Compute Cape Lo points from parcel geometry with spatial matching to coordinate points
 * This is the on-the-fly computation that replaces reliance on stored metadata
 */
export async function computeCapeLoPointsFromGeometry(
  parcel: ParcelWithGeometry,
  coordinatePoints?: any[]
): Promise<CapeLoPoint[]> {
  const points: CapeLoPoint[] = [];
  
  // Get geometry (check both 'geom' and 'geometry' fields)
  const geometry = parcel.geom || parcel.geometry;
  
  if (!geometry?.coordinates?.[0]) {
    console.warn(`[ParcelMetadata] No geometry found for parcel ${parcel.stand}`);
    return points;
  }
  
  const coords = geometry.coordinates[0];
  console.log(`[ParcelMetadata] Computing points for parcel ${parcel.stand} with ${coords.length - 1} vertices`);
  
  // ⭐ SINGLE SOURCE OF TRUTH: Always use spatial matching to coordinate_points
  // This ensures consistency between database geometry and beacon names
  if (coordinatePoints && coordinatePoints.length > 0) {
    // Match vertices to coordinate points by spatial proximity
    console.log(`[ParcelMetadata] Matching vertices to ${coordinatePoints.length} coordinate points`);
    
    // DEBUG: Log first coordinate point to check Y/X values
    if (coordinatePoints.length > 0) {
      const firstCP = coordinatePoints[0];
      console.log(`[ParcelMetadata] 🔍 Sample coordinate point: ${firstCP.name}, y=${firstCP.y?.toFixed(2)}, x=${firstCP.x?.toFixed(2)}`);
    }
    
    const tolerance = 2.0; // 2 meter tolerance
    const usedPoints = new Set();
    
    for (let i = 0; i < coords.length - 1; i++) {
      const capeLoPoint = geoJsonToCapeLoPoint(coords[i]);
      const vertexY = capeLoPoint.y; // Westing (~97k)
      const vertexX = capeLoPoint.x; // Southing (~2247k)
      
      // DEBUG: Log vertex coordinates
      if (i === 0) {
        console.log(`[ParcelMetadata] 🔍 Sample vertex: Y=${vertexY.toFixed(2)}, X=${vertexX.toFixed(2)}`);
      }
      
      // Find nearest coordinate point
      let nearestPoint = null;
      let minDistance = Infinity;
      
      for (const cp of coordinatePoints) {
        if (usedPoints.has(cp.name)) continue;
        
        // Database already stores coordinates correctly:
        // Database y = Westing (~97k), x = Southing (~2247k)
        // This matches Cape Lo convention, so NO SWAP needed
        const cpY = cp.y; // Database y (Westing) = Cape Lo y
        const cpX = cp.x; // Database x (Southing) = Cape Lo x
        
        const dy = vertexY - cpY; // Both are Westing
        const dx = vertexX - cpX; // Both are Southing
        const distance = Math.sqrt(dy * dy + dx * dx);
        
        if (distance < minDistance) {
          minDistance = distance;
          nearestPoint = cp;
        }
      }
      
      if (nearestPoint && minDistance <= tolerance) {
        console.log(`[ParcelMetadata] ✅ Vertex ${i} matched to ${nearestPoint.name} (${minDistance.toFixed(3)}m)`);
        usedPoints.add(nearestPoint.name);
        // Use coordinates directly from database (already in correct Cape Lo format)
        points.push({
          id: nearestPoint.name,
          y: nearestPoint.y, // Database y (Westing) = Cape Lo y
          x: nearestPoint.x, // Database x (Southing) = Cape Lo x
          status: 'P',
          description: nearestPoint.description || `Beacon ${nearestPoint.name}`
        });
      } else {
        // Fallback to sequential naming
        const beaconLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const fallbackName = `${parcel.stand}${beaconLetters[i]}`;
        console.warn(`[ParcelMetadata] ⚠️ Vertex ${i} (Y=${vertexY.toFixed(2)}, X=${vertexX.toFixed(2)}) not matched - nearest: ${nearestPoint?.name} at ${minDistance.toFixed(3)}m (tolerance: ${tolerance}m) - using ${fallbackName}`);
        points.push({
          id: fallbackName,
          y: vertexY,
          x: vertexX,
          status: 'P',
          description: `Beacon ${fallbackName}`
        });
      }
    }
  } else {
    // No coordinate points available - use sequential naming
    console.log(`[ParcelMetadata] No coordinate points - using sequential naming`);
    const beaconLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    
    for (let i = 0; i < coords.length - 1; i++) {
      const capeLoPoint = geoJsonToCapeLoPoint(coords[i]);
      points.push({
        id: `${parcel.stand}${beaconLetters[i]}`,
        y: capeLoPoint.y,
        x: capeLoPoint.x,
        status: 'P',
        description: `Beacon ${beaconLetters[i]}`
      });
    }
  }
  
  console.log(`[ParcelMetadata] ✅ Computed ${points.length} points for parcel ${parcel.stand}`);
  return points;
}

/**
 * Load coordinate points for a project (with caching)
 */
let cachedCoordinatePoints: Map<number, any[]> = new Map();

export async function getCoordinatePointsForProject(projectId: number): Promise<any[]> {
  if (cachedCoordinatePoints.has(projectId)) {
    console.log(`[ParcelMetadata] Using cached coordinate points for project ${projectId}`);
    return cachedCoordinatePoints.get(projectId)!;
  }
  
  console.log(`[ParcelMetadata] Loading coordinate points for project ${projectId}`);
  const points = await listCoordinatePoints(projectId);
  cachedCoordinatePoints.set(projectId, points);
  return points;
}

/**
 * Clear coordinate points cache (call when coordinate points are updated)
 */
export function clearCoordinatePointsCache() {
  cachedCoordinatePoints.clear();
}
