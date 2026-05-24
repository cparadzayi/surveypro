# Vector GeoPDF Implementation Guide

## Problem Statement

The current GeoPDF implementation creates a **rasterized image** with georeferencing, not a true vector GeoPDF. This results in:
- ❌ Static PNG image embedded in PDF
- ❌ No selectable features
- ❌ No queryable attributes
- ❌ Pixelated when zoomed
- ❌ Large file sizes
- ❌ Poor UX for GIS professionals

## What is a True Vector GeoPDF?

A proper GeoPDF contains:
- ✅ **Vector geometries** (lines, polygons, points as PDF vector objects)
- ✅ **Embedded coordinates** (each vertex has real Cape Lo coordinates)
- ✅ **Queryable features** (click a parcel, get its attributes)
- ✅ **Selectable text** (labels are real text, not pixels)
- ✅ **Scalable graphics** (zoom without pixelation)
- ✅ **OGC GeoPDF standard** (ISO 32000 encoding)

## Solution Architecture

### Backend: Vector GeoPDF Generation

**File:** `app-backend/src/routes/geopdf-vector.js`

**Process:**
1. Accept GeoJSON FeatureCollections (parcels, beacons)
2. Save GeoJSON to temporary files
3. Use `ogr2ogr` (GDAL vector tool) to convert GeoJSON → Vector PDF
4. Return true vector GeoPDF with embedded coordinates

**Key Command:**
```bash
ogr2ogr -f "PDF" \
  -a_srs EPSG:22291 \
  -dsco GEO_ENCODING=ISO32000 \
  -dsco DPI=300 \
  -dsco TITLE="Survey Plan" \
  -dsco AUTHOR="Surveyor Name" \
  -lco WRITE_GDAL_TAGS=YES \
  output.pdf \
  parcels.geojson
```

**Why ogr2ogr?**
- Creates TRUE vector PDFs (not rasterized)
- Preserves geometry and attributes
- Embeds OGC GeoPDF metadata
- Industry standard for vector GeoPDF

### Frontend: GeoJSON Export

**Required Changes:**

1. **Export parcels as GeoJSON**
   - Convert MapLibre parcel layers to GeoJSON
   - Include attributes (stand number, area, etc.)
   - Use Cape Lo coordinates (EPSG:22291)

2. **Export beacons as GeoJSON**
   - Convert beacon point layers to GeoJSON
   - Include attributes (beacon name, type, etc.)
   - Use Cape Lo coordinates

3. **Call vector GeoPDF endpoint**
   - POST to `/api/geopdf/vector`
   - Send GeoJSON + projection + metadata
   - Receive true vector PDF

## Implementation Steps

### Step 1: Backend Route (✅ COMPLETED)

Created `app-backend/src/routes/geopdf-vector.js`:
- Auto-detects ogr2ogr in QGIS installations
- Accepts GeoJSON input
- Generates vector PDF with OGC metadata
- Returns PDF with embedded coordinates

### Step 2: Frontend Service (TODO)

Update `app-frontend/src/services/geopdf.ts`:

```typescript
export async function generateVectorGeoPDF(options: {
  parcels: GeoJSON.FeatureCollection
  beacons: GeoJSON.FeatureCollection
  projection: string
  metadata: {
    title: string
    surveyor: string
    date: string
    designation: string
  }
}): Promise<Blob> {
  const response = await fetch('/api/geopdf/vector', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  })
  
  if (!response.ok) {
    throw new Error('Vector GeoPDF generation failed')
  }
  
  return response.blob()
}
```

### Step 3: Export GeoJSON from MapLibre (TODO)

Update `SurveyPlanMapView.vue`:

```typescript
function exportParcelsAsGeoJSON(): GeoJSON.FeatureCollection {
  const features = []
  
  // Get all parcel sources
  parcels.value.forEach(parcel => {
    const source = map.value.getSource(`parcel-${parcel.id}`)
    if (source && source._data) {
      features.push({
        type: 'Feature',
        geometry: source._data.geometry,
        properties: {
          stand: parcel.stand,
          area_m2: parcel.area_m2,
          description: parcel.description
        }
      })
    }
  })
  
  return {
    type: 'FeatureCollection',
    features
  }
}

function exportBeaconsAsGeoJSON(): GeoJSON.FeatureCollection {
  const source = map.value.getSource('beacons')
  return source._data // Already GeoJSON
}
```

