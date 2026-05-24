# Map Label Collision Detection System

## Overview

Advanced collision detection and dynamic label placement system for survey plan map annotations with SI 727 compliance.

## Features

### 1. Spatial Indexing
- **Grid-based spatial indexing** for O(1) collision detection
- Configurable grid cell size (default 50px)
- Efficient for large numbers of labels (100+ labels)

### 2. Dynamic Placement
- **Intelligent candidate generation** with expanding circles
- Multiple anchor points (center, top, bottom, left, right, corners)
- Configurable search radius and step size
- Priority-based placement (stand > beacon > edge labels)

### 3. Adaptive Font Sizing
- **Density-aware sizing** - reduces font size in crowded areas
- Space-constrained sizing - fits labels within available space
- Maintains readability (6pt minimum, 24pt maximum)
- SI 727 compliant sizing for field readability

### 4. Collision Scoring
- Overlap area calculation
- Priority-based conflict resolution
- Buffer zones for visual separation

## Usage

### Basic Setup

```typescript
import { CollisionDetector, findOptimalPlacement } from '@/utils/mapLabelCollisionDetector';

// Initialize detector
const detector = new CollisionDetector(50); // 50px grid size
```

### Adding Labels

```typescript
// Add a stand label
detector.addLabel({
  x: 100,
  y: 200,
  width: 40,
  height: 12,
  text: '2283',
  priority: 10,
  type: 'stand',
  parcelId: 'parcel-1'
});

// Add a beacon label
detector.addLabel({
  x: 150,
  y: 220,
  width: 50,
  height: 10,
  text: 'P2',
  priority: 8,
  type: 'beacon'
});
```

### Finding Optimal Placement

```typescript
const placement = findOptimalPlacement(
  centerX,      // Label center X
  centerY,      // Label center Y
  'Stand 2283', // Label text
  12,           // Font size
  detector,     // Collision detector
  {
    priority: 10,
    type: 'stand',
    parcelId: 'parcel-1',
    preferredAnchors: ['center', 'top', 'bottom'],
    maxAttempts: 100
  }
);

if (placement) {
  // Place label at placement.x, placement.y with placement.anchor
  console.log(`Place at (${placement.x}, ${placement.y}) anchor: ${placement.anchor}`);
} else {
  // No collision-free placement found
  console.warn('Label collision unavoidable');
}
```

### Adaptive Font Sizing

```typescript
import { calculateAdaptiveFontSize, calculateLabelDensity } from '@/utils/mapLabelCollisionDetector';

// Calculate label density in area
const density = calculateLabelDensity(x, y, 100, detector); // 100px radius

// Calculate adaptive font size
const fontSize = calculateAdaptiveFontSize(
  14,           // Base font size
  80,           // Available width
  20,           // Available height
  8,            // Text length (characters)
  density       // Label density (0-1)
);
```

### Collision Statistics

```typescript
const stats = detector.getStatistics();
console.log(`Total labels: ${stats.totalLabels}`);
console.log(`Collisions: ${stats.collisionCount}`);
console.log(`Grid cells: ${stats.gridCells}`);
```

## Label Priority Hierarchy

1. **Stand/Parcel Numbers** (Priority 10)
   - Most important
   - Always attempt to place first
   - Larger font sizes

2. **Beacon Identifiers** (Priority 8)
   - High importance
   - Essential for survey control
   - Medium font sizes

3. **Edge Distances** (Priority 6)
   - Medium importance
   - Measurement annotations
   - Smaller font sizes

4. **Edge Bearings** (Priority 4)
   - Lower importance
   - Directional annotations
   - Smallest font sizes

## Integration with MapLibre

### Example: Stand Labels with Collision Avoidance

```typescript
// In SurveyPlanMapView.vue
import { CollisionDetector, findOptimalPlacement } from '@/utils/mapLabelCollisionDetector';

const detector = new CollisionDetector();

// Process parcels
parcels.value.forEach(parcel => {
  const centroid = calculateCentroid(parcel.geom.coordinates[0]);
  const standNumber = parcel.stand;
  
  // Find optimal placement
  const placement = findOptimalPlacement(
    centroid.lng,
    centroid.lat,
    standNumber,
    14,
    detector,
    {
      priority: 10,
      type: 'stand',
      parcelId: parcel.id
    }
  );
  
  if (placement) {
    // Add to MapLibre as GeoJSON feature
    standFeatures.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [placement.x, placement.y]
      },
      properties: {
        stand: standNumber,
        anchor: placement.anchor
      }
    });
  }
});
```

### MapLibre Layer Configuration

