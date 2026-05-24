/**
 * Enhanced Error Message Formatter
 * Converts technical errors into user-friendly messages with suggestions
 */

export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info';

export interface FormattedError {
  title: string;
  message: string;
  suggestion?: string;
  severity: ErrorSeverity;
  technicalDetails?: string;
  helpLink?: string;
  timestamp: Date;
  canRetry?: boolean;
  canReport?: boolean;
}

interface ErrorTemplate {
  title: string;
  message: string;
  suggestion?: string;
  severity: ErrorSeverity;
  helpLink?: string;
  canRetry?: boolean;
}

/**
 * Error message templates
 */
const errorTemplates: Record<string, ErrorTemplate> = {
  // Network Errors
  'NETWORK_ERROR': {
    title: 'Connection Error',
    message: 'Unable to connect to the server',
    suggestion: 'Check your internet connection and make sure the backend server is running on port 3050',
    severity: 'error',
    canRetry: true
  },
  'TIMEOUT_ERROR': {
    title: 'Request Timeout',
    message: 'The server took too long to respond',
    suggestion: 'The server might be busy. Please try again in a moment',
    severity: 'warning',
    canRetry: true
  },
  'SERVER_ERROR': {
    title: 'Server Error',
    message: 'The server encountered an unexpected error',
    suggestion: 'This is a server-side issue. Please try again or contact support if the problem persists',
    severity: 'error',
    canRetry: true
  },

  // Authentication Errors
  'AUTH_REQUIRED': {
    title: 'Authentication Required',
    message: 'You need to be logged in to perform this action',
    suggestion: 'Please log in and try again',
    severity: 'warning',
    helpLink: '/login'
  },
  'AUTH_EXPIRED': {
    title: 'Session Expired',
    message: 'Your session has expired',
    suggestion: 'Please log in again to continue',
    severity: 'warning',
    helpLink: '/login'
  },
  'AUTH_INVALID': {
    title: 'Invalid Credentials',
    message: 'The username or password is incorrect',
    suggestion: 'Please check your credentials and try again',
    severity: 'error'
  },

  // CSV Import Errors
  'CSV_PARSE_ERROR': {
    title: 'CSV File Error',
    message: 'Unable to read the CSV file',
    suggestion: 'Make sure the file is a valid CSV with comma-separated values. Check that the file is not corrupted',
    severity: 'error',
    helpLink: '/help/csv-format'
  },
  'CSV_INVALID_HEADER': {
    title: 'Invalid CSV Headers',
    message: 'The CSV file has incorrect column headers',
    suggestion: 'Required columns: Point, Y, X, Status, Description, Date. Make sure the header row matches exactly',
    severity: 'error',
    helpLink: '/help/csv-format'
  },
  'CSV_MISSING_DATA': {
    title: 'Missing Required Data',
    message: 'Some required fields are missing in the CSV file',
    suggestion: 'Check that all rows have values for Point, Y, and X columns',
    severity: 'error'
  },
  'CSV_INVALID_COORDINATES': {
    title: 'Invalid Coordinates',
    message: 'Some coordinate values are not valid numbers',
    suggestion: 'Y and X coordinates must be numeric values. Check for non-numeric characters or formatting issues',
    severity: 'error'
  },

  // Coordinate System Errors
  'COORDINATE_OUT_OF_RANGE': {
    title: 'Coordinate Range Warning',
    message: 'Some coordinates are outside the typical range for Cape Lo',
    suggestion: 'Verify that you are using the correct coordinate system (Lo 25, 27, 29, 31, or 33). Y (Westing) should be between -150,000 and +100,000, X (Southing) between 1,800,000 and 2,400,000',
    severity: 'warning'
  },
  'PROJECTION_ERROR': {
    title: 'Coordinate Transformation Error',
    message: 'Failed to transform coordinates between systems',
    suggestion: 'Check that the correct central meridian is selected and that coordinates are in the expected format',
    severity: 'error'
  },

  // Database Errors
  'DB_CONNECTION_ERROR': {
    title: 'Database Connection Error',
    message: 'Unable to connect to the database',
    suggestion: 'The database server might be offline. Please contact your system administrator',
    severity: 'critical',
    canRetry: true
  },
  'DB_QUERY_ERROR': {
    title: 'Database Query Error',
    message: 'Failed to retrieve data from the database',
    suggestion: 'This might be a temporary issue. Please try again',
    severity: 'error',
    canRetry: true
  },
  'DB_DUPLICATE_ERROR': {
    title: 'Duplicate Entry',
    message: 'This record already exists in the database',
    suggestion: 'Try using a different name or identifier, or update the existing record instead',
    severity: 'warning'
  },

  // File System Errors
  'FILE_NOT_FOUND': {
    title: 'File Not Found',
    message: 'The requested file could not be found',
    suggestion: 'The file may have been moved or deleted. Check the file path and try again',
    severity: 'error'
  },
  'FILE_PERMISSION_ERROR': {
    title: 'Permission Denied',
    message: 'You do not have permission to access this file',
    suggestion: 'Check file permissions or contact your system administrator',
    severity: 'error'
  },
  'FILE_TOO_LARGE': {
    title: 'File Too Large',
    message: 'The file exceeds the maximum allowed size',
    suggestion: 'Try splitting the file into smaller parts or compressing it',
    severity: 'warning'
  },

  // Validation Errors
  'VALIDATION_ERROR': {
    title: 'Validation Error',
    message: 'Some fields contain invalid data',
    suggestion: 'Please review the highlighted fields and correct any errors',
    severity: 'warning'
  },
  'REQUIRED_FIELD': {
    title: 'Required Field Missing',
    message: 'Please fill in all required fields',
    suggestion: 'Fields marked with * are required',
    severity: 'warning'
  },

  // Computation Errors
  'COMPUTATION_ERROR': {
    title: 'Calculation Error',
    message: 'An error occurred during computation',
    suggestion: 'Check that all input values are valid and within expected ranges',
    severity: 'error'
  },
  'CLOSURE_ERROR_HIGH': {
    title: 'High Closure Error',
    message: 'The traverse closure error exceeds acceptable limits',
    suggestion: 'Review your measurements and calculations. A closure error above 0.5m may indicate measurement errors',
    severity: 'warning'
  },

  // PDF Generation Errors
  'PDF_GENERATION_ERROR': {
    title: 'PDF Generation Failed',
    message: 'Unable to generate the PDF document',
    suggestion: 'This might be a temporary issue. Try generating the document again',
    severity: 'error',
    canRetry: true
  },
  'PDF_SAVE_ERROR': {
    title: 'Failed to Save PDF',
    message: 'The PDF was generated but could not be saved',
    suggestion: 'Check that you have write permissions to the target folder and sufficient disk space',
    severity: 'error'
  }
};

