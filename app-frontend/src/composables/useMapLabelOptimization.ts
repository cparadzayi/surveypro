/**
 * Composable for optimized map labeling with collision detection
 * Integrates with MapLibre GL for survey plan visualization
 */

import { ref, computed, shallowRef } from 'vue';
import {
  CollisionDetector,
  findOptimalPlacement,
  calculateAdaptiveFontSize,
  calculateLabelDensity,
  prioritizeLabels,
  type LabelBounds
} from '../utils/mapLabelCollisionDetector';

export interface MapLabel {
  id: string;
  text: string;
  coordinates: [number, number]; // [lng, lat] or [y, x] in Cape Lo
  type: 'stand' | 'beacon' | 'edge-distance' | 'edge-bearing';
  parcelId?: string;
  fontSize?: number;
  priority?: number;
  metadata?: Record<string, any>;
}

export interface OptimizedLabel extends MapLabel {
  placement: {
    x: number;
    y: number;
    anchor: string;
  };
  fontSize: number;
  hasCollision: boolean;
  density: number;
}

export interface LabelOptimizationOptions {
  gridSize?: number;
  baseFontSize?: number;
  minFontSize?: number;
  maxFontSize?: number;
  densityRadius?: number;
  maxPlacementAttempts?: number;
  collisionBuffer?: number;
}

