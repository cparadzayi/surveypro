# Areas2View.vue - Technical Breakdown

## Overview
**Component**: `Areas2View.vue`  
**Module**: Lite Areas v2  
**Purpose**: Interactive area computation tool for land parcels using Zimbabwe P(Y,X) coordinate system

---

## Architecture

### **Component Type**
- Vue 3 Composition API (`<script setup>`)
- Async component loading for DataMap (performance optimization)
- Reactive state management with `ref()` and `computed()`

### **Coordinate System**
- **Zimbabwe P(Y,X)**: Y = westing (positive westward), X = southing (positive southward)
- **Bearings**: South-oriented (0° = South, 90° = West, 180° = North, 270° = East)
- **DMS Support**: Accepts degrees:minutes:seconds format (e.g., `678:12:30`)

---

## Key Features

### 1. **Point Input Methods**

#### **A. Layer Search**
```typescript
layerId: number                // Source spatial layer
suggestions: Feature[]         // Autocomplete results
selectedSuggestion: Feature    // Currently highlighted suggestion
```

**Flow**:
1. User types in search box
2. Debounced search (250ms) queries backend
3. Autocomplete dropdown shows matching points
4. Keyboard navigation: ↑/↓ to select, Enter to add
5. Click to add point directly

**Search Function**:
```typescript
async function onInput() {
  // Debounced search with 250ms delay
  const rows = await searchFeatures(layerId, query, 20)
  suggestions.value = rows.filter(/* case-insensitive match */)
}
```

#### **B. Manual Entry**
```typescript
type PointAdhoc = {
  nameText: string   // Point identifier
  yText: string      // Y coordinate (decimal or DMS)
  xText: string      // X coordinate (decimal or DMS)
}
```

**Validation**:
- Real-time parsing with `parseFlexibleNumberOrDMS()`
- Red border for invalid entries
- Supports: `123.45`, `123,45`, `123:45:30` (DMS)

#### **C. CSV Import**
```typescript
function handleCsvImport(event: Event) {
  // Expected columns: Point, Y, X
  // Case-insensitive header matching
  // Validates each row before import
}
```

**CSV Format**:
```csv
Point,Y,X,Status,Description,Date of survey
2342C,96751.29,-2247626.76,P,,2025-10-30
```

---

### 2. **Point Management**

#### **Drag-to-Reorder**
```typescript
function onDragStart(i: number) { dragIndex.value = i }
function onDrop(i: number) {
  const [m] = points.value.splice(dragIndex.value, 1)
  points.value.splice(i, 0, m)
  void recomputeIfReady()  // Auto-recompute after reorder
}
```

#### **Keyboard Shortcuts**
- **Alt + ↑**: Move focused row up
- **Alt + ↓**: Move focused row down
- **Esc**: Clear search suggestions
- **Enter**: Add selected suggestion

#### **Auto-Recomputation**
Triggers on:
- Point added
- Point removed
- Point reordered
- Coordinate edited (on blur)

---

### 3. **Area Computation**

#### **Backend API Call**
```typescript
interface AreaComputeRequest {
  points: Array<{ y: number; x: number }>
  hectaresThreshold?: number          // Default: 10,000 m²
  roundMetersDecimals?: number        // Default: 0
  roundHectaresDecimals?: number      // Default: 4
  includeResiduals?: boolean          // Default: true
  save?: boolean
  layer_id?: number
}
```

#### **Response Structure**
```typescript
interface AreaComputeResponse {
  ok: boolean
  area: {
    signed_m2: number
    abs_m2: number
    display: { hectares: number; unit: 'ha' } | { square_meters: number; unit: 'm2' }
  }
  centroid: { y: number; x: number }
  residuals?: {
    sumDy: number    // Total Y residual
    sumDx: number    // Total X residual
    edges: Array<{
      index: number
      from: { y: number; x: number }
      to: { y: number; x: number }
      dy: number                    // Y residual for this edge
      dx: number                    // X residual for this edge
      distance: number              // Raw distance
      distanceRounded: number       // Rounded to 0.01m
      bearingDeg: number            // Raw bearing
      bearingRoundedDeg: number     // Rounded (10" or 1")
      secondsResolution: number     // 10 or 1
    }>
  }
}
```

