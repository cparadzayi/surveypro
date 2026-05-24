/**
 * Historical Survey Points Service
 * Handles import and management of previous survey data for beacon comparison
 * Used by Found Beacons Assessment module with SI 727 of 1979 tolerances
 */

import api from './api';

export interface HistoricalSurveyPoint {
  id: number;
  project_id: number;
  point_name: string;
  y_coordinate: number;
  x_coordinate: number;
  sr_number?: string;
  description?: string;
  survey_date?: string;
  coordinate_system?: string;  // e.g., "Lo 31", "Lo 29", "WGS84"
  measurement_unit?: string;   // e.g., "M" for meters, "FT" for feet
  import_id?: number;
  imported_at: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export interface BeaconComparison {
  historical_id: number;
  project_id: number;
  historical_point_name: string;
  historical_y: number;
  historical_x: number;
  sr_number?: string;
  historical_description?: string;
  historical_survey_date?: string;
  historical_coord_system?: string;  // Coordinate system of historical data
  historical_meas_unit?: string;     // Measurement unit of historical data
  current_point_id?: number;
  current_point_name?: string;
  current_y?: number;
  current_x?: number;
  current_description?: string;
  y_difference?: number;  // dy residual
  x_difference?: number;  // dx residual
  linear_distance?: number;
  tolerance_status: 'NOT_MATCHED' | 'WITHIN_URBAN_TOLERANCE' | 'WITHIN_RURAL_TOLERANCE' | 'EXCEEDS_TOLERANCE';
  // Flag indicating if coordinate systems match (direct comparison possible)
  systems_compatible?: boolean;
}

export interface ComparisonSummary {
  total_historical: number;
  matched: number;
  not_matched: number;
  within_tolerance: number;
  exceeds_tolerance: number;
  tolerance_used: number;
  tolerance_type: 'urban' | 'rural';
}

export interface LeastSquaresAnalysis {
  // Sample size
  n: number;
  redundancy: number;
  
  // Mean residuals (systematic shift)
  mean_dy: number;
  mean_dx: number;
  
  // Standard deviations
  std_dy: number;
  std_dx: number;
  
  // RMS errors
  rms_dy: number;
  rms_dx: number;
  rms_total: number;
  
  // Unit weight standard error (sigma naught)
  sigma_naught: number;
  
  // Range
  min_dy: number;
  max_dy: number;
  min_dx: number;
  max_dx: number;
  max_distance: number;
  
  // Tolerance analysis
  tolerance_used: number;
  tolerance_type: string;
  within_tolerance: number;
  exceeds_tolerance: number;
  pass_rate: string;
  
  // Assessment
  assessment: 'PASS' | 'MARGINAL' | 'FAIL';
  recommendation: string;
}

export interface BeaconResidual {
  point_name: string;
  prev_y: number;
  prev_x: number;
  curr_y: number;
  curr_x: number;
  dy: number;
  dx: number;
  linear_distance: number;
  within_tolerance: boolean;
  sr_number?: string;
  prev_coord_system?: string;
  prev_meas_unit?: string;
}

export interface LeastSquaresResult {
  success: boolean;
  matched_count: number;
  beacons: BeaconResidual[];
  least_squares: LeastSquaresAnalysis | null;
  message?: string;
}

export interface HistoricalPointCSV {
  Point: string;
  Y: string | number;
  X: string | number;
  SR_num?: string;
  Description?: string;
  Survey_date?: string;
  System?: string;      // Coordinate system (e.g., "Lo 31")
  Meas_unit?: string;   // Measurement unit (e.g., "M" for meters)
}

export interface ImportResult {
  success: boolean;
  import_id: number;
  inserted: number;
  skipped: number;
  errors?: Array<{ point: string; error: string }>;
}

/**
 * Get all historical survey points for a project
 */
export async function listHistoricalSurveyPoints(projectId: number): Promise<HistoricalSurveyPoint[]> {
  const response = await api.get(`/historical-survey-points?project_id=${projectId}`);
  return response.data.data;
}

/**
 * Get beacon comparison analysis for a project
 */
export async function getBeaconComparison(
  projectId: number, 
  toleranceType: 'urban' | 'rural' = 'urban'
): Promise<{ data: BeaconComparison[]; summary: ComparisonSummary }> {
  const response = await api.get(
    `/historical-survey-points/comparison?project_id=${projectId}&tolerance_type=${toleranceType}`
  );
  return response.data;
}

/**
 * Get least squares analysis of beacon comparison
 * Returns matched beacons with dy/dx residuals and statistical analysis
 */
export async function getLeastSquaresAnalysis(
  projectId: number,
  toleranceType: 'urban' | 'rural' = 'urban'
): Promise<LeastSquaresResult> {
  const response = await api.get(
    `/historical-survey-points/least-squares?project_id=${projectId}&tolerance_type=${toleranceType}`
  );
  return response.data;
}

/**
 * Import historical survey points from parsed CSV data
 */
export async function importHistoricalSurveyPoints(
  projectId: number,
  points: HistoricalPointCSV[],
  filename?: string,
  metadata?: any
): Promise<ImportResult> {
  console.log('[historicalSurveyPoints] Input points count:', points.length);
  console.log('[historicalSurveyPoints] Input first point:', points[0]);
  
  // Transform CSV format to API format
  const transformedPoints = points.map(p => ({
    point_name: p.Point,
    y_coordinate: typeof p.Y === 'string' ? parseFloat(p.Y) : p.Y,
    x_coordinate: typeof p.X === 'string' ? parseFloat(p.X) : p.X,
    sr_number: p.SR_num,
    description: p.Description,
    survey_date: p.Survey_date,
    coordinate_system: p.System,
    measurement_unit: p.Meas_unit || 'M'
  }));

  console.log('[historicalSurveyPoints] Transformed points count:', transformedPoints.length);
  console.log('[historicalSurveyPoints] Transformed first point:', transformedPoints[0]);

  const requestBody = {
    project_id: projectId,
    points: transformedPoints,
    filename: filename,
    metadata: metadata
  };
  
  console.log('[historicalSurveyPoints] Request body:', JSON.stringify(requestBody, null, 2));

  const response = await api.post('/historical-survey-points/import', requestBody);

  console.log('[historicalSurveyPoints] Response:', response.data);
  return response.data;
}

/**
 * Delete a single historical survey point
 */
export async function deleteHistoricalSurveyPoint(id: number): Promise<void> {
  await api.delete(`/historical-survey-points/${id}`);
}

/**
 * Delete all historical survey points for a project
 */
export async function deleteAllHistoricalSurveyPoints(projectId: number): Promise<{ deleted_count: number }> {
  const response = await api.delete(`/historical-survey-points/project/${projectId}`);
  return response.data;
}

/**
 * Parse CSV file content into HistoricalPointCSV array
 * Expected columns: Point, Y, X, SR_num, Description, Survey_date
 */
export function parseHistoricalPointsCSV(csvContent: string): HistoricalPointCSV[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV file must have at least a header row and one data row');
  }

