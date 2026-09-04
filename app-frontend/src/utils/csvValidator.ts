/**
 * Live CSV Validation Utility
 * Provides real-time validation feedback for CSV imports
 */

export interface ValidationError {
  row: number;
  column: string;
  value: string;
  error: string;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  info: ValidationError[];
  stats: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    warningRows: number;
  };
}

export interface CSVRow {
  Point: string;
  Y: string;
  X: string;
  Status: string;
  Description: string;
  Date: string;
}

/**
 * Validate CSV content in real-time
 */
export function validateCSVContent(content: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const info: ValidationError[] = [];
  
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    return {
      isValid: false,
      errors: [{
        row: 0,
        column: 'file',
        value: '',
        error: 'CSV file is empty',
        severity: 'error'
      }],
      warnings: [],
      info: [],
      stats: { totalRows: 0, validRows: 0, errorRows: 0, warningRows: 0 }
    };
  }

  // Validate header
  const header = lines[0].split(',').map(h => h.trim());
  const expectedHeaders = ['Point', 'Y', 'X', 'Status', 'Description', 'Date'];
  
  const missingHeaders = expectedHeaders.filter(h => !header.includes(h));
  if (missingHeaders.length > 0) {
    errors.push({
      row: 1,
      column: 'header',
      value: header.join(','),
      error: `Missing required columns: ${missingHeaders.join(', ')}`,
      severity: 'error',
      suggestion: `Expected: ${expectedHeaders.join(', ')}`
    });
  }

  const extraHeaders = header.filter(h => !expectedHeaders.includes(h));
  if (extraHeaders.length > 0) {
    warnings.push({
      row: 1,
      column: 'header',
      value: header.join(','),
      error: `Extra columns will be ignored: ${extraHeaders.join(', ')}`,
      severity: 'warning'
    });
  }

  // Validate data rows
  const dataRows = lines.slice(1);
  let validRows = 0;
  const errorRowSet = new Set<number>();
  const warningRowSet = new Set<number>();

  dataRows.forEach((line, index) => {
    const rowNum = index + 2; // +2 because header is row 1, and index is 0-based
    const values = line.split(',').map(v => v.trim());
    
    if (values.length !== expectedHeaders.length) {
      errors.push({
        row: rowNum,
        column: 'row',
        value: line,
        error: `Expected ${expectedHeaders.length} columns, found ${values.length}`,
        severity: 'error',
        suggestion: 'Check for missing or extra commas'
      });
      errorRowSet.add(rowNum);
      return;
    }

    const row: Partial<CSVRow> = {};
    expectedHeaders.forEach((header, i) => {
      row[header as keyof CSVRow] = values[i];
    });

    // Validate Point ID
    if (!row.Point || row.Point.trim() === '') {
      errors.push({
        row: rowNum,
        column: 'Point',
        value: row.Point || '',
        error: 'Point ID is required',
        severity: 'error',
        suggestion: 'Enter a unique point identifier (e.g., 1, 2, 3 or P1, P2, P3)'
      });
      errorRowSet.add(rowNum);
    }

    // Validate Y coordinate (Westing)
    if (!row.Y || row.Y.trim() === '') {
      errors.push({
        row: rowNum,
        column: 'Y',
        value: row.Y || '',
        error: 'Y coordinate is required',
        severity: 'error',
        suggestion: 'Enter Westing coordinate (e.g., 12345.67)'
      });
      errorRowSet.add(rowNum);
    } else if (isNaN(parseFloat(row.Y))) {
      errors.push({
        row: rowNum,
        column: 'Y',
        value: row.Y,
        error: 'Y coordinate must be a number',
        severity: 'error',
        suggestion: 'Use decimal format (e.g., 12345.67)'
      });
      errorRowSet.add(rowNum);
    } else {
      const y = parseFloat(row.Y);
      // Cape Lo Y (Westing) typical range: -150000 to +100000
      if (y < -200000 || y > 200000) {
        warnings.push({
          row: rowNum,
          column: 'Y',
          value: row.Y,
          error: 'Y coordinate outside typical range',
          severity: 'warning',
          suggestion: 'Cape Lo Westing typically ranges from -150,000 to +100,000'
        });
        warningRowSet.add(rowNum);
      }
    }

    // Validate X coordinate (Southing)
    if (!row.X || row.X.trim() === '') {
      errors.push({
        row: rowNum,
        column: 'X',
        value: row.X || '',
        error: 'X coordinate is required',
        severity: 'error',
        suggestion: 'Enter Southing coordinate (e.g., 2234567.89)'
      });
      errorRowSet.add(rowNum);
    } else if (isNaN(parseFloat(row.X))) {
      errors.push({
        row: rowNum,
        column: 'X',
        value: row.X,
        error: 'X coordinate must be a number',
        severity: 'error',
        suggestion: 'Use decimal format (e.g., 2234567.89)'
      });
      errorRowSet.add(rowNum);
    } else {
      const x = parseFloat(row.X);
      // Cape Lo X (Southing) typical range: 1800000 to 2400000
      if (x < 1500000 || x > 2700000) {
        warnings.push({
          row: rowNum,
          column: 'X',
          value: row.X,
          error: 'X coordinate outside typical range',
          severity: 'warning',
          suggestion: 'Cape Lo Southing typically ranges from 1,800,000 to 2,400,000'
        });
        warningRowSet.add(rowNum);
      }
    }

    // Validate Status
    if (!row.Status || row.Status.trim() === '') {
      warnings.push({
        row: rowNum,
        column: 'Status',
        value: row.Status || '',
        error: 'Status is recommended',
        severity: 'warning',
        suggestion: 'Use F (fixed/control), P (peg), TRIG (trig station), RM (reference mark), WS (working station)'
      });
      warningRowSet.add(rowNum);
    } else {
      const status = row.Status.toUpperCase();
      // RM (reference mark) and WS (working station) let the surveyor state the
      // beacon KIND, which the working plan draws from directly instead of
      // guessing it out of the free-text description.
      if (!['F', 'P', 'FIXED', 'PEG', 'TRIG', 'RM', 'WS'].includes(status)) {
        warnings.push({
          row: rowNum,
          column: 'Status',
          value: row.Status,
          error: 'Unrecognized status code',
          severity: 'warning',
          suggestion: 'Use F (Fixed), P (Peg), TRIG (Trig station), RM (Reference mark) or WS (Working station)'
        });
        warningRowSet.add(rowNum);
      }
    }

    // Validate Description
    if (!row.Description || row.Description.trim() === '') {
      info.push({
        row: rowNum,
        column: 'Description',
        value: row.Description || '',
        error: 'Description is optional but recommended',
        severity: 'info',
        suggestion: 'Add a description for easier identification'
      });
    }

    // Validate Date
    if (row.Date && row.Date.trim() !== '') {
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      if (!datePattern.test(row.Date)) {
        warnings.push({
          row: rowNum,
          column: 'Date',
          value: row.Date,
          error: 'Date format should be YYYY-MM-DD',
          severity: 'warning',
          suggestion: 'Use format: 2025-01-20'
        });
        warningRowSet.add(rowNum);
      }
    }

    // If no errors for this row, count as valid
    if (!errorRowSet.has(rowNum)) {
      validRows++;
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    info,
    stats: {
      totalRows: dataRows.length,
      validRows,
      errorRows: errorRowSet.size,
      warningRows: warningRowSet.size
    }
  };
}

/**
 * Get validation summary text
 */
export function getValidationSummary(result: ValidationResult): string {
  const { stats } = result;
  
  if (stats.totalRows === 0) {
    return 'No data rows found';
  }

  const parts: string[] = [];
  
  parts.push(`${stats.totalRows} rows`);
  
  if (stats.validRows > 0) {
    parts.push(`${stats.validRows} valid`);
  }
  
  if (stats.errorRows > 0) {
    parts.push(`${stats.errorRows} errors`);
  }
  
  if (stats.warningRows > 0) {
    parts.push(`${stats.warningRows} warnings`);
  }

  return parts.join(', ');
}

/**
 * Format validation error for display
 */
export function formatValidationError(error: ValidationError): string {
  let message = `Row ${error.row}`;
  
  if (error.column !== 'row' && error.column !== 'file' && error.column !== 'header') {
    message += `, Column "${error.column}"`;
  }
  
  message += `: ${error.error}`;
  
  if (error.suggestion) {
    message += ` (${error.suggestion})`;
  }
  
  return message;
}
