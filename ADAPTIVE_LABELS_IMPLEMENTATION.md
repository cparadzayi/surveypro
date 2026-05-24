# 🏷️ Adaptive Control Point Labels Implementation

## 🎯 **Objective**

Implement zoom-based adaptive labeling for control points on the map to avoid clutter, inspired by the trig beacon inset map implementation.

---

## ✅ **Implementation**

### **Replaced HTML Markers with MapLibre Symbol Layers**

**Before:**
- ❌ HTML markers (`<div>` elements with emojis)
- ❌ All labels always visible
- ❌ Cluttered at low zoom levels
- ❌ Poor performance with many points

**After:**
- ✅ Native MapLibre symbol layers (circles + text)
- ✅ Adaptive labels based on zoom level
- ✅ Automatic label collision detection
- ✅ Better performance and rendering

---

## 🔧 **Key Features**

### **1. Zoom-Based Label Adaptation**

```typescript
'text-field': [
  'step', ['zoom'],
  '',  // No labels below zoom 9 (overview)
  9, ['get', 'shortId'],  // Short ID from zoom 9-12 (e.g., "105")
  12, ['get', 'monu_num'],  // Full monument number from zoom 12-14 (e.g., "105/S")
  14, [
    'concat',
    ['get', 'monu_num'],  // Monument number
    '\n',
    ['to-string', ['round', ['get', 'distance']]],  // Distance in km
    ' km'
  ]  // Full details at zoom 14+ (e.g., "105/S\n5 km")
]
```

**Zoom Levels:**
- **< 9**: No labels (clean overview)
- **9-12**: Short ID only (numbers, e.g., "105")
- **12-14**: Full monument number (e.g., "105/S")
- **14+**: Monument number + distance (e.g., "105/S\n5 km")

### **2. Collision Detection**

```typescript
'text-allow-overlap': false,  // Prevent label overlap
'text-optional': true,  // Hide labels if they would overlap
```

MapLibre automatically hides labels that would overlap with other labels or symbols, keeping the map clean.

### **3. Selection Priority**

```typescript
'symbol-sort-key': [
  'case',
  ['get', 'isSelected'],
  0,   // Selected points have higher priority
  1    // Unselected points have lower priority
]
```

Selected control points are prioritized and their labels are more likely to be shown when space is limited.

### **4. Visual Distinction**

**Symbols:**
```typescript
'circle-color': [
  'case',
  ['get', 'isSelected'],
  '#dc2626',  // Red for selected
  '#3b82f6'   // Blue for unselected
]
'circle-radius': [
  'case',
  ['get', 'isSelected'],
  8,   // Larger for selected
  6    // Smaller for unselected
]
```

**Labels:**
```typescript
'text-color': [
  'case',
  ['get', 'isSelected'],
  '#991b1b',  // Dark red for selected
  '#1e40af'   // Dark blue for unselected
]
```

### **5. Text Sizing**

```typescript
'text-size': [
  'interpolate', ['linear'], ['zoom'],
  9, 9,    // Small text at zoom 9
  12, 11,  // Medium at zoom 12
  15, 13   // Larger at zoom 15
]
```

Text size smoothly increases as you zoom in for better readability.

---

## 🎨 **Visual Behavior**

### **Zoom Level 8 (Far Out)**
```
Map shows region overview
No labels visible
Only colored circles
Clean, uncluttered view
```

### **Zoom Level 10 (Medium)**
```
Short IDs appear: "105", "89", "234"
Only non-overlapping labels shown
Selected points prioritized
Readable but not cluttered
```

### **Zoom Level 13 (Close)**
```
Full monument numbers: "105/S", "89/N", "234/W"
More labels visible as space allows
Clear identification of points
```

### **Zoom Level 15 (Very Close)**
```
Full details with distance:
"105/S
5 km"

"89/N
12 km"

All labels visible (no overlap)
Maximum detail
```

---

## 📊 **Performance Benefits**

### **HTML Markers (Before)**
- Each marker is a DOM element
- 27 markers = 27 DOM nodes
- Browser must layout and render each element
- Slow with 100+ markers
- No built-in collision detection

### **Symbol Layers (After)**
- Rendered on GPU via WebGL
- All points in single draw call
- Native collision detection
- Fast with 1000+ points
- Smooth zoom transitions

---

## 🔄 **Reactivity**

### **Selection Updates**

When user selects/deselects points:

