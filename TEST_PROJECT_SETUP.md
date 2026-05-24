# 🧪 Automated Test Project Setup Guide

## Quick Start (3 Steps)

### 1. Run Automated Setup
```typescript
// In browser console (when logged in as Elon Paradzayi):
import { createTestProject, generateTestReport } from './services/testProjectSetup'

const result = await createTestProject()
console.log(generateTestReport(result))
```

### 2. Or Manual Setup in UI
1. **Login** as Elon Paradzayi (License: 294)
2. **Create New Project**:
   - Client: MSU
   - District: Gwelo
   - Project: "Proj4Leaflet Test - Nov 2025"

3. **Import Test Coordinates** (use data below)

4. **Progress Through Workflow**:
   - Step 1: Field Observations → Skip (use adjusted coords)
   - Step 2: Coordinate List → Verify SRID detection
   - Step 3: Area Computation → Test map display
   - Step 4: Create test parcels
   - Step 5: Generate PDF

### 3. Verify Results

Check for these indicators of success:

✅ **SRID Detection**
```
Console should show: "Detected zone: Lo29 (Cape Lo29) - SRID: 22289"
```

✅ **Map Display**
- Points cluster near Gwelo area
- Scale bar shows meters
- Coordinates in correct ranges:
  - Y (Westing): 96,000 - 97,500m
  - X (Northing): 2,247,000 - 2,248,000m

✅ **Coordinate Transformation**
```
Console: "Using Proj4 with Zimbabwe P(Y,X) convention: [Y, X] → [Easting, Northing]"
Sample: "ST1: P(Y=96649.178, X=2247915) → [96649.178, 2247915]"
```

✅ **Area Computation**
- Closure error < 0.50m (acceptable)
- Closure error < 0.05m (excellent)
- Area calculations complete without errors

## Test Coordinates (Copy-Paste Ready)

### CSV Format
```csv
Point,Y (Westing),X (Northing),Status,Description,Date
ST1,96649.178,2247915,P,10mm iron,2025-01-10
ST2,97128.263,2248259.2,P,10mm iron,2025-01-10
P2,97538.004,2247107.9,F,50mm Iron,2025-01-10
ZA,96271.08,2247869.9,F,50mm Iron,2025-01-10
ZD,96551.464,2248065.6,F,50mm Iron,2025-01-10
ZE,96649.178,2247915,F,50mm Iron,2025-01-10
ZG,97128.263,2248259.2,F,50mm Iron,2025-01-10
2283A,97057.022,2247854.4,P,12mm iron,2025-01-10
2283L,96831.6,2248046,P,12mm iron,2025-01-10
2283M,96865.86,2247999.3,P,12mm iron,2025-01-10
```

### Test Parcels
```
Parcel 1: Stand 2428
Points: ST1, ZD, ZG, P2

Parcel 2: Stand 2836
Points: ZA, ZE, 2283M, 2283L
```

## Automated Validation Checklist

The automated setup will validate:

- [x] Coordinate ranges (Y: 0-200km, X: 0-3000km)
- [x] SRID detection (expected: 22289 - Lo29)
- [x] Coordinate transformation (P(Y,X) → [Y,X])
- [x] Parcel validity (≥3 points, valid designation)
- [x] CRS initialization (Proj4Leaflet with correct proj4 def)

## Expected Console Output

```
🚀 Starting automated test project creation...
📊 Step 1: Validating coordinate ranges...
✅ All coordinates within valid ranges

📊 Step 2: Detecting SRID from coordinates...
📍 Average coordinates: X=2247964, Y=96833
✅ Detected zone: Lo29 (Cape Lo29) - SRID: 22289
✅ Correct SRID detected: 22289

📊 Step 3: Initializing coordinate transformation...
🌍 Creating CRS for Cape Lo29 (EPSG:22289)
✅ Using Cape Lo29 (EPSG:22289, CM: 29°E)

📊 Step 4: Testing coordinate transformations...
🔄 Transforming 10 points
✅ Using Proj4 with Zimbabwe P(Y,X) convention: [Y, X] → [Easting, Northing]
📍 Sample transformations:
   ST1: P(Y=96649.178, X=2247915) → [96649.178, 2247915]
   ST2: P(Y=97128.263, X=2248259.2) → [97128.263, 2248259.2]
   P2: P(Y=97538.004, X=2247107.9) → [97538.004, 2247107.9]
✅ Coordinate transformations valid

📊 Step 5: Validating test parcels...
✅ Parcel Stand 2428: Valid
✅ Parcel Stand 2836: Valid

📊 Step 6: Creating workflow state...
🎉 Test project created successfully!
📍 10 coordinates loaded
📦 2 test parcels ready
🗺️ Projection: Cape Lo29 (EPSG:22289)
```

## Troubleshooting

### Map Shows Blank
**Cause**: Coordinate transformation error
**Fix**: Check console for "Invalid coordinate filtered out" messages

### Points in Wrong Location
**Cause**: Wrong coordinate order ([X,Y] instead of [Y,X])
**Solution**: Verify transformation shows "P(Y=..., X=...) → [Y, X]"

### Wrong SRID Detected
**Cause**: Coordinate ranges don't match expected zone
**Fix**: Verify your data is actually in Lo29 zone (CM: 29°E)

### Closure Error Too High
**Cause**: Data entry errors or incorrect coordinate system
**Acceptable**: < 0.50m
**Excellent**: < 0.05m

## Success Criteria

Your test is successful when:

1. ✅ SRID auto-detects as 22289 (Lo29)
2. ✅ All 10 points display on map
3. ✅ Points are in Gwelo area (not at 0,0 or top-left)
4. ✅ Scale bar shows metric units
5. ✅ Parcels compute without errors
6. ✅ Closure errors < 0.50m
7. ✅ PDF generates with correct P(Y,X) coordinates

## Next Steps After Success

1. **Document** any issues encountered
2. **Compare** with legacy projects (if available)
3. **Test** with different Lo zones (Lo25, Lo27, Lo31, Lo33)
4. **Train** other surveyors on the new system
5. **Migrate** existing projects gradually

## Support

If automated setup fails:
1. Check console for detailed error messages
2. Verify proj4leaflet is loaded correctly
3. Ensure coordinateTransform service is available
4. Review ZIMBABWE_CAPE_LO_SYSTEM.md for technical details

---

**Remember**: This is a TEST project. Use it to validate the system before processing real survey data.
