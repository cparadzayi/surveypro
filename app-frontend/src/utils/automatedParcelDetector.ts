/**
 * Automated Parcel Detector
 * 
 * Uses rule-based algorithms and pattern matching to automatically
 * identify land parcels from survey point data.
 * 
 * Algorithm:
 * 1. Cluster points by designation prefix (STAND/LOT/PLOT/FARM number)
 * 2. Order points around perimeter using spatial sorting
 * 3. Validate polygon closure and topology
 * 4. Compute area and consistency metrics
 * 
 * COORDINATE SYSTEM:
 * - Uses Gauss coordinates (Cape Lo 31 projected coordinates)
 * - y = Northing (meters), x = Easting (meters)
 * - NOT WGS84 lat/lon - ensures accurate metric calculations
 * - All distances in meters, areas in square meters (m²)
 */

import type { AdjustedCoordinate } from '@/types/adjusted-coordinates'

export interface DetectedParcel {
  designation: string
  designationType: 'STAND' | 'LOT' | 'PLOT' | 'FARM' | 'UNKNOWN'
  designationNumber: string
  boundaryPoints: string[]  // Point IDs in order
  coordinates: { pointId: string, y: number, x: number }[]
  area: number  // Square meters
  areaFormatted: string  // "319 m²" or "1.2345 ha"
  perimeter: number
  centroid: { y: number, x: number }
  confidence: number  // 0-1 score
  warnings: string[]
}

export interface DetectionConfig {
  minPoints: number  // Minimum points to form a parcel (default: 3)
  maxClosureGap: number  // Maximum gap between first/last point (default: 1.0m)
  minArea: number  // Minimum valid parcel area (default: 50 m²)
  maxArea: number  // Maximum valid parcel area (default: 1,000,000 m²)
  confidenceThreshold: number  // Minimum confidence to accept (default: 0.7)
}

export class AutomatedParcelDetector {
  private config: DetectionConfig
  
  constructor(config?: Partial<DetectionConfig>) {
    this.config = {
      minPoints: 2,  // Allow 2-point clusters for incomplete data
      maxClosureGap: config?.maxClosureGap ?? 1.0,
      minArea: config?.minArea ?? 100,  // Minimum 100 m² - discard smaller parcels
      maxArea: config?.maxArea ?? 1_000_000,
      confidenceThreshold: config?.confidenceThreshold ?? 0.5,  // Lowered from 0.6 to 0.5
      ...config
    }
  }
  
  /**
   * Detect parcels from survey points
   */
  detectParcels(points: AdjustedCoordinate[]): DetectedParcel[] {
    console.log(`[ParcelDetector] 🔍 Starting detection on ${points.length} points...`)
    
    // Step 1: Cluster by the designation named in each point's description
    // ("STAND 1439 CORNER" -> "STAND 1439"). This is the primary strategy: where a
    // surveyor has stated which parcel a beacon belongs to, that statement is
    // authoritative -- a beacon ID such as 1438A names the NEIGHBOURING stand it is
    // shared with, so it cannot be trusted over an explicit description.
    const designationParcels = this.clusterByDesignation(points)
    console.log(`[ParcelDetector] 🏷️ Designation clustering found ${designationParcels.size} parcels`)

    // Step 2: Topological reconstruction covers the points no description named. It runs
    // over the FULL point set, not just the leftovers, because it reasons about shared
    // corners and nearest neighbours and would lose that context on a subset; clusters it
    // builds from already-designated points are discarded when merging below.
    const topologicalParcels = this.topologicalParcelReconstruction(points)
    console.log(`[ParcelDetector] 🗺️ Topological reconstruction found ${topologicalParcels.size} parcels`)

    // Step 3: Detect road reserves and linear features
    const roadReserves = this.detectRoadReserves(points)
    console.log(`[ParcelDetector] 🛣️ Road reserve detection found ${roadReserves.size} linear features`)

    // Merge the two, by UNION rather than replacement. A description does not describe a
    // whole parcel -- it speaks for the one beacon it is attached to -- so a stated
    // designation must ADD that beacon to its parcel, not shrink the parcel down to only
    // the beacons that happened to be described. (Replacing here left a stand with the
    // single described point and no polygon at all.)
    const mergedClusters = new Map<string, AdjustedCoordinate[]>()
    for (const [designation, clusterPoints] of topologicalParcels) {
      mergedClusters.set(designation, [...clusterPoints])
    }
    for (const [designation, clusterPoints] of designationParcels) {
      const list = mergedClusters.get(designation) ?? []
      for (const point of clusterPoints) {
        if (!list.some(q => q.pointId === point.pointId)) list.push(point)
      }
      mergedClusters.set(designation, list)
    }

    // Where a description DID name a parcel, that beacon belongs to that parcel and to no
    // other -- so drop it from any cluster topology guessed it into. Clusters emptied this
    // way simply fail the 3-point minimum in processCluster and yield no parcel.
    const statedOwner = new Map<string, string>()
    for (const [designation, clusterPoints] of designationParcels) {
      for (const point of clusterPoints) statedOwner.set(point.pointId, designation)
    }
    if (statedOwner.size > 0) {
      for (const [designation, clusterPoints] of mergedClusters) {
        mergedClusters.set(designation, clusterPoints.filter(
          p => (statedOwner.get(p.pointId) ?? designation) === designation))
      }
      console.log(`[ParcelDetector] 🏷️ ${statedOwner.size} point(s) assigned by explicit description`)
    }

    const validClusters = new Map<string, AdjustedCoordinate[]>([
      ...mergedClusters,
      ...roadReserves
    ])
    
    console.log(`[ParcelDetector] ✅ ${validClusters.size} valid parcels from topology + road reserves`)
    
    // Track which points have been assigned to valid clusters
    const assignedPoints = new Set<string>()
    for (const clusterPoints of validClusters.values()) {
      for (const point of clusterPoints) {
        assignedPoints.add(point.pointId)
      }
    }
    
    // Step 3: Find ungrouped points for spatial clustering fallback
    const ungroupedPoints = points.filter(p => !assignedPoints.has(p.pointId))
    console.log(`[ParcelDetector] 🔍 Found ${ungroupedPoints.length} ungrouped points, applying spatial clustering...`)
    
    // Step 4: Apply spatial proximity clustering to ungrouped points
    if (ungroupedPoints.length >= this.config.minPoints) {
      // Compute adaptive distance threshold based on point spacing
      const adaptiveDistance = this.computeAdaptiveDistance(ungroupedPoints)
      console.log(`[ParcelDetector] 📏 Using adaptive distance threshold: ${adaptiveDistance.toFixed(1)}m`)
      
      const spatialClusters = this.spatialProximityClustering(ungroupedPoints, adaptiveDistance)
      console.log(`[ParcelDetector] 📍 Spatial clustering found ${spatialClusters.length} additional clusters`)
      
      // Add spatial clusters with synthetic designations
      let syntheticId = 1
      for (const spatialCluster of spatialClusters) {
        const designation = `PARCEL-${syntheticId.toString().padStart(3, '0')}`
        validClusters.set(designation, spatialCluster)
        syntheticId++
      }
    }
    
    // Step 5: Process all clusters
    const parcels: DetectedParcel[] = []
    let lowConfidenceCount = 0
    let tooSmallCount = 0
    
    for (const [designation, clusterPoints] of validClusters) {
      try {
        const parcel = this.processCluster(designation, clusterPoints)
        if (parcel && parcel.confidence >= this.config.confidenceThreshold) {
          parcels.push(parcel)
        } else if (parcel) {
          // Check if it's too small (area < 100 m²)
          if (parcel.area < this.config.minArea) {
            tooSmallCount++
            if (tooSmallCount <= 5) {
              console.warn(`[ParcelDetector] 🚫 Discarded ${designation}: Too small (${parcel.areaFormatted}, < 100 m²)`)
            }
          } else {
            lowConfidenceCount++
            if (lowConfidenceCount <= 5) {  // Log first 5 low confidence parcels
              console.warn(`[ParcelDetector] ⚠️ Low confidence for ${designation}: ${(parcel.confidence * 100).toFixed(0)}% (${clusterPoints.length} points, ${parcel.areaFormatted})`)
            }
          }
        }
      } catch (error) {
        console.error(`[ParcelDetector] ❌ Error processing ${designation}:`, error)
      }
    }
    
    if (tooSmallCount > 5) {
      console.warn(`[ParcelDetector] 🚫 ... and ${tooSmallCount - 5} more parcels discarded (too small)`)
    }
    if (lowConfidenceCount > 5) {
      console.warn(`[ParcelDetector] ⚠️ ... and ${lowConfidenceCount - 5} more low confidence parcels`)
    }
    
    console.log(`[ParcelDetector] ✅ Detected ${parcels.length} valid parcels (${tooSmallCount} discarded < 100 m²)`)
    return parcels
  }
  
