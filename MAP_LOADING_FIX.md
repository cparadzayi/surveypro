# Map Loading Timeout Fix

## Issue

The MapLibreAreaView component was getting stuck on "Transforming coordinates... Converting 545 points to WGS84" indefinitely, preventing users from accessing the Area Computation interface.

**Symptoms:**
- Loading spinner shows indefinitely
- Message: "Transforming coordinates... Converting 545 points to WGS84"
- Map never renders
- No error messages shown to user

---

## Root Cause

The map initialization was waiting for the MapLibre 'load' event without a timeout:

```typescript
// ❌ PROBLEMATIC CODE
await new Promise(resolve => map!.on('load', resolve));
```

If the map fails to load due to:
- Network issues loading tiles
- Map container not properly mounted
- Coordinate transformation errors
- Browser compatibility issues

The promise would never resolve, causing the app to hang indefinitely with `isLoading.value = true`.

---

## Fix Applied

### **1. Added Timeout to Map Load**

```typescript
// ✅ FIXED CODE
console.log('[MapLibre] ⏳ Waiting for map to load...');
await Promise.race([
  new Promise(resolve => map!.on('load', resolve)),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Map load timeout after 10 seconds')), 10000))
]).catch(error => {
  console.error('[MapLibre] ❌ Map load failed:', error);
  throw error;
});
```

**Benefits:**
- If map doesn't load in 10 seconds, throws error
- Error is caught by try-catch block
- `isLoading.value = false` is set in finally block
- User sees error alert instead of infinite spinner

---

### **2. Added Coordinate Transformation Validation**

```typescript
// Check if we have points to transform
if (coordinatePoints.value.length === 0) {
  throw new Error('No coordinate points available to display on map');
}

console.log('[MapLibre] 🔄 Starting coordinate transformation...');
console.log(`[MapLibre] 📊 Points to transform: ${coordinatePoints.value.length}`);

// Transform ALL points for adding to map
const allWgs84Points = capeLoArrayToWGS84(coordinatePoints.value as CapeLoPoint[]);
console.log(`[MapLibre] ✅ Transformation complete: ${allWgs84Points.length} WGS84 points`);
```

**Benefits:**
- Early validation prevents transformation of empty arrays
- Detailed logging shows transformation progress
- Easier to diagnose coordinate transformation issues

---

## Console Output

### **Before Fix (Stuck)**
```
[MapLibre] 🗺️ Initializing main map (survey pegs only)...
[MapLibre] 📊 Total points: 545
[MapLibre] 📍 Survey pegs for main map bounds: 542
[MapLibre] 📍 Bounds (from survey pegs): {...}
(HANGS HERE - no further output)
```

### **After Fix (Success)**
```
[MapLibre] 🗺️ Initializing main map (survey pegs only)...
[MapLibre] 📊 Total points: 545
[MapLibre] 🔄 Starting coordinate transformation...
[MapLibre] 📊 Points to transform: 545
[MapLibre] ✅ Transformation complete: 545 WGS84 points
[MapLibre] 📍 Survey pegs for main map bounds: 542
[MapLibre] 📍 Bounds (from survey pegs): {...}
[MapLibre] ⏳ Waiting for map to load...
[MapLibre] ✅ Map loaded successfully
[MapLibre] Current center: {...}
[MapLibre] Current zoom: 16
[MapLibre] Canvas element: ✅ Found in DOM
[MapLibre] ✅ Drawing layers initialized
```

### **After Fix (Timeout)**
```
[MapLibre] 🗺️ Initializing main map (survey pegs only)...
[MapLibre] 📊 Total points: 545
[MapLibre] 🔄 Starting coordinate transformation...
[MapLibre] 📊 Points to transform: 545
[MapLibre] ✅ Transformation complete: 545 WGS84 points
[MapLibre] ⏳ Waiting for map to load...
[MapLibre] ❌ Map load failed: Error: Map load timeout after 10 seconds
[MapLibre] ❌ Error initializing map: Error: Map load timeout after 10 seconds
Alert: "Failed to initialize map. Check console for details."
(Loading spinner stops)
```

---

## Testing

### **Test Scenario 1: Normal Load**
1. Navigate to Area Computation step
2. Map should load within 2-3 seconds
3. Console shows: "✅ Map loaded successfully"
4. Loading spinner disappears
5. Map is interactive

### **Test Scenario 2: Network Issues**
1. Disable network or block tile requests
2. Navigate to Area Computation step
3. After 10 seconds, see error alert
4. Console shows: "❌ Map load timeout after 10 seconds"
5. Loading spinner disappears (not stuck)

### **Test Scenario 3: No Coordinates**
1. Navigate to Area Computation without completing previous steps
2. Immediate error: "No coordinate points available to display on map"
3. Loading spinner disappears
4. User sees helpful error message

---

## Additional Improvements

### **Enhanced Logging**
Added detailed console logs at each stage:
- 🔄 Starting coordinate transformation
- ✅ Transformation complete
- ⏳ Waiting for map to load
- ✅ Map loaded successfully
- ❌ Map load failed (with error details)

### **Error Handling**
All errors now:
1. Log to console with details
2. Set `isLoading.value = false`
3. Show user-friendly alert
4. Allow user to retry or navigate away

---

## Files Modified

1. **`MapLibreAreaView.vue`**
   - Added timeout to map load promise (line 598-604)
   - Added coordinate validation (line 497-499)
   - Enhanced transformation logging (line 501-506)

---

## Potential Root Causes (If Still Stuck)

If the map still hangs after this fix, check:

### **1. Tile Server Issues**
```javascript
// Check if tiles are loading
map.on('data', (e) => {
  if (e.dataType === 'source' && e.isSourceLoaded) {
    console.log('✅ Tiles loaded for:', e.sourceId);
  }
});

map.on('error', (e) => {
  console.error('❌ Tile error:', e.error);
});
```

### **2. Browser Console Errors**
- Open DevTools → Console
- Look for CORS errors
- Look for network errors (failed tile requests)
- Look for JavaScript errors

### **3. Network Tab**
- Open DevTools → Network
- Filter by "tile" or "png"
- Check if tile requests are failing (red)
- Check response times

### **4. Coordinate Data**
```javascript
// Verify coordinates are valid
console.log('First point:', coordinatePoints.value[0]);
console.log('Sample WGS84:', allWgs84Points[0]);
```

---

## Workarounds

### **If Map Still Won't Load**

1. **Refresh the page** - Sometimes helps with tile loading
2. **Check internet connection** - Tiles require network access
3. **Try different browser** - Some browsers block tile requests
4. **Check firewall** - May block OpenStreetMap or Esri tiles
5. **Use localhost** - Avoid HTTPS/CORS issues in development

### **Alternative Basemaps**

If OpenStreetMap tiles are blocked, you can switch to:
- Mapbox (requires API key)
- Google Maps (requires API key)
- Local tile server
- No basemap (just show points on gray background)

---

## Summary

✅ **Added 10-second timeout** - Prevents infinite hanging  
✅ **Enhanced error handling** - User sees helpful messages  
✅ **Improved logging** - Easier to diagnose issues  
✅ **Coordinate validation** - Catches empty data early  
✅ **Graceful degradation** - App doesn't freeze on errors  

The map loading process is now resilient to network issues, tile server problems, and data errors, ensuring users always see feedback instead of an infinite loading spinner.
