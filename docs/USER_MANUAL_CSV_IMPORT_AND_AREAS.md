# SurveyPro Lite: User Manual (CSV Import, Areas, Areas v2, Quotes)

This guide covers how to structure CSV files for Points, LineStrings, and Polygons, upload them into the database, compute areas using Zimbabwe conventions (Areas and Areas v2), and generate financial quotes with branded letterhead.

## What’s new (Oct 2025)

- Areas v2 (Search): Build polygons by searching points from a selected layer; reorder points; compute area and residuals; optional save and CSV export.
- Financial Estimate (Quotes): Calculator and CSV-parity modes; VAT and contingency; per-stand “Say” display; print Summary and Detailed quotes with letterhead.
- Letterhead printing: Place your logo/letterhead at `app-frontend/public/letterhead.png` to brand printed quotes. The app automatically uses this file.
- Manual PDF now builds from this document and is copied into the app for quick access.

- Coordinate convention: P(Y, X)
  - Y = Westing (increases to the west)
  - X = Southing (increases to the south)
  - Always list coordinates in the order Y X
- Zimbabwe display and rounding:
  - Banker’s rounding is used for numeric displays
  - Areas policy: if area < 10,000 m², show nearest m²; otherwise show hectares (ha) with 4 decimal places

## Map rendering, grids, and overlays (Lite)

SurveyPro’s map follows Zimbabwe Lo planar conventions by default and provides overlays to help you read coordinates precisely:

- Renderer modes
  - LO planar (default): Renders directly in the grid plane using P(Y, X)
  - Preview WGS84: Optional basemap toggle; if SRID/PostGIS transforms are available, the layer can be previewed on OSM tiles

- Renderer badge (top-left)
  - Shows current renderer and, for Zimbabwe Lo belts, displays the layer’s EPSG and Central Meridian (CM), e.g. “EPSG:22291 • CM 31°E”

- Planar grid and axes
  - Light grid lines at nice intervals in meters
  - Central meridian (Y=0): shown as a red dashed vertical line with tick marks
  - Equator (X=0): shown as a green dashed horizontal line when it falls within the current view
  - Tick labels show full meters with space as thousands separator and local qualifiers:
    - X ticks (on Y=0): “12 345 m S” (Southing)
    - Y ticks (on X=0): “67 890 m E” (Easting)

- Cursor coordinates (bottom-right)
  - LO planar: shows “Y …, X …” following P(Y, X) with live values under the cursor
  - WGS84 preview: shows “lat, lon” in decimal degrees

- Scalebar (bottom-left)
  - LO planar: simple meter-based bar
  - WGS84 preview: standard Leaflet scalebar in meters

## Before you start

- Ensure the backend server is running and you are logged in to the app
- Optional: If you seeded the sample data, you can explore with the provided sample project and layer names
- Recommended: Prepare clean UTF-8 CSV files with a header row and dot as decimal separator

## CSV formats

You can upload Points, LineStrings, and Polygons. For non-Point geometries you can use either WKT or a simple coordinate list. Header names are case-insensitive.

### Points CSV

Required columns:
- POINT (or NAME/ID)
- Y (Westing)
- X (Southing)

Optional columns:
- F_P (free/primary or other flag)
- DESCRIPTION

Example:
```
POINT,Y,X,F_P,DESCRIPTION
P1,33332.88,1860173,,KAPIRO
P2,33744.12,1860450,,
P3,34012.67,1860220,,
```

Notes:
- Coordinates must be in P(Y, X) order
- Use dot as decimal separator (e.g., 33332.88). Thousands separators are not supported

### LineStrings CSV

Provide either WKT or a coordinate-list column.

Columns:
- Either WKT with a LINESTRING value, e.g. `LINESTRING(1000 2000, 1500 2400, 2100 2600)`
- Or COORDS with a list like `1000 2000; 1500 2400; 2100 2600`
- Optional: POINT/NAME/ID, F_P, DESCRIPTION

Example (COORDS):
```
POINT,COORDS,DESCRIPTION
L1,"1000 2000; 1500 2400; 2100 2600",Footpath
```

Rules:
- Minimum 2 vertices
- Coordinates listed as Y X, separated by spaces; pairs separated by semicolons

### Polygons CSV

Provide either WKT or a ring coordinate list.

Columns:
- Either WKT with a POLYGON value, e.g. `POLYGON((1000 2000, 1500 2400, 2100 2600, 1000 2000))`
- Or RING with a list like `1000 2000; 1500 2400; 2100 2600; 1000 2000`
- Optional: POINT/NAME/ID, F_P, DESCRIPTION

Example (WKT):
```
POINT,WKT,F_P,DESCRIPTION
PolyA,"POLYGON((1000 2000, 1500 2400, 2100 2600, 1000 2000))",,Parcels Lot A
```

Rules:
- Minimum 3 unique vertices (closing pair can be omitted; if present, any duplicate last vertex will be dropped)
- Coordinates are Y X in order
- Current limitation: MultiLineString/MultiPolygon and interior holes are not yet supported in the Areas loader

