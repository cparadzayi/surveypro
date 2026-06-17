# Calculations Part 2 - Quick Start Guide

## What is Calculations Part 2?

Calculations Part 2 is the area computation module in the Cadastral Standard workflow. It allows you to:
- Define land parcel boundaries using adjusted coordinates
- Compute areas automatically with professional accuracy
- Generate consistency checks (residuals) for quality assurance
- Prepare data for the final Report on Survey

## Step-by-Step Usage

### 1. Access the Module
Navigate through the Cadastral Standard workflow:
```
CSV Import → Field Book → Calculations Part 1 → Coordinate List → Calculations Part 2
```

### 2. Select Your Projection System
Choose the appropriate Central Meridian (Lo) for your project area:

| Central Meridian | EPSG Code | Coverage Area |
|------------------|-----------|---------------|
| Lo 25            | 20935     | Western Zimbabwe |
| Lo 27            | 20936     | |
| Lo 29 (Default)  | 20937     | Central Zimbabwe |
| Lo 31            | 20938     | |
| Lo 33            | 20939     | Eastern Zimbabwe |

**Tip:** Use the same projection system as your field survey.

### 3. View Your Coordinate Points
The interface displays:
- **Available Points**: Total count of adjusted coordinates
- **Point List**: Preview table with Y, X, and status
- **Interactive Map**: All points plotted with labels

### 4. Build a Parcel

#### Method A: Click on Map
1. Click points on the map in boundary order (clockwise or counter-clockwise)
2. Each click adds the point to your current parcel
3. Points turn green when selected

#### Method B: Search for Points
1. Type a point name in the search box (e.g., "P1", "BEACON")
2. Click the matching point from the dropdown
3. Press Enter to add the first match quickly

#### Building Tips:
- **Order Matters**: Add points in the order they form the boundary
- **Minimum 3 Points**: You need at least 3 points to form a closed polygon
- **No Duplicates**: Each point can only be added once per parcel
- **Remove Mistakes**: Click "Remove" next to any point to delete it

### 5. Name Your Parcel
Enter a designation in the text box:
- Examples: "LOT 1", "STAND 123", "PORTION 5 OF ERF 2847"
- Use standard cadastral naming conventions
- Be descriptive and unique

### 6. Save the Parcel
Click **"Save Parcel"** button (enabled when you have 3+ points and a designation)

The parcel is added to the "Defined Parcels" list below.

### 7. Build Additional Parcels
Repeat steps 4-6 for each land parcel in your survey.

### 8. Compute All Areas
Once all parcels are defined:
1. Click **"🧮 Compute All Areas"** button
2. Wait for processing (usually instant)
3. Results appear for each parcel

### 9. Review Results

For each parcel, you'll see:

#### Area Display
- **< 10,000 m²**: Shown as square meters (e.g., "2,547 m²")
- **≥ 10,000 m²**: Shown as hectares with 4 decimals (e.g., "1.2547 ha")

#### Centroid
- Y and X coordinates of the geometric center
- Useful for label placement on maps

#### Consistency Check
- **ΣdY**: Sum of Y-coordinate differences (should be ≈ 0)
- **ΣdX**: Sum of X-coordinate differences (should be ≈ 0)
- Large residuals may indicate errors in point order or coordinates

#### Edge Analysis (Click "Details")
For each boundary segment:
- **Distance**: Length in meters
- **Bearing**: Direction (DMS format)
- **dY, dX**: Coordinate differences
- Helps verify boundary measurements

## Example Workflow

### Scenario: Computing area for LOT 1 with 4 corner beacons

```
Points Available: P1, P2, P3, P4 (from Coordinate List)

Step 1: Select Lo 29 projection
Step 2: Search "P1" → Add to parcel
Step 3: Search "P2" → Add to parcel
Step 4: Search "P3" → Add to parcel
Step 5: Search "P4" → Add to parcel
Step 6: Enter designation: "LOT 1"
Step 7: Click "Save Parcel"
Step 8: Click "Compute All Areas"

Result:
✅ LOT 1
   Area: 0.5247 ha
   Centroid: (97538.12, 2247108.45)
   ΣdY: 0.00 m
   ΣdX: 0.01 m
```

## Common Issues & Solutions

### Issue: "Need at least 3 points"
**Solution:** Add more points to form a closed polygon. A parcel must have minimum 3 corners.

### Issue: Large residuals (ΣdY or ΣdX > 0.10)
**Possible Causes:**
- Points added in wrong order
- Incorrect point coordinates
- Polygon not properly closed

**Solution:** 
1. Delete the parcel
2. Rebuild with correct point order
3. Verify coordinates in Coordinate List

### Issue: Points not visible on map
**Solution:**
- Check that Calculations Part 1 generated adjusted coordinates
- Verify projection system matches your survey area
- Zoom out on the map

### Issue: Can't find a point by search
**Solution:**
- Check exact point name in the preview table
- Search is case-insensitive but must match the name
- Try clicking the point on the map instead

## Best Practices

### 1. Point Order
Always add points in boundary order (either clockwise or counter-clockwise). This ensures:
- Correct area calculation
- Proper edge analysis
- Accurate bearing computations

### 2. Parcel Naming
Use consistent naming conventions:
- **Subdivisions**: "LOT 1", "LOT 2", etc.
- **Stands**: "STAND 123", "STAND 124", etc.
- **Portions**: "PORTION 1 OF ERF 2847"

### 3. Quality Checks
Before finalizing:
- Verify area matches expected size
- Check residuals are near zero (< 0.05 m)
- Review edge distances against field measurements
- Confirm centroid is inside the parcel

### 4. Multiple Parcels
When surveying multiple parcels:
- Define all parcels before computing
- Use "Compute All Areas" for batch processing
- Review each parcel's results individually

## Data Flow

```
Calculations Part 1
        ↓
Adjusted Coordinates (542 points)
        ↓
Calculations Part 2
        ↓
Select Projection (EPSG)
        ↓
Build Parcels (point selection)
        ↓
Compute Areas (automated)
        ↓
Results: Area, Centroid, Consistency
        ↓
(Future: Report on Survey PDF)
```

## Keyboard Shortcuts

- **Enter**: Add first search result to parcel
- **Escape**: Clear search results
- **Click Map**: Add point to parcel

## Technical Notes

### Coordinate System
- Uses Zimbabwe P(Y,X) convention
- Y = Westing (positive west)
- X = Southing (positive south)

### Area Algorithm
- Surveyor's Formula (Shoelace Formula)
- Accounts for coordinate system orientation
- Banker's rounding for precision

### Precision
- Coordinates: 2 decimal places (centimeters)
- Areas < 10,000 m²: Nearest integer
- Areas ≥ 10,000 m²: 4 decimal places
- Residuals: 2 decimal places

## Next Steps

After completing Calculations Part 2:
1. Click **"Continue to Report on Survey"**
2. Generate professional PDF report (coming soon)
3. Include area computations in DSG Certificate

## Support

For issues or questions:
- Check the coordinate list has data
- Verify projection system selection
- Review point names and coordinates
- Consult CALCULATIONS_PART2_IMPLEMENTATION.md for technical details