  /**
   * Compute adaptive distance threshold based on point spacing
   * 
   * Density-based tiers:
   * - High density (median < 15m): Use 30m threshold for urban areas
   * - Medium density (15-40m): Use 1.8x median
   * - Low density (> 40m): Use 1.8x median, capped at 150m
   */
  private computeAdaptiveDistance(points: AdjustedCoordinate[]): number {
    if (points.length < 2) return 50  // Default fallback
    
    // Sample distances between nearby points
    const sampleSize = Math.min(50, points.length)
    const distances: number[] = []
    
    for (let i = 0; i < sampleSize; i++) {
      const point = points[i]
      let minDist = Infinity
      
      // Find nearest neighbor
      for (let j = 0; j < points.length; j++) {
        if (i === j) continue
        const dist = this.distance(point, points[j])
        if (dist < minDist) {
          minDist = dist
        }
      }
      
      if (minDist !== Infinity) {
        distances.push(minDist)
      }
    }
    
    if (distances.length === 0) return 50
    
    // Use median of nearest neighbor distances
    distances.sort((a, b) => a - b)
    const medianIndex = Math.floor(distances.length / 2)
    const medianDistance = distances[medianIndex]
    const p75Index = Math.floor(distances.length * 0.75)
    const p75Distance = distances[p75Index]
    
    // Density-based threshold calculation
    let adaptiveDistance: number
    let densityTier: string
    
    if (medianDistance < 15) {
      // HIGH DENSITY: Urban subdivisions with tight spacing
      // Use fixed 30m threshold to capture all corners
      adaptiveDistance = 30
      densityTier = 'HIGH (urban)'
    } else if (medianDistance < 40) {
      // MEDIUM DENSITY: Suburban areas
      // Use 1.8x multiplier with 30m minimum
      adaptiveDistance = Math.max(30, Math.min(150, medianDistance * 1.8))
      densityTier = 'MEDIUM (suburban)'
    } else {
      // LOW DENSITY: Rural/farm areas
      // Use 1.8x multiplier with standard bounds
      adaptiveDistance = Math.max(10, Math.min(150, medianDistance * 1.8))
      densityTier = 'LOW (rural)'
    }
    
    console.log(`[DBSCAN] 📊 Point spacing analysis:`, {
      sample: distances.length,
      min: distances[0].toFixed(1),
      median: medianDistance.toFixed(1),
      p75: p75Distance.toFixed(1),
      density: densityTier,
      adaptive: adaptiveDistance.toFixed(1)
    })
    
    return adaptiveDistance
  }
  
  /**
   * Spatial proximity clustering (DBSCAN-like algorithm)
   * Groups nearby points that don't have designation labels
   */
  private spatialProximityClustering(
    points: AdjustedCoordinate[],
    maxDistance: number = 50  // Maximum distance between points in same cluster (meters)
  ): AdjustedCoordinate[][] {
    const clusters: AdjustedCoordinate[][] = []
    const visited = new Set<string>()
    
    console.log(`[DBSCAN] 🔍 Processing ${points.length} points with maxDistance=${maxDistance.toFixed(1)}m, minPts=${this.config.minPoints}`)
    
    let isolatedCount = 0
    let clusterableCount = 0
    
    for (const point of points) {
      if (visited.has(point.pointId)) continue
      
      // Find all neighbors within maxDistance
      const neighbors = this.findNeighbors(point, points, maxDistance)
      
      // Need at least minPoints to form a cluster
      if (neighbors.length < this.config.minPoints) {
        isolatedCount++
        if (isolatedCount <= 5) {  // Log first 5 isolated points
          console.log(`[DBSCAN] ❌ Point ${point.pointId} has only ${neighbors.length} neighbors (need ${this.config.minPoints})`)  
        }
        continue  // Skip isolated points
      }
      
      clusterableCount++
      
      // Expand cluster by finding neighbors of neighbors
      const cluster = this.expandCluster(point, neighbors, points, maxDistance, visited)
      
      if (cluster.length >= this.config.minPoints) {
        clusters.push(cluster)
        console.log(`[DBSCAN] ✅ Cluster ${clusters.length}: ${cluster.length} points (${cluster.map(p => p.pointId).join(', ')})`)
      }
    }
    
    console.log(`[DBSCAN] 📊 Summary: ${clusterableCount} clusterable points, ${isolatedCount} isolated points, ${clusters.length} clusters formed`)
    
    return clusters
  }
  
  /**
   * Find all points within maxDistance of the given point
   */
  private findNeighbors(
    point: AdjustedCoordinate,
    allPoints: AdjustedCoordinate[],
    maxDistance: number
  ): AdjustedCoordinate[] {
    const neighbors: AdjustedCoordinate[] = []
    
    for (const other of allPoints) {
      if (other.pointId === point.pointId) continue
      
      const dist = this.distance(point, other)
      if (dist <= maxDistance) {
        neighbors.push(other)
      }
    }
    
    return neighbors
  }
  
