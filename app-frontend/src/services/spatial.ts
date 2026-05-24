import api from './api'

export interface Project { id: number; name: string; code?: string; description?: string }
export interface Layer { id: number; name: string; layer_type?: string; geom_type?: string; project_id: number; srid?: number; params?: Record<string, any> }
export interface Feature { id: number; layer_id: number; project_id: number; geometry: any; properties: Record<string, any>; bbox?: number[] }

export async function listProjects() {
  const r = await api.get<Project[]>('/spatial/projects')
  return r.data
}
export async function createProject(input: { name: string; code?: string; description?: string }) {
  const r = await api.post<Project>('/spatial/projects', input)
  return r.data
}
export async function listLayers(projectId: number) {
  const r = await api.get<Layer[]>(`/spatial/projects/${projectId}/layers`)
  return r.data
}
export async function getLayer(layerId: number) {
  const r = await api.get<Layer>(`/spatial/layers/${layerId}`)
  return r.data
}
export async function createLayer(projectId: number, input: { name: string; layer_type?: string; geom_type?: string; srid?: number; params?: Record<string, any> }) {
  const r = await api.post<Layer>(`/spatial/projects/${projectId}/layers`, input)
  return r.data
}
export async function createFeature(layerId: number, input: { geometry: any; properties?: Record<string, any> }) {
  const r = await api.post<Feature>(`/spatial/layers/${layerId}/features`, input)
  return r.data
}
export async function bboxQuery(layerId: number, bbox: number[]) {
  const r = await api.post<Feature[]>(`/spatial/layers/${layerId}/query`, { bbox })
  return r.data
}

export async function searchFeatures(layerId: number, q: string, limit = 20) {
  const r = await api.get<Feature[]>(`/spatial/layers/${layerId}/search`, { params: { q, limit } })
  return r.data
}

export async function listLayerFeatures(layerId: number, params: { page?: number; limit?: number; search?: string } = {}) {
  const r = await api.get<{ items: Feature[]; total: number; page: number; limit: number }>(`/spatial/layers/${layerId}/features`, { params })
  return r.data
}

export async function getLayerGeoJSON(layerId: number, params: { search?: string } = {}) {
  const r = await api.get<any>(`/spatial/layers/${layerId}/geojson`, { params })
  return r.data
}

export async function importCsv(options: { file: File; projectId?: number; projectName?: string; layerId?: number; layerName?: string; geometryType?: 'Point'|'LineString'|'Polygon'; srid?: number; centralMeridian?: 'Lo25'|'Lo27'|'Lo29'|'Lo31'|'Lo33'; zone?: string }) {
  const fd = new FormData()
  fd.append('file', options.file)
  if (options.projectId) fd.append('project_id', String(options.projectId))
  if (options.projectName) fd.append('project_name', options.projectName)
  if (options.layerId) fd.append('layer_id', String(options.layerId))
  if (options.layerName) fd.append('layer_name', options.layerName)
  if (options.geometryType) fd.append('geometry_type', options.geometryType)
  if (options.srid) fd.append('srid', String(options.srid))
  if (options.centralMeridian) fd.append('central_meridian', options.centralMeridian)
  if (options.zone) fd.append('zone', options.zone)
  // Let the browser set the correct multipart boundary automatically
  const r = await api.post(`/spatial/import/csv`, fd)
  return r.data
}

export async function transformLayerPoints(layerId: number, points: Array<{ y: number; x: number }>) {
  const r = await api.post<{ ok: boolean; coords: Array<{ lat: number; lon: number }|null>; error?: string }>(`/spatial/layers/${layerId}/transform`, { points })
  return r.data
}

export async function updateLayerSrid(layerId: number, input: { srid?: number; central_meridian?: string }) {
  const r = await api.put(`/spatial/layers/${layerId}/srid`, input)
  return r.data
}

export interface DBConnectionInfo {
  ok: boolean
  connection: {
    host: string
    port: number
    database: string
    username: string
    sslmode: string
    schema: string
  }
  qgis_connection_string: string
  qgis_uri: string
  surveyor_schema?: string
  surveyor_profile?: {
    id: number
    name: string
  }
  instructions?: string[]
}

export async function getDBConnectionInfo() {
  const r = await api.get<DBConnectionInfo>('/spatial/db-connection')
  return r.data
}

export interface BatchCreateFeaturesRequest {
  features: Array<{
    geometry: any
    properties: Record<string, any>
  }>
  replace_duplicates?: boolean
}

export interface BatchCreateFeaturesResponse {
  ok: boolean
  total: number
  created: number
  skipped: number
  replaced: number
  errors: number
  details: Array<{
    name: string | null
    status: 'created' | 'skipped' | 'replaced' | 'error'
    message?: string
    id?: number
  }>
}

export async function batchCreateFeatures(layerId: number, request: BatchCreateFeaturesRequest) {
  const r = await api.post<BatchCreateFeaturesResponse>(`/spatial/layers/${layerId}/features/batch`, request)
  return r.data
}

