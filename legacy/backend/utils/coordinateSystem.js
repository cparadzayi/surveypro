// Clarke 1880 (Modified) ellipsoid parameters
const CLARKE_1880_MODIFIED = {
  a: 6378249.145,          // Semi-major axis in meters
  f: 1 / 293.465,          // Flattening
  e2: 0.006803481196,      // First eccentricity squared
  e4: 0.0000462873585,     // e2^2
  e6: 0.0000031476,        // e2^3
  A0: 1.0000000000,       // Meridional arc coefficients
  A2: 0.0050517732,
  A4: 0.0000106218,
  A6: 0.0000000225
};

// Central meridians for Zimbabwe cadastral system (in degrees)
const CENTRAL_MERIDIANS = [25, 27, 29, 31, 33];

/**
 * Converts degrees to radians
 * @param {number} deg - Angle in degrees
 * @returns {number} Angle in radians
 */
function toRadians(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Converts radians to degrees
 * @param {number} rad - Angle in radians
 * @returns {number} Angle in degrees
 */
function toDegrees(rad) {
  return rad * (180 / Math.PI);
}

/**
 * Banker's rounding (round to even)
 * @param {number} value - Value to round
 * @param {number} precision - Number of decimal places
 * @returns {number} Rounded value
 */
function bankersRound(value, precision = 0) {
  const factor = Math.pow(10, precision);
  const rounded = Math.round(value * factor) / factor;
  
  // Check if we're at the midpoint between two numbers
  if (Math.abs(value * factor - Math.round(value * factor)) === 0.5) {
    const intPart = Math.floor(rounded);
    // If the integer part is even, return it, otherwise round to nearest even
    return intPart % 2 === 0 ? intPart : intPart + 1;
  }
  return rounded;
}

/**
 * Converts decimal degrees to DMS (Degrees, Minutes, Seconds)
 * @param {number} decimal - Decimal degrees
 * @param {boolean} isLng - Whether it's a longitude value (for E/W, N/S determination)
 * @param {number} precision - Seconds precision (1 or 10)
 * @returns {string} Formatted DMS string
 */
function decimalToDMS(decimal, isLng = false, precision = 1) {
  const absDecimal = Math.abs(decimal);
  const degrees = Math.floor(absDecimal);
  const minutesFloat = (absDecimal - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = (minutesFloat - minutes) * 60;
  
  // Apply banker's rounding to seconds based on precision
  const roundedSeconds = bankersRound(
    seconds,
    precision === 10 ? -1 : 0  // -1 for tens place, 0 for units
  );
  
  // Determine direction
  let direction = '';
  if (isLng) {
    direction = decimal >= 0 ? 'E' : 'W';
  } else {
    direction = decimal >= 0 ? 'N' : 'S';
  }
  
  return `${degrees}°${minutes}'${roundedSeconds.toFixed(precision === 10 ? 0 : 2)}"${direction}`;
}

/**
 * Finds the nearest central meridian for a given longitude
 * @param {number} longitude - Longitude in decimal degrees
 * @returns {number} Nearest central meridian
 */
function findCentralMeridian(longitude) {
  return CENTRAL_MERIDIANS.reduce((prev, curr) => 
    Math.abs(curr - longitude) < Math.abs(prev - longitude) ? curr : prev
  );
}

/**
 * Converts geodetic coordinates (lat, lon) to Zimbabwe cadastral grid P(Y, X)
 * Format: P(Y,X) where P is beacon name
 * @param {number} lat - Latitude in decimal degrees (negative for south)
 * @param {number} lon - Longitude in decimal degrees (positive for east)
 * @returns {{y: number, x: number, centralMeridian: number}} Grid coordinates
 *   - y: Y-Coordinate (Westing) - increases westwards from central meridian (negative=east, positive=west)
 *   - x: X-Coordinate (Southing) - increases positively from Equator southwards
 *   - centralMeridian: Automatically selected central meridian (25, 27, 29, 31, or 33 degrees E)
 */
function geodeticToGrid(lat, lon) {
  const φ = toRadians(lat);
  const λ = toRadians(lon);
  const λ0 = toRadians(findCentralMeridian(toDegrees(λ)));
  
  const { a, e2, e4, e6, A0, A2, A4, A6 } = CLARKE_1880_MODIFIED;
  
  // Meridional arc
  const M = a * (A0 * φ - A2 * Math.sin(2 * φ) + A4 * Math.sin(4 * φ) - A6 * Math.sin(6 * φ));
  
  // Transverse Mercator projection
  const N = a / Math.sqrt(1 - e2 * Math.sin(φ) * Math.sin(φ));
  const T = Math.tan(φ) * Math.tan(φ);
  const C = e2 * Math.cos(φ) * Math.cos(φ) / (1 - e2);
  const A = (λ - λ0) * Math.cos(φ);
  
  // Calculate Y (easting) and X (northing)
  // Y increases westwards from central meridian
  // X increases southwards from equator (positive values increasing south)
  const y = N * A * (1 + A * A * ((1 - T + C) / 6 + A * A * (5 - 18 * T + T * T + 72 * C - 58 * e2) / 120));
  const x = M + N * Math.tan(φ) * (A * A * (0.5 + A * A * ((5 - T + 9 * C + 4 * C * C) / 24 + A * A * (61 - 58 * T + T * T + 600 * C - 330 * e2) / 720)));
  
  return {
    y: -y,  // Invert Y to increase westwards
    x: -x,  // Invert X to be positive southwards from equator
    centralMeridian: toDegrees(λ0)
  };
}

/**
 * Converts Zimbabwe cadastral grid P(Y, X) to geodetic coordinates (lat, lon)
 * Format: P(Y,X) where P is beacon name
 * @param {number} y - Y-Coordinate (Westing): increases westwards (negative=east, positive=west)
 * @param {number} x - X-Coordinate (Southing): increases positively from Equator southwards
 * @param {number} centralMeridian - Central meridian in decimal degrees (25, 27, 29, 31, or 33)
 * @returns {{lat: number, lon: number}} Geodetic coordinates in decimal degrees
 *   - lat: Latitude (negative for south)
 *   - lon: Longitude (positive for east)
 */
function gridToGeodetic(y, x, centralMeridian) {
  const { a, e2, e4, e6 } = CLARKE_1880_MODIFIED;
  const λ0 = toRadians(centralMeridian);
  
  // Invert the coordinates back to standard Transverse Mercator convention
  const yTM = -y;  // Invert back from westward to eastward
  const xTM = -x;  // Invert back from southward to northward
  
  // First approximation for latitude
  let φ = xTM / (a * CLARKE_1880_MODIFIED.A0);
  let φPrev = 0;
  
  // Iterate to find latitude
  do {
    φPrev = φ;
    const M = a * (CLARKE_1880_MODIFIED.A0 * φ - CLARKE_1880_MODIFIED.A2 * Math.sin(2 * φ) + 
                  CLARKE_1880_MODIFIED.A4 * Math.sin(4 * φ) - CLARKE_1880_MODIFIED.A6 * Math.sin(6 * φ));
    φ = φ + (xTM - M) / (a * CLARKE_1880_MODIFIED.A0);
  } while (Math.abs(φ - φPrev) > 1e-10);
  
  // Calculate other parameters
  const N = a / Math.sqrt(1 - e2 * Math.sin(φ) * Math.sin(φ));
  const T = Math.tan(φ) * Math.tan(φ);
  const C = e2 * Math.cos(φ) * Math.cos(φ) / (1 - e2);
  const R = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(φ) * Math.sin(φ), 1.5);
  const D = yTM / (N * Math.cos(φ));
  
  // Calculate longitude
  const λ = λ0 + D - (D * D * D * (1 + 2 * T + C)) / 6 + 
            (D * D * D * D * D * (5 - 2 * C + 28 * T - 3 * C * C + 8 * e2 + 24 * T * T)) / 120;
  
  // Calculate latitude correction
  const Δφ = -yTM * yTM * Math.tan(φ) * (1 + T - C) / (2 * R * N) + 
             yTM * yTM * yTM * yTM * Math.tan(φ) * (5 + 3 * T + 10 * C - 4 * C * C - 9 * e2) / (24 * R * N * N * N);
  
  return {
    lat: toDegrees(φ + Δφ),
    lon: toDegrees(λ)
  };
}

/**
 * Formats coordinates based on distance
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {Object} Formatted coordinates with appropriate precision
 */
function formatCoordinatesWithPrecision(lat1, lon1, lat2, lon2) {
  // Calculate distance using Haversine formula
  const R = 6371000; // Earth's radius in meters
  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δφ = toRadians(lat2 - lat1);
  const Δλ = toRadians(lon2 - lon1);
  
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  // Determine precision based on distance
  const precision = distance >= 6000 ? 1 : 10;
  
  // Format coordinates
  return {
    point1: {
      lat: decimalToDMS(lat1, false, precision),
      lon: decimalToDMS(lon1, true, precision)
    },
    point2: {
      lat: decimalToDMS(lat2, false, precision),
      lon: decimalToDMS(lon2, true, precision)
    },
    distance: distance,
    precision: precision === 1 ? '1 second' : '10 seconds'
  };
}

export {
  geodeticToGrid,
  gridToGeodetic,
  decimalToDMS,
  formatCoordinatesWithPrecision,
  findCentralMeridian,
  CLARKE_1880_MODIFIED,
  CENTRAL_MERIDIANS
};
