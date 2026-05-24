/**
 * Area Parcels Service
 * API client for digitized parcels in the cadastral workflow
 */

import api from './api';

export interface AreaParcel {
  id: number;
  project_id: number;
  designation: string;
  geometry: GeoJSON.Polygon;
  area_sqm: number;
  perimeter_m: number;
  closure_ratio: string;
  closure_error: number;
  status: 'draft' | 'finalized' | 'approved';
  digitized_at: string;
  digitized_by?: number;
  finalized_at?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CreateParcelRequest {
  project_id: number;
  designation: string;
  geometry: GeoJSON.Polygon;
  area_sqm: number;
  perimeter_m: number;
  closure_ratio: string;
  closure_error: number;
  status?: 'draft' | 'finalized';
  digitized_by?: number;
  metadata?: Record<string, any>;
}

export interface UpdateParcelRequest {
  designation?: string;
  geometry?: GeoJSON.Polygon;
  area_sqm?: number;
  perimeter_m?: number;
  closure_ratio?: string;
  closure_error?: number;
  status?: 'draft' | 'finalized' | 'approved';
  metadata?: Record<string, any>;
}

export interface ParcelStats {
  total_parcels: number;
  draft_parcels: number;
  finalized_parcels: number;
  approved_parcels: number;
  total_area_sqm: number;
  avg_area_sqm: number;
  min_area_sqm: number;
  max_area_sqm: number;
}

/**
 * Get all parcels for a project
 */
export async function fetchParcels(
  projectId: number,
  status?: 'draft' | 'finalized' | 'approved'
): Promise<AreaParcel[]> {
  const params: any = { project_id: projectId };
  if (status) {
    params.status = status;
  }
  
  const response = await api.get('/area-parcels', { params });
  return response.data.data;
}

/**
 * Create a new parcel (auto-save on digitization)
 */
export async function createParcel(parcel: CreateParcelRequest): Promise<AreaParcel> {
  const response = await api.post('/area-parcels', parcel);
  return response.data.data;
}

/**
 * Update an existing parcel
 */
export async function updateParcel(id: number, updates: UpdateParcelRequest): Promise<AreaParcel> {
  const response = await api.put(`/area-parcels/${id}`, updates);
  return response.data.data;
}

/**
 * Delete a parcel
 */
export async function deleteParcel(id: number): Promise<void> {
  await api.delete(`/area-parcels/${id}`);
}

/**
 * Finalize multiple parcels (batch status update)
 */
export async function finalizeParcels(
  projectId: number,
  parcelIds: number[]
): Promise<{ count: number; parcels: Array<{ id: number; designation: string }> }> {
  const response = await api.patch('/area-parcels/finalize', {
    project_id: projectId,
    parcel_ids: parcelIds
  });
  return {
    count: response.data.count,
    parcels: response.data.parcels
  };
}

/**
 * Check if a designation already exists
 */
export async function checkDuplicateDesignation(
  projectId: number,
  designation: string
): Promise<{ exists: boolean; parcel: AreaParcel | null }> {
  const response = await api.get('/area-parcels/check-duplicate', {
    params: { project_id: projectId, designation }
  });
  return {
    exists: response.data.exists,
    parcel: response.data.parcel
  };
}

/**
 * Get parcel statistics for a project
 */
export async function getParcelStats(projectId: number): Promise<ParcelStats> {
  const response = await api.get('/area-parcels/stats', {
    params: { project_id: projectId }
  });
  return response.data.data;
}