#### **Computation Logic** (Backend)
1. **Shoelace Formula**: Calculate signed area
2. **Centroid**: Polygon center of mass
3. **Traverse Validation**:
   - Compute raw distance & bearing between consecutive points
   - Round distance to 0.01m (banker's rounding)
   - Round bearing seconds: <6000m → 10", ≥6000m → 1"
   - Perform traverse starting at P1 with rounded observations
   - Calculate residuals: `dY = Y_computed - Y_entered`
4. **Closure Gap**: `√(ΣdY² + ΣdX²)`

---

### 4. **Results Display**

#### **Summary Section**
```vue
<div class="text-lg font-medium">
  Area: {{ Math.abs(result.area.display.hectares).toFixed(4) }} ha
</div>
<div class="text-sm text-gray-600">
  Centroid P(Y,X): {{ fmtNumber(result.centroid.y) }}, {{ fmtNumber(result.centroid.x) }}
</div>
```

#### **Residuals Table**
Columns:
- **#**: Point index
- **Point**: Point name/identifier
- **Y-Coordinate**: Entered Y value
- **X-Coordinate**: Entered X value
- **Dist (m)**: Rounded distance to next point
- **Direction**: Bearing in DMS format
- **dY**: Y residual (computed - entered)
- **dX**: X residual (computed - entered)

**Debug Mode** (checkbox enabled):
- `dy_og`: Raw Y difference
- `dx_og`: Raw X difference
- `dist_og`: Raw distance
- `bearing_deg`: Raw bearing in decimal degrees

---

### 5. **Map Preview**

#### **DataMap Component**
```vue
<DataMap :items="mapItems" :layer-id="layerId" />
```

**Item Format**:
```typescript
const mapItems = computed(() => selectedForMap.value.map((p, i) => ({
  geometry: { type: 'Point', coordinates: [p.y, p.x] },
  properties: { name: p.name || `P${i+1}` }
})))
```

**Features**:
- Interactive Leaflet map
- Toggle between LO planar and WGS84 basemap
- Grid overlay with axis labels
- Central meridian (Y=0) in red
- Equator (X=0) in green
- Point markers with labels

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    USER INPUT                            │
├─────────────────────────────────────────────────────────┤
│  Search Layer  │  Manual Entry  │  CSV Import           │
│  ↓             │  ↓             │  ↓                    │
│  Suggestions   │  Validation    │  Parse & Validate     │
│  ↓             │  ↓             │  ↓                    │
│  Add Point ────┴────────────────┴──→ points[]           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                 POINT MANAGEMENT                         │
├─────────────────────────────────────────────────────────┤
│  • Drag to reorder                                       │
│  • Alt+↑/↓ keyboard shortcuts                           │
│  • Remove individual points                              │
│  • Auto-recompute on changes                            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              COORDINATE VALIDATION                       │
├─────────────────────────────────────────────────────────┤
│  parseFlexibleNumberOrDMS()                             │
│  • Decimal: 123.45 or 123,45                            │
│  • DMS: 123:45:30                                       │
│  • Validates M < 60, S < 60                             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│               AREA COMPUTATION                           │
├─────────────────────────────────────────────────────────┤
│  Backend API: POST /compute/area                        │
│  • Shoelace formula for area                            │
│  • Centroid calculation                                 │
│  • Traverse with rounded observations                   │
│  • Residual analysis per edge                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  RESULTS DISPLAY                         │
├─────────────────────────────────────────────────────────┤
│  • Area (m² or ha)                                      │
│  • Centroid P(Y,X)                                      │
│  • Consistency: ΣdY, ΣdX                                │
│  • Edge table with residuals                            │
│  • Map preview                                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    EXPORT                                │
├─────────────────────────────────────────────────────────┤
│  CSV Export: Point, Y, X, Status, Description, Date     │
│  Optional: Save to spatial layer                        │
└─────────────────────────────────────────────────────────┘
```

---

## Issues Fixed

### **1. Missing Error Handling in `doCompute()`**
**Problem**: No try-catch, silent failures

**Fix**:
```typescript
async function doCompute() {
  try {
    result.value = await areaCompute(payload)
    if (result.value?.error) {
      alert(`Computation error: ${result.value.error}`)
    }
  } catch (error) {
    console.error('Area computation failed:', error)
    alert(`Failed to compute area: ${error.message}`)
  }
}
```

### **2. Unsafe Array Access in `displayRows`**
**Problem**: No null checks on edge data structure

**Fix**:
```typescript
const displayRows = computed(() => {
  const edges = result.value?.residuals?.edges
  if (!edges || !edges.length) return []
  
  // Safety check for edge data
  if (!edges[0]?.from || !edges[0]?.to) {
    console.warn('Invalid edge data structure')
    return []
  }
  
  // Safe iteration with null checks
  for (let i = 0; i < edges.length; i++) {
    if (edges[i]?.to) {
      pts.push({ y: edges[i].to.y, x: edges[i].to.x })
    }
  }
})
```

### **3. Invalid Geometry Handling in `addSelected()`**
**Problem**: Assumed geometry.coordinates always exists

**Fix**:
```typescript
function addSelected() {
  if (!selectedSuggestion.value) return
  const f = selectedSuggestion.value
  
  // Validate geometry
  if (!f.geometry?.coordinates || f.geometry.coordinates.length < 2) {
    console.error('Invalid feature geometry:', f)
    alert('Invalid point geometry')
    return
  }
  
  const [y, x] = f.geometry.coordinates
  const name = f.properties?.name || f.properties?.beacon || f.properties?.point_name || ''
  points.value.push({ nameText: name, yText: String(y), xText: String(x) })
}
```

---

## Performance Optimizations

### **1. Debounced Search**
```typescript
let debounceTimer: any = null
async function onInput() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(async () => {
    // Search logic
  }, 250)
}
```

### **2. Async DataMap Loading**
```typescript
const DataMap = defineAsyncComponent(() => 
  import('../../../../components/maps/DataMap.vue')
)
```
- Reduces initial bundle size
- Loads map component only when needed

### **3. Silent Recomputation**
```typescript
async function recomputeIfReady() {
  const pts = collectPoints()
  if (pts.length < 3) {
    result.value = null
    return
  }
  // Compute without user interaction
  result.value = await areaCompute({ points: pts, save: false })
}
```
- Auto-updates results on point changes
- Never saves automatically (user must click "Compute" to save)

---

## Usage Examples

### **Example 1: Search and Add Points**
1. Select layer from dropdown
2. Type point name in search box (e.g., "2342")
3. Use ↓ arrow to navigate suggestions
4. Press Enter to add point
5. Repeat for 3+ points
6. Area auto-computes

### **Example 2: Manual Entry**
1. Leave layer unselected
2. Type point name: `P1`
3. Enter Y: `96751.29` or `96751:17:24` (DMS)
4. Enter X: `-2247626.76`
5. Tab to next row (auto-creates)
6. Enter 3+ points
7. Click "Compute"

### **Example 3: CSV Import**
1. Click "📂 Import CSV"
2. Select CSV file with columns: Point, Y, X
3. Points populate automatically
4. Drag row numbers to reorder if needed
5. Click "Compute"

### **Example 4: Reorder Points**
1. Add points in any order
2. Drag row numbers to reorder
3. OR use Alt+↑/↓ with focused row
4. Area recomputes automatically

---

## Testing Checklist

- [ ] Search finds points from layer
- [ ] Keyboard navigation works (↑/↓/Enter/Esc)
- [ ] Manual entry validates DMS format
- [ ] CSV import handles various formats
- [ ] Drag-to-reorder updates computation
- [ ] Alt+↑/↓ keyboard shortcuts work
- [ ] Area computes with 3+ valid points
- [ ] Residuals table displays correctly
- [ ] Map preview shows all points
- [ ] CSV export generates valid file
- [ ] Error handling shows user-friendly messages
- [ ] Debug mode shows additional columns

---

## Dependencies

### **Services**
- `areaCompute()` - Backend area computation API
- `searchFeatures()` - Point search in spatial layers
- `getLayer()` - Layer metadata retrieval

### **Utils**
- `parseFlexibleNumberOrDMS()` - Coordinate parsing
- `decimalToDMS()` - Convert decimal to DMS
- `formatDMS()` - Format DMS for display
- `bankersRound()` - Banker's rounding (round half to even)
- `getDMSPolicy()` - Display configuration
- `getAreaPolicy()` - Area unit policy

### **Components**
- `LayerSelect.vue` - Layer dropdown selector
- `DataMap.vue` - Interactive map preview (async loaded)

---

## Configuration

### **Area Unit Policy**
```typescript
hectaresThreshold: number  // Default: 10,000 m²
```
- `>= 10,000 m²` → Display in hectares (4 decimal places)
- `< 10,000 m²` → Display in m² (0 decimal places)
- Override: "Always m²" or "Always ha"

### **DMS Display**
```typescript
const policy = getDMSPolicy('default')
// separator: ':' or '°\' "'
// secondsDecimals: 0 for cadastral
```

---

## Common Issues & Solutions

### **Issue 1: "No matching points"**
**Cause**: Layer not selected or search term too specific  
**Solution**: Select layer first, try partial name

### **Issue 2: Red border on coordinate input**
**Cause**: Invalid format (e.g., minutes/seconds ≥ 60)  
**Solution**: Use decimal (123.45) or valid DMS (123:45:30)

### **Issue 3: Area not computing**
**Cause**: Less than 3 valid points  
**Solution**: Check for red borders, ensure 3+ points with valid coordinates

### **Issue 4: Map not showing**
**Cause**: DataMap async loading or layer SRID not set  
**Solution**: Wait for load, set layer SRID in layer selector

### **Issue 5: Large residuals in results**
**Cause**: Points in wrong order (not sequential around boundary)  
**Solution**: Drag to reorder points clockwise or counter-clockwise

---

## Future Enhancements

1. **Visual Point Selection**: Click map to add points
2. **Polygon Preview**: Show draft polygon while building
3. **Undo/Redo**: Point addition/removal history
4. **Batch Import**: Multiple parcels from single CSV
5. **PDF Export**: Generate area computation report
6. **Coordinate Transformation**: Support multiple EPSG codes
7. **Closure Gap Display**: Show √(ΣdY² + ΣdX²) prominently
8. **Point Validation**: Warn if closure gap > threshold

---

## Related Components

- **CalculationsPart2View.vue**: Cadastral workflow version (more features)
- **DataMap.vue**: Shared map component
- **LayerSelect.vue**: Shared layer selector
- **compute.ts**: Backend API service

---

## Maintainer Notes

- Keep coordinate system comments accurate (P(Y,X) convention)
- Maintain banker's rounding for consistency
- Test with both decimal and DMS inputs
- Ensure error messages are user-friendly
- Document any changes to residual calculation logic
