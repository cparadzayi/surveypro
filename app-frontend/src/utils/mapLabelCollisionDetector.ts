/**
 * Advanced Map Label Collision Detection and Dynamic Placement
 * Expert system for survey plan map annotations with SI 727 compliance
 */

import {
  boxesIntersect as sharedBoxesIntersect,
  calculateOverlapArea as sharedCalculateOverlapArea,
  normalizeRect
} from './collisionPrimitives'

export interface LabelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  priority: number; // Higher = more important
  type: 'stand' | 'beacon' | 'edge-distance' | 'edge-bearing';
  parcelId?: string;
  rotation?: number;
}

export interface PlacementCandidate {
  x: number;
  y: number;
  score: number; // Lower is better
  anchor: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export interface CollisionResult {
  hasCollision: boolean;
  collidingWith: LabelBounds[];
  overlapArea: number;
}

/**
 * Check if two bounding boxes intersect
 */
export function boxesIntersect(box1: LabelBounds, box2: LabelBounds, buffer: number = 2): boolean {
  const spacing = buffer
  return sharedBoxesIntersect(box1, box2, spacing)
}

/**
 * Calculate overlap area between two boxes
 */
export function calculateOverlapArea(box1: LabelBounds, box2: LabelBounds): number {
  return sharedCalculateOverlapArea(box1, box2)
}

/**
 * Collision Detector with spatial indexing for performance
 */
export class CollisionDetector {
  private labels: LabelBounds[] = [];
  private spatialGrid: Map<string, LabelBounds[]> = new Map();
  private gridSize: number = 50; // Grid cell size in pixels

  constructor(gridSize: number = 50) {
    this.gridSize = gridSize;
  }

  /**
   * Get grid cell key for a point
   */
  private getGridKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.gridSize);
    const cellY = Math.floor(y / this.gridSize);
    return `${cellX},${cellY}`;
  }

  /**
   * Get all grid cells that a box overlaps
   */
  private getOverlappingCells(box: LabelBounds): string[] {
    const normalizedBox = normalizeRect(box)
    const cells: string[] = [];
    const minCellX = Math.floor(normalizedBox.x / this.gridSize);
    const maxCellX = Math.floor((normalizedBox.x + normalizedBox.width) / this.gridSize);
    const minCellY = Math.floor(normalizedBox.y / this.gridSize);
    const maxCellY = Math.floor((normalizedBox.y + normalizedBox.height) / this.gridSize);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        cells.push(`${cx},${cy}`);
      }
    }
    return cells;
  }

  /**
   * Add a label to the detector
   */
  addLabel(label: LabelBounds): void {
    this.labels.push(label);
    
    // Add to spatial grid
    const cells = this.getOverlappingCells(label);
    cells.forEach(cell => {
      if (!this.spatialGrid.has(cell)) {
        this.spatialGrid.set(cell, []);
      }
      this.spatialGrid.get(cell)!.push(label);
    });
  }

  /**
   * Check for collisions with existing labels
   */
  checkCollision(candidate: LabelBounds, buffer: number = 2): CollisionResult {
    const spacing = buffer;
    const collidingWith: LabelBounds[] = [];
    let totalOverlapArea = 0;

    // Get nearby labels using spatial grid
    const cells = this.getOverlappingCells(candidate);
    const nearbyLabels = new Set<LabelBounds>();
    
    cells.forEach(cell => {
      const cellLabels = this.spatialGrid.get(cell) || [];
      cellLabels.forEach(label => nearbyLabels.add(label));
    });

    // Check collisions only with nearby labels
    nearbyLabels.forEach(label => {
      if (boxesIntersect(candidate, label, spacing)) {
        collidingWith.push(label);
        totalOverlapArea += calculateOverlapArea(candidate, label);
      }
    });

    return {
      hasCollision: collidingWith.length > 0,
      collidingWith,
      overlapArea: totalOverlapArea
    };
  }

  /**
   * Get all labels
   */
  getLabels(): LabelBounds[] {
    return this.labels;
  }

  /**
   * Clear all labels
   */
  clear(): void {
    this.labels = [];
    this.spatialGrid.clear();
  }

  /**
   * Get collision statistics
   */
  getStatistics(): {
    totalLabels: number;
    collisionCount: number;
    gridCells: number;
  } {
    let collisionCount = 0;
    
    for (let i = 0; i < this.labels.length; i++) {
      for (let j = i + 1; j < this.labels.length; j++) {
        if (boxesIntersect(this.labels[i], this.labels[j])) {
          collisionCount++;
        }
      }
    }

    return {
      totalLabels: this.labels.length,
      collisionCount,
      gridCells: this.spatialGrid.size
    };
  }
}

/**
 * Generate placement candidates for a label
 */
