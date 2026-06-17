# Instructions to Revert to Cape Lo 31 and Fix QGIS Display

## Problem Summary

The coordinate data has been incorrectly transformed through multiple migrations:

1. **Original**: Cape Lo 31 (EPSG:22291) - Y=97,057, X=2,247,854
2. **Migration 062**: Transformed to Hartebeesthoek94 Lo29 (EPSG:2053) using `ST_Transform`
3. **Migration 063**: Relabeled to Hartebeesthoek94 Lo31 (EPSG:2054) using `ST_SetSRID`
4. **Result**: Coordinates are wrong, causing 1-degree eastward shift in QGIS

## Solution: Revert and Re-import

### Step 1: Revert Database to Cape Lo 31

```bash
psql -U postgres -d surveypro_db -f app-backend/migrations/069_revert_to_cape_lo31_complete.sql
```

### Step 2: Re-import CSV Data

Use the SurveyPro frontend to re-import your CSV file:
- File: `cadastral-standard/Magls 2283.csv`
- This will restore the original Cape Lo 31 coordinates

### Step 3: Use QGIS Views

The migration creates `coordinate_points_qgis` and `land_parcels_qgis` views that:
- Transform from Cape Lo 31 (EPSG:22291) to WGS84 (EPSG:4326)
- Display correctly in QGIS with north pointing up
- Show data in correct location (Zvishavane, Zimbabwe)

### Step 4: QGIS Setup

1. Add PostGIS layer: `coordinate_points_qgis`
2. Geometry column: `geom_qgis`
3. CRS: EPSG:4326 (WGS84)
4. Data will appear at approximately:
   - Latitude: -20.32°S
   - Longitude: 30.07°E (correct for Zvishavane!)

## Why Cape Lo 31?

Cape Lo 31 (EPSG:22291) is the **correct coordinate system** for Zimbabwe survey data:
- Based on Cape Datum (Modified Clarke 1880 ellipsoid)
- Lo31 zone (Central Meridian = 31°E)
- South-oriented (Y=Westing, X=Southing)
- Standard for Zimbabwean cadastral surveys

## Expected Coordinates

After reversion and re-import:

| Point | Y (Cape Lo 31) | X (Cape Lo 31) | Lat (WGS84) | Lon (WGS84) |
|-------|----------------|----------------|-------------|-------------|
| 2283A | 97,057.022     | 2,247,854.388  | -20.32°     | 30.07°      |

This will place the data correctly in Zvishavane, Zimbabwe!
