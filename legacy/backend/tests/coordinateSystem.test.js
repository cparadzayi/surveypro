import {
  geodeticToGrid,
  gridToGeodetic,
  decimalToDMS,
  formatCoordinatesWithPrecision,
  findCentralMeridian,
  CLARKE_1880_MODIFIED,
  CENTRAL_MERIDIANS
} from '../utils/coordinateSystem.js';

// Test data for known points (example values - should be replaced with actual test cases)
const TEST_POINTS = [
  {
    name: 'Harare',
    lat: -17.8252,
    lon: 31.0335,
    expectedMeridian: 31
  },
  {
    name: 'Bulawayo',
    lat: -20.1394,
    lon: 28.5596,
    expectedMeridian: 29
  },
  // Add more test points as needed
];

describe('Zimbabwe Cadastral Coordinate System', () => {
  describe('findCentralMeridian', () => {
    it('should find the correct central meridian for given longitudes', () => {
      TEST_POINTS.forEach(point => {
        const meridian = findCentralMeridian(point.lon);
        expect(meridian).toBe(point.expectedMeridian);
      });
    });
  });

  describe('geodeticToGrid and gridToGeodetic', () => {
    TEST_POINTS.forEach(point => {
      it(`should convert between geodetic and grid coordinates for ${point.name}`, () => {
        // Convert to grid
        const grid = geodeticToGrid(point.lat, point.lon);
        
        // Convert back to geodetic
        const geo = gridToGeodetic(grid.y, grid.x, grid.centralMeridian);
        
        // Check if we get back to the original coordinates (within reasonable tolerance)
        expect(geo.lat).toBeCloseTo(point.lat, 6);
        expect(geo.lon).toBeCloseTo(point.lon, 6);
      });
    });
  });

  describe('decimalToDMS', () => {
    it('should convert decimal degrees to DMS format', () => {
      // Test positive latitude
      expect(decimalToDMS(17.5, false, 1)).toMatch(/^17°30'0"N$/);
      
      // Test negative longitude
      expect(decimalToDMS(-31.0335, true, 1)).toMatch(/31°2'0.6"W$/);
      
      // Test with 10-second precision
      expect(decimalToDMS(17.5, false, 10)).toMatch(/^17°30'0"N$/);
    });
  });

  describe('formatCoordinatesWithPrecision', () => {
    it('should use 1-second precision for distances >= 6000m', () => {
      // Points approximately 6.5km apart
      const result = formatCoordinatesWithPrecision(
        -17.82, 31.03,  // Point 1
        -17.88, 31.03   // Point 2 (about 6.5km south of point 1)
      );
      
      expect(result.precision).toBe('1 second');
      expect(result.distance).toBeGreaterThanOrEqual(6000);
    });

    it('should use 10-second precision for distances < 6000m', () => {
      // Points approximately 1km apart
      const result = formatCoordinatesWithPrecision(
        -17.82, 31.03,  // Point 1
        -17.83, 31.03   // Point 2 (about 1.1km south of point 1)
      );
      
      expect(result.precision).toBe('10 seconds');
      expect(result.distance).toBeLessThan(6000);
    });
  });
});
