/**
 * Precision Management Utilities for Cadastral Standard Module
 * 
 * Handles coordinate precision cascading through the cadastral workflow:
 * 1. Field Book: 3 decimal places
 * 2. Coordinate List: 2 decimal places (banker's rounding)
 * 3. Areas/Consistencies: Use rounded coordinates from coordinate list
 */

import type { PrecisionManager } from '../types/cadastral';

/**
 * Implementation of banker's rounding (round half to even)
 * Used for converting from 3-decimal field book to 2-decimal coordinate list
 * 
 * @param value - The number to round
 * @param decimals - Number of decimal places
 * @returns Rounded number using banker's rounding
 */
export function bankersRound(value: number, decimals: number = 2): number {
  const multiplier = Math.pow(10, decimals);
  const shifted = value * multiplier;
  const floor = Math.floor(shifted);
  const remainder = shifted - floor;
  
  // If remainder is exactly 0.5, round to the nearest even number
  if (Math.abs(remainder - 0.5) < Number.EPSILON) {
    return (floor % 2 === 0 ? floor : floor + 1) / multiplier;
  }
  
  // Otherwise, use standard rounding
  return Math.round(shifted) / multiplier;
}

/**
 * Format a coordinate value to specified decimal places
 * 
 * @param value - The coordinate value
 * @param decimals - Number of decimal places
 * @returns Formatted string with fixed decimal places
 */
export function formatCoordinate(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

/**
 * Convert coordinate from field book precision (3 decimals) to coordinate list precision (2 decimals)
 * Uses banker's rounding for the conversion
 * 
 * @param fieldBookValue - String value from field book (3 decimals)
 * @returns String value for coordinate list (2 decimals)
 */
export function convertFieldBookToCoordinateList(fieldBookValue: string): string {
  const numericValue = parseFloat(fieldBookValue);
  if (isNaN(numericValue)) {
    throw new Error(`Invalid coordinate value: ${fieldBookValue}`);
  }
  
  const rounded = bankersRound(numericValue, 2);
  return formatCoordinate(rounded, 2);
}

/**
 * Validate coordinate value based on context
 * 
 * @param value - Coordinate value to validate
 * @param context - Context for validation (fieldbook or coordinatelist)
 * @returns True if valid, false otherwise
 */
export function validateCoordinate(value: number, context: 'fieldbook' | 'coordinatelist'): boolean {
  // Check for basic validity
  if (isNaN(value) || !isFinite(value)) {
    return false;
  }
  
  // Check reasonable coordinate ranges (assuming projected coordinates in meters)
  // Adjust these ranges based on your coordinate system
  const MIN_COORDINATE = -1000000; // -1,000,000 meters
  const MAX_COORDINATE = 10000000; // 10,000,000 meters
  
  if (value < MIN_COORDINATE || value > MAX_COORDINATE) {
    return false;
  }
  
  // Context-specific validation
  if (context === 'fieldbook') {
    // Field book allows up to 3 decimal places
    const decimalPlaces = (value.toString().split('.')[1] || '').length;
    return decimalPlaces <= 3;
  } else if (context === 'coordinatelist') {
    // Coordinate list should have exactly 2 decimal places
    const decimalPlaces = (value.toString().split('.')[1] || '').length;
    return decimalPlaces <= 2;
  }
  
  return true;
}

/**
 * Parse date from various formats commonly used in survey data
 * 
 * @param dateString - Date string in various formats
 * @returns Parsed Date object or null if invalid
 */
export function parseSurveyDate(dateString: string): Date | null {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }
  
  // Try various date formats commonly used
  const formats = [
    // M/D/YYYY (e.g., "9/12/2025")
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // DD/MM/YYYY (e.g., "12/09/2025")
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // YYYY-MM-DD (ISO format)
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    // DD-MM-YYYY
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
  ];
  
  const cleanDateString = dateString.trim();
  
  // Try M/D/YYYY format first (most common in samples)
  const mdyMatch = cleanDateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const month = parseInt(mdyMatch[1], 10);
    const day = parseInt(mdyMatch[2], 10);
    const year = parseInt(mdyMatch[3], 10);
    
    // Create date and validate
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && 
        date.getMonth() === month - 1 && 
        date.getDate() === day) {
      return date;
    }
  }
  
  // Fallback to standard Date parsing
  const parsed = new Date(cleanDateString);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Validate point identifier format
 * 
 * @param pointId - Point identifier string
 * @returns True if valid format
 */
