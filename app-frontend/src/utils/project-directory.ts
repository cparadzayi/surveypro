/**
 * Project Directory Management Utilities
 * 
 * Handles working directory operations for cadastral survey projects.
 * The working directory contains all input files and generated output files.
 */

import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3042/api'

// Cache for system home directory
let cachedHomeDirectory: string | null = null

/**
 * Fetch the actual system home directory from the backend
 */
export async function getSystemHomeDirectory(): Promise<string> {
  if (cachedHomeDirectory) {
    return cachedHomeDirectory
  }

  try {
    const response = await axios.get(`${API_BASE}/system/info`)
    if (response.data.ok && response.data.system?.homeDirectory) {
      cachedHomeDirectory = response.data.system.homeDirectory
      return cachedHomeDirectory as string
    }
  } catch (error) {
    console.error('Failed to fetch system home directory:', error)
  }

  // Fallback to default
  cachedHomeDirectory = 'C:/Users/User'
  return cachedHomeDirectory
}

export interface ProjectDirectoryStructure {
  root: string;
  input: string;
  output: string;
  fieldBook: string;
  calculations: string;
  coordinateList: string;
  reports: string;
  certificates: string;
  diagrams: string;
  generalPlans: string;
  workingPlans: string;
  surveyRecord: string;
}

/**
 * Get the recommended directory structure for a project
 */
export function getProjectDirectoryStructure(workingDirectory: string): ProjectDirectoryStructure {
  return {
    root: workingDirectory,
    input: `${workingDirectory}/input`,
    output: `${workingDirectory}/output`,
    fieldBook: `${workingDirectory}/output/field-book`,
    calculations: `${workingDirectory}/output/calculations`,
    coordinateList: `${workingDirectory}/output/coordinate-list`,
    reports: `${workingDirectory}/output/reports`,
    certificates: `${workingDirectory}/output/certificates`,
    diagrams: `${workingDirectory}/output/diagrams`,
    generalPlans: `${workingDirectory}/output/general-plans`,
    workingPlans: `${workingDirectory}/output/working-plans`,
    surveyRecord: `${workingDirectory}/output/survey-record`
  };
}