```typescript
map.addLayer({
  id: 'stand-labels-layer',
  type: 'symbol',
  source: 'stand-labels',
  layout: {
    'text-field': ['get', 'stand'],
    'text-size': [
      'interpolate',
      ['linear'],
      ['zoom'],
      12, 10,
      16, 14,
      20, 18
    ],
    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
    'text-anchor': ['get', 'anchor'], // Use calculated anchor
    'text-allow-overlap': false,
    'text-ignore-placement': false,
    'text-optional': false,
    'text-padding': 3
  },
  paint: {
    'text-color': '#0f172a',
    'text-halo-color': '#ffffff',
    'text-halo-width': 2,
    'text-halo-blur': 1
  }
});
```

## Integration with PDF Export

### Example: Backend PDF Labeling

```javascript
// In pdfkitLabeling.js
import { CollisionDetector, findOptimalPlacement } from '../../../app-frontend/src/utils/mapLabelCollisionDetector.js';

const detector = new CollisionDetector();

// Render stand labels
parcels.features.forEach(parcel => {
  const coords = parcel.geometry.coordinates[0];
  const centroid = calculateCentroid(coords);
  const pdfPos = transformCoords(centroid.y, centroid.x, extent, mapBounds);
  
  const placement = findOptimalPlacement(
    pdfPos.x,
    pdfPos.y,
    parcel.properties.stand,
    12,
    detector,
    { priority: 10, type: 'stand' }
  );
  
  if (placement) {
    doc.fontSize(12)
       .text(parcel.properties.stand, placement.x, placement.y);
    
    // Add to detector for subsequent collision checks
    detector.addLabel({
      x: placement.x,
      y: placement.y,
      width: doc.widthOfString(parcel.properties.stand),
      height: 12 * 1.2,
      text: parcel.properties.stand,
      priority: 10,
      type: 'stand'
    });
  }
});
```

## Performance Considerations

### Spatial Grid Optimization
- Grid size affects performance vs. accuracy tradeoff
- Smaller grid (25px): More accurate, slower
- Larger grid (100px): Faster, less accurate
- Recommended: 50px for most use cases

### Label Count Scaling
- **< 50 labels**: No optimization needed
- **50-200 labels**: Use spatial grid (default)
- **200+ labels**: Consider label clustering or level-of-detail

### Placement Search
- `maxAttempts` limits search iterations
- Default 100 attempts balances quality vs. speed
- Reduce to 50 for faster placement
- Increase to 200 for better collision avoidance

## Best Practices

### 1. Label Prioritization
Always place high-priority labels first:
```typescript
const sortedLabels = labels.sort((a, b) => b.priority - a.priority);
sortedLabels.forEach(label => {
  const placement = findOptimalPlacement(...);
  if (placement) detector.addLabel(...);
});
```

### 2. Density-Aware Sizing
Adjust font sizes in crowded areas:
```typescript
const density = calculateLabelDensity(x, y, 100, detector);
const fontSize = calculateAdaptiveFontSize(14, width, height, text.length, density);
```

### 3. Graceful Degradation
Handle cases where no collision-free placement exists:
```typescript
const placement = findOptimalPlacement(...);
if (!placement) {
  // Option 1: Use smallest font size
  // Option 2: Hide label (text-optional: true in MapLibre)
  // Option 3: Force placement at preferred position
}
```

### 4. Clear Detector Between Renders
```typescript
detector.clear(); // Clear before re-rendering
```

## SI 727 Compliance

### Font Size Requirements
- **Stand numbers**: Minimum 8pt (2.8mm at 1:1000)
- **Beacon labels**: Minimum 6pt (2.1mm at 1:1000)
- **Edge labels**: Minimum 5pt (1.8mm at 1:1000)

### Spacing Requirements
- **Minimum clearance**: 2mm between labels
- **Buffer from boundaries**: 1mm
- **Text halo**: 1-2pt for readability

### Field Readability
Labels must be readable at:
- **1:1000 scale**: 8-12pt fonts
- **1:2000 scale**: 10-14pt fonts
- **1:5000 scale**: 12-16pt fonts

## Troubleshooting

### Issue: Labels Still Colliding
**Solution**: Increase buffer in collision detection
```typescript
const collision = detector.checkCollision(labelBounds, 4); // Increase buffer to 4px
```

### Issue: No Placement Found
**Solution**: Increase search radius or reduce font size
```typescript
const placement = findOptimalPlacement(..., {
  maxAttempts: 200, // More attempts
  preferredAnchors: ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right'] // More anchors
});
```

### Issue: Performance Slow
**Solution**: Increase grid size or reduce label count
```typescript
const detector = new CollisionDetector(100); // Larger grid cells
```

## Future Enhancements

1. **Label Clustering** - Group nearby labels at low zoom levels
2. **Hierarchical LOD** - Show/hide labels based on zoom level
3. **Rotation Support** - Rotate labels to follow edges
4. **Multi-line Labels** - Support for wrapped text
5. **GPU Acceleration** - WebGL-based collision detection

## References

- SI 727 of 1979 (Zimbabwe Survey Regulations)
- MapLibre GL JS Documentation
- PDFKit Documentation
- Computational Geometry: Algorithms and Applications
