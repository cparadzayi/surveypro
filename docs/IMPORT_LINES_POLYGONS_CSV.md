# Importing LineStrings and Polygons via CSV

This app accepts CSV uploads for Points, LineStrings, and Polygons. For non-Point types you can provide either WKT or a simple coordinate-list format.

Zimbabwe planar convention: P(Y,X)
- Y = Westing (x-axis), X = Southing (y-axis)
- Always list coordinates in the order: y x

Accepted columns (header names are case-insensitive):

1) LineString
- WKT: LINESTRING(y x, y x, ...)
  OR
- COORDS: y1 x1; y2 x2; y3 x3; ...
- Optional: NAME/POINT/ID, F_P, DESCRIPTION

2) Polygon (single outer ring)
- WKT: POLYGON((y x, y x, ...))  -- single ring
  OR
- RING: y1 x1; y2 x2; ...; y1 x1 (closing pair optional)
- Optional: NAME/POINT/ID, F_P, DESCRIPTION

Notes
- The importer treats commas or dots in numbers: "33,333.88" is not supported; use either 33333.88 or 33333,88. Mixed thousands separators are not parsed.
- Lines need at least 2 vertices; polygons at least 3.
- The app stores geometry as JSONB and (optionally) in PostGIS `geom` if available. Provide an SRID if you want `geom` populated (e.g., 0 for local, or a specific EPSG). If PostGIS is not installed, the upload still succeeds and only JSONB is stored.
- Layers created during import are typed:
  - Point → layer_type: points
  - LineString → layer_type: lines
  - Polygon → layer_type: polygons

Example CSV rows

LineString using COORDS:
POINT,COORDS,DESCRIPTION
L1,"1000 2000; 1500 2400; 2100 2600",Footpath

Polygon using WKT:
POINT,WKT,F_P,DESCRIPTION
PolyA,"POLYGON((1000 2000, 1500 2400, 2100 2600, 1000 2000))",,Parcels Lot A

Where to upload in the UI
- Open Lite → Imports/Exports.
- Choose a target layer or tick "Create new" and provide Project/Layer, Geometry Type, and optional SRID.
- Pick CSV file and click Import.
