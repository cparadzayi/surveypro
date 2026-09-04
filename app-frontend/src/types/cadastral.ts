/**
 * Cadastral Standard Module Types
 *
 * Defines TypeScript interfaces for the SurveyPro Cadastral Standard workflow
 * which handles production of digital cadastral records from reduced field notes.
 */

import type { SiteCalibration } from '../utils/siteCalibration';

/**
 * Status codes for survey points
 * F = Fixed (control/reference points)
 * P = Peg (boundary markers)
 * null/undefined = Other points (like OCP - Old Control Point)
 */
export type PointStatus = 'F' | 'P' | null;

/**
 * Raw CSV coordinate data structure
 * Based on actual reduced fieldbook.csv structure
 * 
 * Input format: Point,Y,X,Status,Description,Date of survey
 * Note: Coordinates are final adjusted values (not raw observations)
 */
export interface CadastralPointCSV {
  /** Point identifier (e.g., P2, ZA, 2283A) */
  Point: string;
  
  /** Northing coordinate (final adjusted, typically 3 decimal places) */
  Y: number;
  
  /** Easting coordinate (final adjusted, typically 3 decimal places) */
  X: number;
  
  /** Point status: F=Fixed, P=Peg, blank=Other */
  Status?: PointStatus;
  
  /** Point description/monument type (e.g., "50mm Iron Pipe in Concrete") */
  Description: string;
  
  /** Survey date (format: D/M/YYYY - e.g., "1/10/2025") */
  'Date of survey': string;
}

/**
 * Processed cadastral point with precision-managed coordinates
 */
export interface CadastralPoint {
  /** Point identifier */
  id: string;
  
  /** Original coordinates (as imported, in Cape Lo) */
  original: {
    y: number;  // Westing (Cape Lo)
    x: number;  // Southing (Cape Lo)
  };
  
  /** WGS84 coordinates (for MapLibre/satellite overlay) */
  wgs84?: {
    lng: number;  // Longitude
    lat: number;  // Latitude
  };
  
  /** Field book coordinates (3 decimal places) */
  fieldBook: {
    y: string; // Formatted to 3 decimals
    x: string; // Formatted to 3 decimals
  };
  
  /** Coordinate list values (2 decimal places, banker's rounding) */
  coordinateList: {
    y: string; // Formatted to 2 decimals
    x: string; // Formatted to 2 decimals
  };
  
  /** Point metadata */
  status: PointStatus;
  description: string;
  surveyDate: Date;
  
  /** Document generation flags */
  includeInFieldBook: boolean;
  includeInCoordinateList: boolean;
}

/**
 * CSV import validation result
 */
export interface CSVValidationResult {
  isValid: boolean;
  errors: CSVValidationError[];
  warnings: CSVValidationWarning[];
  preview: CadastralPoint[];
  summary: {
    totalPoints: number;
    fixedPoints: number;
    pegPoints: number;
    otherPoints: number;
    calculatedPoints: number;
    fieldBookPoints: number;
  };
  detectedCentralMeridian?: number;  // Cape Lo zone detected from System column (25/27/29/31/33)
}

/**
 * CSV validation error
 */
export interface CSVValidationError {
  row: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * CSV validation warning
 */
export interface CSVValidationWarning {
  row: number;
  field: string;
  message: string;
  suggestion?: string;
}

/**
 * Document generation configuration
 */
export interface DocumentGenerationConfig {
  /** Project information */
  project: {
    name: string;
    surveyorName: string;
    surveyorLicense: string;
    clientName: string;
    dateRange: {
      start: Date;
      end: Date;
    };
  };
  
  /** Coordinate system settings */
  coordinateSystem: {
    name: string;
    datum: string;
    projection: string;
    zone?: string;
  };
  
  /** Document formatting options */
  formatting: {
    includeLetterhead: boolean;
    pageNumbering: boolean;
    crossReferences: boolean;
    precisionDisplay: {
      fieldBook: number; // Default: 3
      coordinateList: number; // Default: 2
    };
  };
}

/**
 * Electronic Field Book structure
 */
export interface ElectronicFieldBook {
  metadata: {
    title: string;
    surveyorName: string;
    dateGenerated: Date;
    pageCount: number;
  };
  
  points: Array<{
    id: string;
    coordinates: {
      y: string; // 3 decimal places
      x: string; // 3 decimal places
    };
    status: PointStatus;
    description: string;
    surveyDate: Date;
    calculationsRef?: string;
    pageNumber: number;
  }>;
  
  /** Cross-references to calculations */
  calculationRefs: Record<string, string>;
}

/**
 * Coordinate List document structure
 */
export interface CoordinateListDocument {
  metadata: {
    title: string;
    surveyorName: string;
    dateGenerated: Date;
    coordinateSystem: string;
  };
  
