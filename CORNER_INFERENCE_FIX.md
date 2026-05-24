# Corner Inference Implementation Fix

## Problem
The `automatedParcelDetector.ts` file got corrupted during edit at lines 900-934.

## Corruption Details
- Line 900: `extractDesignation` method missing return statement and closing brace
- Lines 901-902: Premature class closing
- Lines 903-933: Orphaned code fragments from `findSharedBoundaryPoints` and `processCluster`
- Line 934: Orphaned closing brace

## Fix Strategy
1. Add missing `return null` to `extractDesignation` method (line 900)
2. Remove premature class closing (lines 901-902)
3. Remove orphaned code (lines 903-933)
4. Keep proper method structure intact

## Implementation Plan
The corner inference feature needs to be added to `topologicalParcelReconstruction` method around line 465.

### New Method to Add: `inferMissingCorners`
```typescript
/**
 * Infer missing corners for 2-corner parcels (A+C pattern)
 * 
 * When only opposite corners A and C are present, intelligently search for
 * missing corners B and D by looking at adjacent stands.
 */
private inferMissingCorners(
  standNum: number,
  existingCorners: AdjustedCoordinate[],
  allPoints: AdjustedCoordinate[]
): AdjustedCoordinate[] {
  if (existingCorners.length !== 2) return []
  
  // Extract corner letters
  const cornerLetters = new Set<string>()
  for (const point of existingCorners) {
    const match = point.pointId.match(/([A-F])$/i)
    if (match) cornerLetters.add(match[1].toUpperCase())
  }
  
  // Check for A+C pattern
  if (!cornerLetters.has('A') || !cornerLetters.has('C')) return []
  
  // Search for B and D
  const missingCorners = ['B', 'D']
  const inferredCorners: AdjustedCoordinate[] = []
  const adjacentStands = [
    standNum - 4, standNum - 3, standNum - 2, standNum - 1,
    standNum + 1, standNum + 2, standNum + 3, standNum + 4
  ]
  
  for (const corner of missingCorners) {
    let best: AdjustedCoordinate | null = null
    let bestDist = Infinity
    
    for (const point of allPoints) {
      if (existingCorners.some(c => c.pointId === point.pointId)) continue
      
      const match = point.pointId.match(/([A-F])$/i)
      if (!match || match[1].toUpperCase() !== corner) continue
      
      const otherStand = this.extractStandNumber(point.pointId)
      if (!otherStand || !adjacentStands.includes(otherStand)) continue
      
      const minDist = Math.min(
        ...existingCorners.map(c => this.distance(c, point))
      )
      
      if (minDist <= 30 && minDist < bestDist) {
        best = point
        bestDist = minDist
      }
    }
    
    if (best) inferredCorners.push(best)
  }
  
  // Only return if we found both B and D
  return inferredCorners.length === 2 ? inferredCorners : []
}
```

### Integration Point (in `topologicalParcelReconstruction`)
```typescript
// After line 463: let allBoundaryPoints = [...ownPoints, ...sharedPoints]

// INTELLIGENT CORNER INFERENCE
if (allBoundaryPoints.length === 2) {
  const inferred = this.inferMissingCorners(standNum, allBoundaryPoints, points)
  if (inferred.length > 0) {
    allBoundaryPoints = [...allBoundaryPoints, ...inferred]
    inferredCount++
    if (inferredCount <= 10) {
      console.log(`[Topology] 🔍 STAND ${standNum}: Inferred ${inferred.length} corners (${inferred.map(c => c.pointId).join(', ')})`)
    }
    // Mark as inferred
    for (const corner of inferred) {
      (corner as any).__inferred = true
    }
  }
}
```

### Update Summary Logging
Change line 494 from:
```typescript
console.log(`[Topology] 📊 Summary: ${validCount} valid parcels, ${insufficientCount} insufficient (${standPoints.size} total stands)`)
```

To:
```typescript
console.log(`[Topology] 📊 Summary: ${validCount} valid, ${insufficientCount} insufficient, ${inferredCount} with inferred corners (${standPoints.size} total)`)
```

### Add Warning in `processCluster`
After line 920 (closure gap validation):
```typescript
// Check for inferred corners
const inferredCorners = orderedPoints.filter(p => (p as any).__inferred)
if (inferredCorners.length > 0) {
  warnings.push(`${inferredCorners.length} corner(s) inferred from adjacent stands: ${inferredCorners.map(c => c.pointId).join(', ')}`)
}
```
