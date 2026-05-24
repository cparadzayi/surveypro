# Nearby Points Labeling and Context Preservation

## Overview
Implemented intelligent nearby point detection and labeling to solve the visualization loss problem when zooming to selected points. The system now automatically identifies and labels points in the vicinity of selected points, making it easy to select additional parcel vertices for area calculations.

---

## Problem Solved

### **Before** ❌
```
User selects 3 points
↓
Map zooms in close to selected points
↓
Problem: Lost visualization of surrounding points
Problem: Can't see which points are nearby
Problem: Hard to select additional vertices
Result: Poor UX for parcel definition
```

### **After** ✅
```
User selects 3 points
↓
Map zooms to show selected points + context
↓
Nearby points automatically:
  - Show permanent labels
  - Highlighted with darker color
  - Larger markers (30% bigger)
  - More visible (higher opacity)
↓
Result: Easy to see and select adjacent vertices
```

---

## Features Implemented

### **1. Nearby Point Detection**
Automatically identifies points within 50% of the diagonal distance from selected points' center.

### **2. Permanent Labels**
Nearby points show their names permanently (no hover required).

### **3. Visual Distinction**
Nearby points are:
- **30% larger** than regular background points
- **Darker color** (#6b7280 vs #9ca3af)
- **Thicker border** (2px vs 1px)
- **Higher opacity** (0.8 vs 0.5)

### **4. Generous Zoom Padding**
Map uses 100% padding (2x bounds) and caps zoom at level 14 to maintain context.

---

## Implementation Details

### **Nearby Point Detection Algorithm**

```typescript
// Calculate nearby points if selected points exist
const nearbyPointIndices = new Set<number>()
if (latlngs.length > 0) {
  // Calculate bounding box of selected points
  const selectedBounds = L.latLngBounds(latlngs)
  const center = selectedBounds.getCenter()
  
  // Calculate distance threshold (50% of diagonal)
  const ne = selectedBounds.getNorthEast()
  const sw = selectedBounds.getSouthWest()
  const diagonal = Math.sqrt(
    Math.pow(ne.lat - sw.lat, 2) + Math.pow(ne.lng - sw.lng, 2)
  )
  const threshold = diagonal * 0.5  // 50% of diagonal
  
  // Find nearby points
  bgPts.forEach((pt, i) => {
    const dist = Math.sqrt(
      Math.pow(pt.latlng[0] - center.lat, 2) + 
      Math.pow(pt.latlng[1] - center.lng, 2)
    )
    if (dist <= threshold) {
      nearbyPointIndices.add(i)
    }
  })
}
```

### **Visual Styling**

```typescript
// Render background points with smart labeling
for (let i = 0; i < bgLatLngs.length; i++) {
  const isNearby = nearbyPointIndices.has(i)
  
  const m = L.circleMarker(bgLatLngs[i], {
    radius: getMarkerRadius(zoom, true) * (isNearby ? 1.3 : 1.0),
    color: isNearby ? '#6b7280' : '#9ca3af',  // Darker if nearby
    weight: isNearby ? 2 : 1,
    fillColor: isNearby ? '#9ca3af' : '#d1d5db',
    fillOpacity: isNearby ? 0.8 : 0.5
  })
  
  m.bindTooltip(String(bgPts[i].name), {
    permanent: isNearby,  // Show label permanently for nearby points
    direction: 'top',
    offset: L.point(0, isNearby ? -8 : -6),
    className: 'area-map-label'
  })
}
```

### **Improved Zoom/Padding**

```typescript
// Fit bounds with generous padding
if (latlngs.length > 0) {
  const b = L.latLngBounds(latlngs)
  if (b.isValid()) {
    // Use 100% padding (2x the bounds) to show surrounding context
    map.fitBounds(b.pad(1.0), { maxZoom: 14 })  // Cap zoom at 14
  }
}
```

---

## Visual Comparison

### **Regular Background Points**
```
Color: Light gray (#9ca3af)
Fill: Very light gray (#d1d5db)
Opacity: 50%
Border: 1px
Radius: Base size (3px at zoom 10)
Label: On hover only
```

### **Nearby Points (Highlighted)**
```
Color: Medium gray (#6b7280) - DARKER
Fill: Light gray (#9ca3af) - DARKER
Opacity: 80% - HIGHER
Border: 2px - THICKER
Radius: Base size × 1.3 (3.9px at zoom 10) - LARGER
Label: Permanent - ALWAYS VISIBLE
```

### **Selected Points**
```
Color: Red (#dc2626)
Fill: Bright red (#ef4444)
Opacity: 90%
Border: 2px
Radius: Base size × 2 (6px at zoom 10)
Label: Permanent
```

---

## User Experience

### **Scenario: Defining a Parcel**

#### **Step 1: Initial Selection**
```
User adds first point: "2524B"
↓
Map shows:
- All 542 gray points (small)
- 1 red point (selected)
- No nearby highlighting yet
- Zoom: Overview
```

#### **Step 2: Add Second Point**
```
User adds: "2413A"
↓
Map shows:
- 542 gray points
- 2 red points
- Still no nearby highlighting
- Zoom: Overview
```

#### **Step 3: Add Third Point (Nearby Detection Activates)**
```
User adds: "2411C"
↓
System calculates:
- Center of 3 selected points
- Diagonal distance
- Threshold = 50% of diagonal
↓
Map automatically:
- Zooms to selected points with 100% padding
- Caps zoom at level 14
- Identifies ~20 nearby points
- Shows permanent labels for nearby points
- Highlights nearby points (darker, larger)
↓
User sees:
- 3 red points (selected) with labels
- ~20 highlighted gray points with labels (nearby)
- ~520 regular gray points (background, no labels)
- Green polygon connecting selected points
↓
Result: Easy to identify and select adjacent vertices!
```

#### **Step 4: Select Adjacent Vertex**
```
User sees labeled nearby point: "2410A"
↓
User searches for "2410A" and adds it
↓
Map updates:
- 4 red points (selected)
- Recalculates nearby points
- Updates labels and highlighting
- Polygon updates to include new point
```

---

## Distance Threshold Calculation

### **Formula**
```
diagonal = √((ne.lat - sw.lat)² + (ne.lng - sw.lng)²)
threshold = diagonal × 0.5
```

### **Example**
```
Selected points bounding box:
- NE: (96800, -2247600)
- SW: (96700, -2247700)
↓
Diagonal = √((100)² + (100)²) = √20000 ≈ 141.4 units
↓
Threshold = 141.4 × 0.5 = 70.7 units
↓
Any point within 70.7 units of center is "nearby"
```

### **Adjustable Threshold**
```typescript
// Current: 50% of diagonal
const threshold = diagonal * 0.5

// More aggressive (more nearby points):
const threshold = diagonal * 0.75  // 75%

// Less aggressive (fewer nearby points):
const threshold = diagonal * 0.3  // 30%
```

---

## Benefits

### **1. Better Context** 🎯
✅ **Generous padding**: 100% padding shows 2x the area  
✅ **Zoom cap**: Max zoom 14 prevents getting too close  
✅ **Nearby detection**: Automatically identifies relevant points  

### **2. Improved Selection** 🖱️
✅ **Permanent labels**: No need to hover to see names  
✅ **Visual distinction**: Easy to spot nearby points  
✅ **Larger markers**: Easier to click  

### **3. Efficient Workflow** ⚡
✅ **Automatic**: No manual zooming/panning needed  
✅ **Smart**: Only labels relevant points  
✅ **Scalable**: Works with any number of points  

### **4. Professional UX** 💼
✅ **Intuitive**: Natural workflow for parcel definition  
✅ **Responsive**: Updates as points are added/removed  
✅ **Polished**: Clear visual hierarchy  

---

## Configuration

### **Adjusting Distance Threshold**

```typescript
// Current: 50% of diagonal
const threshold = diagonal * 0.5

// Show more nearby points (larger radius):
const threshold = diagonal * 0.8  // 80% of diagonal

// Show fewer nearby points (smaller radius):
const threshold = diagonal * 0.3  // 30% of diagonal
```

### **Adjusting Visual Distinction**

```typescript
// Current: 30% larger
radius: getMarkerRadius(zoom, true) * (isNearby ? 1.3 : 1.0)

// More prominent:
radius: getMarkerRadius(zoom, true) * (isNearby ? 1.5 : 1.0)

// Subtle:
radius: getMarkerRadius(zoom, true) * (isNearby ? 1.1 : 1.0)
```

### **Adjusting Zoom Padding**

```typescript
// Current: 100% padding, max zoom 14
map.fitBounds(b.pad(1.0), { maxZoom: 14 })

// More context (zoom out more):
map.fitBounds(b.pad(1.5), { maxZoom: 12 })

// Less context (zoom in more):
map.fitBounds(b.pad(0.5), { maxZoom: 16 })
```

---

## Testing

### **Test 1: Nearby Detection**
1. Load layer with 542 points
2. Add 3 points close together
3. **Expected**: ~10-30 nearby points highlighted
4. **Expected**: Nearby points show permanent labels
5. **Expected**: Nearby points are darker and larger

### **Test 2: Zoom Context**
1. After selecting 3 points
2. **Expected**: Map zooms to show selected points
3. **Expected**: Zoom level ≤ 14 (not too close)
4. **Expected**: Surrounding points visible
5. **Expected**: 100% padding around selected points

### **Test 3: Dynamic Updates**
1. Start with 3 selected points
2. Add a 4th point
3. **Expected**: Nearby points recalculated
4. **Expected**: Labels update automatically
5. **Expected**: Highlighting updates

### **Test 4: Sparse vs Dense**
1. Select 3 points far apart
2. **Expected**: Fewer nearby points (larger threshold)
3. Select 3 points close together
4. **Expected**: More nearby points (smaller threshold)

### **Test 5: Performance**
1. Load layer with 542 points
2. Select 3 points
3. **Expected**: Nearby detection completes instantly
4. **Expected**: No lag in rendering
5. **Expected**: Smooth zoom animation

---

## Future Enhancements

### **1. Adjustable Threshold**
Allow users to control nearby radius:
```typescript
const nearbyRadius = ref<number>(0.5)  // 50% default

// UI slider
<input type="range" min="0.2" max="1.0" step="0.1" v-model="nearbyRadius" />
```

### **2. Highlight on Hover**
Temporarily highlight a nearby point when hovering:
```typescript
m.on('mouseover', () => {
  m.setStyle({ fillOpacity: 1.0, weight: 3 })
})
m.on('mouseout', () => {
  m.setStyle({ fillOpacity: isNearby ? 0.8 : 0.5, weight: isNearby ? 2 : 1 })
})
```

### **3. Click to Add**
Allow clicking nearby points to add them:
```typescript
m.on('click', () => {
  // Add this point to selection
  addPointByName(bgPts[i].name)
})
```

### **4. Distance Display**
Show distance from selected points:
```typescript
m.bindTooltip(`${bgPts[i].name} (${dist.toFixed(1)}m)`, {
  permanent: isNearby
})
```

---

## Summary

✅ **Nearby Detection**: Automatically identifies points within 50% of diagonal  
✅ **Permanent Labels**: Nearby points always show names  
✅ **Visual Distinction**: Darker, larger, more prominent  
✅ **Generous Padding**: 100% padding shows 2x the area  
✅ **Zoom Cap**: Max zoom 14 maintains context  
✅ **Dynamic Updates**: Recalculates as points are added  

The map now intelligently highlights and labels nearby points, making it easy to identify and select adjacent parcel vertices without losing context! 🗺️✨
