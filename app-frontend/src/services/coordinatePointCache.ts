/**
 * Module-level cache for a project's coordinate points (used by
 * getCoordinatePointsForProject). Kept dependency-free so both the loader
 * (parcelMetadataComputer) and every mutation path (services/spatial,
 * services/csvImports) can share and invalidate it without an import cycle.
 */
const cachedCoordinatePoints = new Map<number, any[]>()

export function readCoordinatePointsCache(projectId: number): any[] | undefined {
  return cachedCoordinatePoints.get(projectId)
}

export function writeCoordinatePointsCache(projectId: number, points: any[]): void {
  cachedCoordinatePoints.set(projectId, points)
}

/** Clear everything — call after any coordinate-point mutation (create/rename/merge). */
export function clearCoordinatePointsCache(): void {
  cachedCoordinatePoints.clear()
}