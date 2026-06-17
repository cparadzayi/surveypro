# Cadastral Label Placement - Quick Reference

## Core Principle
**ALL labels placed INSIDE their respective parcel polygons** (except Outside Figure)

## Label Hierarchy

### 1. Stand/Parcel Numbers (Highest Priority)
- **Position:** Parcel centroid
- **Font:** Helvetica Bold, 14-18pt
- **Example:** "2283", "2284A"
- **Never moves, never omitted**

### 2. Beacon Names
- **Position:** 3-5mm inside parcel, offset from beacon symbol toward centroid
- **Font:** Helvetica Regular, 8-10pt
- **Example:** "2283A", "2283B", "M8"
- **Always horizontal, never rotated**

### 3. Edge Distance Labels
- **Position:** Edge midpoint, 2-3mm inside parcel
- **Font:** Helvetica Regular, 7-8pt
- **Format:** "45.67" (meters, 2 decimals)
- **Rotated to align with edge**

### 4. Edge Direction Labels (Lowest Priority)
- **Position:** Near distance label, 1-2mm further inside
- **Font:** Helvetica Regular, 6-7pt
- **Format:** "305°47'30"" (DMS)
- **Orientation:** Rotated to align with edge (same as distance)
- **Color:** Dark gray (#333333) to differentiate
- **Short edges (<5m):** Omit and create map inset

## Map Insets for Short Edges
- **Trigger:** Edge length < 5m (direction label omitted)
- **Numbering:** Global counter "Inset 1", "Inset 2", etc.
- **Scale:** 2-3× magnification of main plan
- **Size:** 60-80mm square boxes
- **Location:** Right/top/bottom margins
- **Content:** Scaled-up view with ALL labels visible
- **Indicator:** "Inset 1" label near edge on main plan
- **Leader line:** Dashed gray line from indicator to inset

## Placement Order
1. Place stand numbers at centroids
2. Place beacon names near corners (inside)
3. Place edge distances along edges (inside, rotated)
4. Place edge directions near distances (inside, rotated)
5. Create map insets for short edges (<5m)
6. Render all insets in margins with leader lines

## Collision Resolution
- Stand numbers: Never move
- Beacon names: Minimal adjustment
- Distance labels: Shift ±20% along edge
- Direction labels: Omit if necessary

## Special Cases
- **Outside Figure:** Labels OUTSIDE polygon (exception)
- **Small parcels (<100m²):** Reduce font sizes
- **Narrow parcels (<10m width):** Labels on long edges only
- **Irregular shapes:** Use visual center instead of centroid

## Key Benefits
✅ Field surveyor sees all labels while standing in parcel  
✅ No confusion about label-to-parcel association  
✅ Professional, clean appearance  
✅ SI 727 compliant  

## Implementation Files
- Design: `CADASTRAL_LABEL_PLACEMENT_DESIGN.md`
- Backend: `app-backend/src/services/pdfkitGeoPDF.js`
- Functions: `calculateStandLabelPosition()`, `calculateBeaconLabelPosition()`, `calculateEdgeLabelPositions()`
