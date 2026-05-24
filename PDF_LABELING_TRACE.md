# PDF Labeling Generation Flow - Complete Trace

This document traces the complete flow of PDF labeling generation from the frontend button click to the backend rendering for the survey plan shown in your image.

## Overview

The PDF shows:
- **Parcel boundaries** (black polygons): 1463, 1464, 1465, 1466, 1467, 1468, 1469
- **Beacon labels** (point names): PRD2, 1463A, 1463C, 1471A, etc.
- **Edge labels** (distance + bearing): e.g., "5.71 / 76°05'10"", "28.62 / 120°52'00""
- **Stand numbers** (inside parcels): 14225, 1464, 1465, etc.
- **Outside Figure boundary** (red polygon): PRD2, 1463A, O, 1463C

---

## Frontend Flow

### 1. User Interface Component
**File:** `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`

The user clicks "Export Survey Plan (GeoPDF)" button which triggers the export process.

**Key Functions:**
- `exportGeoPDF()` - Main export function
- Prepares GeoJSON data for parcels, beacons, and outside figure
- Calls backend API via `generateVectorGeoPDF()`

**Data Preparation:**
```typescript
// Parcels with metadata (edges, area, etc.)
const parcelsGeoJSON = {
  type: 'FeatureCollection',
  features: parcels.map(parcel => ({
    type: 'Feature',
    geometry: parcel.geom, // Polygon coordinates
    properties: {
      stand: parcel.stand, // "1463", "1464", etc.
      area_m2: parcel.area_m2,
      metadata: {
        residuals: {
          edges: [ // Pre-calculated edge data
            {
              from: "1463A",
              to: "1462A",
              distance: 5.71,
              distanceRounded: 5.71,
              bearing: 76.086111,
              directionDMS: "76°05'10""
            },
            // ... more edges
          ]
        }
      }
    }
  }))
}

// Beacons (coordinate points)
const beaconsGeoJSON = {
  type: 'FeatureCollection',
  features: coordinatePoints.map(point => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [point.y, point.x] // [Westing, Southing]
    },
    properties: {
      name: point.name, // "1463A", "PRD2", etc.
      status: point.status, // "found", "placed"
      description: point.description
    }
  }))
}

// Outside Figure boundary
const outsideFigureData = {
  edges: [
    { y: 96123.45, x: 2247890.12 }, // PRD2
    { y: 96234.56, x: 2247678.90 }, // 1463A
    // ... more vertices
  ]
}
```

### 2. API Service
**File:** `app-frontend/src/services/geopdf.ts`

**Function:** `generateVectorGeoPDF(request: VectorGeoPDFRequest)`

```typescript
export async function generateVectorGeoPDF(request: VectorGeoPDFRequest): Promise<Blob> {
  console.log('[VectorGeoPDF] 📤 Sending request:', {
    parcelCount: request.parcels.features.length,
    beaconCount: request.beacons.features.length,
    projection: request.projection
  })
  
  const response = await api.post('/geopdf/vector', request, {
    responseType: 'blob',
    timeout: 60000 // 60 second timeout
  })
  
  return response.data // PDF blob
}
```

**API Endpoint:** `POST /api/geopdf/vector`

**Request Body:**
```json
{
  "parcels": { /* GeoJSON FeatureCollection */ },
  "beacons": { /* GeoJSON FeatureCollection */ },
  "outsideFigure": { /* GeoJSON FeatureCollection */ },
  "outsideFigureData": { /* Edge data with coordinates */ },
  "beaconLabels": [ /* Beacon-to-parcel mapping */ ],
  "projection": "EPSG:22291",
  "extent": {
    "minY": 95000,
    "minX": 2246000,
    "maxY": 97000,
    "maxX": 2248000
  },
  "metadata": {
    "title": "STANDS 2283-2293...",
    "surveyor": "Kuda Makonese",
    "date": "2024-12-15",
    "designation": "STANDS 2283-2293",
    "district": "Shabani",
    "township": "MAGLAS TOWNSHIP"
  }
}
```

---

## Backend Flow

### 3. API Route Handler
**File:** `app-backend/src/routes/geopdf-vector.js`

**Route:** `POST /geopdf/vector`