  points: Array<{
    id: string;
    coordinates: {
      y: string; // 2 decimal places, banker's rounding
      x: string; // 2 decimal places, banker's rounding
    };
    status: PointStatus;
    description: string;
  }>;
  
  summary: {
    totalPoints: number;
    fixedPoints: number;
    pegPoints: number;
  };
}

/**
 * Found beacon status and details (for Report on Survey Section 3)
 * Also used for SI 727 Section 67(5) Beacon Comparison
 */
export interface FoundBeacon {
  /** Beacon identifier (from CSV) */
  beaconId: string;
  
  /** Found status */
  status: 'found' | 'not-found' | 'replaced';
  
  /** Beacon condition (if found) */
  condition?: 'excellent' | 'good' | 'fair' | 'poor';
  
  /** Particular circumstances */
  circumstances?: string; // e.g., "scattered stones", "no centre-mark", "concreted by owner"
  
  /** Original data from previous survey (for SI 727 Section 67(5) comparison) */
  originalData?: {
    coordinates: {
      y: number;
      x: number;
    };
    srNumber: string; // e.g., "SR 21/2016"
    surveyDate?: Date;
    source: 'previous-survey' | 'deeds-office' | 'sg-office' | 'trig-list' | 'other';
  };
  
  /** Current coordinates (from CSV) */
  currentCoordinates: {
    y: number;
    x: number;
  };
  
  /** Auto-calculated discrepancy (SI 727 Section 67(5)) */
  discrepancy?: {
    dy: number;  // ΔY (Y_new - Y_original)
    dx: number;  // ΔX (X_new - X_original)
    distance: number;  // √(dy² + dx²)
    bearing?: number;  // Bearing of displacement (degrees)
    withinTolerance?: boolean;  // Based on survey type tolerance
  };
  
  /** Alignment test performed */
  alignmentTest?: {
    line: string; // e.g., "P1-P2"
    testResult: string; // e.g., "Measured bearing: 45°23'15""
    discrepancyMeters: number;
    acceptable: boolean;
  };
  
  /** Adopted status */
  adopted: boolean;
  
  /** Reason if not adopted */
  rejectionReason?: string;
  
  /** Replacement details (if replaced) */
  replacement?: {
    reason: string;
    method: string; // How new position was determined
    distanceFromOriginal?: number;
  };
}

/**
 * Beacon comparison configuration (SI 727 Section 67(5))
 */
export interface BeaconComparisonConfig {
  /** Comparison method selection */
  method: 'tabulation' | 'sketch' | 'both';
  
  /** Current survey S.R. Number */
  currentSRNumber: string;
  
  /** Original survey S.R. Number */
  originalSRNumber?: string;
  
  /** Tolerance threshold (meters) */
  toleranceThreshold: number; // e.g., 0.020 for urban, 0.200 for rural

  /** How accept/reject was decided (e.g. Helmert LSQ + W-test summary). Printed in place of the tolerance line when present. */
  adjustmentSummary?: string;
  
  /** SI 727 s.67(5) inter-beacon (edge) compliance — distance AND direction/swing checks for
   *  every pair of accepted beacons. Source of truth for the comparison sketch. Populated
   *  from si727.js's edgeCompliance(), already computed by every comparison run. */
  edgeCompliance?: {
    surveyClass: 'B' | 'C';
    rows: Array<{
      from: string; to: string;
      dH: number; dS: number; dDiff: number; dAllow: number; distOk: boolean;
      brgH: number; brgS: number; dirDiffSec: number; dirAllowSec: number; dirOk: boolean;
      pass: boolean;
    }>;
    summary: {
      totalLines: number; distPass: number; dirPass: number; bothPass: number;
      meanScale: number | null; meanSwingDeg: number | null;
    };
  };
  
  /** Conclusion statement */
  conclusion?: string; // e.g., "From the above comparison, I adopt the positions of all found beacons."
}

/**
 * Report on Survey data (SI 727 of 1979 format)
 */
export interface ReportOnSurveyData {
  /** Survey Register Number */
  srNumber: string;
  
  /** Section 1: Purpose */
  purpose: {
    type: 'state-land' | 'municipal-land' | 'private-land' | 'amended-title' | 'servitude' | 'replacement' | 'other';
    reference: string; // Permit/approval reference
    otherDescription?: string; // If type is 'other'
  };
  
  /** Section 2: Survey based on */
  surveyBasis: {
    trigStations: boolean;
    trigStationNames?: string[]; // Auto-populated from control points
    townSurveyMarks: boolean;
    townSurveyMarkNames?: string[];
    officialControlPoints: boolean;
    controlPointNames?: string[];
    previousSurvey: boolean;
    previousSurveySRNumber?: string;
    localSystem: boolean;
    localSystemDetails?: {
      baseMeasurementComparison: string;
      trueNorthMethod: string;
    };
  };
  
