/**
 * Parcel Geometry Composable
 * Handles polygon generation and area calculation for land parcels
 */

import type { AdjustedCoordinate } from '../types/adjusted-coordinates';

export interface ParcelGeometry {
  polygon: L.LatLng[];
  geoJSON: any;
  area: {
    sqm: number;
    hectares: number;
    acres: number;
  };
  perimeter: number;
  compactness: number;
  boundingBox: [number, number, number, number]; // [minY, minX, maxY, maxX]
  validation: PolygonValidation;
  statistics: PolygonStatistics;
}

export interface PolygonValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  closureError: number;
  selfIntersections: number;
  hasDuplicatePoints: boolean;
  hasSpikes: number;
}

export interface PolygonStatistics {
  vertexCount: number;
  longestSide: number;
  shortestSide: number;
  averageSideLength: number;
  shapeType: 'Regular' | 'Moderate' | 'Irregular' | 'Highly Irregular';
  elongationRatio: number;
}

export function useParcelGeometry() {
  
  /**
   * Generate polygon from boundary points with QGIS-style validation
   */
  function generatePolygon(
    boundaryPointIds: string[],
    allPoints: AdjustedCoordinate[]
  ): ParcelGeometry | null {
    if (boundaryPointIds.length < 3) {
      console.warn('[ParcelGeometry] Need at least 3 points to form a polygon');
      return null;
    }

    // Initialize validation object
    const validation: PolygonValidation = {
      isValid: true,
      errors: [],
      warnings: [],
      closureError: 0,
      selfIntersections: 0,
      hasDuplicatePoints: false,
      hasSpikes: 0
    };

    // Find the coordinates for each boundary point
    const coordinates: { y: number; x: number }[] = [];
    const missingPoints: string[] = [];
    
    for (const pointId of boundaryPointIds) {
      const point = allPoints.find(p => p.pointId === pointId);
      if (!point) {
        missingPoints.push(pointId);
        validation.isValid = false;
      } else {
        coordinates.push({ y: point.y, x: point.x });
      }
    }

    if (missingPoints.length > 0) {
      validation.errors.push(`Missing points: ${missingPoints.join(', ')}`);
      console.warn(`[ParcelGeometry] Missing points:`, missingPoints);
      return null;
    }

    // Check for duplicate consecutive points
    const uniqueCoordinates = removeDuplicatePoints(coordinates);
    if (uniqueCoordinates.length !== coordinates.length) {
      validation.hasDuplicatePoints = true;
      validation.warnings.push(`Removed ${coordinates.length - uniqueCoordinates.length} duplicate consecutive point(s)`);
    }

    // Check polygon closure (first vs last point distance)
    // NOTE: This is NOT the same as traverse closure error!
    // This only checks if the polygon is geometrically closed.
    // The actual traverse closure is calculated by the backend API.
    const first = uniqueCoordinates[0];
    const last = uniqueCoordinates[uniqueCoordinates.length - 1];
    const closureDistance = Math.sqrt(
      Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2)
    );
    validation.closureError = closureDistance;

    // Auto-close polygon if needed
    const workingCoordinates = [...uniqueCoordinates];
    if (closureDistance > 0.001) { // More than 1mm gap
      // Always auto-close, but warn if gap is large
      workingCoordinates.push({ ...first });
      
      if (closureDistance < 10.0) {
        // Small gap - auto close with warning
        validation.warnings.push(`Polygon auto-closed with ${closureDistance.toFixed(3)}m gap`);
      } else {
        // Large gap - warning only (not error)
        // The backend traverse validation will determine actual quality
        validation.warnings.push(
          `Large geometric gap: ${closureDistance.toFixed(2)}m between first and last point.\n` +
          `This may indicate points are not in sequential order.\n` +
          `The traverse closure error will be calculated after area computation.`
        );
      }
    } else {
      // Already closed or very close
      workingCoordinates.push({ ...first });
    }

    // Check for self-intersections
    const intersectionCount = checkSelfIntersections(workingCoordinates);
    if (intersectionCount > 0) {
      validation.selfIntersections = intersectionCount;
      validation.isValid = false;
      validation.errors.push(`Polygon has ${intersectionCount} self-intersection(s)`);
    }

    // Check for spikes (very acute angles)
    const spikeCount = detectSpikes(workingCoordinates);
    if (spikeCount > 0) {
      validation.hasSpikes = spikeCount;
      validation.warnings.push(`Polygon has ${spikeCount} spike(s) - very acute angles detected`);
    }

    // Calculate area using Shoelace formula (Gauss coordinates)
    const area_sqm = calculateArea(workingCoordinates);
    const area_hectares = area_sqm / 10000;
    const area_acres = area_sqm / 4046.86;

    // Calculate perimeter
    const perimeter = calculatePerimeter(workingCoordinates);

    // Calculate compactness index (Polsby-Popper test)
    // Perfect circle = 1.0, irregular shape approaches 0
    const compactness = (4 * Math.PI * area_sqm) / Math.pow(perimeter, 2);

    // Calculate bounding box
    const boundingBox = calculateBoundingBox(workingCoordinates);

    // Calculate polygon statistics
    const statistics = calculatePolygonStatistics(workingCoordinates, area_sqm, perimeter, compactness, boundingBox);

    // Validate shape quality
    if (compactness < 0.05) {
      validation.warnings.push('Very irregular shape (sliver polygon) - verify point selection');
    }

    if (statistics.elongationRatio > 10) {
      validation.warnings.push('Highly elongated parcel - verify measurements');
    }

    // Convert Zimbabwe P(Y,X) to Leaflet LatLng format
    // Zimbabwe: Y=westing (increases west), X=southing (increases south)
    // Leaflet: lat=northing, lng=easting
    // For north-up display, we map: lat=X (southing), lng=Y (westing)
    const polygon = workingCoordinates.map(coord => ({
      lat: coord.x,  // X (southing) → lat
      lng: coord.y   // Y (westing) → lng
    }) as L.LatLng);

    // Generate GeoJSON with enhanced properties
    const geoJSON = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [workingCoordinates.map(c => [c.x, c.y])]
      },
      properties: {
        area_sqm,
        area_hectares,
        area_acres,
        perimeter,
        compactness,
        shapeType: statistics.shapeType,
        isValid: validation.isValid,
        validationErrors: validation.errors,
        validationWarnings: validation.warnings
      }
    };

    return {
      polygon,
      geoJSON,
      area: {
        sqm: area_sqm,
        hectares: area_hectares,
        acres: area_acres
      },
      perimeter,
      compactness,
      boundingBox,
      validation,
      statistics
    };
  }

  /**
   * Calculate polygon area using Shoelace formula
   * Coordinates are in Gauss (Y, X) format
   */
  function calculateArea(coordinates: { y: number; x: number }[]): number {
    let area = 0;
    const n = coordinates.length;

    for (let i = 0; i < n - 1; i++) {
      const y1 = coordinates[i].y;
      const x1 = coordinates[i].x;
      const y2 = coordinates[i + 1].y;
      const x2 = coordinates[i + 1].x;

      area += (y1 * x2) - (y2 * x1);
    }

    return Math.abs(area / 2);
  }

  /**
   * Calculate polygon perimeter
   */
  function calculatePerimeter(coordinates: { y: number; x: number }[]): number {
    let perimeter = 0;
    const n = coordinates.length;

    for (let i = 0; i < n - 1; i++) {
      const dy = coordinates[i + 1].y - coordinates[i].y;
      const dx = coordinates[i + 1].x - coordinates[i].x;
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }

    return perimeter;
  }

  /**
   * Calculate bounding box [minY, minX, maxY, maxX]
   */
  function calculateBoundingBox(coordinates: { y: number; x: number }[]): [number, number, number, number] {
    let minY = Infinity, minX = Infinity, maxY = -Infinity, maxX = -Infinity;

    for (const coord of coordinates) {
      if (coord.y < minY) minY = coord.y;
      if (coord.y > maxY) maxY = coord.y;
      if (coord.x < minX) minX = coord.x;
      if (coord.x > maxX) maxX = coord.x;
    }

    return [minY, minX, maxY, maxX];
  }

  /**
   * Remove duplicate consecutive points
   */
  function removeDuplicatePoints(coordinates: { y: number; x: number }[]): { y: number; x: number }[] {
    if (coordinates.length === 0) return [];

    const unique = [coordinates[0]];
    for (let i = 1; i < coordinates.length; i++) {
      const prev = unique[unique.length - 1];
      const curr = coordinates[i];
      // Check if points are different (tolerance: 0.001m = 1mm)
      if (Math.abs(curr.y - prev.y) > 0.001 || Math.abs(curr.x - prev.x) > 0.001) {
        unique.push(curr);
      }
    }

    return unique;
  }

  /**
   * Check for self-intersections using simple O(n²) algorithm
   * Sufficient for typical parcel sizes (< 100 points)
   */
  function checkSelfIntersections(coordinates: { y: number; x: number }[]): number {
    let count = 0;
    const n = coordinates.length - 1; // Exclude last point (duplicate of first)

    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 2; j < n - 1; j++) {
        // Don't check adjacent segments
        if (Math.abs(i - j) === 1) continue;

        if (doSegmentsIntersect(
          coordinates[i], coordinates[i + 1],
          coordinates[j], coordinates[j + 1]
        )) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Check if two line segments intersect
   */
  function doSegmentsIntersect(
    p1: { y: number; x: number },
    p2: { y: number; x: number },
    p3: { y: number; x: number },
    p4: { y: number; x: number }
  ): boolean {
    const ccw = (A: { y: number; x: number }, B: { y: number; x: number }, C: { y: number; x: number }) => {
      return (C.x - A.x) * (B.y - A.y) > (B.x - A.x) * (C.y - A.y);
    };

    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
  }

  /**
   * Detect spikes (very acute angles < 10 degrees)
   */
  function detectSpikes(coordinates: { y: number; x: number }[]): number {
    let spikeCount = 0;
    const n = coordinates.length - 1; // Exclude last point

    for (let i = 1; i < n; i++) {
      const prev = coordinates[i - 1];
      const curr = coordinates[i];
      const next = coordinates[i + 1];

      // Calculate vectors
      const v1 = { y: curr.y - prev.y, x: curr.x - prev.x };
      const v2 = { y: next.y - curr.y, x: next.x - curr.x };

      // Calculate angle using dot product
      const dot = v1.y * v2.y + v1.x * v2.x;
      const mag1 = Math.sqrt(v1.y * v1.y + v1.x * v1.x);
      const mag2 = Math.sqrt(v2.y * v2.y + v2.x * v2.x);

      if (mag1 > 0 && mag2 > 0) {
        const cosAngle = dot / (mag1 * mag2);
        const angleDeg = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);

        // Spike if angle < 10 degrees
        if (angleDeg < 10) {
          spikeCount++;
        }
      }
    }

    return spikeCount;
  }

  /**
   * Calculate comprehensive polygon statistics
   */
  function calculatePolygonStatistics(
    coordinates: { y: number; x: number }[],
    area: number,
    perimeter: number,
    compactness: number,
    boundingBox: [number, number, number, number]
  ): PolygonStatistics {
    const n = coordinates.length - 1; // Exclude last point
    const sideLengths: number[] = [];

    // Calculate all side lengths
    for (let i = 0; i < n; i++) {
      const dy = coordinates[i + 1].y - coordinates[i].y;
      const dx = coordinates[i + 1].x - coordinates[i].x;
      sideLengths.push(Math.sqrt(dx * dx + dy * dy));
    }

    const longestSide = Math.max(...sideLengths);
    const shortestSide = Math.min(...sideLengths);
    const averageSideLength = sideLengths.reduce((a, b) => a + b, 0) / sideLengths.length;

    // Calculate elongation ratio (length/width of bounding box)
    const [minY, minX, maxY, maxX] = boundingBox;
    const width = maxY - minY;
    const height = maxX - minX;
    const elongationRatio = Math.max(width, height) / Math.min(width, height);

    // Classify shape type based on compactness
    let shapeType: 'Regular' | 'Moderate' | 'Irregular' | 'Highly Irregular';
    if (compactness > 0.7) {
      shapeType = 'Regular';
    } else if (compactness > 0.4) {
      shapeType = 'Moderate';
    } else if (compactness > 0.2) {
      shapeType = 'Irregular';
    } else {
      shapeType = 'Highly Irregular';
    }

    return {
      vertexCount: n,
      longestSide,
      shortestSide,
      averageSideLength,
      shapeType,
      elongationRatio
    };
  }

  /**
   * Get polygon color based on status
   */
  function getPolygonColor(status: 'draft' | 'calculated'): { fillColor: string; color: string } {
    return status === 'draft'
      ? { fillColor: '#FFFF00', color: '#FFD700' } // Yellow
      : { fillColor: '#32CD32', color: '#228B22' }; // Lime green
  }

  return {
    generatePolygon,
    calculateArea,
    getPolygonColor
  };
}
