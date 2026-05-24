# GeoPDF Proof of Concept - Implementation Guide

## Overview

This proof of concept demonstrates georeferenced PDF export for SurveyPro cadastral plans using GDAL. The GeoPDF embeds coordinate system metadata directly into the PDF, enabling users to click anywhere on the map to see real-world Cape Lo coordinates in Adobe Reader.

## What is GeoPDF?

GeoPDF is a georeferenced PDF format that embeds geospatial metadata (coordinate system, extent, projection) into standard PDF files. This allows:

- **Coordinate Display**: Click any point on the map → see Y/X coordinates
- **Measurement Tools**: Measure distances and areas directly in Adobe Reader
- **GPS Integration**: Navigate to locations using mobile devices (future)
- **No Special Software**: Works in free Adobe Acrobat Reader

## Implementation Architecture

```
┌─────────────────────────────────────────┐
│ Frontend (Vue + MapLibre)               │
│ - Capture map canvas as high-res PNG   │
│ - Extract extent from Outside Figure   │
│ - Collect metadata (surveyor, date)    │
└──────────────┬──────────────────────────┘
               │ POST /api/geopdf/generate
               ▼
┌─────────────────────────────────────────┐
│ Backend (Node.js + GDAL)                │
│ - Receive map image + extent           │
│ - Call gdal_translate with ISO 32000   │
│ - Embed Cape Lo projection (EPSG:22291)│
│ - Return georeferenced PDF              │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ GeoPDF Output                           │
│ ✓ Clickable coordinates                 │
│ ✓ Embedded projection metadata         │
│ ✓ SI 727 compliant layout              │
│ ✓ Adobe Reader compatible               │
└─────────────────────────────────────────┘
```

## Files Created

### Backend
- **`app-backend/src/routes/geopdf.js`** - GeoPDF service endpoints
  - `GET /api/geopdf/check` - Check GDAL availability
  - `POST /api/geopdf/generate` - Generate GeoPDF from map image
  - `GET /api/geopdf/info` - Get GeoPDF capabilities

### Frontend
- **`app-frontend/src/services/geopdf.ts`** - GeoPDF service client
  - `checkGeoPDFAvailability()` - Check if GDAL is installed
  - `generateGeoPDF()` - Call backend to generate GeoPDF
  - `captureMapCanvas()` - Capture MapLibre canvas as high-res PNG
  - `downloadBlob()` - Download PDF file

### Integration
- **`SurveyPlanMapView.vue`** - Added GeoPDF export button and logic
  - New button: "🌍 GeoPDF (Proof of Concept)"
  - `exportGeoPDF()` function
  - GDAL availability check on mount
  - Status indicator (green = available, amber = unavailable)

## Prerequisites

### Install GDAL on Server

**Windows:**
```bash
# Download OSGeo4W installer from https://trac.osgeo.org/osgeo4w/
# Or use Chocolatey:
choco install gdal

# Verify installation:
gdal_translate --version
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install gdal-bin

# Verify installation:
gdal_translate --version
```

**macOS:**
```bash
brew install gdal

# Verify installation:
gdal_translate --version
```

## Usage

### 1. Start Backend with GDAL
```bash
cd app-backend
npm run dev
```

### 2. Check GDAL Status
The frontend automatically checks GDAL availability on component mount. You'll see:
- **Green message**: "GDAL is available" - GeoPDF button enabled
- **Amber message**: "GDAL not found" - GeoPDF button disabled

### 3. Export GeoPDF
1. Navigate to Survey Plan view (Cadastral Standard workflow)
2. Ensure Outside Figure data is loaded (required for georeferencing)
3. Click **"🌍 GeoPDF (Proof of Concept)"** button
4. Wait for processing (~2-5 seconds)
5. PDF downloads automatically

### 4. Test in Adobe Reader
1. Open the downloaded GeoPDF in Adobe Reader
2. Click anywhere on the map
3. Coordinates appear in Cape Lo format (Y, X in meters)

## Technical Details

### GDAL Command Used
```bash
gdal_translate \
  -of PDF \
  -co GEO_ENCODING=ISO32000 \
  -co DPI=300 \
  -co AUTHOR="Surveyor Name" \
  -co TITLE="Survey Plan" \
  -a_srs EPSG:22291 \
  -a_ullr minX maxY maxX minY \
  input.png output.pdf
```

### Coordinate System
- **Projection**: Cape Lo 31 (EPSG:22291)
- **Central Meridian**: 31°E
- **Units**: Meters
- **Extent**: Extracted from Outside Figure polygon

### Map Capture
- **Resolution**: 300 DPI (high-quality print)
- **Format**: PNG (lossless)
- **Source**: MapLibre GL canvas
- **Scaling**: 3.125x for high-res export (300 DPI / 96 DPI)

## API Reference

### Backend Endpoints