  /** Section 3 & 4: Found and Replaced Beacons */
  beacons: FoundBeacon[];
  
  /** Beacon Comparison Configuration (SI 727 Section 67(5)) */
  beaconComparison?: BeaconComparisonConfig;
  
  /** Section 5: Curvilinear boundaries */
  curvilinearBoundaries: {
    applicable: boolean;
    method?: 'previous-survey' | 'taped-traverse' | 'tacheometric-traverse' | 'aerial-photography' | 'various';
    previousSurveySRNumber?: string;
    previousSurveyReference?: string;
    details?: string; // Curve details (radius, arc length, etc.)
  };
  
  /** Section 6: Unusual occurrences and comments */
  unusualOccurrences: string;
}

/**
 * Cadastral workflow state
 */
export interface CadastralWorkflowState {
  /** Persistent surveyor information for the workflow */
  surveyorInfo: {
    landSurveyor: string;
    licenseNumber: string;
    firm: string;
    address: string;
    surveyDate: string;
    surveyOf: string;
    instruments: string;
  };
  
  /** Project information (from settings/projects) */
  projectInfo: {
    name: string;
    district: string;
    surveyType?: string; // Survey type (subdivision, mining-lease, etc.) - from Project Setup
    standReference?: string; // Stand/Reference number (e.g., "STANDS 1-50") - from Project Setup
    township?: string; // Township name (e.g., "Maglas Township") - from Project Setup
    parentProperty?: string; // Immediate parent property (e.g., "Shabani Mine Surface Rights A") - from Project Setup
    /** Registered area of the parent from its title diagram, m². Captured in
     *  Project Setup; the working plan checks the mutations and remaining
     *  extent sum back to it. Never computed. */
    parentArea?: number | null;
    surveyDescription: string;
    projectId?: number; // Survey project ID for fetching control points
    centralMeridian?: number; // Central meridian (Lo27, Lo29, Lo31, Lo33)
    controlPointIds?: number[]; // Selected control point IDs
    controlPointsSkipped?: boolean; // Flag indicating user skipped control point selection
    workingDirectory?: string; // Working directory path for input/output files
    srNumber?: string; // Survey Register Number (for Report on Survey)
    wholePortion?: string; // SI 727 Seventh Schedule (b): 'the whole' | 'the remainder' | 'a portion'
  };
  /** Current step in the workflow */
  currentStep: 
    | 'project-setup'
    | 'control-point-selection'
    | 'csv-import'
    | 'found-beacons'
    | 'field-book' 
    | 'calculations-part1' 
    | 'coordinate-list'
    | 'qgis-export'
    | 'area-computation'
    | 'servitudes'
    | 'survey-plan'
    | 'report-on-survey'
    | 'dsg-certificate';
  
  /** Imported data */
  importedPoints: CadastralPoint[];
  
  /** Adjusted coordinates from Calculations Part 1 */
  adjustedCoordinates?: import('./adjusted-coordinates').AdjustedCoordinate[];
  
  /** Duplicate analyses from Calculations Part 1 */
  duplicateAnalyses?: import('./adjusted-coordinates').DuplicateAnalysis[];
  
  /** Report on Survey data (SI 727 format) */
  reportOnSurvey?: ReportOnSurveyData;
  
  /** Generated documents */
  documents: {
    fieldBook?: ElectronicFieldBook;
    coordinateList?: CoordinateListDocument;
    calculationsPart1?: {
      pdf: Blob;
      pageCount: number;
      startingPage: number;
    };
    calculationsPart2?: any;
    reportOnSurvey?: {
      pdf: Blob;
      pageCount: number;
    };
    dsgCertificate?: any;
    /**
     * Parsed GNSS site calibration, when the surveyor supplied one at the CSV
     * import step. Optional throughout: a plan without a calibration must
     * generate exactly as it did before this existed.
     */
    siteCalibration?: SiteCalibration;
  };
  
  /** Configuration */
  config: DocumentGenerationConfig;
  
  /** Validation state */
  validation: CSVValidationResult | null;
}

/**
 * Precision management utilities interface
 */
export interface PrecisionManager {
  /** Format coordinate to specified decimal places */
  formatCoordinate(value: number, decimals: number): string;
  
  /** Apply banker's rounding to 2 decimal places */
  bankersRound(value: number): number;
  
  /** Convert coordinates from field book (3 dec) to coordinate list (2 dec) */
  convertFieldBookToCoordinateList(fieldBookValue: string): string;
  
  /** Validate coordinate precision and range */
  validateCoordinate(value: number, context: 'fieldbook' | 'coordinatelist'): boolean;
}