  /**
   * Expand cluster by recursively adding neighbors
   */
  private expandCluster(
    point: AdjustedCoordinate,
    neighbors: AdjustedCoordinate[],
    allPoints: AdjustedCoordinate[],
    maxDistance: number,
    visited: Set<string>
  ): AdjustedCoordinate[] {
    const cluster: AdjustedCoordinate[] = [point]
    visited.add(point.pointId)
    
    const queue = [...neighbors]
    
    while (queue.length > 0) {
      const current = queue.shift()!
      
      if (visited.has(current.pointId)) continue
      visited.add(current.pointId)
      cluster.push(current)
      
      // Find neighbors of this point
      const currentNeighbors = this.findNeighbors(current, allPoints, maxDistance)
      
      // If this point has enough neighbors, add them to the queue
      if (currentNeighbors.length >= this.config.minPoints) {
        for (const neighbor of currentNeighbors) {
          if (!visited.has(neighbor.pointId)) {
            queue.push(neighbor)
          }
        }
      }
    }
    
    return cluster
  }
  
  /**
   * Detect Road Reserves and Linear Features
   * 
   * Identifies points that form linear features (roads, servitudes, etc.)
   * Based on:
   * 1. Point IDs containing "RR", "ROAD", "RESERVE", "SERVITUDE"
   * 2. Linear arrangement (points form a line, not a polygon)
   * 3. Consistent spacing between points
   */
  private detectRoadReserves(points: AdjustedCoordinate[]): Map<string, AdjustedCoordinate[]> {
    const roadReserves = new Map<string, AdjustedCoordinate[]>()
    
    // Identify road reserve points by ID patterns
    const roadPoints = points.filter(p => this.isRoadReservePoint(p.pointId))
    
    if (roadPoints.length === 0) {
      return roadReserves
    }
    
    console.log(`[RoadReserve] 🛣️ Found ${roadPoints.length} potential road reserve points`)
    
    // Group road points by proximity (linear clustering)
    const roadClusters = this.clusterLinearFeatures(roadPoints)
    
    let rrCount = 1
    for (const cluster of roadClusters) {
      if (cluster.length >= 2) {  // Need at least 2 points for a linear feature
        const designation = `ROAD-RESERVE-${rrCount.toString().padStart(2, '0')}`
        roadReserves.set(designation, cluster)
        console.log(`[RoadReserve] ✅ ${designation}: ${cluster.length} points`)
        rrCount++
      }
    }
    
    return roadReserves
  }
  
  /**
   * Check if point ID indicates a road reserve or linear feature
   */
  private isRoadReservePoint(pointId: string): boolean {
    const id = pointId.toUpperCase()
    
    // Common road reserve patterns
    const roadPatterns = [
      /^RR\d*$/,                    // RR, RR1, RR2
      /^R\.R\.?\d*$/,               // R.R, R.R.1
      /ROAD/,                       // ROAD, ROADRESERVE
      /RESERVE/,                    // RESERVE, RES
      /SERVITUDE/,                  // SERVITUDE, SERV
      /^S\.R\.?\d*$/,               // S.R (Servitude Reserve)
      /STREET/,                     // STREET
      /AVENUE/,                     // AVENUE
      /WAY$/,                       // HIGHWAY, PATHWAY
    ]
    
    return roadPatterns.some(pattern => pattern.test(id))
  }
  
  /**
   * Cluster points that form linear features
   * Uses spatial proximity + linearity check
   */
  private clusterLinearFeatures(points: AdjustedCoordinate[]): AdjustedCoordinate[][] {
    const clusters: AdjustedCoordinate[][] = []
    const visited = new Set<string>()
    
    for (const point of points) {
      if (visited.has(point.pointId)) continue
      
      // Find nearby points (within 100m for road reserves)
      const nearbyPoints = points.filter(p => {
        if (visited.has(p.pointId) || p.pointId === point.pointId) return false
        const dist = this.distance(point, p)
        return dist <= 100
      })
      
      if (nearbyPoints.length > 0) {
        const cluster = [point, ...nearbyPoints]
        cluster.forEach(p => visited.add(p.pointId))
        clusters.push(cluster)
      } else {
        visited.add(point.pointId)
      }
    }
    
    return clusters
  }
  
  /**
   * Topological Parcel Reconstruction
   * 
   * Builds complete parcels by considering shared boundaries between adjacent stands.
   * Algorithm:
   * 1. Extract stand number from each point (e.g., "1441A" → stand 1441)
   * 2. For each stand, find its own points
   * 3. Find nearby points from adjacent stands (shared boundary vertices)
   * 4. Intelligent corner inference: If only 2 corners (A+C), search for missing B+D
   * 5. Construct polygon from own points + shared boundary points + inferred corners
   * 6. Order points to form valid closed polygon
   */
  private topologicalParcelReconstruction(points: AdjustedCoordinate[]): Map<string, AdjustedCoordinate[]> {
    const parcels = new Map<string, AdjustedCoordinate[]>()
    
    // Group points by stand number
    const standPoints = new Map<number, AdjustedCoordinate[]>()
    
    for (const point of points) {
      const standNum = this.extractStandNumber(point.pointId)
      if (!standNum) continue
      
      if (!standPoints.has(standNum)) {
        standPoints.set(standNum, [])
      }
      standPoints.get(standNum)!.push(point)
    }
    
    console.log(`[Topology] 📊 Found ${standPoints.size} unique stands`)
    
    let validCount = 0
    let insufficientCount = 0
    let inferredCount = 0
    
    // For each stand, find its complete boundary (own points + shared vertices)
    for (const [standNum, ownPoints] of standPoints) {
      if (ownPoints.length === 0) continue
      
      // Find shared boundary points from adjacent stands
      const sharedPoints = this.findSharedBoundaryPoints(standNum, ownPoints, points)
      
      // Combine own points + shared points
      let allBoundaryPoints = [...ownPoints, ...sharedPoints]
      
      // INTELLIGENT CORNER INFERENCE: If we have only 2-3 corners and they're all the same letter (e.g., all A),
      // search for missing opposite corners (C) and perpendicular corners (B, D)
      let hasInferredCorners = false
      if (allBoundaryPoints.length >= 2 && allBoundaryPoints.length <= 3) {
        // Check if we have only A corners (or only C corners)
        const cornerLetters = new Set<string>()
        for (const point of allBoundaryPoints) {
          const match = point.pointId.match(/([A-F])$/i)
          if (match) {
            cornerLetters.add(match[1].toUpperCase())
          }
        }
        
        // If all points have the same corner letter, they're collinear - need inference
        const needsInference = cornerLetters.size === 1 || allBoundaryPoints.length === 2
        
        // Debug logging for first few stands
        if (standNum <= 1445 && needsInference) {
          console.log(`[Inference] STAND ${standNum}: ${allBoundaryPoints.length} points, corners={${Array.from(cornerLetters).join(',')}}, needsInference=${needsInference}`)
        }
        
        if (needsInference) {
          const inferredCorners = this.inferMissingCorners(standNum, allBoundaryPoints.slice(0, 2), points)
          if (inferredCorners.length > 0) {
            allBoundaryPoints = [...allBoundaryPoints, ...inferredCorners]
            hasInferredCorners = true
            inferredCount++
            if (inferredCount <= 10) {
              console.log(`[Topology] 🔍 STAND ${standNum}: Inferred ${inferredCorners.length} missing corners (${inferredCorners.map(c => c.pointId).join(', ')})`)
            }
            
            // Mark inferred corners with metadata
            for (const corner of inferredCorners) {
              (corner as any).__inferred = true
            }
          } else if (standNum <= 1445) {
            console.log(`[Inference] STAND ${standNum}: inferMissingCorners returned 0 corners`)
          }
        }
      }
      
      // Only create parcel if we have enough points for a polygon
      if (allBoundaryPoints.length >= 3) {
        const designation = `STAND ${standNum}`
        parcels.set(designation, allBoundaryPoints)
        validCount++
        if (validCount <= 10) {  // Log first 10 valid parcels
          console.log(`[Topology] ✅ ${designation}: ${ownPoints.length} own + ${sharedPoints.length} shared = ${allBoundaryPoints.length} total points`)
        }
      } else {
        insufficientCount++
        if (insufficientCount <= 5) {  // Log first 5 insufficient parcels
          console.log(`[Topology] ⚠️ STAND ${standNum}: Only ${allBoundaryPoints.length} points (need 3+)`)
        }
      }
    }
    
    console.log(`[Topology] 📊 Summary: ${validCount} valid parcels, ${insufficientCount} insufficient, ${inferredCount} with inferred corners (${standPoints.size} total stands)`)
    console.log(`[Topology] 🎯 Detection rate: ${((validCount / standPoints.size) * 100).toFixed(1)}%`)
    
    return parcels
  }
  