  // Parse header (handle various delimiters)
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));

  // Find column indices (case-insensitive)
  const findColumn = (names: string[]): number => {
    for (const name of names) {
      const idx = headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const pointIdx = findColumn(['Point', 'point_name', 'name', 'beacon', 'id']);
  const yIdx = findColumn(['Y', 'y_coordinate', 'westing', 'northing']);
  const xIdx = findColumn(['X', 'x_coordinate', 'southing', 'easting']);
  const srIdx = findColumn(['SR_num', 'sr_number', 'survey_record', 'sr']);
  const descIdx = findColumn(['Description', 'desc', 'beacon_type', 'type']);
  const dateIdx = findColumn(['Survey_date', 'survey_date', 'date', 'surveyed']);
  const systemIdx = findColumn(['System', 'coordinate_system', 'coord_system', 'datum']);
  const unitIdx = findColumn(['Meas_unit', 'measurement_unit', 'unit', 'units']);

  if (pointIdx === -1) {
    throw new Error('CSV must have a "Point" column');
  }
  if (yIdx === -1 || xIdx === -1) {
    throw new Error('CSV must have "Y" and "X" coordinate columns');
  }

  // Parse data rows
  const points: HistoricalPointCSV[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));

    const point: HistoricalPointCSV = {
      Point: values[pointIdx] || '',
      Y: values[yIdx] || '',
      X: values[xIdx] || ''
    };

    if (srIdx !== -1 && values[srIdx]) {
      point.SR_num = values[srIdx];
    }
    if (descIdx !== -1 && values[descIdx]) {
      point.Description = values[descIdx];
    }
    if (dateIdx !== -1 && values[dateIdx]) {
      point.Survey_date = values[dateIdx];
    }
    if (systemIdx !== -1 && values[systemIdx]) {
      point.System = values[systemIdx];
    }
    if (unitIdx !== -1 && values[unitIdx]) {
      point.Meas_unit = values[unitIdx];
    }

    // Skip empty rows
    if (point.Point && point.Y && point.X) {
      points.push(point);
    }
  }

  return points;
}

/**
 * SI 727 of 1979 tolerance constants
 */
export const SI727_TOLERANCES = {
  urban: 0.05,  // 50mm for urban surveys
  rural: 0.10,  // 100mm for rural surveys
  mining: 0.10  // 100mm for mining surveys
};

/**
 * Check if a distance is within SI 727 tolerance
 */
export function isWithinTolerance(
  distance: number, 
  toleranceType: 'urban' | 'rural' | 'mining' = 'urban'
): boolean {
  return distance <= SI727_TOLERANCES[toleranceType];
}

/**
 * Get tolerance status description
 */
export function getToleranceStatusDescription(status: BeaconComparison['tolerance_status']): string {
  switch (status) {
    case 'NOT_MATCHED':
      return 'No matching current point found';
    case 'WITHIN_URBAN_TOLERANCE':
      return 'Within urban tolerance (≤50mm)';
    case 'WITHIN_RURAL_TOLERANCE':
      return 'Within rural tolerance (≤100mm)';
    case 'EXCEEDS_TOLERANCE':
      return 'Exceeds SI 727 tolerance';
    default:
      return 'Unknown status';
  }
}
