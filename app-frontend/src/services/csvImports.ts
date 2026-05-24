/**
 * CSV Import Management Service
 * Handles CSV import tracking, smart merge analysis, and import history
 */

import api from './api';

export interface CSVImport {
  id: number;
  project_id: number;
  import_date: string;
  csv_hash: string;
  point_count: number;
  filename?: string;
  imported_by?: number;
  coordinate_system?: string;
  metadata?: any;
  has_generated_documents: boolean;
  has_land_parcels: boolean;
  created_at: string;
  updated_at: string;
  // From view
  parcel_count?: number;
  active_point_count?: number;
  imported_by_username?: string;
}

export interface PointMatch {
  oldId: string;
  oldDbId: number;
  newId: string;
  coordinate: { y: number; x: number };
  distance: number;
}

export interface NewPoint {
  id: string;
  coordinate: { y: number; x: number };
}

export interface RemovedPoint {
  id: string;
  dbId: number;
  coordinate: { y: number; x: number };
  usedInParcels: string[];
}

export interface ParcelMatch {
  id: number;
  designation: string;
  vertexCount: number;
  matchedCount?: number;
  matchRatio?: number;
  missingVertices?: Array<{ y: number; x: number }>;
}

export interface MergeAnalysis {
  matched: PointMatch[];
  newPoints: NewPoint[];
  removedPoints: RemovedPoint[];
  parcelAnalysis: {
    fullyMatched: ParcelMatch[];
    partiallyMatched: ParcelMatch[];
    orphaned: ParcelMatch[];
  };
  summary: {
    existingPointCount: number;
    newPointCount: number;
    matchedCount: number;
    newCount: number;
    removedCount: number;
    parcelCount: number;
    fullyMatchedParcels: number;
    partiallyMatchedParcels: number;
    orphanedParcels: number;
  };
}

export interface PointHistoryEntry {
  id: number;
  point_id: number;
  import_id: number;
  previous_point_id?: number;
  action: 'created' | 'updated' | 'matched' | 'removed' | 'replaced';
  point_name: string;
  coordinates: { y: number; x: number };
  metadata?: any;
  created_at: string;
  current_point_name?: string;
}

/**
 * Get all CSV imports for a project
 */
export async function listCSVImports(projectId: number): Promise<CSVImport[]> {
  const response = await api.get(`/csv-imports?project_id=${projectId}`);
  return response.data.data;
}

/**
 * Get details of a specific CSV import
 */
export async function getCSVImport(importId: number): Promise<CSVImport> {
  const response = await api.get(`/csv-imports/${importId}`);
  return response.data.data;
}

/**
 * Get the latest CSV import for a project
 */
export async function getLatestCSVImport(projectId: number): Promise<CSVImport | null> {
  const response = await api.get(`/csv-imports/latest/${projectId}`);
  return response.data.data;
}

/**
 * Create a new CSV import record
 */
export async function createCSVImport(data: {
  project_id: number;
  csv_content: string;
  filename?: string;
  point_count: number;
  coordinate_system?: string;
  metadata?: any;
}): Promise<CSVImport> {
  const response = await api.post('/csv-imports', data);
  return response.data.data;
}

/**
 * Update CSV import metadata
 */
export async function updateCSVImport(
  importId: number,
  data: {
    has_generated_documents?: boolean;
    metadata?: any;
  }
): Promise<CSVImport> {
  const response = await api.put(`/csv-imports/${importId}`, data);
  return response.data.data;
}

/**
 * Analyze potential merge between existing and new CSV data
 */
export async function analyzeMerge(data: {
  project_id: number;
  new_points: Array<{ id: string; y: number; x: number }>;
  tolerance?: number;
}): Promise<MergeAnalysis> {
  const response = await api.post('/csv-imports/analyze-merge', data);
  return response.data.data;
}

/**
 * Execute a smart merge based on analysis results
 */
export async function executeMerge(data: {
  project_id: number;
  import_id: number;
  matched_points: PointMatch[];
  new_points: Array<{ id: string; y: number; x: number }>;
  orphaned_parcel_ids?: number[];
  partial_parcel_actions?: Record<number, 'delete' | 'keep' | 'review'>;
  duplicate_tolerance?: number;
  detectedCentralMeridian?: number; // Cape Lo zone from CSV System column (25/27/29/31/33)
}): Promise<{
  success: boolean;
  message: string;
  data: {
    matched_count: number;
    new_count: number;
    orphaned_parcels: number;
  };
}> {
  const response = await api.post('/csv-imports/execute-merge', data);
  return response.data;
}

/**
 * Get point history for a specific import
 */
export async function getImportHistory(importId: number): Promise<PointHistoryEntry[]> {
  const response = await api.get(`/csv-imports/${importId}/history`);
  return response.data.data;
}

/**
 * Calculate SHA256 hash of CSV content
 */
export function calculateCSVHash(csvContent: string): string {
  // Use Web Crypto API for browser-based hashing
  const encoder = new TextEncoder();
  const data = encoder.encode(csvContent);
  
  return crypto.subtle.digest('SHA-256', data).then(hashBuffer => {
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }) as any; // Type assertion for now
}
