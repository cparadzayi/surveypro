import type {
  CadastralPointCSV,
  CadastralPoint,
  CSVValidationResult,
  CSVValidationError,
  CSVValidationWarning,
  PointStatus
} from '../types/cadastral';

import {
  parseSurveyDate,
  validatePointId,
  validateCoordinate,
  coordinatePrecision,
  qualityControl
} from './cadastral-precision';

import { capeLoToWGS84, type CapeLoPoint } from './coordinateTransform';
/**
 * CSV Import and Validation Utilities for Cadastral Standard Module
 * Handles parsing, validation, and processing of cadastral coordinate CSV files
 * Expected format: Point,Y,X,Status,Description,Date of survey
 */
const EXPECTED_HEADERS = [
  'point',
  'y', 
  'x',
  'status',
  'description',
  'date of survey',
  'system'  // Cape Lo zone (Lo 25/27/29/31/33) - optional
];


/**
 * Parse a single CSV row, handling quoted values and commas
 * 
 * @param row - CSV row string
 * @returns Array of cell values
 */
function parseCSVRow(row: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

/**
 * Generate sample CSV template
 * 
 * @returns CSV template string
 */
export function generateCSVTemplate(): string {
  const headers = ['Point', 'Y', 'X', 'Status', 'Description', 'Date of survey'];
  const sampleRows = [
    ['P2', '97538.004', '2247107.872', 'F', '50mm Iron Pipe in Concrete', '1/10/2025'],
    ['ZA', '96271.080', '2247869.919', 'F', '50mm Iron Pipe in Concrete', '1/10/2025'],
    ['2283A', '97057.022', '2247854.388', 'P', '12mm iron peg in concrete', '1/10/2025'],
    ['2283L', '96831.600', '2248046.047', 'P', '12mm iron peg in concrete', '1/10/2025']
  ];
  
  const csvLines = [
    headers.join(','),
    ...sampleRows.map(row => row.map(cell => 
      cell.includes(',') ? `"${cell}"` : cell
    ).join(','))
  ];
  
  return csvLines.join('\n');
}

/**
 * Extract Cape Lo zone from System column value
 * Handles formats: "Lo 31", "Lo31", "31", etc.
 * 
 * @param systemValue - Value from System column
 * @returns Central meridian number (25/27/29/31/33) or null if invalid
 */
function extractCapeLoZone(systemValue: string): number | null {
  if (!systemValue) return null;
  
  const normalized = systemValue.toLowerCase().trim();
  const match = normalized.match(/\d+/);
  
  if (!match) return null;
  
  const zone = parseInt(match[0], 10);
  const validZones = [25, 27, 29, 31, 33];
  
  return validZones.includes(zone) ? zone : null;
}

// Restore original CSV validation and parsing logic
export function validateAndParseCSV(csv: string, loZone?: number): CSVValidationResult {
  const result: CSVValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    preview: [],
    summary: { 
      totalPoints: 0, 
      fixedPoints: 0, 
      pegPoints: 0, 
      otherPoints: 0,
      calculatedPoints: 0,
      fieldBookPoints: 0
    },
    detectedCentralMeridian: undefined  // Will be set if System column found
  };
  
  // Log transformation info if Lo zone is provided
  if (loZone) {
    console.log(`[CSV Parser] 🌍 Will transform coordinates from Cape Lo ${loZone} to WGS84`);
  }

  // Track detected central meridian from System column (declare outside try block)
  let detectedMeridian: number | null = null;
  let meridianConsistency = true;

  try {
    const rows = csv.split(/\r?\n/).filter(row => row.trim() !== '');
    if (rows.length < 2) {
      result.isValid = false;
      result.errors.push({
        row: 0,
        field: 'file',
        message: 'CSV must have a header and at least one data row',
        severity: 'error'
      });
      return result;
    }
    const header = parseCSVRow(rows[0]).map(h => h.toLowerCase().trim());
    console.log(' [CSV Parser] Header columns:', header);
    
    // Check if System column exists
    const hasSystemColumn = header.some(h => h === 'system' || h === 'lo' || h === 'zone');
    console.log(`[CSV Parser] System column detected: ${hasSystemColumn}`);
    
    // Helper function to find column value by multiple possible names
    const getColumnValue = (record: any, possibleNames: string[]): string => {
      for (const name of possibleNames) {
        if (record[name] !== undefined && record[name] !== '') {
          return record[name];
        }
      }
      return '';
    };
    
    for (let i = 1; i < rows.length; i++) {
      const row = parseCSVRow(rows[i]);
      if (row.length === 0 || (row.length === 1 && row[0].trim() === '')) continue;
      const record: any = {};
      header.forEach((h, idx) => {
        record[h] = idx < row.length ? row[idx].trim() : '';
      });
      
      // Debug first point
      if (i === 1) {
        console.log(' [CSV Parser] First row data:', record);
      }
      
      // Parse System column if present
      if (hasSystemColumn) {
        const systemValue = getColumnValue(record, ['system', 'lo', 'zone']);
        if (systemValue) {
          const pointMeridian = extractCapeLoZone(systemValue);
          
          if (pointMeridian) {
            if (detectedMeridian === null) {
              detectedMeridian = pointMeridian;
              console.log(`[CSV Parser] 🎯 Detected Cape Lo zone from System column: Lo ${pointMeridian}`);
            } else if (detectedMeridian !== pointMeridian) {
              meridianConsistency = false;
              result.warnings.push({
                row: i,
                field: 'system',
                message: `Inconsistent Cape Lo zone: Expected Lo ${detectedMeridian}, found Lo ${pointMeridian}`,
                suggestion: `All points should use the same Cape Lo zone (Lo ${detectedMeridian})`
              });
            }
          } else if (i === 1) {
            result.warnings.push({
              row: i,
              field: 'system',
              message: `Invalid System value: "${systemValue}". Expected Lo 25/27/29/31/33`,
              suggestion: 'Use valid Cape Lo zone: Lo 25, Lo 27, Lo 29, Lo 31, or Lo 33'
            });
          }
        }
      }
      
      // Map to CadastralPoint structure - handle multiple column name formats
      const yValue = getColumnValue(record, ['y', 'y (westing)', 'y (northing)', 'westing']);
      const xValue = getColumnValue(record, ['x', 'x (northing)', 'x (southing)', 'x (easting)', 'northing', 'southing', 'easting']);
      
      if (i === 1) {
        console.log('  - yValue found:', yValue);
        console.log('  - xValue found:', xValue);
      }
      
      const rawY = yValue ? parseFloat(yValue) : NaN;
      const rawX = xValue ? parseFloat(xValue) : NaN;
      
      if (i === 1) {
        console.log(' [CSV Parser] === STAGE 1: PARSING ===' );
        console.log('  - rawY:', rawY, 'isNaN:', isNaN(rawY));
        console.log('  - rawX:', rawX, 'isNaN:', isNaN(rawX));
      }
      const parsedDate = record['date of survey'] ? new Date(record['date of survey']) : new Date();
      const originalY = isNaN(rawY) ? 0 : rawY;
      const originalX = isNaN(rawX) ? 0 : rawX;
      
      if (i === 1) {
        console.log(' [CSV Parser] === STAGE 2: CREATING POINT OBJECT ===' );
        console.log('  - originalY (will be assigned):', originalY);
        console.log('  - originalX (will be assigned):', originalX);
      }
      
      // Transform to WGS84 if Lo zone is provided
      let wgs84Coords: { lng: number; lat: number } | undefined;
      if (loZone && !isNaN(rawY) && !isNaN(rawX)) {
        try {
          const capeLoPoint: CapeLoPoint = {
            id: record['point'] || '',
            y: originalY,
            x: originalX
          };
          const wgs84Point = capeLoToWGS84(capeLoPoint, loZone);
          wgs84Coords = {
            lng: wgs84Point.lng,
            lat: wgs84Point.lat
          };
          
          if (i === 1) {
            console.log(`[CSV Parser] 🌍 Transformed to WGS84: ${wgs84Point.lng.toFixed(6)}°E, ${wgs84Point.lat.toFixed(6)}°S`);
          }
        } catch (error) {
          console.error(`[CSV Parser] Failed to transform point ${record['point']}:`, error);
        }
      }
      
      // Detect calculated points
      // Calculated points are identified by:
      // 1. Point Type column = "Calculated" or "C"
      // 2. Status column = "C" or "CALC"
      // 3. Description contains "calculated" (case-insensitive)
      const pointType = getColumnValue(record, ['type', 'point type', 'pointtype']).toLowerCase();
      const statusValue = (record['status'] || '').toLowerCase();
      const descriptionValue = (record['description'] || '').toLowerCase();
      
      const isCalculated = 
        pointType === 'calculated' || 
        pointType === 'c' ||
        statusValue === 'c' ||
        statusValue === 'calc' ||
        descriptionValue.includes('calculated');
      
      if (i === 1 && isCalculated) {
        console.log('[CSV Parser] 🧮 Detected CALCULATED point:', record['point']);
        console.log('  - Point Type:', pointType);
        console.log('  - Status:', statusValue);
        console.log('  - Description:', descriptionValue);
      }
      
      const point: CadastralPoint = {
        id: record['point'] || '',
        original: {
          y: originalY,
          x: originalX
        },
        wgs84: wgs84Coords,
        fieldBook: {
          y: (!isNaN(rawY) ? rawY.toFixed(3) : ''),
          x: (!isNaN(rawX) ? rawX.toFixed(3) : '')
        },
        coordinateList: {
          y: (!isNaN(rawY) ? rawY.toFixed(2) : ''),
          x: (!isNaN(rawX) ? rawX.toFixed(2) : '')
        },
        status: (record['status'] || '') as any,
        description: record['description'] || '',
        surveyDate: parsedDate,
        includeInFieldBook: !isCalculated,  // Exclude calculated points from field book
        includeInCoordinateList: true       // Include all points in coordinate list
      };
      
      if (i === 1) {
        console.log(' [CSV Parser] === STAGE 3: FINAL POINT OBJECT ===' );
        console.log('  - point.id:', point.id);
        console.log('  - point.original:', point.original);
        console.log('  - point.original.y:', point.original.y);
        console.log('  - point.original.x:', point.original.x);
        console.log('  - point.fieldBook.y:', point.fieldBook.y);
        console.log('  - point.fieldBook.x:', point.fieldBook.x);
        console.log('  - point.coordinateList.y:', point.coordinateList.y);
        console.log('  - point.coordinateList.x:', point.coordinateList.x);
        console.log('  - Full point object:', JSON.stringify(point, null, 2));
      }
      
      result.preview.push(point);
      result.summary.totalPoints++;
      
      // Count by status
      if (point.status === 'F') result.summary.fixedPoints++;
      else if (point.status === 'P') result.summary.pegPoints++;
      else result.summary.otherPoints++;
      
      // Count calculated vs field book points
      if (isCalculated) {
        result.summary.calculatedPoints++;
      }
      if (point.includeInFieldBook) {
        result.summary.fieldBookPoints++;
      }
    }
  } catch (err) {
    result.isValid = false;
    result.errors.push({
      row: 0,
      field: 'file',
      message: 'Failed to parse CSV: ' + (err instanceof Error ? err.message : String(err)),
      severity: 'error'
    });
  }
  
  // Store detected central meridian
  if (detectedMeridian !== null) {
    result.detectedCentralMeridian = detectedMeridian;
  }
  
  // Log summary
  console.log('[CSV Parser] 📊 Import Summary:');
  console.log(`  - Total Points: ${result.summary.totalPoints}`);
  console.log(`  - Field Book Points: ${result.summary.fieldBookPoints}`);
  console.log(`  - Calculated Points: ${result.summary.calculatedPoints} (excluded from field book)`);
  console.log(`  - Fixed Points (F): ${result.summary.fixedPoints}`);
  console.log(`  - Peg Points (P): ${result.summary.pegPoints}`);
  console.log(`  - Other Points: ${result.summary.otherPoints}`);
  
  if (result.detectedCentralMeridian) {
    console.log(`  - 🎯 Detected Cape Lo Zone: Lo ${result.detectedCentralMeridian}`);
    console.log(`  - SRID will be: ${22287 + (result.detectedCentralMeridian - 25) / 2}`);
  } else {
    console.log(`  - ⚠️ No System column detected - will use project's default central meridian`);
  }
  
  return result;
}