export function validatePointId(pointId: string): boolean {
  if (!pointId || typeof pointId !== 'string') {
    return false;
  }
  
  const cleaned = pointId.trim();
  
  // Must not be empty
  if (cleaned.length === 0) {
    return false;
  }
  
  // Common patterns from samples:
  // - Alphanumeric: ST1, T1, V, W, Y
  // - With slash: 419/S, 521/V, 525/V
  // - Alphanumeric with numbers: 1a, 3h2, 3h2b, etc.
  const validPattern = /^[A-Za-z0-9\/]+$/;
  
  return validPattern.test(cleaned) && cleaned.length <= 20; // Reasonable length limit
}

/**
 * Implementation of the PrecisionManager interface
 */
export const precisionManager: PrecisionManager = {
  formatCoordinate,
  bankersRound: (value: number) => bankersRound(value, 2),
  convertFieldBookToCoordinateList,
  validateCoordinate,
};

/**
 * Utility functions for coordinate precision management
 */
export const coordinatePrecision = {
  /**
   * Convert raw import coordinates to field book format (3 decimals)
   */
  toFieldBook: (value: number): string => formatCoordinate(value, 3),
  
  /**
   * Convert raw import coordinates to coordinate list format (2 decimals, banker's rounding)
   */
  toCoordinateList: (value: number): string => {
    const rounded = bankersRound(value, 2);
    return formatCoordinate(rounded, 2);
  },
  
  /**
   * Convert field book coordinate to coordinate list coordinate
   */
  fieldBookToCoordinateList: convertFieldBookToCoordinateList,
  
  /**
   * Get coordinate for areas calculations (uses coordinate list precision)
   */
  forAreasCalculation: (value: number): number => bankersRound(value, 2),
};

/**
 * Quality control utilities
 */
export const qualityControl = {
  /**
   * Check if coordinate precision is consistent with expected format
   */
  checkPrecisionConsistency: (coordinates: Array<{y: number, x: number}>, expectedDecimals: number): boolean => {
    return coordinates.every(coord => {
      const yDecimals = (coord.y.toString().split('.')[1] || '').length;
      const xDecimals = (coord.x.toString().split('.')[1] || '').length;
      return yDecimals <= expectedDecimals && xDecimals <= expectedDecimals;
    });
  },
  
  /**
   * Detect potential coordinate system issues
   */
  detectCoordinateSystemIssues: (coordinates: Array<{y: number, x: number}>): string[] => {
    const issues: string[] = [];
    
    if (coordinates.length === 0) {
      return issues;
    }
    
    // Check for coordinates that might be in degrees (should be in projected meters)
    const hasSmallValues = coordinates.some(coord => 
      Math.abs(coord.y) < 1000 && Math.abs(coord.x) < 1000
    );
    
    if (hasSmallValues) {
      issues.push('Some coordinates appear to be in degrees rather than projected meters');
    }
    
    // Check for extreme coordinate ranges
    const yValues = coordinates.map(c => c.y);
    const xValues = coordinates.map(c => c.x);
    const yRange = Math.max(...yValues) - Math.min(...yValues);
    const xRange = Math.max(...xValues) - Math.min(...xValues);
    
    if (yRange > 100000 || xRange > 100000) {
      issues.push('Coordinate range is very large (>100km), verify coordinate system');
    }
    
    return issues;
  },
};