### SRID and Central Meridian (Zimbabwe Lo belts)

If your database has PostGIS enabled, you can optionally store geometries in `geom` with an SRID and request WGS84 transforms for basemap overlays. You can either:
- Enter a numeric SRID directly (e.g., 0 for local P(Y,X), or a specific EPSG)
- Or select a Central Meridian (Lo) and we’ll map to a Zimbabwe EPSG:

- Lo25 → EPSG:22285
- Lo27 → EPSG:22287
- Lo29 → EPSG:22289
- Lo31 → EPSG:22291
- Lo33 → EPSG:22293

Central Meridian (CM) by EPSG (per QGIS):

- EPSG:22285 → CM 25°E (Lo25)
- EPSG:22287 → CM 27°E (Lo27)
- EPSG:22289 → CM 29°E (Lo29)
- EPSG:22291 → CM 31°E (Lo31)
- EPSG:22293 → CM 33°E (Lo33)

Note: The map’s renderer badge uses an explicit EPSG→CM lookup and will display CM where known; unknown SRIDs omit the CM.

Tip: If your source data is in Easting/Northing (EN), convert to P(Y,X) before upload per your project convention. For south- and west-positive systems, a common conversion is Y = −Easting, X = −Northing, but verify against your survey standard.

## Financial Estimate and Quotes (Lite)

Open Modules → Lite → Compute → Financial Estimate.

Two modes mirror typical workflows:

- CSV estimate: Paste or upload a tariff-like CSV and the app will render line items with sections, totals, VAT, Grand Total, and a per-stand “Say …” line if present or derivable.
- Calculator: Enter inputs directly (units/stands, rates, beacons, GP, dispensation, travel/subsistence, professional time, exam fees) and the app composes the same table layout and totals.

Header fields and options:
- Title, Client, Project, Location, Quote #, Prepared by, Date
- Currency: USD or ZWL; display formatting adjusts accordingly
- VAT rate (%), Contingency (%). “Initial Charge” follows the rule: $50 + 20% of the per-lot total
- Beacons default qty: 2.5 × stands (min 3). You can override the quantity if needed

Outputs and actions:
- Generate Quote Summary: Prints a one-page summary showing Professional Fees, Reimbursables, Exam Fees, and Total
- Generate Detailed Quote: Prints the full itemized table with sections and totals
- Share: Quick WhatsApp share line with Title, Quote # (if set), Units, and Total (+ per-stand if available)
- Save Draft: Persists your inputs locally (browser storage) for both CSV and Calculator modes

Letterhead and branding for printouts:
- Place your letterhead image at `app-frontend/public/letterhead.png` (recommended PNG, landscape-friendly). The app looks for this by default
- If `public/letterhead.png` is missing, it will attempt a fallback to `/tariff/letterhead.png` (dev only) or `/help/letterhead.png` if present
- The app waits for the letterhead image to load before printing to avoid blank logos in generated PDFs

Notes:
- Tariff version (from the embedded dataset) is shown on the screen for reference
- Per-stand “Say” is derived automatically when Grand Total and Units are present

## Uploading CSVs in the app

1) Open the Imports/Exports screen
- In the left navigation: Modules → Lite → Imports/Exports

2) Choose or create a destination
- Pick an existing Project and Layer, or tick “Create new” and enter:
  - Project name
  - Layer name
  - Geometry Type: Point, LineString, or Polygon
  - Optional SRID or Central Meridian (Lo25/27/29/31/33)

3) Select your CSV and import
- Click “Choose File” and select your CSV
- Click “Import” and wait for the summary (rows created, skipped, errors)

4) Verify in the map or Areas module
- The upload stores geometry in JSONB; if SRID/PostGIS are provided, a `geom` column is also populated
- You can use the Layers and search tools in map-enabled screens to view features

## Using Points/Lines/Polygons in the Areas module

Open Modules → Lite → Areas.

There are two ways to drive area computations:

1) Load Points from DB
- Use the “Load from DB (Points)” panel to select a Project/Layer containing points
- Search or pick the points you want and add to the computation table
- The table shows P(Y, X), bearings, distances, and residuals. Banker’s rounding is applied in displays

2) Load Lines/Polygons
- Use the “Load Lines/Polygons” panel
- Select the target Project/Layer and fetch available geometries
- Pick one LineString or Polygon; its vertices will be loaded into the points table
  - For Polygon, any repeated closing vertex is dropped automatically

Then click Compute Area.
- The result shows:
  - Computed area (shoelace method)
  - Residuals (dY, dX) if applicable
  - Display policy: nearest m² below 10,000 m²; otherwise hectares (ha) with 4 decimals

Optional actions:
- Save: persist the current computation as a new feature (if implemented for your workflow)
- Export CSV: download the current points table as CSV (POINT,Y,X)
- Map toggle: switch to OSM basemap if SRID/PostGIS are available for WGS84 transforms; otherwise the map uses a planar view (CRS.Simple)