/** Sanitize a name for use as a filesystem path segment. */
function sanitizePathSegment(s: string, max = 60): string {
  return (s || '')
    .replace(/[<>:"/\\|?*]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, max);
}

/**
 * Generate default working directory: surveyor-scoped, stable (no date).
 * `Documents/SurveyPro/Surveyors/<surveyor>/<project>[_district]`
 */
export function generateDefaultWorkingDirectory(
  projectName: string,
  district?: string,
  surveyorName?: string,
): string {
  const project = projectName
    .replace(/[^a-zA-Z0-9-_\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('_')
    .substring(0, 50);
  const districtPart = district ? `_${district.replace(/[^a-zA-Z0-9-_]/g, '').substring(0, 20)}` : '';
  const surveyor = sanitizePathSegment(surveyorName || '') || 'Unknown_Surveyor';
  return `Documents/SurveyPro/Surveyors/${surveyor}/${project}${districtPart}`;
}

/** Map a plan type to its output subfolder name (relative to output/). */
export function planTypeOutputSubdir(planType: string): string {
  switch (planType) {
    case 'diagram': return 'diagrams';
    case 'general-undeveloped':
    case 'general-developed':
    case 'general-plan': return 'general-plans';
    case 'working-plan': return 'working-plans';
    case 'survey-record':
    case 'report-on-survey': return 'survey-record';
    default: return 'output';
  }
}

/**
 * Validate working directory path
 */
export function validateWorkingDirectory(path: string): { valid: boolean; error?: string } {
  if (!path || path.trim() === '') {
    return { valid: false, error: 'Working directory path is required' };
  }
  
  // Check for invalid characters (Windows/Linux compatible)
  const invalidChars = /[<>"|?*]/;
  if (invalidChars.test(path)) {
    return { valid: false, error: 'Path contains invalid characters: < > " | ? *' };
  }
  
  // Check for relative path indicators that might be problematic
  if (path.includes('..')) {
    return { valid: false, error: 'Path cannot contain ".." (parent directory references)' };
  }
  
  // Check path length (Windows MAX_PATH is 260 characters)
  // We need to account for the full absolute path
  const absolutePath = makeAbsolutePath(path);
  if (absolutePath.length > 200) {
    return { valid: false, error: 'Path is too long. Please use a shorter path (max 200 characters)' };
  }
  
  return { valid: true };
}

/**
 * Get file paths for project outputs
 */
export function getOutputFilePaths(workingDirectory: string, projectName: string) {
  const structure = getProjectDirectoryStructure(workingDirectory);
  const sanitizedName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_');
  
  return {
    fieldBook: `${structure.fieldBook}/${sanitizedName}_FieldBook.pdf`,
    calculationsPart1: `${structure.calculations}/${sanitizedName}_CalculationsPart1.pdf`,
    coordinateList: `${structure.coordinateList}/${sanitizedName}_CoordinateList.pdf`,
    calculationsPart2: `${structure.calculations}/${sanitizedName}_CalculationsPart2.pdf`,
    reportOnSurvey: `${structure.reports}/${sanitizedName}_ReportOnSurvey.pdf`,
    dsgCertificate: `${structure.certificates}/${sanitizedName}_DSGCertificate.pdf`,
    
    // Combined documents
    fullDocument: `${structure.output}/${sanitizedName}_Complete.pdf`,
    
    // Input files
    csvInput: `${structure.input}/${sanitizedName}_coordinates.csv`,
    
    // Project metadata
    projectMetadata: `${structure.root}/${sanitizedName}_project.json`
  };
}

/**
 * Create directory structure description for display
 */
export function getDirectoryStructureDescription(workingDirectory: string): string {
  const structure = getProjectDirectoryStructure(workingDirectory);
  
  return `
${structure.root}/
├── input/                    (CSV files, control points)
└── output/
    ├── field-book/          (Electronic Field Book PDFs)
    ├── calculations/        (Calculations Part 1 & 2 PDFs)
    ├── coordinate-list/     (Coordinate List PDFs)
    ├── reports/             (Report on Survey PDFs)
    ├── certificates/        (DSG Certificate PDFs)
    ├── diagrams/            (Diagram PDFs + DXF)
    ├── general-plans/       (General Plan PDFs + DXF)
    ├── working-plans/       (Working Plan PDFs + DXF)
    └── survey-record/       (Survey record documents)
  `.trim();
}

/**
 * Format directory path for display (shorten if too long)
 */
export function formatDirectoryPath(path: string, maxLength: number = 50): string {
  if (path.length <= maxLength) return path;
  
  const parts = path.split(/[/\\]/);
  if (parts.length <= 2) return path;
  
  // Show first and last parts with ellipsis in middle
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first}/.../${last}`;
}

/**
 * Check if path is absolute
 */
export function isAbsolutePath(path: string): boolean {
  // Windows: C:\ or \\server\share
  if (/^[a-zA-Z]:\\/.test(path) || /^\\\\/.test(path)) return true;
  
  // Unix/Linux: /path
  if (path.startsWith('/')) return true;
  
  return false;
}

/**
 * Convert relative path to absolute
 * Uses Windows USERPROFILE environment variable when available
 */
export function makeAbsolutePath(path: string, basePath?: string): string {
  if (isAbsolutePath(path)) return path;
  
  // Try to get actual user profile from environment
  // In browser, we'll use a sensible default
  let base = basePath;
  
  if (!base) {
    // Try to detect Windows user profile
    // Note: In browser context, we can't access process.env directly
    // The backend will handle the actual resolution
    if (typeof window !== 'undefined') {
      // Browser context - use Windows default
      base = 'C:/Users/User';
    } else if (typeof process !== 'undefined') {
      // Node context (shouldn't happen in frontend, but just in case)
      base = process.env.USERPROFILE || process.env.HOME || 'C:/Users/User';
    } else {
      base = 'C:/Users/User';
    }
  }
  
  return `${base}/${path}`;
}

/**
 * Convert relative path to absolute using actual system home directory
 * This should be called before sending to backend to ensure consistent paths
 * Note: This uses cached home directory. Call getSystemHomeDirectory() first to populate cache.
 */
export function resolveToAbsolutePath(path: string): string {
  if (isAbsolutePath(path)) return path;
  
  // Use cached home directory or fallback
  const userProfile = cachedHomeDirectory || 'C:/Users/User';
  
  return `${userProfile}/${path}`.replace(/\\/g, '/');
}

/**
 * Resolve path to absolute asynchronously (fetches home directory if needed)
 */
export async function resolveToAbsolutePathAsync(path: string): Promise<string> {
  if (isAbsolutePath(path)) return path;
  
  const homeDir = await getSystemHomeDirectory();
  return `${homeDir}/${path}`.replace(/\\/g, '/');
}
