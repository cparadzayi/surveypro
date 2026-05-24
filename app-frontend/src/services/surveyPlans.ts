/**
 * Survey Plans Service
 * API calls for generating General Plans, Diagrams, and Working Plans
 */

import api from './api'

export interface GeneralPlanRequest {
  project_id: number
  plan_type: 'developed' | 'undeveloped'
  scale?: string
  surveyor_name?: string
  license_number?: string
  survey_date?: string
  notes?: string[]
  sheet_number?: string
}

export interface PlanPreviewData {
  project: {
    id: number
    name: string
    location?: string
    surveyor?: string
  }
  parcel_count: number
  coordinate_point_count: number
  total_area_ha: string
  total_area_m2: string
  parcels: Array<{
    id: number
    stand: string
    area_ha: number
    area_m2: number
  }>
}

/**
 * Generate a General Plan PDF
 */
export async function generateGeneralPlan(data: GeneralPlanRequest): Promise<Blob> {
  const response = await api.post('/survey-plans/general-plan', data, {
    responseType: 'blob'
  })
  return response.data
}

/**
 * Get preview data for a survey plan
 */
export async function getPreviewData(projectId: number): Promise<PlanPreviewData> {
  const response = await api.get('/survey-plans/preview', {
    params: { project_id: projectId }
  })
  return response.data.data
}

/**
 * Generate a Diagram (not yet implemented)
 */
export async function generateDiagram(data: any): Promise<Blob> {
  const response = await api.post('/survey-plans/diagram', data, {
    responseType: 'blob'
  })
  return response.data
}

/**
 * Generate a Working Plan (not yet implemented)
 */
export async function generateWorkingPlan(data: any): Promise<Blob> {
  const response = await api.post('/survey-plans/working-plan', data, {
    responseType: 'blob'
  })
  return response.data
}