  /**
   * Infer missing corners for 2-corner parcels (A+C pattern)
   * 
   * When only opposite corners A and C are present, intelligently search for
   * missing corners B and D by looking at adjacent stands.
   * 
   * Strategy:
   * 1. Identify which corners are present (A, C, etc.)
   * 2. Determine which corners are missing (typically B, D)
   * 3. Search adjacent stands (±1 to ±4) for points with matching corner letters
   * 4. Validate spatial proximity (must be within 30m of existing corners)
   * 5. Return inferred corners that form a valid rectangle
   */
  private inferMissingCorners(
    standNum: number,
    existingCorners: AdjustedCoordinate[],
    allPoints: AdjustedCoordinate[]
  ): AdjustedCoordinate[] {
    if (existingCorners.length !== 2) return []
    
    // Extract corner letters from existing points
    const cornerLetters = new Set<string>()
    for (const point of existingCorners) {
      const match = point.pointId.match(/([A-F])$/i)
      if (match) {
        cornerLetters.add(match[1].toUpperCase())
      }
    }
    
    // Check corner pattern
    const hasA = cornerLetters.has('A')
    const hasC = cornerLetters.has('C')
    
    // Determine which corners we need to find
    let missingCorners: string[] = []
    
    if (hasA && hasC) {
      // Standard A+C pattern: need B and D
      missingCorners = ['B', 'D']
    } else if (hasA && !hasC) {
      // Only A corners: need C first, then B and D
      missingCorners = ['C', 'B', 'D']
    } else if (hasC && !hasA) {
      // Only C corners: need A first, then B and D
      missingCorners = ['A', 'B', 'D']
    } else {
      // No A or C corners, skip inference
      return []
    }
    const inferredCorners: AdjustedCoordinate[] = []
    
    // Define adjacent stand numbers (±1 to ±4)
    const adjacentStandNumbers = [
      standNum - 4, standNum - 3, standNum - 2, standNum - 1,
      standNum + 1, standNum + 2, standNum + 3, standNum + 4
    ]
    
    // Search for missing corners in adjacent stands
    for (const missingCorner of missingCorners) {
      let bestCandidate: AdjustedCoordinate | null = null
      let bestDistance = Infinity
      
      // Look for points with matching corner letter in adjacent stands
      for (const point of allPoints) {
        // Skip if already in our existing corners
        if (existingCorners.some(c => c.pointId === point.pointId)) continue
        
        // Check if this point has the missing corner letter
        const match = point.pointId.match(/([A-F])$/i)
        if (!match || match[1].toUpperCase() !== missingCorner) continue
        
        // Check if this point is from an adjacent stand
        const otherStandNum = this.extractStandNumber(point.pointId)
        if (!otherStandNum || !adjacentStandNumbers.includes(otherStandNum)) continue
        
        // Calculate distance to nearest existing corner
        let minDistance = Infinity
        for (const existingCorner of existingCorners) {
          const dist = this.distance(existingCorner, point)
          if (dist < minDistance) {
            minDistance = dist
          }
        }
        
        // Must be within 30m of existing corners (urban subdivision spacing)
        if (minDistance <= 30 && minDistance < bestDistance) {
          bestCandidate = point
          bestDistance = minDistance
        }
      }
      
      // Add the best candidate if found
      if (bestCandidate) {
        inferredCorners.push(bestCandidate)
      }
    }
    
    // Only return inferred corners if we found both B and D
    // (partial inference could create invalid polygons)
    if (inferredCorners.length === 2) {
      return inferredCorners
    }
    
    return []
  }
  
  /**
   * Extract stand number from point ID - Enhanced patterns
   * 
   * Supported formats:
   * - "1441A" → 1441
   * - "1442E" → 1442
   * - "STAND 1443" → 1443
   * - "S1444" → 1444
   * - "ST1445A" → 1445
   * - "1446-A" → 1446 (hyphenated)
   * - "1447_B" → 1447 (underscored)
   * - "ERF 1448" → 1448 (South African style)
   * - "PLOT 1449" → 1449
   * - "LOT 1450" → 1450
   * - "RR" → null (Road Reserve - handled separately)
   * - "ROAD" → null (Road Reserve)
   */
  private extractStandNumber(pointId: string): number | null {
    const id = pointId.toUpperCase().trim()
    
    // Pattern 1: Direct numeric with optional letter suffix (1441A, 1442E)
    let match = id.match(/^(\d+)[A-Z]?$/)
    if (match) {
      return parseInt(match[1], 10)
    }
    
    // Pattern 2: Numeric with separator (1446-A, 1447_B, 1448.C)
    match = id.match(/^(\d+)[\-_\.][A-Z]?$/)
    if (match) {
      return parseInt(match[1], 10)
    }
    
    // Pattern 3: Prefix + numeric (S1444, ST1445A)
    match = id.match(/^S(?:T)?(\d+)[A-Z]?$/)
    if (match) {
      return parseInt(match[1], 10)
    }
    
    // Pattern 4: Full keywords (STAND 1443, ERF 1448, PLOT 1449, LOT 1450)
    match = id.match(/(?:STAND|ERF|PLOT|LOT|PARCEL)\s*[\-_\.]?\s*(\d+)/)
    if (match) {
      return parseInt(match[1], 10)
    }
    
    // Pattern 5: Numeric only (for points like "1234" without suffix)
    match = id.match(/^(\d{3,})$/)
    if (match) {
      return parseInt(match[1], 10)
    }
    
    // Pattern 6: Corner notation (1441-CORNER, 1442_NE)
    match = id.match(/^(\d+)[\-_](?:CORNER|NE|NW|SE|SW|N|S|E|W)$/)
    if (match) {
      return parseInt(match[1], 10)
    }
    
    return null
  }
  
