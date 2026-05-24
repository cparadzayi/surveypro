// Zimbabwe Cadastral Coordinate System composable
export function useCoordinateSystem() {
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3042';
  
  // Central meridians for Zimbabwe
  const CENTRAL_MERIDIANS = [25, 27, 29, 31, 33];
  
  /**
   * Convert geodetic coordinates (lat/lon) to grid coordinates P(Y,X)
   * Format: P(Y,X) where P is beacon name
   * Returns:
   *   - y: Y-Coordinate (Westing) - increases westwards from central meridian (negative=east, positive=west)
   *   - x: X-Coordinate (Southing) - increases positively from Equator southwards
   *   - centralMeridian: Auto-selected central meridian (25, 27, 29, 31, or 33°E)
   */
  async function geodeticToGrid(lat: number, lon: number) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/coordinates/geodetic-to-grid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Error converting geodetic to grid:', error);
      throw error;
    }
  }
  
  /**
   * Convert grid coordinates P(Y,X) to geodetic coordinates (lat/lon)
   * Format: P(Y,X) where P is beacon name
   * Parameters:
   *   - y: Y-Coordinate (Westing) - increases westwards (negative=east, positive=west)
   *   - x: X-Coordinate (Southing) - increases positively from Equator southwards
   *   - centralMeridian: Central meridian (25, 27, 29, 31, or 33°E)
   */
  async function gridToGeodetic(y: number, x: number, centralMeridian: number) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/coordinates/grid-to-geodetic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ y, x, centralMeridian })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Error converting grid to geodetic:', error);
      throw error;
    }
  }
  
  /**
   * Format coordinates with automatic precision based on distance
   */
  async function formatWithPrecision(
    point1: { lat: number; lon: number },
    point2: { lat: number; lon: number }
  ) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/coordinates/format-with-precision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ point1, point2 })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Error formatting coordinates:', error);
      throw error;
    }
  }
  
  /**
   * Find the nearest central meridian for a given longitude
   */
  function findCentralMeridian(longitude: number): number {
    return CENTRAL_MERIDIANS.reduce((prev, curr) => 
      Math.abs(curr - longitude) < Math.abs(prev - longitude) ? curr : prev
    );
  }
  
  /**
   * Convert decimal degrees to DMS format
   */
  function decimalToDMS(decimal: number, isLongitude: boolean = false): string {
    const absDecimal = Math.abs(decimal);
    const degrees = Math.floor(absDecimal);
    const minutesFloat = (absDecimal - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = (minutesFloat - minutes) * 60;
    
    const direction = isLongitude 
      ? (decimal >= 0 ? 'E' : 'W')
      : (decimal >= 0 ? 'N' : 'S');
    
    return `${degrees}°${minutes}'${seconds.toFixed(2)}"${direction}`;
  }
  
  /**
   * Calculate distance between two points using Haversine formula
   */
  function calculateDistance(
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
  }
  
  /**
   * Validate if coordinates are within Zimbabwe's bounds
   */
  function validateZimbabweCoordinates(lat: number, lon: number): boolean {
    return lat >= -22.5 && lat <= -15.5 && lon >= 25.0 && lon <= 33.5;
  }
  
  return {
    geodeticToGrid,
    gridToGeodetic,
    formatWithPrecision,
    findCentralMeridian,
    decimalToDMS,
    calculateDistance,
    validateZimbabweCoordinates,
    CENTRAL_MERIDIANS
  };
}
