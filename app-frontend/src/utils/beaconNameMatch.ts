export function isGenericFallbackName(name: string): boolean {
  if (!name) return true
  const genericPatterns = [
    /^PEGGING[A-Z]$/, /^[A-Z]+[A-Z]$/, /^P\d+$/, /^[A-Z]$/, /^POINT\d+$/, /^BEACON\d+$/,
  ]
  return genericPatterns.some((p) => p.test(name))
}

/** Nearest coordinate-point name within tolerance (2 m; 10 m for a generic fallback). y=Westing, x=Southing. */
export function findBeaconNameBySpatialMatch(
  y: number, x: number, coordinatePoints: any[], isGenericFallback = false,
): string | null {
  const tolerance = 2.0
  let closestMatch: string | null = null
  let closestDist = Infinity
  for (const cp of coordinatePoints || []) {
    const cpY = Number(cp.y), cpX = Number(cp.x)
    const dist = Math.sqrt((cpY - y) ** 2 + (cpX - x) ** 2)
    if (dist < closestDist) { closestDist = dist; closestMatch = cp.name }
    if (dist < tolerance) return cp.name
  }
  if (isGenericFallback && closestMatch && closestDist < tolerance * 5) return closestMatch
  return null
}

/** Resolve a point's beacon name: its own id/name, else a spatial match, else null. */
export function resolveBeaconNameForPoint(point: any, coordinatePoints: any[]): string | null {
  const own = point?.id || point?.name || null
  if (own && !isGenericFallbackName(own)) return own
  if (coordinatePoints?.length && point?.y != null && point?.x != null) {
    const matched = findBeaconNameBySpatialMatch(point.y, point.x, coordinatePoints, true)
    if (matched) return matched
  }
  return own || null
}