  /**
   * Find shared boundary points from adjacent stands
   * 
   * Enhanced Logic:
   * 1. Spatial proximity: Points within 10m from any stand
   * 2. Stand adjacency: Points from numerically adjacent stands (±1, ±2)
   * 3. Smart search: If STAND 1441, look for points from 1439, 1440, 1442, 1443
   */
  private findSharedBoundaryPoints(
    standNum: number,
    ownPoints: AdjustedCoordinate[],
    allPoints: AdjustedCoordinate[]
  ): AdjustedCoordinate[] {
    const sharedPoints: AdjustedCoordinate[] = []
    const ownPointIds = new Set(ownPoints.map(p => p.pointId))
    
    // Maximum distance to consider points as shared boundary (10 meters)
    const sharedBoundaryThreshold = 10.0
    
    // Define adjacent stand numbers (±1 to ±4 for comprehensive coverage)
    // ±1, ±2: Immediate neighbors (shared boundaries)
    // ±3, ±4: Extended neighbors (corner-to-corner connections)
    const adjacentStandNumbers = new Set([
      standNum - 4,
      standNum - 3,
      standNum - 2,
      standNum - 1,
      standNum + 1,
      standNum + 2,
      standNum + 3,
      standNum + 4
    ])
    
    let spatialCount = 0
    let adjacencyCount = 0
    let sharedCount = 0
    
    // Strategy 1: Spatial proximity (existing logic)
    // Only include corner points (A-F suffix)
    for (const ownPoint of ownPoints) {
      for (const otherPoint of allPoints) {
        if (ownPointIds.has(otherPoint.pointId)) continue
        
        const otherStandNum = this.extractStandNumber(otherPoint.pointId)
        if (!otherStandNum || otherStandNum === standNum) continue
        
        // CRITICAL: Only include corner points (ending in A-F)
        const isCornerPoint = /[A-F]$/i.test(otherPoint.pointId)
        if (!isCornerPoint) continue
        
        const dist = this.distance(ownPoint, otherPoint)
        if (dist <= sharedBoundaryThreshold) {
          spatialCount++
          if (!sharedPoints.some(p => p.pointId === otherPoint.pointId)) {
            sharedPoints.push(otherPoint)
            sharedCount++
          }
        }
      }
    }
    
    // Strategy 2: Stand adjacency with semantic corner matching
    // Find CORNER POINTS ONLY from numerically adjacent stands
    // Use proximity-based matching (simpler than semantic rules)
    for (const otherPoint of allPoints) {
      if (ownPointIds.has(otherPoint.pointId)) continue
      if (sharedPoints.some(p => p.pointId === otherPoint.pointId)) continue
      
      const otherStandNum = this.extractStandNumber(otherPoint.pointId)
      if (!otherStandNum) continue
      
      // CRITICAL: Only include corner points (ending in A-F)
      const isCornerPoint = /[A-F]$/i.test(otherPoint.pointId)
      if (!isCornerPoint) continue
      
      // Check if this point is from an adjacent stand
      if (adjacentStandNumbers.has(otherStandNum)) {
        // PROXIMITY-BASED MATCHING: Find corners that are VERY close to our corners
        // Shared corners should be within 15m (typical urban parcel width/2)
        // This is more restrictive than 30m to avoid matching wrong corners
        let isSharedCorner = false
        for (const ownPoint of ownPoints) {
          const dist = this.distance(ownPoint, otherPoint)
          if (dist <= 15) {  // Tighter threshold for better accuracy
            isSharedCorner = true
            break
          }
        }
        
        if (isSharedCorner) {
          adjacencyCount++
          sharedPoints.push(otherPoint)
          sharedCount++
        }
      }
    }
    
    // Strategy 3: Fallback - find closest points if we still don't have enough
    const totalPoints = ownPoints.length + sharedPoints.length
    if (totalPoints < 3) {
      // Find the 3 closest CORNER points from any stand
      const candidatePoints = allPoints
        .filter(p => !ownPointIds.has(p.pointId))
        .filter(p => !sharedPoints.some(sp => sp.pointId === p.pointId))
        .filter(p => {
          const otherStandNum = this.extractStandNumber(p.pointId)
          return otherStandNum && otherStandNum !== standNum
        })
        .filter(p => /[A-F]$/i.test(p.pointId)) // CRITICAL: Only corner points
      
      // Calculate distances from our points
      const pointsWithDistance = candidatePoints.map(candidate => {
        let minDist = Infinity
        for (const ownPoint of ownPoints) {
          const dist = this.distance(ownPoint, candidate)
          if (dist < minDist) {
            minDist = dist
          }
        }
        return { point: candidate, distance: minDist }
      })
      
      // Sort by distance and take closest points (up to 100m away)
      pointsWithDistance.sort((a, b) => a.distance - b.distance)
      const needed = 3 - totalPoints
      let fallbackCount = 0
      
      for (let i = 0; i < Math.min(needed, pointsWithDistance.length); i++) {
        if (pointsWithDistance[i].distance <= 100) {
          sharedPoints.push(pointsWithDistance[i].point)
          fallbackCount++
          sharedCount++
        }
      }
      
      if (fallbackCount > 0 && standNum <= 1445) {
        console.log(`[Topology] 🔍 STAND ${standNum}: Added ${fallbackCount} fallback points (closest neighbors)`)
      }
    }
    
    // Smart deduplication: If we have too many shared points from the same stand,
    // only keep the closest ones (max 2 per adjacent stand)
    const pointsByStand = new Map<number, Array<{point: AdjustedCoordinate, distance: number}>>()
    
    for (const sharedPoint of sharedPoints) {
      const sharedStandNum = this.extractStandNumber(sharedPoint.pointId)
      if (!sharedStandNum) continue
      
      // Calculate minimum distance to our own points
      let minDist = Infinity
      for (const ownPoint of ownPoints) {
        const dist = this.distance(ownPoint, sharedPoint)
        if (dist < minDist) {
          minDist = dist
        }
      }
      
      if (!pointsByStand.has(sharedStandNum)) {
        pointsByStand.set(sharedStandNum, [])
      }
      pointsByStand.get(sharedStandNum)!.push({ point: sharedPoint, distance: minDist })
    }
    
    // Keep only the 2 closest points from each adjacent stand
    const filteredSharedPoints: AdjustedCoordinate[] = []
    for (const [adjacentStand, points] of pointsByStand) {
      // Sort by distance and take top 2
      points.sort((a, b) => a.distance - b.distance)
      const toKeep = points.slice(0, 2)
      filteredSharedPoints.push(...toKeep.map(p => p.point))
    }
    
    // Log diagnostic info for first few stands
    if (standNum <= 1445) {
      const sharedPointIds = filteredSharedPoints.map(p => p.pointId).join(', ')
      console.log(`[Topology] 🔍 STAND ${standNum}: ${spatialCount} spatial + ${adjacencyCount} adjacency = ${sharedCount} shared points (filtered to ${filteredSharedPoints.length})`)
      console.log(`[Topology]    Own: ${ownPoints.map(p => p.pointId).join(', ')}`)
      console.log(`[Topology]    Shared: ${sharedPointIds}`)
    }
    
    return filteredSharedPoints
  }
  
