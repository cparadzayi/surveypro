# MapLibre Playground - CSV Import Guide

## Overview

The MapLibre Playground is an interactive map testing environment that allows you to import survey points from CSV files and visualize them on a MapLibre GL map with automatic coordinate transformation from Cape Lo 31 to WGS84.

## Features

✅ **CSV Import** - Load survey points from CSV files  
✅ **Automatic Coordinate Transformation** - Cape Lo 31 (Modified Clarke 1880) → WGS84  
✅ **Interactive Map** - Pan, zoom, rotate, and pitch controls  
✅ **Point Markers** - Blue markers for survey points, red marker for Zvishavane reference  
✅ **Popups** - Click markers to view point details  
✅ **Auto-fit** - Map automatically zooms to show all imported points  

## CSV Format

Your CSV file must contain the following columns:

| Column | Required | Description |
|--------|----------|-------------|
| Point | ✅ Yes | Point identifier (e.g., TB1, WS1, P1) |
| Y | ✅ Yes | Westing coordinate in meters (Cape Lo 31) |
| X | ✅ Yes | Southing coordinate in meters (Cape Lo 31) |
| Status | ⚪ Optional | Point status (e.g., Found, Placed) |
| Description | ⚪ Optional | Point description |
| Date | ⚪ Optional | Survey date |

### Example CSV

```csv
Point,Y,X,Status,Description,Date
TB1,195432.50,2763845.20,Found,Trig Beacon 1,2024-11-15
TB2,195850.30,2764120.45,Found,Trig Beacon 2,2024-11-15
WS1,195640.75,2763980.10,Placed,Working Station 1,2024-11-16
P1,195500.20,2763900.50,Placed,Boundary Point 1,2024-11-17
```

## Coordinate System Details

### Source: Cape Lo 31 (EPSG:22291)
- **Projection:** Transverse Mercator
- **Ellipsoid:** Modified Clarke 1880 (Cape)
- **Datum:** Cape Datum
- **Central Meridian:** 31°E
- **Axis Order:** South-orientated (Y=Westing, X=Southing)
- **Units:** Meters
- **Transformation Parameters:** `+towgs84=-136,-108,-292,0,0,0,0`

### Target: WGS84 (EPSG:4326)
- **Standard GPS coordinates**
- **Longitude/Latitude in decimal degrees**

## Coordinate Transformation

The transformation is handled automatically using **Proj4js** with the following definition:

```javascript
proj4.defs('EPSG:22291', 
  '+proj=tmerc +axis=wsu +lat_0=0 +lon_0=31 +k=1 +x_0=0 +y_0=0 +ellps=clrk80 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs'
);
```

### Transformation Process

1. **Parse CSV** - Extract Point, Y, X, and optional fields
2. **Validate** - Check for valid numeric coordinates
3. **Transform** - Convert Cape Lo 31 → WGS84 using Proj4
4. **Display** - Add markers to MapLibre GL map
5. **Auto-fit** - Zoom map to show all points

### Technical Notes

- **South-orientated system:** X (Southing) is negated during transformation
- **Axis order:** Cape Lo uses `+axis=wsu` (West-South-Up)
- **Validation:** Points are checked to ensure they fall within Zimbabwe region (25-33°E, 15-23°S)

## Usage

1. **Navigate** to `/modules/lite/maplibre-playground`
2. **Click** the file input to select your CSV file
3. **Wait** for automatic transformation and display
4. **Click** markers to view point details
5. **Clear** points using the "Clear Points" button

## Sample Data

A sample CSV file is provided: `sample-survey-points-zvishavane.csv`

This contains 22 verified survey points from **Maglas Township, Zvishavane** - actual cadastral survey data that has been validated against Google Maps.

**Sample coordinates:**
- Y range: ~96,271 to ~97,538 meters (Westing)
- X range: ~2,247,107 to ~2,248,259 meters (Southing)
- Expected WGS84 center: ~30.072°E, ~20.321°S
- **Verified location:** Maglas Township center, Zvishavane District

## Map Controls

- **Pan:** Click and drag
- **Zoom:** Scroll wheel or +/- buttons
- **Rotate:** Right-click and drag (or Ctrl + drag)
- **Pitch:** Ctrl + drag up/down

## Reference Point

The map includes a red reference marker at **Zvishavane**:
- **Coordinates:** 30°04'28"E, 20°19'13"S
- **Decimal:** 30.074444°E, -20.320278°S

## Troubleshooting

### Points not appearing?
- Check CSV format matches expected columns
- Verify Y and X coordinates are in meters
- Ensure coordinates are in Cape Lo 31 system

### Points in wrong location?

**Check the coordinate statistics displayed after import:**

1. **Y range should be:** -150,000 to +100,000 meters
2. **X range should be:** 1,800,000 to 2,400,000 meters  
3. **WGS84 center should be:** 25-33°E, 15-23°S (Zimbabwe region)

**Common issues:**

- **Points far to the east/west:** Wrong Lo zone (check if data is Lo 29, 27, 25, or 33 instead of Lo 31)
- **Points in wrong country:** Y/X columns may be swapped
- **Coordinates in millions:** Data might be in different projection (e.g., UTM)
- **Coordinates < 1000:** Data might already be in decimal degrees

**Zvishavane-specific:**
- Zvishavane straddles Lo 29 and Lo 31 boundary
- Western Zvishavane: Use Lo 29 (central meridian 29°E)
- Eastern Zvishavane: Use Lo 31 (central meridian 31°E)
- Check your survey district to determine correct zone

### CSV parsing errors?
- Ensure CSV uses comma separators
- Check for empty rows or invalid data
- Verify header row contains required column names

## Technical Implementation

### Files Modified
- `app-frontend/src/views/modules/lite/MaplibrePlaygroundView.vue` - Main component
- `app-frontend/src/stores/modules.ts` - Added to Lite menu
- `app-frontend/src/utils/coordinateTransform.ts` - Transformation utilities (existing)

### Dependencies
- **maplibre-gl** - Map rendering
- **proj4** - Coordinate transformation
- **Vue 3** - Component framework

## Future Enhancements

- [ ] Support for other Cape Lo zones (Lo 25, 27, 29, 33)
- [ ] Export transformed points to CSV
- [ ] Point editing and deletion
- [ ] Line and polygon drawing
- [ ] Distance and area measurements
- [ ] Custom marker styles based on status
- [ ] Point clustering for large datasets
- [ ] Integration with backend database

## Related Documentation

- [NGI Coordinate Conversion Utility](https://ngi.dalrrd.gov.za/index.php/technical-information/software-and-utilities/ngi-coordinate-conversion-utility)
- [Proj4 Documentation](https://proj.org/)
- [MapLibre GL JS Documentation](https://maplibre.org/maplibre-gl-js-docs/)
