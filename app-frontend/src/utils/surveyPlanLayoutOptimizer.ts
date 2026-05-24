/**
 * Survey Plan Layout Optimizer
 * Intelligent positioning system with collision detection for SI 727 compliant survey plans
 */

import {
  boxesIntersect as sharedBoxesIntersect,
  isRectWithinBounds
} from './collisionPrimitives'

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface OverlayBlock {
  id: string
  element: HTMLElement
  priority: number // Higher = placed first
  preferredZones: ('top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center')[]
  minMargin: number // Minimum distance from map edges (mm)
}

export interface LayoutResult {
  positions: Record<string, { x: number; y: number }>
  collisions: number
  coverage: number // % of map covered by blocks
}

export interface MapBounds {
  width: number
  height: number
  parcelBounds?: BoundingBox[] // Areas occupied by parcels
}

/**
 * Calculate bounding box for an HTML element
 */
export function calculateBoundingBox(element: HTMLElement, position: { x: number; y: number }): BoundingBox {
  const rect = element.getBoundingClientRect()
  return {
    x: position.x,
    y: position.y,
    width: rect.width,
    height: rect.height
  }
}

/**
 * Check if two bounding boxes intersect
 */
export function boxesIntersect(box1: BoundingBox, box2: BoundingBox, margin: number = 10): boolean {
  const spacing = margin
  return sharedBoxesIntersect(box1, box2, spacing)
}

/**
 * Check if a box is within map bounds
 */
export function isWithinBounds(box: BoundingBox, mapBounds: MapBounds, margin: number = 20): boolean {
  const spacing = margin
  return isRectWithinBounds(
    box,
    { x: 0, y: 0, width: mapBounds.width, height: mapBounds.height },
    spacing
  )
}

/**
 * Generate candidate positions for a zone
 */
export function generateZonePositions(
  zone: string,
  mapBounds: MapBounds,
  blockSize: { width: number; height: number },
  margin: number = 20
): { x: number; y: number }[] {
  const spacing = margin
  const positions: { x: number; y: number }[] = []
  const step = 50 // Grid step in pixels

  switch (zone) {
    case 'top-left':
      for (let x = spacing; x <= mapBounds.width / 3; x += step) {
        for (let y = spacing; y <= mapBounds.height / 3; y += step) {
          positions.push({ x, y })
        }
      }
      break

    case 'top-right':
      for (let x = (mapBounds.width * 2) / 3; x <= mapBounds.width - blockSize.width - spacing; x += step) {
        for (let y = spacing; y <= mapBounds.height / 3; y += step) {
          positions.push({ x, y })
        }
      }
      break

    case 'bottom-left':
      for (let x = spacing; x <= mapBounds.width / 3; x += step) {
        for (let y = (mapBounds.height * 2) / 3; y <= mapBounds.height - blockSize.height - spacing; y += step) {
          positions.push({ x, y })
        }
      }
      break

    case 'bottom-right':
      for (let x = (mapBounds.width * 2) / 3; x <= mapBounds.width - blockSize.width - spacing; x += step) {
        for (let y = (mapBounds.height * 2) / 3; y <= mapBounds.height - blockSize.height - spacing; y += step) {
          positions.push({ x, y })
        }
      }
      break

    case 'center':
      const centerX = (mapBounds.width - blockSize.width) / 2
      const centerY = (mapBounds.height - blockSize.height) / 2
      for (let x = centerX - 100; x <= centerX + 100; x += step) {
        for (let y = centerY - 100; y <= centerY + 100; y += step) {
          positions.push({ x, y })
        }
      }
      break
  }

  return positions
}

/**
 * Calculate overlap score (lower is better)
 */
export function calculateOverlapScore(
  box: BoundingBox,
  existingBoxes: BoundingBox[],
  parcelBounds: BoundingBox[] = []
): number {
  let score = 0

  // Penalize overlap with existing blocks (heavy penalty)
  for (const existing of existingBoxes) {
    if (boxesIntersect(box, existing, 10)) {
      score += 1000
    }
  }

  // Penalize overlap with parcels (moderate penalty)
  for (const parcel of parcelBounds) {
    if (boxesIntersect(box, parcel, 5)) {
      score += 100
    }
  }

  return score
}

/**
 * Find optimal position for a block
 */