  /**
   * Cluster points by the designation their DESCRIPTION states:
   * - "STAND 1439 CORNER" → "STAND 1439"
   * - "LOT 5 BEACON" → "LOT 5"
   * - "FARM 123A" → "FARM 123"
   *
   * Description only -- never the point-ID fallback. Real survey exports describe the
   * beacon, not the parcel ("12mm iron peg in concrete"), so this correctly yields
   * nothing for them and topological reconstruction handles the whole job. Letting the
   * ID fallback in here would group a stand on its own points alone and discard the
   * corners its neighbours recorded -- reporting half a stand (see
   * designationFromPointId).
   */
  private clusterByDesignation(points: AdjustedCoordinate[]): Map<string, AdjustedCoordinate[]> {
    const clusters = new Map<string, AdjustedCoordinate[]>()
    
    for (const point of points) {
      const designation = this.designationFromDescription(point)
      if (!designation) continue
      
      if (!clusters.has(designation)) {
        clusters.set(designation, [])
      }
      clusters.get(designation)!.push(point)
    }
    
    return clusters
  }
  
  /**
   * Extract designation from point ID or description
   * 
   * Enhanced patterns:
   * - Description: "STAND 1439 CORNER" → "STAND 1439"
   * - Description: "LOT 5 BEACON" → "LOT 5"
   * - Description: "1439 CORNER" → "STAND 1439"
   * - Description: "Stand 1439A" → "STAND 1439"
   * - Point ID: "1439A" → "STAND 1439"
   * - Point ID: "1439" → "STAND 1439"
   * - Point ID: "S1439" → "STAND 1439"
   * - Point ID: "ST1439A" → "STAND 1439"
   */
  private designationFromDescription(point: AdjustedCoordinate): string | null {
    const desc = point.description?.toUpperCase() || ''
    
    // Pattern 1: Full keyword + number in description
    // "STAND 1439 CORNER" → "STAND 1439"
    let match = desc.match(/(STAND|LOT|PLOT|FARM)\s+(\d+)/)
    if (match) {
      return `${match[1]} ${match[2]}`
    }
    
    // Pattern 2: Number only in description
    // "1439 CORNER" → "STAND 1439"
    match = desc.match(/^(\d+)\s/)
    if (match) {
      return `STAND ${match[1]}`
    }
    
    // Pattern 3: Partial keyword in description
    // "Stand 1439" or "S1439" → "STAND 1439"
    match = desc.match(/S(?:TAND|T)?\s*(\d+)/)
    if (match) {
      return `STAND ${match[1]}`
    }
    
    // Pattern 4: LOT/PLOT/FARM variations
    match = desc.match(/L(?:OT)?\s*(\d+)/)
    if (match) {
      return `LOT ${match[1]}`
    }
    match = desc.match(/P(?:LOT|L)?\s*(\d+)/)
    if (match) {
      return `PLOT ${match[1]}`
    }
    match = desc.match(/F(?:ARM)?\s*(\d+)/)
    if (match) {
      return `FARM ${match[1]}`
    }
    
    return null
  }

  /** Description first, then the point-ID guess. Combined behaviour, unchanged. */
  private extractDesignation(point: AdjustedCoordinate): string | null {
    return this.designationFromDescription(point) ?? this.designationFromPointId(point)
  }

  /**
   * Designation guessed from the point ID alone ("1439A" -> "STAND 1439").
   *
   * Deliberately separate from designationFromDescription: the two carry very
   * different authority. A description is the surveyor stating which parcel a beacon
   * bounds. A beacon ID does NOT reliably say that -- adjoining stands share one
   * physical corner, and it is recorded under whichever stand's number the surveyor
   * happened to use, so 2299A is routinely a corner of stand 2300. Grouping on the ID
   * therefore reproduces exactly what topologicalParcelReconstruction() already does,
   * but WITHOUT its shared-corner enrichment, and must never override it.
   */
  private designationFromPointId(point: AdjustedCoordinate): string | null {
    const id = point.pointId.toUpperCase()

    // Pattern 5: Point ID with letter suffix
    // "1439A" → "STAND 1439"
    let match = id.match(/^(\d+)[A-Z]?$/)
    if (match) {
      return `STAND ${match[1]}`
    }
    
    // Pattern 6: Point ID with prefix
    // "S1439A" or "ST1439" → "STAND 1439"
    match = id.match(/^S(?:T)?(\d+)[A-Z]?$/)
    if (match) {
      return `STAND ${match[1]}`
    }
    match = id.match(/^L(\d+)[A-Z]?$/)
    if (match) {
      return `LOT ${match[1]}`
    }
    match = id.match(/^P(?:L)?(\d+)[A-Z]?$/)
    if (match) {
      return `PLOT ${match[1]}`
    }
    match = id.match(/^F(\d+)[A-Z]?$/)
    if (match) {
      return `FARM ${match[1]}`
    }
    
    return null
  }
  
  /**
   * Process cluster into parcel
   * 
   * Takes a cluster of points and:
   * 1. Orders them around the perimeter
   * 2. Validates polygon closure
   * 3. Computes area and metrics
   * 4. Assigns confidence score
   * 5. Tracks inferred corners for transparency
   */
  private processCluster(designation: string, points: AdjustedCoordinate[]): DetectedParcel | null {
    if (points.length < 3) return null
    
    // Order points using cadastral conventions
    const orderedPoints = this.orderPointsWithCadastralConventions(points)
    
    // Validate closure
    const closureGap = this.distance(orderedPoints[0], orderedPoints[orderedPoints.length - 1])
    const warnings: string[] = []
    
    // Check for inferred corners
    const inferredCorners = orderedPoints.filter(p => (p as any).__inferred)
    if (inferredCorners.length > 0) {
      warnings.push(`${inferredCorners.length} corner(s) inferred from adjacent stands: ${inferredCorners.map(c => c.pointId).join(', ')}`)
    }
    
    if (closureGap > this.config.maxClosureGap) {
      warnings.push(`Closure gap: ${closureGap.toFixed(2)}m (max: ${this.config.maxClosureGap}m)`)
    }
    
    // Compute area
    const area = this.computeArea(orderedPoints)
    
    // Log closure gap for debugging (first 10 parcels)
    const standMatch = designation.match(/\d+/)
    const standNumForLog = standMatch ? parseInt(standMatch[0]) : 9999
    if (standNumForLog <= 1450 && closureGap > 0.1) {
      console.log(`[Closure] ${designation}: gap=${closureGap.toFixed(2)}m, points=${orderedPoints.length}, area=${area.toFixed(0)}m²`)
    }
    
    // Compute perimeter
    const perimeter = this.computePerimeter(orderedPoints)
    
    // Compute centroid
    const centroid = this.computeCentroid(orderedPoints)
    
    // Validate shape (bonus for rectangularity, but all shapes valid)
    const rectangularityScore = points.length === 4 
      ? this.validateRectangularShape(orderedPoints)
      : points.length === 3
        ? this.validateRightTriangle(orderedPoints)
        : 0.7
    
    // Compute confidence score (including rectangularity)
    const confidence = this.computeConfidence(orderedPoints, area, closureGap, warnings, rectangularityScore)
    
    // Extract designation type and number
    const typeMatch = designation.match(/^(STAND|LOT|PLOT|FARM)\s+(\d+)$/)
    const designationType = typeMatch ? typeMatch[1] as any : 'UNKNOWN'
    const designationNumber = typeMatch ? typeMatch[2] : designation
    
    // Format area
    const areaFormatted = this.formatArea(area)
    
    return {
      designation,
      designationType,
      designationNumber,
      boundaryPoints: orderedPoints.map(p => p.pointId),
      coordinates: orderedPoints.map(p => ({ pointId: p.pointId, y: p.y, x: p.x })),
      area,
      areaFormatted,
      perimeter,
      centroid,
      confidence,
      warnings
    }
  }
  
