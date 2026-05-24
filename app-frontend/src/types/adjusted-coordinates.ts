/**
 * Adjusted Coordinates Types
 * 
 * Defines the structure for coordinates that have been processed through
 * Calculations Part 1 (duplicate analysis, GPS adjustments, etc.)
 */

/**
 * Adjusted coordinate for a single point
 * This is the output from Calculations Part 1
 */
export interface AdjustedCoordinate {
  /** Point identifier */
  pointId: string
  
  /** Adjusted Y coordinate (Westing in Cape Lo) - 3 decimal places */
  y: number

  /** Adjusted X coordinate (Southing in Cape Lo) - 3 decimal places */
  x: number
  
  /** Point status (F=Fixed, P=Peg, etc.) */
  status: string
  
  /** Point description/monument type */
  description: string
  
  /** Survey date */
  surveyDate: string
  
  /** Field Book page reference (e.g., E1, E2, E3...) */
  fieldBookPage: string
  
  /** Calculations Part 1 page reference (e.g., 115, 116, 117...) */
  calculationsPage: number
  
  /** Adjustment metadata */
  adjustment?: {
    /** Was this point adjusted from duplicate observations? */
    isDuplicate: boolean
    
    /** Number of observations used */
    observationCount: number
    
    /** Maximum residual in Y (meters) */
    maxResidualY?: number
    
    /** Maximum residual in X (meters) */
    maxResidualX?: number
    
    /** Is within survey tolerance? */
    withinTolerance?: boolean
    
    /** Adjustment method used */
    method: 'mean' | 'gps' | 'single' | 'computed'
  }
}

/**
 * Duplicate point analysis from Calculations Part 1
 */
export interface DuplicateAnalysis {
  pointId: string
  observations: any[]  // Array of survey points
  meanY: number
  meanX: number
  residualsY: number[]
  residualsX: number[]
  maxResidualY: number
  maxResidualX: number
  withinTolerance: boolean
  fieldBookPages: number[]
}

/**
 * Result from Calculations Part 1 generation
 */
export interface CalculationsPart1Result {
  /** Generated PDF blob */
  pdf: Blob
  
  /** Adjusted coordinates for all points */
  adjustedCoordinates: AdjustedCoordinate[]
  
  /** Duplicate point analyses */
  duplicateAnalyses: DuplicateAnalysis[]
  
  /** Page count of the calculations document */
  pageCount: number
  
  /** Starting page number (typically 115) */
  startingPage: number
  
  /** Field book page lookup map */
  fieldBookPageLookup: Record<string, string>
  
  /** Calculations page lookup map (pointId -> page number) */
  calculationsPageLookup: Record<string, number>
  
  /** Summary statistics */
  summary: {
    totalPoints: number
    duplicatePoints: number
    adjustedPoints: number
    singleObservations: number
  }
}

/**
 * Coordinate precision levels
 */
export enum CoordinatePrecision {
  /** Field Book: 3 decimal places */
  FIELD_BOOK = 3,
  
  /** Coordinate List: 2 decimal places */
  COORDINATE_LIST = 2
}

/**
 * Format coordinate to specified precision
 */
export function formatCoordinate(value: number, precision: CoordinatePrecision): string {
  return value.toFixed(precision)
}

/**
 * Apply banker's rounding to 2 decimal places for Coordinate List
 */
export function bankersRound(value: number): number {
  const factor = 100 // For 2 decimal places
  const rounded = Math.round(value * factor)
  const decimal = rounded % 10
  
  // Banker's rounding: round to nearest even number when exactly .5
  if (Math.abs(value * factor - rounded) === 0.5) {
    return decimal % 2 === 0 ? rounded / factor : (rounded - 1) / factor
  }
  
  return rounded / factor
}

/**
 * Format coordinate with space as thousand separator and sign
 * Example: -17876.13 -> "- 17 876.13"
 *          3287.17 -> "+3 287.17"
 */
function formatCoordinateWithSpaces(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  const absValue = Math.abs(value);
  const [intPart, decPart] = absValue.toFixed(2).split('.');
  
  // Add spaces as thousand separators
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  
  return `${sign}${formattedInt}.${decPart}`;
}

/**
 * Convert adjusted coordinate from 3 decimals to 2 decimals for Coordinate List
 * Formats with space as thousand separator and proper sign
 */
export function toCoordinateListPrecision(adjustedCoord: AdjustedCoordinate): {
  y: string
  x: string
} {
  const yRounded = bankersRound(adjustedCoord.y);
  const xRounded = bankersRound(adjustedCoord.x);
  
  return {
    y: formatCoordinateWithSpaces(yRounded),
    x: formatCoordinateWithSpaces(xRounded)
  }
}
