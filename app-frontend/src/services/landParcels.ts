/**
 * Land Parcels API Service
 * Handles all API calls related to land parcels
 */

import api from './api';
import type { ParcelPoint } from '../composables/useParcelManagement';

export interface LandParcelData {
  stand: string;
  geom: any;
  owner?: string;
  title_deed?: string;
  survey_date?: string;
  surveyor?: string;
  notes?: string;
  centroid_y?: number;
  centroid_x?: number;
  closure_error_m?: number;
  area_m2?: number;
  area_ha?: number;
  perimeter_m?: number;
  metadata?: any;
}

export interface LandParcel extends LandParcelData {
  id: number;
  project_id: number;
  created_at: string;
  updated_at?: string;
  geometry?: any;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Get land parcels for a project with optional pagination and status filter.
 * Returns the data array directly for backward compatibility.
 */
export async function getLandParcels(
  projectId: number,
  options: { page?: number; limit?: number; status?: string } = {}
): Promise<LandParcel[]> {
  const { data } = await getLandParcelsPaginated(projectId, options);
  return data;
}

/**
 * Get land parcels with full pagination metadata.
 */
export async function getLandParcelsPaginated(
  projectId: number,
  options: { page?: number; limit?: number; status?: string } = {}
): Promise<{ data: LandParcel[]; pagination: PaginationMeta }> {
  const params = new URLSearchParams({ project_id: String(projectId) });
  if (options.page) params.set('page', String(options.page));
  if (options.limit) params.set('limit', String(options.limit));
  if (options.status) params.set('status', options.status);

  const response = await api.get<{
    ok: boolean;
    data: LandParcel[];
    pagination: PaginationMeta;
  }>(`/land-parcels?${params}`);
  return { data: response.data.data, pagination: response.data.pagination };
}

/**
 * Get a single land parcel
 */
export async function getLandParcel(id: number): Promise<LandParcel> {
  const response = await api.get<{ ok: boolean; data: LandParcel }>(
    `/land-parcels/${id}`
  );
  return response.data.data;
}

/**
 * Create a single land parcel
 */
export async function createLandParcel(
  projectId: number,
  data: LandParcelData
): Promise<LandParcel> {
  const response = await api.post<{ ok: boolean; data: LandParcel }>(
    '/land-parcels',
    {
      project_id: projectId,
      ...data
    }
  );
  return response.data.data;
}

/**
 * Batch create land parcels
 */
export async function batchCreateLandParcels(
  projectId: number,
  parcels: LandParcelData[]
): Promise<{ created: number; failed: number; data: LandParcel[]; errors: any[] }> {
  const response = await api.post<{
    ok: boolean;
    created: number;
    failed: number;
    data: LandParcel[];
    errors: any[];
  }>('/land-parcels/batch', {
    project_id: projectId,
    parcels
  });
  return response.data;
}

/**
 * Update a land parcel
 */
export async function updateLandParcel(
  id: number,
  data: Partial<LandParcelData>
): Promise<LandParcel> {
  const response = await api.put<{ ok: boolean; data: LandParcel }>(
    `/land-parcels/${id}`,
    data
  );
  return response.data.data;
}

/**
 * Delete a land parcel
 */
export async function deleteLandParcel(id: number): Promise<void> {
  await api.delete(`/land-parcels/${id}`);
}

/**
 * Convert parcel points to GeoJSON geometry
 */
export function pointsToGeoJSON(points: ParcelPoint[]): any {
  // Close the polygon by adding the first point at the end
  const coordinates = points.map(p => [p.x, p.y]);
  coordinates.push(coordinates[0]);

  return {
    type: 'Polygon',
    coordinates: [coordinates]
  };
}

/**
 * Prepare parcel data for API submission
 */
export function prepareParcelForAPI(
  designation: string,
  points: ParcelPoint[],
  areaResult?: any
): LandParcelData {
  const geom = pointsToGeoJSON(points);

  const data: LandParcelData = {
    stand: designation,
    geom
  };

  // Add computed values if available
  if (areaResult) {
    data.centroid_y = areaResult.centroid.y;
    data.centroid_x = areaResult.centroid.x;
    data.area_m2 = areaResult.area.abs_m2;
    data.area_ha = areaResult.area.abs_m2 / 10000;

    if (areaResult.residuals) {
      const closureError = Math.sqrt(
        areaResult.residuals.sumDy ** 2 + areaResult.residuals.sumDx ** 2
      );
      data.closure_error_m = closureError;
    }

    // Calculate perimeter if edges available
    if (areaResult.residuals?.edges) {
      const perimeter = areaResult.residuals.edges.reduce(
        (sum: number, edge: any) => sum + edge.distance,
        0
      );
      data.perimeter_m = perimeter;
    }

    // Store full area result in metadata for later use (includes edges with beacon names)
    data.metadata = {
      areaResult: areaResult,
      edges: areaResult.residuals?.edges || [],
      computedAt: new Date().toISOString()
    };
  }

  return data;
}
