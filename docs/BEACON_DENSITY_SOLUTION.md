# Smart Beacon Density Solution

## Problem Analysis
From the uploaded image, the issue is clear: **dense beacon clustering** causes:
1. **Circle overlap**: Red circles (shared beacons) physically overlap when beacons are < 10m apart at 1:2000 scale
2. **Label collisions**: MapLibre hides many labels due to collision avoidance
3. **Incomplete labeling**: Not every beacon is explicitly labeled

## Implemented Solution (Phase 1) ✅

### 1. **Black Beacon Circles**
All beacon circles now render in **uniform black** (`#0f172a`) instead of red/orange for shared/boundary beacons.
- Professional cadastral standard
- Consistent visual appearance
- No color-coding confusion

### 2. **Beacon Density-Aware Scale Selection**
The system now **automatically detects beacon density** and selects appropriate scales:

**Algorithm:**
```typescript
// For each pair of beacons, calculate distance
minBeaconDistM = min(distance between any two beacons)

// Calculate minimum scale to prevent 3.5mm circles from overlapping
// Requirement: 3.5mm circle + 2mm clearance = 5.5mm minimum spacing on paper
minScale = (minBeaconDistM × 1000mm) / 5.5mm

// Round up to next standard scale (500, 1000, 1250, 2000, 2500, 5000...)
selectedScale = nextStandardScale(minScale)
```

**Example:**
- If beacons are 5.5m apart → requires scale ≥ 1:1000
- If beacons are 2.75m apart → requires scale ≥ 1:500
- If beacons are 11m apart → can use 1:2000

**Console Output:**
```
[BeaconDensity] Min beacon spacing: 5.23m → requires scale ≥ 1:951
[ScaleOptimizer] ✅ Sheet Medium fits: blocks need 180mm, available 200mm
[SurveyPlanMap] 📐 Auto-selected sheet+scale: { sheetSize: 'Medium', scaleDenominator: 1000, scaleLabel: '1:1000' }
```

### 3. **Smart Sheet Upsizing**
The optimizer tries sheet sizes in order (Small → Medium → Large) and validates:
- ✅ Map extent fits in plot window
- ✅ All blocks (tables) fit without truncation
- ✅ Beacon circles don't overlap (via scale constraint)

If Small sheet can't accommodate the required scale, it automatically upsizes to Medium or Large.

## Current Behavior

**What works now:**
- ✅ Beacon circles are 3.5mm diameter when printed
- ✅ All beacon circles are black
- ✅ System auto-selects larger scales (1:500, 1:1000) when beacons are dense
- ✅ Circles won't physically overlap if auto-scale is used
- ✅ Parcels show only black outlines (no fill)

**What still needs work:**
- ⚠️ **Not all beacons are labeled** - MapLibre collision avoidance hides crowded labels
- ⚠️ **No guarantee of explicit labeling** - some beacons may have no visible label

## Next Phase: Indexed Labeling (Phase 2)

To **guarantee every beacon is explicitly labeled**, implement:

### Option A: Numbered Beacons with Table
```
Map shows:        Beacon Schedule table shows:
  ①                 ① = Beacon 2481A
  ②                 ② = Beacon 2442A  
  ③                 ③ = Beacon 2462A
  ...               ... (all beacons listed)
```

**Pros:**
- Guarantees every beacon labeled
- Clean, low-noise appearance
- Standard cadastral practice for dense plans

**Cons:**
- Requires additional table space on plan
- User must cross-reference table

### Option B: Adaptive Label Strategy
```
Dense areas:   Use indexed labels (①②③)
Sparse areas:  Use full names (2481A, 2442A)
```

**Pros:**
- Best of both worlds
- Full names where space permits
- Indexes only where necessary

**Cons:**
- More complex logic
- Potential inconsistency

### Option C: Multi-Sheet Plans
```
Sheet 1: Overview at 1:2000 with indexed beacons
Sheet 2: Detail inset at 1:500 with full labels
```

**Pros:**
- Professional for complex surveys
- Both overview and detail

**Cons:**
- Multiple pages
- More complex to produce

## Recommendation

For your dense dataset, I recommend:

**Immediate (use current system):**
1. Set `scale: 'auto'` and `sheetSize: 'auto'`
2. System will auto-select **Large sheet + 1:500 or 1:1000**
3. Circles won't overlap
4. Many (but not all) labels will appear

**Next enhancement (Phase 2):**
Implement **Option A: Numbered Beacons with Beacon Schedule table**
- Add indexed labels (①②③...) to all beacons
- Add "Beacon Schedule" table to PDF listing all beacon names
- Guarantee 100% labeling coverage

## Testing with Your Data

**To test the current solution:**
1. Refresh the map view → see black beacon circles
2. Export Professional PDF with auto scale/sheet
3. Check console for: `[BeaconDensity] Min beacon spacing: X.XXm → requires scale ≥ 1:XXX`
4. Verify selected scale (should be 1:500 or 1:1000 for your dense data)
5. Measure beacon circles on printed PDF → should be 3.5mm diameter
6. Verify circles don't overlap

**Expected outcome:**
- Large sheet (1000×800mm)
- Scale 1:500 or 1:1000 (depending on your exact beacon spacing)
- No circle overlap
- Some labels visible (not all, due to collision avoidance)

**To get 100% labeling:**
- Reply "implement indexed labels" and I'll add Phase 2