```javascript
fastify.post('/geopdf/vector', async (request, reply) => {
  const { parcels, beacons, outsideFigure, projection, metadata, extent, outsideFigureData, beaconLabels } = request.body
  
  fastify.log.info({
    msg: '[VectorGeoPDF] 📊 Received request',
    parcels: parcels.features.length,
    beacons: beacons.features.length,
    projection,
    hasOutsideFigure: !!outsideFigureData,
    beaconLabels: beaconLabels?.length || 0
  })
  
  // Call PDFKit GeoPDF generator
  await generateGeoPDF({
    parcels,
    beacons,
    outsideFigure,
    projection,
    extent: { minY, minX, maxY, maxX },
    metadata,
    outputPath: outputPdf,
    beaconLabels,
    outsideFigureData
  }, fastify.log)
  
  // Read and return PDF
  const pdfBuffer = await readFile(outputPdf)
  reply.type('application/pdf').send(pdfBuffer)
})
```

### 4. PDF Generation Service
**File:** `app-backend/src/services/pdfkitGeoPDF.js`

This is the **main rendering engine** that generates all the labels you see in the PDF.

#### Main Function: `generateGeoPDF()`

**Line:** ~8000-8200

```javascript
export async function generateGeoPDF(options, logger) {
  const { parcels, beacons, extent, metadata, beaconLabels, outsideFigure, outsideFigureData } = options
  
  // Step 1: Calculate optimal scale and layout
  const optimalScale = calculateOptimalScale(parcels, extent, figureBounds)
  
  // Step 2: Render parcel boundaries with edge labels
  renderParcels(doc, parcels, extent, figureBounds, collisionDetector, optimalScale, logger)
  
  // Step 3: Render beacons with labels
  renderBeacons(doc, beacons, parcels, extent, figureBounds, collisionDetector, optimalScale, beaconLabels, logger)
  
  // Step 4: Render outside figure boundary
  renderOutsideFigureBoundary(doc, outsideFigure, extent, figureBounds, logger)
  renderOutsideFigureLabels(doc, outsideFigure, outsideFigureData, extent, figureBounds, optimalScale, logger)
}
```

---

## Label Rendering Details

### A. Parcel Rendering (`renderParcels`)
**Line:** 1945-2500

**Renders:**
1. **Parcel boundaries** (black polygon outlines)
2. **Edge labels** (distance + bearing on each edge)
3. **Stand numbers** (inside parcels)

```javascript
function renderParcels(doc, parcels, extent, mapBounds, collisionDetector, scale, logger) {
  parcels.features.forEach((parcel, index) => {
    const coords = parcel.geometry.coordinates[0]
    
    // 1. USE PRE-CALCULATED EDGES from area consistency data
    if (parcel.properties.metadata?.residuals?.edges) {
      parcel.properties.edges = parcel.properties.metadata.residuals.edges.map(edge => ({
        bearing: edge.bearingDeg,
        distance: edge.distance,
        distanceRounded: edge.distanceRounded,  // Banker's rounded
        directionDMS: edge.directionDMS,        // Pre-formatted DMS
        from: edge.from,
        to: edge.to
      }))
    }
    
    // 2. DRAW POLYGON OUTLINE
    const pdfCoords = coords.map(coord => transformCoords(coord[0], coord[1], extent, mapBounds))
    doc.moveTo(pdfCoords[0].x, pdfCoords[0].y)
    pdfCoords.slice(1).forEach(point => doc.lineTo(point.x, point.y))
    doc.closePath()
    doc.lineWidth(0.5).strokeColor('#000000').fillColor('#FFFFFF', 0.9).fillAndStroke()
    
    // 3. RENDER EDGE LABELS (distance + bearing)
    const edges = parcel.properties.edges
    for (let i = 0; i < coords.length - 1; i++) {
      const edge = edges[i]
      const p1 = pdfCoords[i]
      const p2 = pdfCoords[i + 1]
      
      // Calculate edge midpoint
      const midX = (p1.x + p2.x) / 2
      const midY = (p1.y + p2.y) / 2
      
      // Calculate edge angle for rotation
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI)
      
      // Render distance label (e.g., "5.71")
      doc.save()
      doc.translate(midX, midY).rotate(angle)
      doc.fontSize(6).font('Helvetica-Bold')
      doc.text(edge.distanceRounded.toFixed(2), 0, -8, { align: 'center' })
      doc.restore()
      
      // Render bearing label (e.g., "76°05'10"")
      doc.save()
      doc.translate(midX, midY).rotate(angle)
      doc.fontSize(5).font('Helvetica')
      doc.text(edge.directionDMS, 0, 2, { align: 'center' })
      doc.restore()
    }
    
    // 4. RENDER STAND NUMBER (deferred - after all edge labels)
    // Stored in parcel._standLabelData for later rendering
  })
  
  // 5. RENDER ALL STAND NUMBERS (after edge labels to avoid collisions)
  parcels.features.forEach(parcel => {
    const { stand, pdfCoords, standFontSize } = parcel._standLabelData
    const labelPos = calculateStandLabelPosition(pdfCoords, stand, standFontSize, doc)
    
    doc.save()
    doc.fontSize(standFontSize).font('Helvetica-Bold')
    doc.text(stand, labelPos.x, labelPos.y, { align: 'center' })
    doc.restore()
  })
}
```