/**
 * Identify error type from error object
 */
function identifyErrorType(error: Error | any): string {
  const message = error.message?.toLowerCase() || '';
  const code = error.code || error.response?.status;

  // Network errors
  if (message.includes('network') || message.includes('connection refused')) {
    return 'NETWORK_ERROR';
  }
  if (message.includes('timeout')) {
    return 'TIMEOUT_ERROR';
  }
  if (code === 500 || code === 502 || code === 503) {
    return 'SERVER_ERROR';
  }

  // Authentication errors
  if (code === 401) {
    return 'AUTH_REQUIRED';
  }
  if (code === 403) {
    return 'AUTH_INVALID';
  }

  // Database errors
  if (message.includes('database') || message.includes('db')) {
    if (message.includes('connection')) return 'DB_CONNECTION_ERROR';
    if (message.includes('duplicate')) return 'DB_DUPLICATE_ERROR';
    return 'DB_QUERY_ERROR';
  }

  // CSV errors
  if (message.includes('csv')) {
    if (message.includes('parse')) return 'CSV_PARSE_ERROR';
    if (message.includes('header')) return 'CSV_INVALID_HEADER';
    if (message.includes('coordinate')) return 'CSV_INVALID_COORDINATES';
    return 'CSV_MISSING_DATA';
  }

  // File errors
  if (message.includes('file not found') || code === 404) {
    return 'FILE_NOT_FOUND';
  }
  if (message.includes('permission')) {
    return 'FILE_PERMISSION_ERROR';
  }

  // Default
  return 'UNKNOWN_ERROR';
}

/**
 * Format error into user-friendly message
 */
export function formatError(error: Error | any): FormattedError {
  const errorType = identifyErrorType(error);
  const template = errorTemplates[errorType] || {
    title: 'Unexpected Error',
    message: error.message || 'An unexpected error occurred',
    suggestion: 'Please try again or contact support if the problem persists',
    severity: 'error' as ErrorSeverity,
    canRetry: true
  };

  return {
    ...template,
    technicalDetails: error.stack || error.toString(),
    timestamp: new Date(),
    canReport: true
  };
}

/**
 * Format multiple errors
 */
export function formatErrors(errors: (Error | any)[]): FormattedError[] {
  return errors.map(formatError);
}

/**
 * Get severity icon
 */
export function getSeverityIcon(severity: ErrorSeverity): string {
  switch (severity) {
    case 'critical': return '🔴';
    case 'error': return '❌';
    case 'warning': return '⚠️';
    case 'info': return 'ℹ️';
    default: return '❓';
  }
}

/**
 * Get severity color class
 */
export function getSeverityColorClass(severity: ErrorSeverity): string {
  switch (severity) {
    case 'critical': return 'bg-red-100 border-red-500 text-red-900';
    case 'error': return 'bg-red-50 border-red-300 text-red-800';
    case 'warning': return 'bg-yellow-50 border-yellow-300 text-yellow-800';
    case 'info': return 'bg-blue-50 border-blue-300 text-blue-800';
    default: return 'bg-gray-50 border-gray-300 text-gray-800';
  }
}

/**
 * Copy error details to clipboard
 */
export async function copyErrorToClipboard(error: FormattedError): Promise<boolean> {
  const text = `
Error: ${error.title}
Message: ${error.message}
${error.suggestion ? `Suggestion: ${error.suggestion}` : ''}
Severity: ${error.severity}
Time: ${error.timestamp.toISOString()}
${error.technicalDetails ? `\nTechnical Details:\n${error.technicalDetails}` : ''}
  `.trim();

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    console.error('Failed to copy to clipboard:', e);
    return false;
  }
}

/**
 * Log error for reporting
 */
export function logError(error: FormattedError): void {
  console.group(`${getSeverityIcon(error.severity)} ${error.title}`);
  console.error('Message:', error.message);
  if (error.suggestion) {
    console.info('Suggestion:', error.suggestion);
  }
  if (error.technicalDetails) {
    console.debug('Technical Details:', error.technicalDetails);
  }
  console.groupEnd();
}
