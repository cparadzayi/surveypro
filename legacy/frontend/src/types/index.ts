// User types
export interface User {
  id: number
  email: string
  first_name: string
  last_name: string
  role: 'user' | 'admin' | 'viewer'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  password: string
  first_name: string
  last_name: string
}

// Project types
export interface Project {
  id: number
  name: string
  description?: string
  owner_id: number
  coordinate_system: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateProjectData {
  name: string
  description?: string
  coordinate_system?: string
}

// Survey point types
export interface SurveyPoint {
  id: number
  project_id: number
  point_number: string
  x: number
  y: number
  z?: number
  description?: string
  point_type: 'control' | 'traverse' | 'detail' | 'boundary'
  created_at: string
  updated_at: string
}

export interface CreateSurveyPointData {
  project_id: number
  point_number: string
  x: number
  y: number
  z?: number
  description?: string
  point_type?: 'control' | 'traverse' | 'detail' | 'boundary'
}

// CAD entity types
export interface CADEntity {
  id: number
  project_id: number
  entity_type: 'point' | 'line' | 'polyline' | 'polygon' | 'circle' | 'arc' | 'text'
  layer: string
  color: string
  properties: Record<string, any>
  created_at: string
  updated_at: string
}

// Computation types
export interface Computation {
  id: number
  project_id: number
  computation_type: 'traverse' | 'area' | 'volume' | 'distance' | 'bearing' | 'transformation' | 'intersection'
  input_data: Record<string, any>
  result_data: Record<string, any>
  created_by: number
  created_at: string
}

export interface Point {
  x: number
  y: number
}

export interface InverseComputationInput {
  project_id: number
  point1: Point
  point2: Point
}

export interface ForwardComputationInput {
  project_id: number
  start_point: Point
  distance: number
  bearing: number
}

export interface AreaComputationInput {
  project_id: number
  points: Point[]
}

export interface TraverseComputationInput {
  project_id: number
  courses: {
    bearing: number
    distance: number
  }[]
}

// Computation results
export interface InverseResult {
  distance: number
  bearing: number
}

export interface ForwardResult {
  x: number
  y: number
}

export interface AreaResult {
  area: number
  unit: string
}

export interface TraverseResult {
  northing_error: number
  easting_error: number
  misclosure: number
  precision: number
  perimeter: number
}
