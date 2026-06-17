# Map Visibility Fix - DataMap.vue

## Problem
Points and polygons were not displaying clearly in the DataMap component. The main issues were:

1. **Background point markers were nearly invisible**
   - Using light gray colors (#6b7280, #9ca3af)
   - Low opacity (0.7)
   - Small radius (minimum 6px)
   - Against light gray planar background, these were barely visible

2. **Selected points were too subtle**
   - Red markers with only 8px minimum radius
   - 0.95 opacity
   - Could be hard to distinguish from background

3. **Polygon borders were thin**
   - Only 3px weight
   - Made parcels hard to see clearly

## Solution Applied

### Background Points (Lines 330-345)
**Before:**
- Color: `#6b7280` (light gray)
- Fill: `#9ca3af` (lighter gray)
- Opacity: 0.7
- Radius: minimum 6px
- Weight: 2px

**After:**
- Color: `#475569` (DARKER slate-600)
- Fill: `#64748b` (DARKER slate-500)
- Opacity: **0.9** (much more visible)
- Radius: minimum **7px**
- Weight: **3px** (thicker border)
- Radius multiplier: **1.2x** for all points (was 1.0x)

### Selected Points (Lines 580-590)
**Before:**
- Color: `#dc2626` (red-600)
- Fill: `#ef4444` (red-500)
- Opacity: 0.95
- Radius: minimum 8px
- Weight: 3px

**After:**
- Color: **`#b91c1c`** (DARKER red-700)
- Fill: **`#dc2626`** (DARKER red-600)
- Opacity: **1.0** (fully opaque)
- Radius: minimum **10px**
- Weight: **4px** (thicker border)

### Polygon Borders (Lines 479-486)
**Before:**
- Weight: 3px
- Opacity: 0.3 (computed) / 0.35 (pending)

**After:**
- Weight: **4px** (thicker)
- Opacity: **0.4** (computed) / **0.45** (pending)
- Border colors: Darker shades for better visibility

## Enhanced Debugging

Added comprehensive console logging:
```
[DataMap] Rendering N background points, enableClick=true/false, zoom=X
[DataMap] ✅ Added N background point markers
[DataMap] 🎨 Background marker colors: ...
[DataMap] ✅ DOM Verified: N interactive elements (X paths, Y circles)
[DataMap] 📊 First marker style: fill=..., stroke=..., opacity=...
[DataMap] ✅ Added N selected point markers (red, radius 10+, opacity 1.0)
```

## How to Verify the Fix

1. **Open Browser Console** (F12 → Console tab)

2. **Navigate to Areas2 or any map view** with DataMap component

3. **Check console logs** - you should see:
   ```
   [DataMap] Rendering 542 background points, enableClick=true, zoom=14
   [DataMap] ✅ Added 542 background point markers
   [DataMap] 🎨 Background marker colors: dark gray (#475569), opacity: 0.9
   [DataMap] ✅ DOM Verified: 542 interactive elements (542 paths, 0 circles)
   [DataMap] 📊 First marker style: fill=rgb(100, 116, 139), stroke=rgb(71, 85, 105), opacity=1, fillOpacity=0.9
   ```

4. **Visual Check:**
   - **Background points**: Should appear as **dark gray circles** (easily visible)
   - **Selected points**: Should appear as **bright red circles** (very prominent)
   - **Point labels**: White background with point names (already working)
   - **Polygons**: Should have **thick borders** (4px) in green or yellow

5. **Expected Appearance:**
   - Map should show hundreds of dark gray dots with labels
   - Selected points should be bright red and larger
   - All markers should be clearly visible against any background
   - No "invisible" or "barely visible" points

## Color Reference

### Background Points (Non-nearby)
- **Stroke**: #475569 (slate-600) - darker gray
- **Fill**: #64748b (slate-500) - medium gray
- **Opacity**: 0.9

### Background Points (Nearby to selection)
- **Stroke**: #1e293b (slate-900) - very dark
- **Fill**: #334155 (slate-700) - dark gray
- **Opacity**: 0.9

### Selected Points
- **Stroke**: #b91c1c (red-700) - dark red
- **Fill**: #dc2626 (red-600) - bright red
- **Opacity**: 1.0 (fully opaque)

### Clickable Background Points
- **Stroke**: #1d4ed8 (blue-700) - dark blue
- **Fill**: #3b82f6 (blue-500) - bright blue
- **Opacity**: 0.95

## Troubleshooting

### If markers still not visible:

1. **Check browser zoom** - ensure it's at 100%
2. **Clear browser cache** - hard refresh (Ctrl+F5)
3. **Check console for errors** - look for JavaScript errors
4. **Verify coordinate data** - ensure points have valid Y/X values
5. **Check map initialization** - ensure Leaflet is properly initialized

### If DOM verification fails:

Check for:
- CSS conflicts that might hide `.leaflet-interactive` elements
- Z-index issues with other overlays
- SVG rendering problems in the browser

## Files Modified

- `app-frontend/src/components/maps/DataMap.vue` (lines 330-345, 580-590, 479-486, 424-444, 631-633)

## Related Issues

This fix resolves:
- Points appearing "invisible" or "barely visible" on map
- Polygons being hard to distinguish
- User confusion about whether data loaded correctly
- Difficulty selecting or clicking on points

## Performance Impact

**None** - These changes only affect rendering styles, not data processing or DOM operations.