#### Check GDAL Availability
```http
GET /api/geopdf/check

Response:
{
  "available": true,
  "version": "GDAL 3.8.0",
  "message": "GDAL is available"
}
```

#### Generate GeoPDF
```http
POST /api/geopdf/generate

Request Body:
{
  "mapImage": "data:image/png;base64,...",
  "extent": {
    "minX": 96457.39,
    "maxX": 97134.18,
    "minY": 2247514.30,
    "maxY": 2248046.05
  },
  "projection": "EPSG:22291",
  "metadata": {
    "title": "Survey Plan - STANDS 2283-2293",
    "surveyor": "Kuda Makonese",
    "date": "2025-12-16",
    "designation": "STANDS 2283-2293",
    "district": "Shabani",
    "township": "MAGLAS TOWNSHIP"
  }
}

Response: PDF blob (application/pdf)
```

### Frontend Functions

#### Check Availability
```typescript
import { checkGeoPDFAvailability } from '@/services/geopdf'

const status = await checkGeoPDFAvailability()
// { available: true, version: "GDAL 3.8.0", message: "..." }
```

#### Generate GeoPDF
```typescript
import { generateGeoPDF, captureMapCanvas, downloadBlob } from '@/services/geopdf'

// 1. Capture map
const mapImage = await captureMapCanvas(map, { dpi: 300 })

// 2. Generate GeoPDF
const pdfBlob = await generateGeoPDF({
  mapImage,
  extent: { minX, maxX, minY, maxY },
  projection: 'EPSG:22291',
  metadata: { title, surveyor, date }
})

// 3. Download
downloadBlob(pdfBlob, 'survey-plan-geo.pdf')
```

## Testing Checklist

- [ ] Backend starts without errors
- [ ] GDAL version appears in console on startup
- [ ] GeoPDF button shows in Survey Plan view
- [ ] Button is enabled (green status message)
- [ ] Clicking button captures map and generates PDF
- [ ] PDF downloads successfully
- [ ] PDF opens in Adobe Reader
- [ ] Clicking map shows Cape Lo coordinates
- [ ] Coordinates match expected values (±1m tolerance)

## Known Limitations (Proof of Concept)

1. **No Vector Layers**: Only raster map image, no clickable parcels/beacons yet
2. **No Attribute Tables**: Cannot click parcel to see area/stand number
3. **No Layer Control**: Cannot toggle beacons/labels on/off
4. **Basic Metadata**: Only title, author, date embedded
5. **Single Page**: No multi-sheet support yet

## Next Steps (Phase 2)

### Short Term (1-2 weeks)
- [ ] Add vector layers (parcels, beacons) using `ogr2ogr`
- [ ] Embed attribute tables (click parcel → see area, stand)
- [ ] Add layer groups (toggle beacons, labels separately)
- [ ] Improve error handling and user feedback

### Medium Term (1 month)
- [ ] Coordinate readout toolbar in PDF
- [ ] Measurement tools configuration
- [ ] QR code linking to online project data
- [ ] Batch export multiple projects

### Long Term (2-3 months)
- [ ] Offline GPS navigation mode
- [ ] Mobile app integration
- [ ] Cloud storage integration
- [ ] Version control for GeoPDFs

## Troubleshooting

### "GDAL not found" Error
**Solution**: Install GDAL on the server (see Prerequisites section)

### "Outside Figure data required" Error
**Solution**: Ensure you've digitized the Outside Figure polygon in the Area Computation step

### Coordinates Don't Match
**Solution**: Verify the central meridian is correct (31 for Lo31, 29 for Lo29)

### PDF Opens But No Coordinates
**Solution**: Make sure you're using Adobe Acrobat Reader (not Chrome PDF viewer)

## Performance

- **Map Capture**: ~500ms (300 DPI, 1000×800mm sheet)
- **GDAL Processing**: ~1-2 seconds
- **Total Export Time**: ~2-5 seconds
- **PDF File Size**: ~2-5 MB (typical survey plan)

## Security Considerations

- Base64 image data validated before processing
- Temp files cleaned up after generation
- GDAL command sanitized (no shell injection)
- File size limits enforced (50MB max)

## References

- [GDAL PDF Driver Documentation](https://gdal.org/drivers/raster/pdf.html)
- [ISO 32000 GeoPDF Specification](https://www.iso.org/standard/51502.html)
- [TerraGo GeoPDF](https://www.terragotech.com/products/geopdf)
- [Adobe Geospatial PDF](https://www.adobe.com/content/dam/acom/en/devnet/acrobat/pdfs/geospatial_pdf.pdf)

## Support

For issues or questions:
1. Check GDAL installation: `gdal_translate --version`
2. Review backend logs for GDAL errors
3. Test with sample data first
4. Verify Cape Lo coordinates are correct

---

**Status**: ✅ Proof of Concept Complete
**Next**: User testing with real survey data
