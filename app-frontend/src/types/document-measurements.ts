/**
 * Document Measurements - Type definitions for two-pass PDF generation
 * 
 * These interfaces define the structure of measurements collected
 * during Pass 1 (measurement) and used in Pass 2 (rendering).
 */

/**
 * Basic section measurement
 */
export interface SectionMeasurement {
  /** Number of pages in this section */
  pages: number
  
  /** Starting page number (global document page number) */
  startPage: number
  
  /** Ending page number (global document page number) */
  endPage: number
}

/**
 * Calculations section measurement with point tracking
 */
export interface CalculationsMeasurement extends SectionMeasurement {
  /** Map of Point ID → Page Number for cross-referencing */
  pointPageMap: Record<string, number>
  
  /** Detailed point locations with Y positions */
  pointLocations: Array<{
    pointId: string
    pageNumber: number
    yPosition: number
  }>
  
  /** Number of duplicate analyses found */
  duplicateCount?: number
}

/**
 * Field Book measurement
 */
export interface FieldBookMeasurement extends SectionMeasurement {
  /** Points per page (typically 27) */
  pointsPerPage: number
  
  /** Total points in field book */
  totalPoints: number
  
  /** Map of Point ID → Field Book Page (e.g., "E3") - REQUIRED for accurate cross-references */
  pointPageMap: Record<string, string>
}

/**
 * Coordinate List measurement
 */
export interface CoordinateListMeasurement extends SectionMeasurement {
  /** Points per page (typically 35) */
  pointsPerPage: number
  
  /** Total coordinates listed */
  totalCoordinates: number
  
  /** Breakdown by point type */
  breakdown?: {
    trigBeacons: number
    workingStations: number
    foundBeacons: number
    placedBeacons: number
  }
}

/**
 * Areas & Consistencies measurement
 */
export interface AreasMeasurement extends SectionMeasurement {
  /** Number of parcels computed */
  parcelCount: number
  
  /** Parcels per page (typically 2-3) */
  parcelsPerPage: number
}

/**
 * Complete document measurements
 */
export interface DocumentMeasurements {
  /** Field Book section */
  fieldBook: FieldBookMeasurement
  
  /** Calculations Part 1 section */
  calculations: CalculationsMeasurement
  
  /** Coordinate List section */
  coordinateList: CoordinateListMeasurement
  
  /** Areas & Consistencies section */
  areas: AreasMeasurement

  /** Beacon Comparison Report section (SI 727 s.67(5)); omitted or pages: 0 when skipped */
  beaconComparison?: SectionMeasurement

  /** Total document page count */
  totalPages: number
  
  /** Measurement timestamp */
  measuredAt: Date
  
  /** Measurement duration (ms) */
  measurementDuration?: number
}

/**
 * Measurement options
 */
export interface MeasurementOptions {
  /** Include detailed point locations */
  includePointLocations?: boolean
  
  /** Log measurement progress */
  verbose?: boolean
  
  /** Custom page dimensions */
  pageSize?: {
    width: number
    height: number
  }
  
  /** Custom margins */
  margins?: {
    top: number
    bottom: number
    left: number
    right: number
  }
}

/**
 * Measurement result with metadata
 */
export interface MeasurementResult {
  /** The measurements */
  measurements: DocumentMeasurements
  
  /** Success status */
  success: boolean
  
  /** Error message if failed */
  error?: string
  
  /** Warnings during measurement */
  warnings?: string[]
}