### Step 4: Update Export Function (TODO)

Replace raster capture with vector export:

```typescript
async function exportVectorGeoPDF() {
  console.log('[SurveyPlanMap] 🗺️ Exporting Vector GeoPDF...')
  
  // 1. Export GeoJSON
  const parcelsGeoJSON = exportParcelsAsGeoJSON()
  const beaconsGeoJSON = exportBeaconsAsGeoJSON()
  
  // 2. Prepare metadata
  const metadata = {
    title: `Survey Plan - ${props.projectInfo.designation}`,
    surveyor: config.value.surveyorName,
    date: config.value.surveyDate,
    designation: props.projectInfo.designation
  }
  
  // 3. Generate vector GeoPDF
  const pdfBlob = await generateVectorGeoPDF({
    parcels: parcelsGeoJSON,
    beacons: beaconsGeoJSON,
    projection: `EPSG:${22260 + parseInt(config.value.centralMeridian)}`,
    metadata
  })
  
  // 4. Download
  downloadBlob(pdfBlob, `survey-plan-vector-${Date.now()}.pdf`)
  
  console.log('[SurveyPlanMap] ✅ Vector GeoPDF exported')
}
```

## Benefits of Vector GeoPDF

### For Users
- **Selectable features** - Click parcels to see attributes
- **Scalable** - Zoom without pixelation
- **Smaller files** - Vector data is more compact
- **Professional** - Industry-standard format

### For GIS Professionals
- **Import into QGIS/ArcGIS** - Automatic positioning
- **Extract coordinates** - Query vertex coordinates
- **Overlay analysis** - Combine with other data
- **Attribute queries** - Filter by stand number, area, etc.

### For Surveyors
- **SI 727 compliant** - Meets cadastral standards
- **Georeferenced** - Cape Lo coordinates embedded
- **Archival quality** - Vector format preserves accuracy
- **Interoperable** - Works with all GIS software

## Testing Checklist

- [ ] Backend route auto-loads on server start
- [ ] ogr2ogr detected in QGIS installation
- [ ] GeoJSON export includes all parcels
- [ ] GeoJSON export includes all beacons
- [ ] Attributes preserved (stand, area, beacon name)
- [ ] Cape Lo coordinates correct (EPSG:22291)
- [ ] PDF opens in Adobe Reader
- [ ] Features are selectable (not rasterized)
- [ ] Coordinates display when clicked
- [ ] PDF imports into QGIS correctly
- [ ] File size reasonable (<5MB for typical project)

## Comparison: Raster vs Vector GeoPDF

| Feature | Raster GeoPDF (Old) | Vector GeoPDF (New) |
|---------|---------------------|---------------------|
| Format | PNG → PDF | GeoJSON → PDF |
| Geometry | Pixels | Vector objects |
| Selectable | ❌ No | ✅ Yes |
| Scalable | ❌ Pixelated | ✅ Smooth |
| Queryable | ❌ No | ✅ Yes |
| File Size | Large (5-20MB) | Small (500KB-2MB) |
| GIS Import | Image only | Full geometry |
| Professional | ❌ No | ✅ Yes |

## Next Steps

1. **Implement GeoJSON export** in SurveyPlanMapView.vue
2. **Update geopdf.ts service** with vector endpoint
3. **Replace export function** to use vector approach
4. **Test with real project data**
5. **Verify in QGIS** - import and query features
6. **Document for users** - explain vector GeoPDF benefits

## Technical Notes

### ogr2ogr vs gdal_translate

- **gdal_translate**: Raster tool (PNG → PDF) ❌
- **ogr2ogr**: Vector tool (GeoJSON → PDF) ✅

### OGC GeoPDF Standard

- ISO 32000 encoding for georeferencing
- Embedded coordinate system (EPSG)
- Neatline (bounding box)
- Metadata (title, author, date)

### GDAL PDF Driver

- Supports vector geometries
- Preserves attributes
- Embeds projection info
- Creates selectable features

## Conclusion

The vector GeoPDF approach is the **correct solution** for professional cadastral surveying. It creates true vector PDFs with embedded coordinates, selectable features, and full GIS interoperability.

The raster approach (PNG → PDF) was a temporary workaround that doesn't meet professional standards. The vector approach (GeoJSON → PDF via ogr2ogr) is the industry-standard method used by GIS professionals worldwide.