  /**
   * Order points with Zimbabwe cadastral conventions
   * - Start from 'A' suffix (northmost apex)
   * - Order clockwise around perimeter
   * - Validate rectangular shape
   */
  private orderPointsWithCadastralConventions(points: AdjustedCoordinate[]): AdjustedCoordinate[] {
    // Find northmost point (highest Y coordinate in Zimbabwe system)
    // Prefer point with 'A' suffix if available
    let startPoint = points[0]
    let maxY = startPoint.y
    
    for (const point of points) {
      // Check if this is the 'A' point (northmost apex by convention)
      const hasASuffix = point.pointId.toUpperCase().endsWith('A')
      
      if (hasASuffix && point.y >= maxY) {
        startPoint = point
        maxY = point.y
      } else if (!startPoint.pointId.toUpperCase().endsWith('A') && point.y > maxY) {
        startPoint = point
        maxY = point.y
      }
    }
    
    // Compute centroid for angle sorting
    const centroid = this.computeCentroid(points)
    
    // Sort by angle from centroid (clockwise from north)
    const sorted = [...points].sort((a, b) => {
      const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x)
      const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x)
      return angleA - angleB
    })
    
    // Rotate array to start from the identified start point
    const startIndex = sorted.findIndex(p => p.pointId === startPoint.pointId)
    if (startIndex > 0) {
      return [...sorted.slice(startIndex), ...sorted.slice(0, startIndex)]
    }
    
    return sorted
  }
  
  /**
   * Validate rectangular/square shape
   * Returns score 0-1 where 1 = perfect rectangle
   * Note: This is a BONUS factor - irregular polygons are perfectly valid!
   */
  private validateRectangularShape(points: AdjustedCoordinate[]): number {
    // Irregular polygons (5+ sides) are valid - neutral score
    if (points.length > 4) {
      return 0.7 // Neutral - no penalty for being irregular
    }
    
    // 3-point parcels (triangular)
    if (points.length === 3) {
      return 0.7 // Neutral - triangular parcels are valid
    }
    
    // 4-point parcels - check if rectangular (bonus if yes)
    if (points.length !== 4) {
      return 0.7 // Neutral baseline
    }
    
    // For 4 points, validate rectangle properties:
    // 1. Opposite sides are parallel and equal
    // 2. All angles are approximately 90 degrees
    // 3. Diagonals are approximately equal
    
    let score = 1.0
    
    // Check angles (bonus if close to 90 degrees, but not required)
    const angles = this.computeInteriorAngles(points)
    let rectangularAngleCount = 0
    for (const angle of angles) {
      const deviation = Math.abs(angle - 90)
      if (deviation < 5) {
        rectangularAngleCount++
      }
    }
    
    // Bonus for rectangular angles (not penalty for non-rectangular)
    if (rectangularAngleCount === 4) {
      score *= 1.0 // Perfect rectangle - no change
    } else if (rectangularAngleCount >= 2) {
      score *= 0.95 // Some right angles - slight bonus
    } else {
      score *= 0.85 // No right angles - still valid, just less bonus
    }
    
    // Check opposite sides (bonus if equal, but not required)
    const side1 = this.distance(points[0], points[1])
    const side2 = this.distance(points[1], points[2])
    const side3 = this.distance(points[2], points[3])
    const side4 = this.distance(points[3], points[0])
    
    const oppositeSides1 = Math.abs(side1 - side3) / Math.max(side1, side3)
    const oppositeSides2 = Math.abs(side2 - side4) / Math.max(side2, side4)
    
    // Bonus for parallel sides (not penalty for non-parallel)
    if (oppositeSides1 < 0.05 && oppositeSides2 < 0.05) {
      score *= 1.0 // Perfect - no change
    } else if (oppositeSides1 < 0.1 || oppositeSides2 < 0.1) {
      score *= 0.95 // Some parallelism
    } else {
      score *= 0.9 // Irregular - still valid
    }
    
    // Check diagonals (bonus if equal, but not required)
    const diag1 = this.distance(points[0], points[2])
    const diag2 = this.distance(points[1], points[3])
    const diagDiff = Math.abs(diag1 - diag2) / Math.max(diag1, diag2)
    
    // Bonus for equal diagonals (not penalty for unequal)
    if (diagDiff < 0.05) {
      score *= 1.0 // Perfect - no change
    } else {
      score *= 0.95 // Irregular - still valid
    }
    
    return Math.max(0, Math.min(1, score))
  }
  
  /**
   * Validate right triangle (for 3-point parcels)
   * Note: All triangular parcels are valid - this just checks for right angles
   */
  private validateRightTriangle(points: AdjustedCoordinate[]): number {
    if (points.length !== 3) return 0.7
    
    const angles = this.computeInteriorAngles(points)
    
    // Check if one angle is approximately 90 degrees (bonus if yes)
    const hasRightAngle = angles.some(angle => Math.abs(angle - 90) < 10)
    
    return hasRightAngle ? 0.75 : 0.7 // All triangles valid, slight bonus for right angle
  }
  
  /**
   * Compute interior angles of polygon (in degrees)
   */
  private computeInteriorAngles(points: AdjustedCoordinate[]): number[] {
    const angles: number[] = []
    const n = points.length
    
    for (let i = 0; i < n; i++) {
      const prev = points[(i - 1 + n) % n]
      const curr = points[i]
      const next = points[(i + 1) % n]
      
      // Vectors from current point
      const v1 = { y: prev.y - curr.y, x: prev.x - curr.x }
      const v2 = { y: next.y - curr.y, x: next.x - curr.x }
      
      // Angle between vectors
      const dot = v1.y * v2.y + v1.x * v2.x
      const mag1 = Math.sqrt(v1.y * v1.y + v1.x * v1.x)
      const mag2 = Math.sqrt(v2.y * v2.y + v2.x * v2.x)
      
      const cosAngle = dot / (mag1 * mag2)
      const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)))
      const angleDeg = (angleRad * 180) / Math.PI
      
      angles.push(angleDeg)
    }
    
    return angles
  }
  
  /**
   * Distance between two points using Gauss coordinates (Cape Lo 31)
   * 
   * IMPORTANT: Uses original projected coordinates (y=Northing, x=Easting in meters)
   * NOT WGS84 lat/lon - this ensures accurate metric distance calculations
   */
  private distance(p1: AdjustedCoordinate, p2: AdjustedCoordinate): number {
    const dy = p2.y - p1.y  // Northing difference (meters)
    const dx = p2.x - p1.x  // Easting difference (meters)
    return Math.sqrt(dy * dy + dx * dx)  // Euclidean distance in meters
  }
  
  /**
   * Compute area using Shoelace formula (Gauss area formula)
   * 
   * IMPORTANT: Uses Gauss coordinates (Cape Lo 31 projected coordinates)
   * - y = Northing (meters)
   * - x = Easting (meters)
   * 
   * Formula: Area = |Σ(y[i] * x[i+1] - y[i+1] * x[i])| / 2
   * Result is in square meters (m²)
   */
  private computeArea(points: AdjustedCoordinate[]): number {
    if (points.length < 3) return 0
    
    let area = 0
    const n = points.length
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      area += points[i].y * points[j].x  // Northing × Easting
      area -= points[j].y * points[i].x  // Cross product
    }
    
    return Math.abs(area) / 2  // Result in m²
  }
  
  /**
   * Compute perimeter
   */
  private computePerimeter(points: AdjustedCoordinate[]): number {
    if (points.length < 2) return 0
    
    let perimeter = 0
    const n = points.length
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const dy = points[j].y - points[i].y
      const dx = points[j].x - points[i].x
      perimeter += Math.sqrt(dy * dy + dx * dx)
    }
    
    return perimeter
  }
  
  /**
   * Compute centroid
   */
  private computeCentroid(points: AdjustedCoordinate[]): { y: number, x: number } {
    const n = points.length
    const sumY = points.reduce((sum, p) => sum + p.y, 0)
    const sumX = points.reduce((sum, p) => sum + p.x, 0)
    
    return {
      y: sumY / n,
      x: sumX / n
    }
  }
  
  /**
   * Compute closure gap (distance from last point back to first)
   * For ordered polygon points, this should be the distance of the closing edge
   */
  private computeClosureGap(points: AdjustedCoordinate[]): number {
    if (points.length < 2) return 0
    
    const first = points[0]
    const last = points[points.length - 1]
    
    const dy = last.y - first.y
    const dx = last.x - first.x
    
    // For a properly ordered polygon, the closure gap is the closing edge length
    // This is expected and normal, so we return 0 to indicate "good closure"
    // A large gap would indicate points are not properly ordered
    const gap = Math.sqrt(dy * dy + dx * dx)
    
    // If gap is reasonable (< 100m), consider it closed
    // This allows for normal parcel edge lengths
    return gap > 100 ? gap : 0
  }
  
  /**
   * Compute confidence score (0-1)
   * 
   * Factors:
   * - Point count (3+ points all valid, slight bonus for 4+)
   * - Closure quality (smaller gap = higher confidence) - PRIMARY FACTOR
   * - Area validity (within expected range = higher confidence)
   * - Shape bonus (rectangular shapes get small bonus, but irregular is valid)
   * - Warnings (fewer warnings = higher confidence)
   */
  private computeConfidence(
    points: AdjustedCoordinate[],
    area: number,
    closureGap: number,
    warnings: string[],
    rectangularityScore: number = 0.7
  ): number {
    let score = 1.0
    
    // Point count factor - all polygon types valid!
    // 3 points = 0.95, 4 points = 1.0, 5+ points = 0.98
    let pointFactor: number
    if (points.length === 3) {
      pointFactor = 0.95 // Triangular parcels valid (increased from 0.85)
    } else if (points.length === 4) {
      pointFactor = 1.0 // Quadrilateral parcels (most common)
    } else if (points.length >= 5) {
      pointFactor = 0.98 // Irregular polygons valid (increased from 0.95)
    } else {
      pointFactor = 0.7 // < 3 points (shouldn't happen)
    }
    score *= pointFactor
    
    // Closure factor - PRIMARY QUALITY INDICATOR.
    // `closureGap` is the step from the last ordered corner back to the first. These
    // points are a polygon's DISTINCT corners, so that step is simply the closing SIDE
    // (13 m on a 13x24 m stand), not a misclosure -- an ordered corner list closes by
    // definition. Judging it against an absolute 2 m tolerance therefore scored 0 for
    // every well-formed parcel, which is why nothing was ever detected.
    // The gap does still carry a real signal, so keep it in scale-relative form: a
    // closing step far longer than the polygon's own typical side means the ordering
    // never really closed and a corner is missing.
    const sides: number[] = []
    for (let i = 0; i < points.length - 1; i++) {
      sides.push(this.distance(points[i], points[i + 1]))
    }
    const sortedSides = [...sides].sort((a, b) => a - b)
    const typicalSide = sortedSides.length ? sortedSides[Math.floor(sortedSides.length / 2)] : 0
    const closureRatio = typicalSide > 0 ? closureGap / typicalSide : 0
    // Within 1.5x the typical side is an ordinary closing side; beyond that, fall off.
    const closureFactor = closureRatio <= 1.5 ? 1.0 : Math.max(0, 1 - (closureRatio - 1.5))
    score *= closureFactor
    
    // Area factor (within range = 1.0, outside = 0.5)
    const areaValid = area >= this.config.minArea && area <= this.config.maxArea
    score *= areaValid ? 1.0 : 0.5
    
    // Shape bonus factor (rectangular shapes get small bonus, irregular is still valid)
    // Reduced weight: 0.95 baseline + 0.05 bonus for rectangularity (less penalty)
    score *= (0.95 + 0.05 * rectangularityScore)
    
    // Warning penalty (each warning = -3%, less harsh)
    score *= Math.max(0.6, 1 - warnings.length * 0.03)
    
    return Math.max(0, Math.min(1, score))
  }
  
  /**
   * Format area according to cadastral standards
   */
  private formatArea(areaM2: number): string {
    if (areaM2 < 10000) {
      // Banker's rounding to nearest square meter
      const rounded = Math.round(areaM2)
      return `${rounded} m²`
    } else {
      // Convert to hectares and apply banker's rounding to 4 decimal places
      const areaHa = areaM2 / 10000
      const rounded = Math.round(areaHa * 10000) / 10000
      return `${rounded.toFixed(4)} ha`
    }
  }
}