## Areas v2: Build polygon by searching points

Areas v2 offers a streamlined, point-by-point workflow to build polygons by searching and adding only the points you want, with simple reordering and export.

Open Modules → Lite → Compute → Areas v2 (Search).

1) Select a Points Layer
- Use the Points Layer selector at the top to choose which database layer to search.

2) Add points via the map search
- In the map panel, type at least 2 characters to search by beacon/name.
- Click a suggestion, then click Add.
- Each added point appears in the table with its P(Y, X) coordinates.

3) Edit names or coordinates (optional)
- You can rename a point in the table or adjust Y (Westing) and X (Southing).
- Input accepts either plain numbers or D:M:S style entries; seconds are validated (< 60).

4) Reorder or remove points
- Drag the row numbers to reorder items, or use the keyboard shortcut Alt+↑/↓ on the focused row.
- Click Remove to delete a row.
- Use Clear all to empty the table if you want to start again.

5) Map preview and basemap toggle
- The map previews your current sequence with labeled markers; once you have 3+ points it also shows a filled polygon.
- Toggle “Show on basemap (WGS84)” to display on OSM tiles when your layer has SRID/PostGIS transforms available.
- If the transform fails or is incomplete, the app automatically falls back to planar P(Y, X) rendering and shows a small amber notice explaining the fallback.

6) Compute, Save, and Export
- The Compute button becomes active when you have 3+ valid points.
- Result displays area via the shoelace method using Zimbabwe display policy:
  - below 10,000 m² → nearest m²
  - otherwise hectares (ha) with 4 decimal places
- Residuals table shows edge distances, bearings (south-oriented), and dY/dX with banker’s rounding on displays.
- Tick Save result to persist the polygon; choose a layer to store the output.
- Export CSV downloads the current table as POINT,Y,X (P(Y, X) order).

Tips
- Coordinate convention is P(Y, X) everywhere: Y = Westing, X = Southing.
- Use the Areas v1 view if you prefer loading entire point layers or extracting vertices from LineStrings/Polygons.
- Bearings show in D:M:S with carry and policy-defined seconds precision.

## Examples

Points CSV:
```
POINT,Y,X,F_P,DESCRIPTION
P1,33332.88,1860173,,Start
P2,33744.12,1860450,,Corner
P3,34012.67,1860220,,End
```

LineString CSV (WKT):
```
POINT,WKT
Road1,"LINESTRING(1000 2000, 1500 2400, 2100 2600)"
```

Polygon CSV (RING):
```
POINT,RING,DESCRIPTION
PolyA,"1000 2000; 1500 2400; 2100 2600; 1000 2000",Farm lot
```

## Troubleshooting

- Import says some rows were skipped:
  - Check header names (POINT/NAME/ID, Y, X for points; WKT/COORDS/RING for lines/polys)
  - Ensure numbers use a dot as decimal separator; remove thousands separators
  - Minimum vertices: 2 for LineString, 3 for Polygon
- Geometry appears flipped or mirrored:
  - Confirm you supplied P(Y, X) values (Westing first, then Southing)
  - If converting from E/N, double-check sign conventions for your dataset
- Basemap toggle doesn’t show transformed locations:
  - Ensure SRID was set on the layer and PostGIS is available; otherwise only planar rendering is available
- Can’t find your layer in Areas:
  - Make sure the import targeted the expected Project/Layer and the geometry type matches your selection
- Polygons with holes or MultiPolygons:
  - Current Areas loader takes a single outer ring. Multi-geometry and holes selection are not yet supported

## Notes on Zimbabwe conventions

- Bearings and angles display use DMS with colons (D:M:S) and carry/normalization rules
- Banker’s rounding is applied consistently in numeric displays
- Coordinates are treated as P(Y, X) across the app

For more details, see:
- docs/IMPORT_POINTS_CSV.md
- docs/IMPORT_LINES_POLYGONS_CSV.md
- docs/COORDINATE_SYSTEM.md
- docs/PLATFORMATIC_API_PATTERNS.md (legacy background)

## Map view (Spatial phase 1)

Open Map in the top navigation.

- Choose a Project and then a Layer
- Add a test point (demo) or run a BBox query to list features
- The main map is a placeholder panel in this phase; map-enabled screens like Areas v2 show live previews

## Authentication and access

- Sign in to access modules that call the backend
- API calls use a bearer token automatically; a 401 response will log you out so you can sign back in

## Troubleshooting quotes and printing

- Letterhead not showing in printed PDF:
  - Ensure the file exists at `app-frontend/public/letterhead.png`
  - Hard-refresh the browser (to clear cache) and try printing again
  - If testing in development and you keep the letterhead outside `public/`, confirm your dev server serves that path
- Missing per-stand “Say” line:
  - Provide Units/Stands, or include an explicit “Say … per Stand” line in your CSV
- Currency symbols or separators look wrong:
  - Switch Currency (USD/ZWL) and re-run; formatted money uses two decimals and thousands separators
