/**
 * Control Point Map Utilities
 * Helper functions for map-based control point selection
 */

export interface ControlPoint {
  id: number
  monu_num: string
  type: string
  y: number // Y coordinate (Gauss-Conformal: Westing)
  x: number // X coordinate (Gauss-Conformal: Southing)
  lat_wgs84?: number // Latitude (WGS84, for map display)
  lng_wgs84?: number // Longitude (WGS84, for map display)
  description?: string
  central_meridian?: number
  distance?: number
}

export interface SurveyCenter {
  lat: number
  lng: number
}

/**
 * Calculate distance between two geographic coordinates using Haversine formula
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371 // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Calculate bearing from point 1 to point 2
 * @returns Bearing in degrees (0-360)
 */
export function calculateBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180)
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(dLng)
  const bearing = (Math.atan2(y, x) * 180) / Math.PI
  return (bearing + 360) % 360
}

/**
 * Auto-detect suggested central meridian based on longitude
 * Zimbabwe uses Lo 25, 27, 29, 31, 33
 */
export function detectCentralMeridian(lng: number): number | null {
  // Each meridian covers ±1° from central meridian
  if (lng >= 24 && lng < 26) return 25
  if (lng >= 26 && lng < 28) return 27
  if (lng >= 28 && lng < 30) return 29
  if (lng >= 30 && lng < 32) return 31
  if (lng >= 32 && lng < 34) return 33

  // Default to nearest
  const meridians = [25, 27, 29, 31, 33]
  return meridians.reduce((prev, curr) =>
    Math.abs(curr - lng) < Math.abs(prev - lng) ? curr : prev
  )
}

/**
 * Generate smart recommendations for control point selection
 */
export function generateRecommendations(
  points: ControlPoint[],
  surveyCenter: SurveyCenter,
  favorites: Set<number>,
  maxRecommendations: number = 5
): Array<{ point: ControlPoint; distance: number; reason: string }> {
  if (!surveyCenter || points.length === 0) return []

  // Calculate distances using WGS84 coordinates if available
  const pointsWithDistance = points.map((p) => ({
    ...p,
    distance: calculateDistance(
      surveyCenter.lat,
      surveyCenter.lng,
      p.lat_wgs84 || p.y,
      p.lng_wgs84 || p.x
    ),
  }))

  const sorted = pointsWithDistance.sort((a, b) => a.distance - b.distance)
  const recs: Array<{ point: ControlPoint; distance: number; reason: string }> = []

  // 1. Nearest point
  if (sorted[0]) {
    recs.push({
      point: sorted[0],
      distance: sorted[0].distance,
      reason: 'Nearest point',
    })
  }

  // 2. Points in different directions for triangulation
  const directions = ['N', 'E', 'S', 'W']
  const directionPoints = directions
    .map((dir) => {
      return sorted.find((p) => {
        const bearing = calculateBearing(
          surveyCenter.lat,
          surveyCenter.lng,
          p.lat_wgs84 || p.y,
          p.lng_wgs84 || p.x
        )
        switch (dir) {
          case 'N':
            return bearing >= 315 || bearing < 45
          case 'E':
            return bearing >= 45 && bearing < 135
          case 'S':
            return bearing >= 135 && bearing < 225
          case 'W':
            return bearing >= 225 && bearing < 315
          default:
            return false
        }
      })
    })
    .filter(Boolean) as ControlPoint[]

  directionPoints.forEach((p) => {
    if (p && !recs.find((r) => r.point.id === p.id)) {
      recs.push({
        point: p,
        distance: p.distance!,
        reason: 'Good coverage',
      })
    }
  })

  // 3. Favorites that are nearby (< 20km)
  const nearbyFavorites = sorted
    .filter((p) => favorites.has(p.id) && p.distance < 20)
    .slice(0, 2)

  nearbyFavorites.forEach((p) => {
    if (!recs.find((r) => r.point.id === p.id)) {
      recs.push({
        point: p,
        distance: p.distance,
        reason: 'Favorite & nearby',
      })
    }
  })

  return recs.slice(0, maxRecommendations)
}

/**
 * Load favorites from localStorage
 */
export function loadFavorites(projectId?: number): Set<number> {
  try {
    const key = projectId
      ? `control-point-favorites-${projectId}`
      : 'control-point-favorites'
    const stored = localStorage.getItem(key)
    if (stored) {
      return new Set(JSON.parse(stored))
    }
  } catch (error) {
    console.error('Failed to load favorites:', error)
  }
  return new Set()
}

/**
 * Save favorites to localStorage
 */
export function saveFavorites(favorites: Set<number>, projectId?: number): void {
  try {
    const key = projectId
      ? `control-point-favorites-${projectId}`
      : 'control-point-favorites'
    localStorage.setItem(key, JSON.stringify([...favorites]))
  } catch (error) {
    console.error('Failed to save favorites:', error)
  }
}

/**
 * Load recently used points from localStorage
 */
export function loadRecentlyUsed(projectId?: number): number[] {
  try {
    const key = projectId
      ? `control-point-recent-${projectId}`
      : 'control-point-recent'
    const stored = localStorage.getItem(key)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error('Failed to load recently used:', error)
  }
  return []
}

/**
 * Save recently used points to localStorage
 */
export function saveRecentlyUsed(recentlyUsed: number[], projectId?: number): void {
  try {
    const key = projectId
      ? `control-point-recent-${projectId}`
      : 'control-point-recent'
    localStorage.setItem(key, JSON.stringify(recentlyUsed))
  } catch (error) {
    console.error('Failed to save recently used:', error)
  }
}

/**
 * Add point to recently used list (max 20 items)
 */
export function addToRecentlyUsed(
  id: number,
  recentlyUsed: number[]
): number[] {
  const updated = [...recentlyUsed]
  const index = updated.indexOf(id)
  if (index > -1) {
    updated.splice(index, 1)
  }
  updated.unshift(id)
  return updated.slice(0, 20)
}