### B. Beacon Rendering (`renderBeacons`)
**Line:** 3004-3200

**Renders:**
1. **Beacon circles** (open circles at coordinate points)
2. **Beacon labels** (point names like "1463A", "PRD2")

```javascript
function renderBeacons(doc, beacons, parcels, extent, mapBounds, collisionDetector, scale, beaconLabels, logger) {
  // Calculate beacon size (1.5mm diameter at print scale)
  const beaconRadius = 2.5 // points
  
  beacons.features.forEach(beacon => {
    const pos = transformCoords(
      beacon.geometry.coordinates[0],  // Y (Westing)
      beacon.geometry.coordinates[1],  // X (Southing)
      extent,
      mapBounds
    )
    
    // 1. DRAW BEACON CIRCLE (open ring)
    doc.save()
    doc.circle(pos.x, pos.y, beaconRadius)
       .lineWidth(0.5)
       .strokeColor('#000000')
       .stroke()
    doc.restore()
    
    // 2. FIND OPTIMAL LABEL POSITION
    const beaconName = beacon.properties.name // "1463A", "PRD2", etc.
    const parcel = findParcelContainingBeacon(beacon, parcels)
    const parcelCoords = parcel.geometry.coordinates[0].map(coord => 
      transformCoords(coord[0], coord[1], extent, mapBounds)
    )
    
    const labelPos = findOptimalBeaconLabelPosition(
      pos,                  // Beacon position
      parcelCoords,         // Parcel boundary
      beaconName,           // Label text
      labelConfig,          // Font config
      doc,                  // PDFKit document
      scale,                // Map scale
      beaconRadius          // Beacon size
    )
    
    // 3. RENDER BEACON LABEL
    if (labelPos) {
      doc.save()
      doc.fontSize(6).font('Helvetica')
      doc.text(beaconName, labelPos.x, labelPos.y)
      doc.restore()
    }
  })
}
```

### C. Beacon Label Placement Algorithm (`findOptimalBeaconLabelPosition`)
**Line:** 3390-3588

This is the **critical function** that determines where beacon labels are placed.

