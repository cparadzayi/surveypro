/**
 * Shared Duplicate Point Analysis Utility
 * 
 * Provides centralized logic for finding and analyzing duplicate survey points.
 * Used by multiple PDF generators to ensure consistent duplicate detection.
 * 
 * @module duplicatePointAnalysis
 */

export interface SurveyPoint {
  pointId: string
  y: number
  x: number
  status?: string
  description?: string
  observationIndex?: number
  [key: string]: any
}

export interface DuplicateAnalysis {
  pointId: string
  observations: SurveyPoint[]
  meanY: number
  meanX: number
  residualsY: number[]
  residualsX: number[]
  maxResidualY: number
  maxResidualX: number
  tolerance: number
  withinTolerance: boolean
  fieldBookPages: number[]
}

/**
 * Find all points with duplicate observations
 * 
 * @param surveyPoints - Array of survey points to analyze
 * @returns Array of duplicate analyses, sorted by point ID
 */
export function findDuplicatePoints(surveyPoints: SurveyPoint[]): DuplicateAnalysis[] {
  const pointGroups = new Map<string, SurveyPoint[]>()
  
  // Group points by point ID
  surveyPoints.forEach((point, index) => {
    const observations = pointGroups.get(point.pointId) || []
    observations.push({
      ...point,
      observationIndex: index + 1
    })
    pointGroups.set(point.pointId, observations)
  })
  
  // Find points with multiple observations
  const duplicateAnalyses: DuplicateAnalysis[] = []
  
  pointGroups.forEach((observations, pointId) => {
    if (observations.length > 1) {
      const analysis = analyzeDuplicatePoint(pointId, observations)
      duplicateAnalyses.push(analysis)
    }
  })
  
  return duplicateAnalyses.sort((a, b) => a.pointId.localeCompare(b.pointId))
}

/**
 * Analyze a single duplicate point's observations
 * 
 * @param pointId - The point identifier
 * @param observations - Array of observations for this point
 * @returns Detailed analysis including mean coordinates and residuals
 */
export function analyzeDuplicatePoint(pointId: string, observations: SurveyPoint[]): DuplicateAnalysis {
  // Calculate mean coordinates
  const meanY = observations.reduce((sum, obs) => sum + obs.y, 0) / observations.length
  const meanX = observations.reduce((sum, obs) => sum + obs.x, 0) / observations.length
  
  // Calculate residuals
  const residualsY = observations.map(obs => obs.y - meanY)
  const residualsX = observations.map(obs => obs.x - meanX)
  
  // Find maximum residuals
  const maxResidualY = Math.max(...residualsY.map(Math.abs))
  const maxResidualX = Math.max(...residualsX.map(Math.abs))
  
  // Determine tolerance based on point type
  const tolerance = getToleranceForPoint(observations[0])
  const withinTolerance = maxResidualY <= tolerance && maxResidualX <= tolerance
  
  // Calculate field book pages (simplified - actual page mapping should be provided)
  const fieldBookPages = observations.map((_, index) => Math.floor(index / 35) + 1)
  
  return {
    pointId,
    observations,
    meanY,
    meanX,
    residualsY,
    residualsX,
    maxResidualY,
    maxResidualX,
    tolerance,
    withinTolerance,
    fieldBookPages
  }
}

/**
 * Get tolerance threshold based on point type
 * 
 * @param point - Survey point to check
 * @returns Tolerance in meters
 */
export function getToleranceForPoint(point: SurveyPoint): number {
  const status = (point.status || '').toUpperCase()
  const description = (point.description || '').toUpperCase()
  
  // TRIG beacons (national control) - strictest tolerance
  if (status.includes('TRIG') || description.includes('TRIG')) {
    return 0.01 // 10mm
  }
  
  // FOUND beacons (existing survey marks) - strict tolerance
  if (status === 'FOUND' || status === 'F') {
    return 0.02 // 20mm
  }
  
  // PLACED beacons (new survey marks) - standard tolerance
  if (status === 'PLACED' || status === 'P') {
    return 0.03 // 30mm
  }
  
  // PEG or working stations - relaxed tolerance
  if (status === 'PEG' || status === 'WORKING') {
    return 0.05 // 50mm
  }
  
  // Default tolerance
  return 0.03 // 30mm
}

/**
 * Calculate adjusted coordinate from duplicate observations
 * Uses mean of all observations
 * 
 * @param analysis - Duplicate analysis result
 * @returns Adjusted Y and X coordinates
 */
export function calculateAdjustedCoordinate(analysis: DuplicateAnalysis): { y: number; x: number } {
  return {
    y: analysis.meanY,
    x: analysis.meanX
  }
}

/**
 * Check if duplicate observations are within acceptable tolerance
 * 
 * @param analysis - Duplicate analysis result
 * @returns True if all residuals are within tolerance
 */
export function isWithinTolerance(analysis: DuplicateAnalysis): boolean {
  return analysis.withinTolerance
}