export function generatePlacementCandidates(
  centerX: number,
  centerY: number,
  labelWidth: number,
  labelHeight: number,
  options: {
    preferredAnchors?: string[];
    radiusStep?: number;
    maxRadius?: number;
  } = {}
): PlacementCandidate[] {
  const {
    preferredAnchors = ['center', 'top', 'bottom', 'left', 'right'],
    radiusStep = 5,
    maxRadius = 30
  } = options;

  const candidates: PlacementCandidate[] = [];
  const anchors: Array<{ anchor: PlacementCandidate['anchor']; dx: number; dy: number }> = [
    { anchor: 'center', dx: -labelWidth / 2, dy: -labelHeight / 2 },
    { anchor: 'top', dx: -labelWidth / 2, dy: -labelHeight },
    { anchor: 'bottom', dx: -labelWidth / 2, dy: 0 },
    { anchor: 'left', dx: -labelWidth, dy: -labelHeight / 2 },
    { anchor: 'right', dx: 0, dy: -labelHeight / 2 },
    { anchor: 'top-left', dx: -labelWidth, dy: -labelHeight },
    { anchor: 'top-right', dx: 0, dy: -labelHeight },
    { anchor: 'bottom-left', dx: -labelWidth, dy: 0 },
    { anchor: 'bottom-right', dx: 0, dy: 0 }
  ];

  // Try preferred position first (center)
  candidates.push({
    x: centerX - labelWidth / 2,
    y: centerY - labelHeight / 2,
    score: 0,
    anchor: 'center'
  });

  // Generate candidates in expanding circles
  for (let radius = radiusStep; radius <= maxRadius; radius += radiusStep) {
    const angleStep = Math.PI / 8; // 22.5 degrees
    
    for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
      const offsetX = Math.cos(angle) * radius;
      const offsetY = Math.sin(angle) * radius;
      
      anchors.forEach(({ anchor, dx, dy }) => {
        if (preferredAnchors.includes(anchor)) {
          candidates.push({
            x: centerX + offsetX + dx,
            y: centerY + offsetY + dy,
            score: radius, // Distance from preferred position
            anchor
          });
        }
      });
    }
  }

  return candidates;
}

/**
 * Find optimal label placement avoiding collisions
 */
export function findOptimalPlacement(
  centerX: number,
  centerY: number,
  text: string,
  fontSize: number,
  detector: CollisionDetector,
  options: {
    priority?: number;
    type?: LabelBounds['type'];
    parcelId?: string;
    preferredAnchors?: string[];
    maxAttempts?: number;
  } = {}
): { x: number; y: number; anchor: string } | null {
  const {
    priority = 5,
    type = 'stand',
    parcelId,
    preferredAnchors = ['center', 'top', 'bottom', 'left', 'right'],
    maxAttempts = 100
  } = options;

  // Estimate label dimensions (rough approximation)
  const charWidth = fontSize * 0.6;
  const labelWidth = text.length * charWidth;
  const labelHeight = fontSize * 1.2;

  // Generate placement candidates
  const candidates = generatePlacementCandidates(
    centerX,
    centerY,
    labelWidth,
    labelHeight,
    { preferredAnchors, maxRadius: 50 }
  );

  // Try each candidate
  for (let i = 0; i < Math.min(candidates.length, maxAttempts); i++) {
    const candidate = candidates[i];
    
    const labelBounds: LabelBounds = {
      x: candidate.x,
      y: candidate.y,
      width: labelWidth,
      height: labelHeight,
      text,
      priority,
      type,
      parcelId
    };

    const collision = detector.checkCollision(labelBounds);
    
    if (!collision.hasCollision) {
      return {
        x: candidate.x,
        y: candidate.y,
        anchor: candidate.anchor
      };
    }
  }

  // No collision-free placement found
  return null;
}

/**
 * Calculate adaptive font size based on available space and label density
 */
export function calculateAdaptiveFontSize(
  baseSize: number,
  availableWidth: number,
  availableHeight: number,
  textLength: number,
  labelDensity: number // 0-1, where 1 is very crowded
): number {
  // Adjust for available space
  const maxWidthSize = (availableWidth / (textLength * 0.6));
  const maxHeightSize = availableHeight / 1.2;
  const spaceLimitedSize = Math.min(maxWidthSize, maxHeightSize);

  // Adjust for density
  const densityFactor = 1 - (labelDensity * 0.4); // Reduce up to 40% in crowded areas
  
  // Combine factors
  let adaptiveSize = Math.min(baseSize, spaceLimitedSize) * densityFactor;
  
  // Clamp to readable range
  return Math.max(6, Math.min(24, adaptiveSize));
}

/**
 * Calculate label density in a region
 */
export function calculateLabelDensity(
  x: number,
  y: number,
  radius: number,
  detector: CollisionDetector
): number {
  const labels = detector.getLabels();
  let labelsInRadius = 0;
  
  labels.forEach(label => {
    const labelCenterX = label.x + label.width / 2;
    const labelCenterY = label.y + label.height / 2;
    const distance = Math.sqrt(
      Math.pow(labelCenterX - x, 2) + Math.pow(labelCenterY - y, 2)
    );
    
    if (distance <= radius) {
      labelsInRadius++;
    }
  });

  // Normalize by area
  const area = Math.PI * radius * radius;
  const density = labelsInRadius / (area / 1000); // Labels per 1000 sq pixels
  
  return Math.min(1, density / 5); // Normalize to 0-1 range
}

/**
 * Prioritize labels based on importance
 */
export function prioritizeLabels(labels: Array<{
  text: string;
  type: LabelBounds['type'];
  area?: number;
}>): Array<{ text: string; priority: number }> {
  return labels.map(label => {
    let priority = 5; // Default
    
    switch (label.type) {
      case 'stand':
        priority = 10; // Highest - parcel/stand numbers
        break;
      case 'beacon':
        priority = 8; // High - beacon identifiers
        break;
      case 'edge-distance':
        priority = 6; // Medium - distance measurements
        break;
      case 'edge-bearing':
        priority = 4; // Lower - bearing annotations
        break;
    }
    
    // Boost priority for larger parcels (more important)
    if (label.area && label.area > 5000) {
      priority += 2;
    }
    
    return {
      text: label.text,
      priority
    };
  });
}

export default {
  CollisionDetector,
  boxesIntersect,
  calculateOverlapArea,
  generatePlacementCandidates,
  findOptimalPlacement,
  calculateAdaptiveFontSize,
  calculateLabelDensity,
  prioritizeLabels
};
