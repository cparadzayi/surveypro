/**
 * Parcel Detection Service
 * 
 * Integrates automated parcel detection with the existing SurveyPro workflow.
 * Provides high-level API for detecting parcels from survey data.
 */

import { AutomatedParcelDetector, type DetectedParcel, type DetectionConfig } from '@/utils/automatedParcelDetector'
import { ParcelTrainingDataParser, type ParsedParcel } from '@/utils/parcelTrainingDataParser'
import type { AdjustedCoordinate } from '@/types/adjusted-coordinates'

export interface ParcelDetectionResult {
  parcels: DetectedParcel[]
  summary: {
    totalPoints: number
    parcelsDetected: number
    highConfidence: number  // confidence >= 0.9
    mediumConfidence: number  // 0.7 <= confidence < 0.9
    lowConfidence: number  // confidence < 0.7
    totalArea: number  // m²
    totalAreaFormatted: string
  }
  timestamp: Date
}

export class ParcelDetectionService {
  private detector: AutomatedParcelDetector
  private parser: ParcelTrainingDataParser
  
  constructor(config?: Partial<DetectionConfig>) {
    this.detector = new AutomatedParcelDetector(config)
    this.parser = new ParcelTrainingDataParser()
  }
  
  /**
   * Detect parcels from adjusted coordinates
   */
  async detectParcels(coordinates: AdjustedCoordinate[]): Promise<ParcelDetectionResult> {
    console.log('[ParcelDetectionService] 🚀 Starting parcel detection...')
    const startTime = Date.now()
    
    // Run detection
    const parcels = this.detector.detectParcels(coordinates)
    
    // Compute summary
    const summary = this.computeSummary(coordinates, parcels)
    
    const duration = Date.now() - startTime
    console.log(`[ParcelDetectionService] ✅ Detection complete in ${duration}ms`)
    console.log(`[ParcelDetectionService] 📊 Found ${parcels.length} parcels:`)
    console.log(`  - High confidence: ${summary.highConfidence}`)
    console.log(`  - Medium confidence: ${summary.mediumConfidence}`)
    console.log(`  - Low confidence: ${summary.lowConfidence}`)
    console.log(`  - Total area: ${summary.totalAreaFormatted}`)
    
    return {
      parcels,
      summary,
      timestamp: new Date()
    }
  }
  
  /**
   * Parse and validate training data
   */
  parseTrainingData(rawData: string): ParsedParcel[] {
    const parcels = this.parser.parse(rawData)
    this.parser.validateParcels(parcels)
    return parcels
  }
  
  /**
   * Compute detection summary statistics
   */
  private computeSummary(
    coordinates: AdjustedCoordinate[],
    parcels: DetectedParcel[]
  ): ParcelDetectionResult['summary'] {
    const highConfidence = parcels.filter(p => p.confidence >= 0.9).length
    const mediumConfidence = parcels.filter(p => p.confidence >= 0.7 && p.confidence < 0.9).length
    const lowConfidence = parcels.filter(p => p.confidence < 0.7).length
    
    const totalArea = parcels.reduce((sum, p) => sum + p.area, 0)
    const totalAreaFormatted = this.formatArea(totalArea)
    
    return {
      totalPoints: coordinates.length,
      parcelsDetected: parcels.length,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      totalArea,
      totalAreaFormatted
    }
  }
  
  /**
   * Format area according to cadastral standards
   */
  private formatArea(areaM2: number): string {
    if (areaM2 < 10000) {
      const rounded = Math.round(areaM2)
      return `${rounded} m²`
    } else {
      const areaHa = areaM2 / 10000
      const rounded = Math.round(areaHa * 10000) / 10000
      return `${rounded.toFixed(4)} ha`
    }
  }
  
  /**
   * Export parcels to format compatible with existing Areas system
   */
  exportForAreasSystem(parcels: DetectedParcel[]): Array<{
    designation: string
    points: string[]
    area: number
    areaFormatted: string
    confidence: number
  }> {
    return parcels.map(p => ({
      designation: p.designation,
      points: p.boundaryPoints,
      area: p.area,
      areaFormatted: p.areaFormatted,
      confidence: p.confidence
    }))
  }
  
  /**
   * Convert detected parcels to coordinate_points format for database
   */
  convertToCoordinatePoints(parcels: DetectedParcel[]): Array<{
    name: string
    y: number
    x: number
    description: string
  }> {
    const points: Array<{ name: string, y: number, x: number, description: string }> = []
    
    for (const parcel of parcels) {
      for (const coord of parcel.coordinates) {
        points.push({
          name: coord.pointId,
          y: coord.y,
          x: coord.x,
          description: `${parcel.designation} BOUNDARY`
        })
      }
    }
    
    return points
  }
  
  /**
   * Convert detected parcels to land_parcels format for database
   */
  convertToLandParcels(parcels: DetectedParcel[]): Array<{
    designation: string
    boundary_points: string[]
    area_m2: number
    perimeter_m: number
    confidence: number
    geometry: any  // GeoJSON polygon
  }> {
    return parcels.map(p => ({
      designation: p.designation,
      boundary_points: p.boundaryPoints,
      area_m2: p.area,
      perimeter_m: p.perimeter,
      confidence: p.confidence,
      geometry: this.createPolygonGeometry(p.coordinates)
    }))
  }
  
  /**
   * Create GeoJSON polygon geometry from coordinates
   */
  private createPolygonGeometry(coords: Array<{ pointId: string, y: number, x: number }>): any {
    // Close the polygon (first point = last point)
    const ring = [...coords, coords[0]].map(c => [c.x, c.y])
    
    return {
      type: 'Polygon',
      coordinates: [ring]
    }
  }
}

// Export singleton instance
export const parcelDetectionService = new ParcelDetectionService()
