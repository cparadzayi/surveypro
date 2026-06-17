# OpenStreetMap Tile Loading Error Fix

## Issue
MapLibre was throwing errors when trying to load OpenStreetMap tiles:
```
Failed to fetch: https://tile.openstreetmap.org/21/1235400/1169515.png
CORS policy: No 'Access-Control-Allow-Origin' header
400 (Bad Request)
```

## Root Cause
The map was configured with `maxZoom: 22` and `maxZoom: 20`, but OpenStreetMap's tile server only supports up to **zoom level 19**.

When users zoomed in beyond level 19, the map tried to request tiles that don't exist (zoom 20, 21, 22), causing:
- 400 Bad Request errors
- CORS errors
- Console spam

## OpenStreetMap Tile Server Limits

| Tile Server | Max Zoom | Notes |
|-------------|----------|-------|
| OpenStreetMap | 19 | Standard raster tiles |
| Satellite imagery | Varies | Usually 18-20 |
| Custom tile servers | Varies | Check provider docs |

**Zoom Level 19 Resolution:**
- ~0.3 meters per pixel
- Sufficient for cadastral survey work
- Individual buildings clearly visible

## Solution

Reduced `maxZoom` to **19** in two locations:

### 1. Main Map Initialization (Line 597)
**Before:**
```typescript
maxZoom: 22,     // Allow very close inspection of points
```

**After:**
```typescript
maxZoom: 19,     // OSM tile server maximum zoom level
```

### 2. Fit Bounds Function (Line 1393)
**Before:**
```typescript
maxZoom: 20,      // Allow close inspection
```

**After:**
```typescript
maxZoom: 19,      // OSM tile server maximum zoom level
```

## Why Zoom 19 is Sufficient

### Cadastral Survey Requirements
- **Zoom 19** = ~0.3m per pixel
- Survey point accuracy: typically 0.01m - 0.05m
- At zoom 19, a 0.05m error = ~0.17 pixels (imperceptible)

### Practical Benefits
- ✅ No tile loading errors
- ✅ No CORS issues
- ✅ Cleaner console logs
- ✅ Faster map performance
- ✅ Still sufficient detail for survey work

### Visual Comparison
- **Zoom 16:** District/town level (~10m per pixel)
- **Zoom 17:** Neighborhood level (~5m per pixel)
- **Zoom 18:** Street level (~2.5m per pixel)
- **Zoom 19:** Building/parcel level (~0.3m per pixel) ✅
- **Zoom 20+:** Not available on OSM

## Alternative Solutions (If More Zoom Needed)

### Option 1: Use Satellite Imagery
Some satellite tile providers support zoom 20-21:
- Mapbox Satellite (requires API key)
- Google Satellite (requires API key)
- Bing Aerial (requires API key)

### Option 2: Custom Tile Server
Host your own tile server with higher zoom levels:
- Use high-resolution aerial imagery
- Generate tiles up to zoom 22
- No rate limiting or CORS issues

### Option 3: Vector Tiles
Switch to vector tiles (e.g., Mapbox Streets):
- Can zoom infinitely (client-side rendering)
- No tile loading errors
- Requires style configuration

## Files Modified

**File:** `MapLibreAreaView.vue`

**Changes:**
1. Line 597: `maxZoom: 22` → `maxZoom: 19`
2. Line 1393: `maxZoom: 20` → `maxZoom: 19`

## Testing

### Before Fix
```
[MapLibre] ⚠️ Map error: Failed to fetch zoom 21 tile
[MapLibre] ⚠️ Map error: Failed to fetch zoom 20 tile
CORS policy error
400 Bad Request
```

### After Fix
```
[MapLibre] ✅ Tiles loaded for: osm-raster
[MapLibre] ✅ Tiles loaded for: survey-pegs
[MapLibre] ✅ Tiles loaded for: parcels
```

## User Impact

### Before
- ❌ Console errors when zooming in
- ❌ Missing tiles (gray areas)
- ❌ Slower performance
- ❌ Confusing error messages

### After
- ✅ No console errors
- ✅ All tiles load successfully
- ✅ Smooth zooming experience
- ✅ Clean console logs

## Additional Notes

### OSM Usage Policy
OpenStreetMap tile servers have usage policies:
- **Rate limiting:** Max 2 requests per second
- **User-Agent required:** Should identify your app
- **Caching recommended:** Don't request same tile repeatedly
- **Commercial use:** Consider donating or using commercial provider

### Current Configuration
The app uses OSM tiles for:
- Base map layer (streets, buildings, labels)
- Fallback when satellite imagery is disabled
- Free, no API key required

### Satellite Toggle
Users can toggle satellite imagery on/off:
- **Satellite ON:** Uses satellite tiles (if available)
- **Satellite OFF:** Uses OSM raster tiles (zoom 19 max)

## Summary

**Issue:** Map tried to load zoom 20-22 tiles from OSM (not available)
**Fix:** Reduced maxZoom to 19 (OSM's maximum)
**Result:** No more tile loading errors, cleaner console, better performance
**Impact:** No loss of functionality - zoom 19 is sufficient for cadastral work

**Status:** ✅ Fixed - Map now respects OSM tile server limits
