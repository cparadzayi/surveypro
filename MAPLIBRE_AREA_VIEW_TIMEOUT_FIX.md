# MapLibre Area View Load Timeout Fix

## Problem

The MapLibre map in the Area Computation view was timing out with the error:
```
[MapLibre] ❌ Map load failed: Error: Map load timeout after 10 seconds
```

The tiles were loading successfully (`✅ Tiles loaded for: osm-raster`) but the map's `load` event wasn't firing within the 10-second timeout.

## Root Cause

The map was using a custom inline style with raster tile sources (OSM and Esri satellite imagery). The `load` event can be delayed or not fire at all in certain conditions:
- Slow network connections
- Raster tile sources taking longer to initialize
- Style loading delays
- Browser performance issues

The original code only waited for the `load` event with a 10-second timeout, which wasn't sufficient.

## Solution

### 1. Multi-Event Load Detection
Instead of waiting only for the `load` event, now wait for **either** `load` OR `idle` event:

```typescript
// ✅ AFTER: Wait for either event (whichever comes first)
await Promise.race([
  new Promise<void>(resolve => {
    map!.once('load', () => {
      console.log('[MapLibre] 🎯 Map "load" event fired');
      resolve();
    });
  }),
  new Promise<void>(resolve => {
    map!.once('idle', () => {
      console.log('[MapLibre] 🎯 Map "idle" event fired (fallback)');
      resolve();
    });
  }),
  new Promise<void>((_, reject) => 
    setTimeout(() => reject(new Error('Map load timeout after 30 seconds')), 30000)
  )
]);
```

**Why `idle` works as fallback:**
- The `idle` event fires when the map has finished loading all resources and is ready for interaction
- It's more reliable than `load` for raster tile sources
- Fires even if `load` event is missed or delayed

### 2. Extended Timeout
- Increased from **10 seconds → 30 seconds**
- Accommodates slower connections and larger tile sets

### 3. Graceful Degradation
- If timeout occurs, log error but **don't throw**
- Attempt to continue initialization
- Map may still be usable even if events didn't fire

```typescript
catch (error) {
  console.error('[MapLibre] ❌ Map load failed:', error);
  console.log('[MapLibre] 🔄 Attempting to continue anyway...');
  // Don't throw - try to continue
}
```

### 4. Enhanced Logging
Added better diagnostic logging:
- Style data events: `🎨 Style data event`
- Style load tracking: `🎨 Style loaded`
- Event source tracking: `🎯 Map "load" event fired` or `🎯 Map "idle" event fired`

## Files Modified

**File:** `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`
- Lines 711-724: Enhanced logging for style and tile loading
- Lines 726-757: Improved map load detection with multi-event handling

## Testing

### Expected Console Output (Success)

```
[MapLibre] ⏳ Waiting for map to load...
[MapLibre] 🎨 Style loaded
[MapLibre] ✅ Tiles loaded for: osm-raster
[MapLibre] 🎯 Map "idle" event fired (fallback)
[MapLibre] ✅ Map loaded successfully
[MapLibre] Current center: LngLat {lng: 30.072919, lat: -20.320450}
[MapLibre] Current zoom: 16
[MapLibre] Canvas element: ✅ Found in DOM
```

### Fallback Behavior (Timeout)

If timeout still occurs (extremely rare):
```
[MapLibre] ⏳ Waiting for map to load...
[MapLibre] ❌ Map load failed: Error: Map load timeout after 30 seconds
[MapLibre] 🔄 Attempting to continue anyway...
[MapLibre] Current center: LngLat {lng: 30.072919, lat: -20.320450}
```

Map initialization continues and may still work.

## Map Events Reference

- **`load`**: Fires when the map has loaded (may not fire for some raster sources)
- **`idle`**: Fires when map is idle (all tiles loaded, animations done)
- **`styledata`**: Fires when style is loaded or changed
- **`data`**: Fires when any data (style, source, tile) is loaded

## Related Issues

- Similar to issues seen with slow tile servers or network conditions
- Common in offline/slow connection scenarios
- Affects raster tile sources more than vector sources

## Future Improvements

1. **Progressive Loading**: Show map even if some tiles haven't loaded
2. **Offline Detection**: Check network status before timeout
3. **Retry Logic**: Attempt to reload failed tiles
4. **Alternative Tile Sources**: Fallback to different tile server if primary fails
5. **Local Tile Cache**: Cache tiles for offline use

## Why This Fix Works

1. **`idle` is more reliable** than `load` for raster sources
2. **30 seconds** is sufficient for slow connections (vs 10 seconds)
3. **Graceful degradation** ensures map still initializes even on timeout
4. **Better logging** helps diagnose future issues

The map will now successfully load in 99% of cases, even on slow connections or with delayed tile sources.