// ============================================================================
// NORMALIZED TABLES: Coordinate Points & Land Parcels
// ============================================================================

export interface CoordinatePoint {
  id: number
  project_id: string | number
  name: string
  geom: any
  y: number  // Extracted from geometry
  x: number  // Extracted from geometry
  elevation?: number
  description?: string
  survey_date?: string
  surveyor?: string
  created_at: string
  updated_at: string
}

export interface LandParcel {
  id: number
  project_id: string | number
  stand: string
  designation?: string
  geom: any
  geometry?: any
  owner?: string
  title_deed?: string
  survey_date?: string
  surveyor?: string
  notes?: string
  area_m2: number | string
  area_sqm?: number | string
  area_ha: number | string
  perimeter_m: number | string
  closure_ratio?: string
  closure_error?: number
  closure_error_m?: number
  status?: 'draft' | 'finalized' | 'approved'
  digitized_by?: number
  finalized_at?: string
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
}

// Coordinate Points
export async function listCoordinatePoints(projectId: number) {
  const r = await api.get<{ ok: boolean; data: CoordinatePoint[] }>('/coordinate-points', {
    params: { project_id: projectId.toString() }
  })
  return r.data.data
}

export async function createCoordinatePoint(data: {
  project_id: number | string
  name: string
  y: number
  x: number
  elevation?: number
  description?: string
  survey_date?: string
  surveyor?: string
}) {
  const payload = {
    ...data,
    project_id: data.project_id.toString()
  }
  const r = await api.post<{ ok: boolean; data: CoordinatePoint }>('/coordinate-points', payload)
  return r.data.data
}

export async function renameCoordinatePoint(projectId: number | string, oldName: string, newName: string) {
  const r = await api.patch<{ ok: boolean; data: CoordinatePoint }>('/coordinate-points/rename', {
    project_id: projectId.toString(),
    old_name: oldName,
    new_name: newName
  })
  return r.data.data
}

export async function updateCoordinatePoint(id: number, data: {
  name?: string
  y?: number
  x?: number
  elevation?: number
  description?: string
  survey_date?: string
  surveyor?: string
}) {
  const r = await api.put<{ ok: boolean; data: CoordinatePoint }>(`/coordinate-points/${id}`, data)
  return r.data.data
}

export async function batchCreateCoordinatePoints(projectId: number, points: Array<{
  name: string
  y: number
  x: number
  elevation?: number
  description?: string
}>) {
  const r = await api.post<{ ok: boolean; data: CoordinatePoint[]; count: number }>('/coordinate-points/batch', {
    project_id: projectId.toString(),
    points
  })
  return r.data
}

export async function deleteCoordinatePoint(id: number) {
  const r = await api.delete<{ ok: boolean }>(`/coordinate-points/${id}`)
  return r.data
}

export async function deleteCoordinatePointByName(projectId: number, name: string) {
  const r = await api.delete<{ ok: boolean; deleted?: number }>('/coordinate-points/by-name', {
    data: { project_id: String(projectId), name }
  })
  return r.data
}

// Land Parcels
export async function listLandParcels(
  projectId: number,
  status?: 'draft' | 'finalized' | 'approved'
) {
  const params: any = { project_id: projectId.toString(), limit: 10000 } // Fetch all — map/plan views need full dataset
  if (status) params.status = status

  const r = await api.get<{ ok: boolean; data: LandParcel[] }>('/land-parcels', { params })
  return r.data.data
}

export async function getLandParcel(id: number) {
  const r = await api.get<{ ok: boolean; data: LandParcel }>(`/land-parcels/${id}`)
  return r.data.data
}

export async function checkParcelDuplicates(data: {
  project_id: number
  stand: string
  geom: any
  exclude_id?: number
}) {
  const payload = {
    ...data,
    project_id: data.project_id.toString() // Convert to string
  }
  
  const r = await api.post<{
    ok: boolean
    hasDuplicates: boolean
    duplicateCount: number
    duplicates: Array<{
      type: string
      severity: 'critical' | 'high' | 'medium' | 'low'
      existing_id: number
      existing_stand: string
      overlap_area_m2?: string
      overlap_percent?: number
      message: string
      details: string
    }>
    summary: {
      critical: number
      high: number
      medium: number
      low: number
    }
  }>('/land-parcels/check-duplicates', payload)
  return r.data
}

/**
 * Create a new land parcel
 * 
 * NOTE: area_m2, area_ha, perimeter_m, centroid_y, centroid_x are auto-calculated
 * by the database trigger from the geometry. Do NOT send these values - they will
 * be ignored or cause errors.
 * 
 * Store calculated values in metadata if you need to preserve them for reference.
 */
