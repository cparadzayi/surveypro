import api from './api'

export interface PolarRequest {
  y: number; // westing (+west)
  x: number; // southing (+south)
  distance: number;
  bearingDeg: number; // south-oriented (0=S)
  save?: boolean;
  layer_id?: number;
  properties?: Record<string, any>;
}

export interface PolarResponse {
  ok: boolean;
  point?: { y: number; x: number };
  saved?: any;
  error?: string;
}

export function computePolar(payload: PolarRequest) {
  return api.post<PolarResponse>('/compute/polar', payload).then(r => r.data)
}

export interface BBIntersectionRequest {
  p1: { y: number; x: number; bearingDeg: number };
  p2: { y: number; x: number; bearingDeg: number };
  save?: boolean;
  layer_id?: number;
  properties?: Record<string, any>;
}

export interface BBIntersectionResponse {
  ok: boolean;
  point?: { y: number; x: number };
  saved?: any;
  error?: string;
}

export function computeIntersectionBB(payload: BBIntersectionRequest) {
  return api.post<BBIntersectionResponse>('/compute/intersections/bearing-bearing', payload).then(r => r.data)
}

export interface AreaComputeRequest {
  points: Array<{ y: number; x: number }>
  hectaresThreshold?: number
  roundMetersDecimals?: number
  roundHectaresDecimals?: number
  includeResiduals?: boolean
  save?: boolean
  layer_id?: number
  properties?: Record<string, any>
}

export interface AreaComputeResponse {
  ok: boolean
  area: {
    signed_m2: number
    abs_m2: number
    meters_rounded: number
    hectares_rounded: number
    display: { hectares: number; unit: 'ha' } | { square_meters: number; unit: 'm2' }
  }
  centroid: { y: number; x: number }
  residuals?: {
    sumDy: number
    sumDx: number
    closureError: number
    closureErrorFormatted: string
    edges: Array<{ 
      index: number
      from: { y: number; x: number }
      to: { y: number; x: number }
      dy: number
      dx: number
      distance: number
      distanceRounded: number
      bearingDeg: number
      bearingRoundedDeg: number
      directionDMS: string
      secondsResolution: number
    }>
  }
  closure?: {
    perimeter: number
    error: number
    ratio: number
    ratioFormatted: string
  }
  saved?: any
  error?: string
}

export function areaCompute(payload: AreaComputeRequest) {
  return api.post<AreaComputeResponse>('/compute/area', payload).then(r => r.data)
}

export interface BatchAreaComputeRequest {
  polygon_layer_id: number
  coordinate_layer_id: number
  hectaresThreshold?: number
  roundMetersDecimals?: number
  roundHectaresDecimals?: number
  tolerance?: number
  save_results?: boolean
}

export interface BatchAreaComputeResult {
  polygon_id: number
  designation: string
  success: boolean
  error?: string
  vertex_names?: string[]
  area?: {
    signed_m2: number
    abs_m2: number
    display: { hectares: number; unit: 'ha' } | { square_meters: number; unit: 'm2' }
  }
  centroid?: { y: number; x: number }
  closure_error_m?: number
  residuals?: { sumDy: number; sumDx: number }
  unmatched_vertices?: Array<{ y: number; x: number; index: number }>
  matched_count?: number
  total_vertices?: number
}

export interface BatchAreaComputeResponse {
  ok: boolean
  total_polygons: number
  success_count: number
  failure_count: number
  results: BatchAreaComputeResult[]
  error?: string
}

export function batchAreaCompute(payload: BatchAreaComputeRequest) {
  return api.post<BatchAreaComputeResponse>('/compute/area/batch', payload).then(r => r.data)
}

// ============================================================================
// BATCH AREA COMPUTATION V2 (Normalized Tables)
// ============================================================================

export interface BatchAreaComputeV2Request {
  project_id: number
  hectaresThreshold?: number
  roundMetersDecimals?: number
  roundHectaresDecimals?: number
  tolerance?: number
  save_results?: boolean
}

export interface BatchAreaComputeV2Result {
  polygon_id: number
  designation: string
  success: boolean
  error?: string
  vertex_names?: string[]
  area?: {
    m2: number
    ha: number
    display: number
    unit: string
  }
  centroid?: { y: number; x: number }
  closure_error_m?: number
  vertex_count?: number
  unmatched_vertices?: Array<{ y: number; x: number; index: number }>
  matched_count?: number
  total_vertices?: number
}

export interface BatchAreaComputeV2Response {
  ok: boolean
  total_polygons: number
  success_count: number
  failure_count: number
  results: BatchAreaComputeV2Result[]
  error?: string
}

export function batchAreaComputeV2(payload: BatchAreaComputeV2Request) {
  return api.post<BatchAreaComputeV2Response>('/compute/area/batch/v2', payload).then(r => r.data)
}