```javascript
function findOptimalBeaconLabelPosition(beaconPos, parcelCoords, labelText, config, doc, scale, beaconRadius) {
  const fontSize = 6 // 6-8pt for professional cadastral plans
  const labelWidth = doc.widthOfString(labelText, { font: 'Helvetica', fontSize })
  const labelHeight = fontSize * 1.2
  
  // 16-POSITION MODEL: Try 16 different angles around the beacon
  const positions = [
    { angle: 45,  name: 'NE', priority: 1 },   // Upper-right (preferred)
    { angle: 135, name: 'NW', priority: 2 },   // Upper-left
    { angle: 315, name: 'SE', priority: 3 },   // Lower-right
    { angle: 225, name: 'SW', priority: 4 },   // Lower-left
    { angle: 0,   name: 'E',  priority: 5 },   // Right
    { angle: 180, name: 'W',  priority: 6 },   // Left
    { angle: 270, name: 'N',  priority: 7 },   // Above
    { angle: 90,  name: 'S',  priority: 8 },   // Below
    // ... 8 more intermediate angles
  ]
  
  // Try each position in priority order
  for (const position of positions) {
    // Try multiple offset distances (from beacon edge)
    const offsets = [
      beaconRadius + 1,  // Just outside circle
      beaconRadius + 2,
      beaconRadius + 3,
      beaconRadius + 4,
      beaconRadius + 6,
      beaconRadius + 8
    ]
    
    for (const offset of offsets) {
      const radians = (position.angle * Math.PI) / 180
      
      // Calculate label center position
      const centerX = beaconPos.x + offset * Math.cos(radians)
      const centerY = beaconPos.y + offset * Math.sin(radians)
      
      // Convert to top-left corner
      const labelX = centerX - labelWidth / 2
      const labelY = centerY - labelHeight / 2
      
      // CHECK 1: Label must not overlap beacon circle
      const closestX = Math.max(labelX, Math.min(beaconPos.x, labelX + labelWidth))
      const closestY = Math.max(labelY, Math.min(beaconPos.y, labelY + labelHeight))
      const distToLabel = Math.sqrt(
        Math.pow(closestX - beaconPos.x, 2) + 
        Math.pow(closestY - beaconPos.y, 2)
      )
      if (distToLabel < beaconRadius + 1) continue
      
      // CHECK 2: Label must be completely inside parcel boundary
      const insideParcel = isBeaconLabelInsideParcel(labelX, labelY, labelWidth, labelHeight, parcelCoords)
      if (!insideParcel) continue
      
      // CHECK 3: Calculate quality score
      const score = calculateLabelPositionQuality(
        { x: labelX, y: labelY },
        labelWidth,
        labelHeight,
        parcelCoords,
        beaconPos,
        position.priority
      )
      
      if (score > 0.15) {
        return { x: labelX, y: labelY } // Found valid position!
      }
    }
  }
  
  return null // No valid position found
}
```

### D. Boundary Checking (`isBeaconLabelInsideParcel`)
**Line:** 3327-3360

**UPDATED TODAY** - Now checks 8 points instead of 4 corners.

```javascript
function isBeaconLabelInsideParcel(labelX, labelY, labelWidth, labelHeight, parcelCoords) {
  // Check all 4 corners of the label
  const corners = [
    { x: labelX, y: labelY },                           // Top-left
    { x: labelX + labelWidth, y: labelY },              // Top-right
    { x: labelX, y: labelY + labelHeight },             // Bottom-left
    { x: labelX + labelWidth, y: labelY + labelHeight } // Bottom-right
  ]
  
  for (const corner of corners) {
    if (!isPointInPolygonPDF(corner, parcelCoords)) {
      return false
    }
  }
  
  // CRITICAL: Also check midpoints along all 4 edges
  const edgeMidpoints = [
    { x: labelX + labelWidth / 2, y: labelY },              // Top edge
    { x: labelX + labelWidth / 2, y: labelY + labelHeight }, // Bottom edge
    { x: labelX, y: labelY + labelHeight / 2 },             // Left edge
    { x: labelX + labelWidth, y: labelY + labelHeight / 2 } // Right edge
  ]
  
  for (const midpoint of edgeMidpoints) {
    if (!isPointInPolygonPDF(midpoint, parcelCoords)) {
      return false
    }
  }
  
  return true // All 8 points are inside
}
```

### E. Outside Figure Rendering
**Line:** 1418-1594

**Renders:**
1. **Outside Figure boundary** (red polygon)
2. **Outside Figure edge labels** (positioned OUTSIDE the polygon)

```javascript
function renderOutsideFigureBoundary(doc, outsideFigure, extent, mapBounds, logger) {
  const coordinates = outsideFigure.features[0].geometry.coordinates[0]
  
  // Draw red boundary polygon
  const firstPoint = transformCoords(coordinates[0][0], coordinates[0][1], extent, mapBounds)
  doc.moveTo(firstPoint.x, firstPoint.y)
  
  coordinates.slice(1).forEach(vertex => {
    const point = transformCoords(vertex[0], vertex[1], extent, mapBounds)
    doc.lineTo(point.x, point.y)
  })
  
  doc.closePath()
  doc.lineWidth(2.0).strokeColor('#FF0000').stroke()
}

function renderOutsideFigureLabels(doc, outsideFigure, outsideFigureData, extent, mapBounds, scale, logger) {
  const edges = outsideFigureData.edges
  
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i]
    const p1 = transformCoords(edge.y, edge.x, extent, mapBounds)
    const p2 = transformCoords(edges[i+1].y, edges[i+1].x, extent, mapBounds)
    
    // Calculate edge midpoint
    const midX = (p1.x + p2.x) / 2
    const midY = (p1.y + p2.y) / 2
    
    // Calculate direction AWAY from polygon centroid (outward)
    const offsetDistance = 30 // 30pt outside polygon
    const labelX = midX + (dx / distance) * offsetDistance
    const labelY = midY + (dy / distance) * offsetDistance
    
    // Render distance and bearing labels
    doc.fontSize(6).text(edge.distance.toFixed(2), labelX, labelY)
    doc.fontSize(5).text(edge.direction, labelX, labelY + 10)
  }
}
```