```typescript
function updateMarkers() {
  // Update GeoJSON source with new selection state
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: filteredAndSortedPoints.value.map((point) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [point.x, point.y] },
      properties: {
        id: point.id,
        monu_num: point.monu_num,
        isSelected: selectedIdsRef.value.includes(point.id),  // ✅ Updated
        // ...
      }
    }))
  }
  
  source.setData(geojson)  // ✅ Instant visual update
}
```

Colors and sizes update instantly without recreating layers.

---

## 🎯 **Inspired By: Trig Beacon Inset Map**

The implementation follows the same pattern as the trig beacon inset map in `MapLibreAreaView.vue`:

### **Similarities**

1. **Zoom-based text fields**
   ```typescript
   // Both use 'step' expression for zoom-based labels
   'text-field': ['step', ['zoom'], '', 8, ['get', 'shortId'], ...]
   ```

2. **Collision prevention**
   ```typescript
   'text-allow-overlap': false
   'text-optional': true
   ```

3. **Text halos for readability**
   ```typescript
   'text-halo-color': '#ffffff'
   'text-halo-width': 2
   ```

4. **Adaptive text sizing**
   ```typescript
   'text-size': ['interpolate', ['linear'], ['zoom'], ...]
   ```

### **Differences**

| Feature | Trig Inset | Control Point Map |
|---------|-----------|-------------------|
| **Zoom thresholds** | 8, 11, 13 | 9, 12, 14 |
| **Symbol type** | Custom triangle | Circle |
| **Selection state** | No | Yes (red/blue) |
| **Distance display** | No | Yes (at zoom 14+) |
| **Priority sorting** | No | Yes (selected first) |

---

## 📝 **Files Modified**

### **`app-frontend/src/composables/useControlPointMap.ts`**

**Changes:**

1. **`addPointsToMap()` function (lines 209-368)**
   - Removed HTML marker creation
   - Added GeoJSON source creation
   - Added circle symbol layer
   - Added adaptive text label layer
   - Added click handlers for popups
   - Added hover cursor changes

2. **`updateMarkers()` function (lines 370-404)**
   - Changed from updating HTML elements
   - Now updates GeoJSON source data
   - Preserves selection state

**Key additions:**
- GeoJSON feature collection with properties
- Symbol layer with data-driven styling
- Adaptive text field with zoom steps
- Collision detection configuration
- Selection priority sorting

---

## ✅ **Testing Checklist**

After reloading the workflow:

- [ ] Navigate to Control Point Selection
- [ ] Verify map displays colored circles
- [ ] Zoom out (< 9) - no labels visible
- [ ] Zoom to level 10 - short IDs appear
- [ ] Zoom to level 13 - full monument numbers
- [ ] Zoom to level 15 - distance info appears
- [ ] Verify no label overlap
- [ ] Select a point - verify color changes to red
- [ ] Verify selected point labels prioritized
- [ ] Click a point - verify popup appears
- [ ] Hover over point - verify cursor changes

---

## 🎯 **Expected Behavior**

### **At Zoom 9**
```
Map View:
  🔵 🔵 🔵 🔵 🔵
  105  89  234  156  78
```

### **At Zoom 12**
```
Map View:
  🔵      🔵      🔵
  105/S   89/N    234/W
  
  🔵      🔵
  156/E   78/S
```

### **At Zoom 14**
```
Map View:
  🔵
  105/S
  5 km
  
  🔵
  89/N
  12 km
  
  🔵
  234/W
  8 km
```

### **With Selection**
```
Map View:
  🔴 (Selected - Red, Larger)
  105/S
  5 km
  
  🔵 (Unselected - Blue, Smaller)
  89/N
  12 km
```

---

## 🎉 **Benefits**

1. **Reduced Clutter**
   - Labels only appear when there's space
   - Automatic collision detection
   - Zoom-appropriate detail level

2. **Better Performance**
   - GPU-accelerated rendering
   - Single draw call for all points
   - Smooth zoom transitions

3. **Improved UX**
   - Clean overview at low zoom
   - Progressive detail disclosure
   - Selected points stand out
   - Distance info when zoomed in

4. **Professional Appearance**
   - Follows cadastral mapping standards
   - Similar to trig beacon inset
   - Consistent visual language

---

## 🔍 **Debug Console Output**

Expected logs:

```
[useControlPointMap] 🗺️ Adding points to map: 27
[useControlPointMap] ✅ Added symbol layers with adaptive labels

// When selection changes:
[useControlPointMap] ✅ Updated markers with new selection state
```

---

**Last Updated**: November 24, 2025, 6:50 AM  
**Status**: ✅ Implemented - Adaptive labels with zoom-based detail levels  
**Reload the workflow to see the new adaptive labeling!** 🎨
