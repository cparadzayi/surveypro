/**
 * Survey Plan Preview Service
 * API calls for MapLibre visualization
 */

import api from './api'

export interface PreviewData {
  project: {
    id: number
  }
  coordinatePoints: Array<{
    name: string
    x: number
    y: number
    type?: string
  }>
  parcels: Array<{
    stand: string
    area_m2: number
    areaFormatted: string
    vertices: Array<{
      name: string
      x: number
      y: number
    }>
    geometry: any
  }>
  analysis: {
    extent: {
      minX: number
      maxX: number
      minY: number
      maxY: number
      width: number
      height: number
      area: number
      center: { x: number; y: number }
    }
    density: {
      totalPoints: number
      pointsPerHectare: number
      averageSpacing: number
      category: string
      description: string
    }
    parcels: {
      count: number
      totalArea: number
      averageArea: number
      medianArea: number
      smallestParcel: number
      largestParcel: number
    } | null
    summary: string
  }
  scale: {
    value: number
    label: string
  }
  sheetSize: string
  layout: {
    sheet: { width: number; height: number; name: string; code: string }
    margins: { left: number; right: number; top: number; bottom: number }
    drawingArea: { x: number; y: number; width: number; height: number }
    titleBlock: { x: number; y: number; width: number; height: number }
    beaconDescriptions: { x: number; y: number; width: number; height: number }
    scaleBar: { x: number; y: number; width: number; height: number }
    scheduleOfAreas: { x: number; y: number; width: number; height: number }
    northArrow: { x: number; y: number; size: number }
    keyPlanInset: { x: number; y: number; width: number; height: number }
  }
  topology: {
    beacons: Array<{
      name: string
      x: number
      y: number
      parcels: string[]
      shared: boolean
      type?: string
    }>
    adjacency: Array<{
      stand: string
      neighbors: string[]
    }>
    summary: {
      totalBeacons: number
      sharedBeacons: number
      uniqueBeacons: number
      totalParcels: number
      totalAdjacencies: number
      averageAdjacenciesPerParcel: number
    }
  }
  labels: Array<{
    x: number
    y: number
    text: string
    parcel: string
    fontSize: number
    strategy: string
    rotation: number
    hasCollision: boolean
    bounds: {
      minX: number
      maxX: number
      minY: number
      maxY: number
    }
    area: number
    metadata: {
      centroid: { x: number; y: number }
      centroidInside: boolean
      width: number
      height: number
    }
  }>
  metadata: {
    totalPoints: number
    totalParcels: number
    sharedBeacons: number
    labelCollisions: number
    generatedAt: string
    sheetNumber?: number
    hasMultipleSheets?: boolean
  }
}

export interface ScaleRecommendation {
  recommended: {
    value: number
    label: string
  }
  alternatives: Array<{
    value: number
    label: string
  }>
  reasoning: string
  requiresMultiSheet: boolean
}

/**
 * Get survey plan preview data
 */
export async function getSurveyPlanPreview(
  projectId: number,
  options?: {
    scale?: number
    sheetSize?: string
    areaType?: 'urban' | 'peri-urban' | 'rural'
    /** SI 727 Reg 32(3): 'general-developed' enforces 1:500 maximum scale denominator */
    planType?: 'general-developed' | 'general-undeveloped' | 'diagram' | 'working-plan'
  }
): Promise<PreviewData> {
  const params = new URLSearchParams()
  if (options?.scale) params.append('scale', options.scale.toString())
  if (options?.sheetSize) params.append('sheetSize', options.sheetSize)
  if (options?.areaType) params.append('areaType', options.areaType)
  if (options?.planType) params.append('planType', options.planType)
  
  const queryString = params.toString()
  const url = `/survey-plan/preview/${projectId}${queryString ? `?${queryString}` : ''}`
  
  const response = await api.get(url)
  return response.data
}

/**
 * Get available scales for a project
 */
export async function getAvailableScales(
  projectId: number,
  areaType?: 'urban' | 'peri-urban' | 'rural'
): Promise<ScaleRecommendation> {
  const params = new URLSearchParams()
  if (areaType) params.append('areaType', areaType)
  
  const queryString = params.toString()
  const url = `/survey-plan/scales/${projectId}${queryString ? `?${queryString}` : ''}`
  
  const response = await api.get(url)
  return response.data
}