---

## Summary of Label Types

| Label Type | Function | Line | Description |
|------------|----------|------|-------------|
| **Parcel boundaries** | `renderParcels` | 1945-2500 | Black polygon outlines |
| **Edge labels (distance)** | `renderParcels` | 2089-2200 | "5.71", "28.62" on edges |
| **Edge labels (bearing)** | `renderParcels` | 2089-2200 | "76°05'10"", "120°52'00"" |
| **Stand numbers** | `renderParcels` | 2400-2500 | "14225", "1464" inside parcels |
| **Beacon circles** | `renderBeacons` | 3004-3200 | Open circles at points |
| **Beacon labels** | `findOptimalBeaconLabelPosition` | 3390-3588 | "1463A", "PRD2" near beacons |
| **Outside Figure boundary** | `renderOutsideFigureBoundary` | 1418-1476 | Red polygon |
| **Outside Figure labels** | `renderOutsideFigureLabels` | 1482-1594 | Distance/bearing outside polygon |

---

## Key Algorithms

### 1. Coordinate Transformation
All coordinates are transformed from Cape Lo 31 (EPSG:22291) to PDF coordinate space:

```javascript
function transformCoords(y, x, extent, mapBounds) {
  // Normalize to 0-1 range
  const normY = (y - extent.minY) / (extent.maxY - extent.minY)
  const normX = (x - extent.minX) / (extent.maxX - extent.minX)
  
  // Map to PDF bounds
  const pdfX = mapBounds.x + normY * mapBounds.width
  const pdfY = mapBounds.y + (1 - normX) * mapBounds.height // Flip Y-axis
  
  return { x: pdfX, y: pdfY }
}
```

### 2. Banker's Rounding
All distances and bearings use banker's rounding (round half to even):

```javascript
function bankersRound(value, decimals) {
  const multiplier = Math.pow(10, decimals)
  const shifted = value * multiplier
  const floor = Math.floor(shifted)
  const fraction = shifted - floor
  
  if (fraction === 0.5) {
    // Round to nearest even
    return (floor % 2 === 0 ? floor : floor + 1) / multiplier
  } else {
    return Math.round(shifted) / multiplier
  }
}
```

### 3. Point-in-Polygon Test
Used to check if beacon labels are inside parcel boundaries:

```javascript
function isPointInPolygonPDF(point, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
                     (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}
```

---

## File Locations

### Frontend
- **UI Component:** `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`
- **API Service:** `app-frontend/src/services/geopdf.ts`

### Backend
- **API Route:** `app-backend/src/routes/geopdf-vector.js`
- **PDF Generator:** `app-backend/src/services/pdfkitGeoPDF.js` ⭐ **MAIN FILE**

### Key Functions in pdfkitGeoPDF.js
- `generateGeoPDF()` - Main entry point (line ~8000)
- `renderParcels()` - Parcel boundaries + edge labels (line 1945)
- `renderBeacons()` - Beacon circles + labels (line 3004)
- `findOptimalBeaconLabelPosition()` - Beacon label placement (line 3390)
- `isBeaconLabelInsideParcel()` - Boundary checking (line 3327) ⭐ **UPDATED TODAY**
- `renderOutsideFigureBoundary()` - Red polygon (line 1418)
- `renderOutsideFigureLabels()` - Outside labels (line 1482)

---

## Recent Fix (Today)

**Problem:** Beacon labels were extending outside parcel boundaries even when all 4 corners were inside.

**Solution:** Enhanced `isBeaconLabelInsideParcel()` to check **8 points** instead of 4:
- 4 corners (top-left, top-right, bottom-left, bottom-right)
- 4 edge midpoints (top, bottom, left, right)

This ensures complete containment of beacon labels within parcel boundaries.