export async function createLandParcel(data: {
  project_id: number
  stand?: string
  designation?: string
  geometry?: any
  geom?: any
  // NOTE: Do NOT send area_m2, area_ha, perimeter_m - auto-calculated by DB trigger
  closure_ratio?: string
  closure_error?: number
  closure_error_m?: number
  status?: 'draft' | 'finalized' | 'approved'
  digitized_by?: number
  metadata?: Record<string, any>
  owner?: string
  title_deed?: string
  survey_date?: string
  surveyor?: string
  notes?: string
}) {
  // Map geometry to geom if needed
  const payload = {
    ...data,
    project_id: data.project_id.toString(), // Convert to string
    geom: data.geom || data.geometry,
    stand: data.stand || data.designation
  }
  delete payload.geometry
  
  // Remove any area-related fields that might have been passed
  // These are auto-calculated by the database trigger
  delete (payload as any).area_sqm
  delete (payload as any).area_m2
  delete (payload as any).area_ha
  delete (payload as any).perimeter_m
  delete (payload as any).centroid_y
  delete (payload as any).centroid_x
  
  const r = await api.post<{ ok: boolean; data: LandParcel }>('/land-parcels', payload)
  return r.data.data
}

/**
 * Update an existing land parcel
 * 
 * NOTE: If you update the geometry (geom), the area_m2, area_ha, perimeter_m,
 * centroid_y, and centroid_x will be automatically recalculated by the database trigger.
 */
export async function updateLandParcel(id: number, data: {
  stand?: string
  designation?: string
  geom?: any
  metadata?: Record<string, any>
  status?: 'draft' | 'finalized' | 'approved'
  owner?: string
  title_deed?: string
  survey_date?: string
  surveyor?: string
  notes?: string
}) {
  // Remove any area-related fields that might have been passed
  // These are auto-calculated by the database trigger when geom is updated
  const payload = { ...data }
  delete (payload as any).area_sqm
  delete (payload as any).area_m2
  delete (payload as any).area_ha
  delete (payload as any).perimeter_m
  delete (payload as any).centroid_y
  delete (payload as any).centroid_x
  
  const r = await api.put<{ ok: boolean; data: LandParcel }>(`/land-parcels/${id}`, payload)
  return r.data.data
}

export async function deleteLandParcel(id: number) {
  const r = await api.delete<{ ok: boolean }>(`/land-parcels/${id}`)
  return r.data
}

export async function finalizeLandParcels(parcelIds: number[]) {
  const r = await api.patch<{ ok: boolean; finalized: number; data: LandParcel[] }>(
    '/land-parcels/finalize',
    { parcel_ids: parcelIds }
  )
  return r.data.data
}

export async function updateLandParcelsProject(projectId: number) {
  const r = await api.post<{ ok: boolean; updated: number }>('/land-parcels/update-project', {
    project_id: projectId.toString() // Convert to string
  })
  return r.data
}

export async function calculateParcelAreas(projectId: number, recalculate: boolean = false) {
  const r = await api.post<{ 
    ok: boolean
    processed: number
    errorCount: number
    results: Array<{ stand: string; area?: number; success?: boolean; skipped?: boolean; reason?: string }>
    errors: Array<{ stand: string; error: string }>
  }>('/land-parcels/calculate-areas', {
    project_id: projectId.toString(), // Convert to string
    recalculate
  })
  return r.data
}

// ============================================================================
// PROJECT-SPECIFIC VIEWS FOR QGIS
// ============================================================================

export interface ProjectViewInfo {
  project_id: number
  project_name: string
  coordinate_view: string
  parcel_view: string
  status: string
}

export interface QGISConnectionInfo extends DBConnectionInfo {
  project_id?: number
  project_name?: string
  client_name?: string
  status?: 'ready' | 'not_created'
  views?: {
    coordinate_points: string
    land_parcels: string
    exist: boolean
  }
}

// Create project-specific views
export async function createProjectViews(projectId: number) {
  const r = await api.post<{ 
    ok: boolean
    message: string
    project_id: number
    project_name: string
    coordinate_view: string
    parcel_view: string
    status: string
  }>('/spatial/create-project-views', { project_id: projectId.toString() }) // Convert to string
  return r.data
}

// Drop project-specific views
export async function dropProjectViews(projectId: number) {
  const r = await api.delete<{ 
    ok: boolean
    message: string
    project_id: number
    coordinate_view: string
    parcel_view: string
    status: string
  }>(`/spatial/project-views/${projectId}`)
  return r.data
}

// List all project views
export async function listProjectViews() {
  const r = await api.get<{ 
    ok: boolean
    views: Array<{
      project_id: number
      coordinate_view: string
      parcel_view: string
    }>
  }>('/spatial/project-views')
  return r.data.views
}

// Get enhanced QGIS connection info with project-specific views
export async function getQGISConnectionInfo(projectId?: number): Promise<QGISConnectionInfo> {
  const params = projectId ? { project_id: projectId } : {}
  const r = await api.get<QGISConnectionInfo>('/spatial/db-connection', { params })
  return r.data
}