export function useMapLabelOptimization(options: LabelOptimizationOptions = {}) {
  const {
    gridSize = 50,
    baseFontSize = 14,
    minFontSize = 6,
    maxFontSize = 24,
    densityRadius = 100,
    maxPlacementAttempts = 100,
    collisionBuffer = 2
  } = options;

  const detector = shallowRef<CollisionDetector>(new CollisionDetector(gridSize));
  const optimizedLabels = ref<OptimizedLabel[]>([]);
  const statistics = ref({
    totalLabels: 0,
    placedLabels: 0,
    collisions: 0,
    averageDensity: 0
  });

  /**
   * Reset the detector and clear all labels
   */
  function reset() {
    detector.value.clear();
    optimizedLabels.value = [];
    statistics.value = {
      totalLabels: 0,
      placedLabels: 0,
      collisions: 0,
      averageDensity: 0
    };
  }

  /**
   * Optimize label placement for a set of labels
   */
  function optimizeLabels(labels: MapLabel[]): OptimizedLabel[] {
    reset();
    
    console.log(`[LabelOptimization] 🎯 Optimizing ${labels.length} labels...`);
    
    // Prioritize labels
    const prioritized = prioritizeLabels(
      labels.map(l => ({
        text: l.text,
        type: l.type,
        area: l.metadata?.area
      }))
    );

    // Sort by priority (highest first)
    const sortedLabels = labels
      .map((label, index) => ({
        ...label,
        priority: label.priority || prioritized[index].priority
      }))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    const results: OptimizedLabel[] = [];
    let totalDensity = 0;

    sortedLabels.forEach((label, index) => {
      const [x, y] = label.coordinates;
      
      // Calculate label density at this location
      const currentDetector = detector.value;
      const density = calculateLabelDensity(x, y, densityRadius, currentDetector);
      totalDensity += density;

      // Calculate adaptive font size
      const estimatedWidth = label.text.length * baseFontSize * 0.6;
      const estimatedHeight = baseFontSize * 1.2;
      const adaptiveFontSize = calculateAdaptiveFontSize(
        label.fontSize || baseFontSize,
        estimatedWidth,
        estimatedHeight,
        label.text.length,
        density
      );

      // Clamp font size
      const fontSize = Math.max(minFontSize, Math.min(maxFontSize, adaptiveFontSize));

      // Find optimal placement
      const placement = findOptimalPlacement(
        x,
        y,
        label.text,
        fontSize,
        currentDetector,
        {
          priority: label.priority,
          type: label.type,
          parcelId: label.parcelId,
          maxAttempts: maxPlacementAttempts
        }
      );

      if (placement) {
        // Calculate label bounds
        const charWidth = fontSize * 0.6;
        const labelWidth = label.text.length * charWidth;
        const labelHeight = fontSize * 1.2;

        const labelBounds: LabelBounds = {
          x: placement.x,
          y: placement.y,
          width: labelWidth,
          height: labelHeight,
          text: label.text,
          priority: label.priority || 5,
          type: label.type,
          parcelId: label.parcelId
        };

        // Check collisions against already-placed labels before registering this label.
        // This avoids counting the label as colliding with itself.
        const collision = detector.value.checkCollision(labelBounds, collisionBuffer);
        detector.value.addLabel(labelBounds);

        results.push({
          ...label,
          placement,
          fontSize,
          hasCollision: collision.hasCollision,
          density
        });

        console.log(
          `[LabelOptimization] ✓ ${label.type} "${label.text}": ` +
          `placed at (${placement.x.toFixed(1)}, ${placement.y.toFixed(1)}) ` +
          `anchor=${placement.anchor}, fontSize=${fontSize.toFixed(1)}pt, density=${density.toFixed(2)}`
        );
      } else {
        console.warn(
          `[LabelOptimization] ⚠️ ${label.type} "${label.text}": ` +
          `no collision-free placement found`
        );
      }
    });

    optimizedLabels.value = results;

    // Update statistics
    const detectorStats = detector.value.getStatistics();
    statistics.value = {
      totalLabels: labels.length,
      placedLabels: results.length,
      collisions: detectorStats.collisionCount,
      averageDensity: labels.length > 0 ? totalDensity / labels.length : 0
    };

    console.log(`[LabelOptimization] 📊 Statistics:`);
    console.log(`  Total labels: ${statistics.value.totalLabels}`);
    console.log(`  Placed: ${statistics.value.placedLabels} (${((statistics.value.placedLabels / statistics.value.totalLabels) * 100).toFixed(1)}%)`);
    console.log(`  Collisions: ${statistics.value.collisions}`);
    console.log(`  Avg density: ${statistics.value.averageDensity.toFixed(2)}`);

    return results;
  }

  /**
   * Convert optimized labels to GeoJSON features for MapLibre
   */
  function toGeoJSONFeatures(labels: OptimizedLabel[]): GeoJSON.Feature[] {
    return labels.map(label => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [label.placement.x, label.placement.y]
      },
      properties: {
        id: label.id,
        text: label.text,
        type: label.type,
        fontSize: label.fontSize,
        anchor: label.placement.anchor,
        hasCollision: label.hasCollision,
        density: label.density,
        priority: label.priority,
        parcelId: label.parcelId,
        ...label.metadata
      }
    }));
  }

  /**
   * Get MapLibre layer configuration for optimized labels
   */
  function getMapLibreLayerConfig(sourceId: string, layerId: string) {
    return {
      id: layerId,
      type: 'symbol' as const,
      source: sourceId,
      layout: {
        'text-field': ['get', 'text'],
        'text-size': ['get', 'fontSize'],
        'text-font': [
          'case',
          ['==', ['get', 'type'], 'stand'],
          ['literal', ['Open Sans Bold', 'Arial Unicode MS Bold']],
          ['literal', ['Open Sans Regular', 'Arial Unicode MS Regular']]
        ],
        'text-anchor': ['get', 'anchor'],
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-optional': [
          'case',
          ['==', ['get', 'type'], 'stand'],
          false, // Stand labels are mandatory
          true   // Other labels are optional
        ],
        'text-padding': collisionBuffer,
        'symbol-sort-key': ['get', 'priority']
      },
      paint: {
        'text-color': [
          'case',
          ['get', 'hasCollision'],
          '#f59e0b', // Amber for collisions
          [
            'case',
            ['==', ['get', 'type'], 'stand'],
            '#0f172a', // Dark for stands
            '#475569'  // Gray for others
          ]
        ],
        'text-halo-color': '#ffffff',
        'text-halo-width': [
          'interpolate',
          ['linear'],
          ['get', 'fontSize'],
          6, 1.0,
          12, 1.5,
          18, 2.0,
          24, 2.5
        ],
        'text-halo-blur': 0.5,
        'text-opacity': [
          'interpolate',
          ['linear'],
          ['get', 'density'],
          0, 1.0,    // Low density: full opacity
          0.5, 0.9,  // Medium density: slight fade
          1.0, 0.7   // High density: more fade
        ]
      }
    };
  }

  /**
   * Get labels by type
   */
  function getLabelsByType(type: MapLabel['type']): OptimizedLabel[] {
    return optimizedLabels.value.filter(label => label.type === type);
  }

  /**
   * Get labels with collisions
   */
  function getCollidingLabels(): OptimizedLabel[] {
    return optimizedLabels.value.filter(label => label.hasCollision);
  }

  /**
   * Get labels in high-density areas
   */
  function getHighDensityLabels(threshold: number = 0.7): OptimizedLabel[] {
    return optimizedLabels.value.filter(label => label.density > threshold);
  }

  return {
    // State
    detector,
    optimizedLabels,
    statistics,
    
    // Methods
    reset,
    optimizeLabels,
    toGeoJSONFeatures,
    getMapLibreLayerConfig,
    getLabelsByType,
    getCollidingLabels,
    getHighDensityLabels,
    
    // Computed
    placementSuccessRate: computed(() => 
      statistics.value.totalLabels > 0
        ? (statistics.value.placedLabels / statistics.value.totalLabels) * 100
        : 0
    ),
    hasCollisions: computed(() => statistics.value.collisions > 0),
    isHighDensity: computed(() => statistics.value.averageDensity > 0.5)
  };
}

export default useMapLabelOptimization;