export function findOptimalPosition(
  block: OverlayBlock,
  mapBounds: MapBounds,
  placedBoxes: BoundingBox[],
  currentPosition?: { x: number; y: number }
): { x: number; y: number } | null {
  const rect = block.element.getBoundingClientRect()
  const blockSize = { width: rect.width, height: rect.height }

  // If current position is valid and has no collisions, keep it
  if (currentPosition) {
    const currentBox = calculateBoundingBox(block.element, currentPosition)
    if (
      isWithinBounds(currentBox, mapBounds, block.minMargin) &&
      calculateOverlapScore(currentBox, placedBoxes, mapBounds.parcelBounds) === 0
    ) {
      return currentPosition
    }
  }

  let bestPosition: { x: number; y: number } | null = null
  let bestScore = Infinity

  // Try preferred zones in order
  for (const zone of block.preferredZones) {
    const candidates = generateZonePositions(zone, mapBounds, blockSize, block.minMargin)

    for (const candidate of candidates) {
      const candidateBox: BoundingBox = {
        x: candidate.x,
        y: candidate.y,
        width: blockSize.width,
        height: blockSize.height
      }

      // Check if within bounds
      if (!isWithinBounds(candidateBox, mapBounds, block.minMargin)) {
        continue
      }

      // Calculate overlap score
      const score = calculateOverlapScore(candidateBox, placedBoxes, mapBounds.parcelBounds)

      // If perfect position (no overlap), return immediately
      if (score === 0) {
        return candidate
      }

      // Track best position
      if (score < bestScore) {
        bestScore = score
        bestPosition = candidate
      }
    }

    // If we found a good position in this zone, use it
    if (bestScore < 100) {
      break
    }
  }

  return bestPosition
}

/**
 * Optimize layout for all overlay blocks
 */
export function optimizeLayout(
  blocks: OverlayBlock[],
  mapBounds: MapBounds,
  currentPositions: Record<string, { x: number; y: number }>
): LayoutResult {
  // Sort blocks by priority (higher priority placed first)
  const sortedBlocks = [...blocks].sort((a, b) => b.priority - a.priority)

  const placedBoxes: BoundingBox[] = []
  const newPositions: Record<string, { x: number; y: number }> = {}
  let totalCollisions = 0

  for (const block of sortedBlocks) {
    const currentPos = currentPositions[block.id]
    const optimalPos = findOptimalPosition(block, mapBounds, placedBoxes, currentPos)

    if (optimalPos) {
      newPositions[block.id] = optimalPos

      // Add to placed boxes
      const box = calculateBoundingBox(block.element, optimalPos)
      placedBoxes.push(box)

      // Check for remaining collisions
      const collisionScore = calculateOverlapScore(box, placedBoxes.slice(0, -1), mapBounds.parcelBounds)
      if (collisionScore > 0) {
        totalCollisions++
      }
    } else {
      // Fallback to current position if no optimal position found
      const fallbackPos = currentPos || { x: 20, y: 20 }
      newPositions[block.id] = fallbackPos

      // Keep fallback blocks in placement state so subsequent blocks still avoid them
      const fallbackBox = calculateBoundingBox(block.element, fallbackPos)
      const fallbackCollisionScore = calculateOverlapScore(fallbackBox, placedBoxes, mapBounds.parcelBounds)
      const fallbackOutOfBounds = !isWithinBounds(fallbackBox, mapBounds, block.minMargin)
      if (fallbackCollisionScore > 0 || fallbackOutOfBounds) {
        totalCollisions++
      }
      placedBoxes.push(fallbackBox)
    }
  }

  // Calculate coverage
  const totalBlockArea = placedBoxes.reduce((sum, box) => sum + box.width * box.height, 0)
  const mapArea = mapBounds.width * mapBounds.height
  const coverage = mapArea > 0 ? (totalBlockArea / mapArea) * 100 : 0

  return {
    positions: newPositions,
    collisions: totalCollisions,
    coverage
  }
}

/**
 * SI 727 Standard Block Priorities and Preferred Zones
 */
export const SI727_BLOCK_CONFIG: Record<string, Omit<OverlayBlock, 'id' | 'element'>> = {
  titleBlock: {
    priority: 100,
    preferredZones: ['top-right', 'top-left'],
    minMargin: 20
  },
  scheduleOfAreas: {
    priority: 90,
    preferredZones: ['bottom-left', 'top-left', 'bottom-right'],
    minMargin: 20
  },
  outsideFigureData: {
    priority: 85,
    preferredZones: ['bottom-right', 'top-right', 'bottom-left'],
    minMargin: 20
  },
  beaconDescription: {
    priority: 80,
    preferredZones: ['bottom-left', 'bottom-right'],
    minMargin: 20
  },
  surveyStatement: {
    priority: 70,
    preferredZones: ['bottom-left', 'bottom-right'],
    minMargin: 20
  },
  northArrow: {
    priority: 60,
    preferredZones: ['top-right', 'top-left'],
    minMargin: 15
  },
  scaleBar: {
    priority: 50,
    preferredZones: ['bottom-right', 'bottom-left'],
    minMargin: 15
  },
  layerToggle: {
    priority: 40,
    preferredZones: ['top-left'],
    minMargin: 15
  }
}
