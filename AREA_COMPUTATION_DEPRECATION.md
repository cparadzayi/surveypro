# 🚨 Area Computation View Deprecation Notice

**Date:** 2025-01-19  
**Status:** ⚠️ DEPRECATED  
**Replacement:** MapLibreAreaView.vue

---

## Summary

The **Leaflet-based AreaComputationView.vue** has been **deprecated** and replaced by **MapLibreAreaView.vue** in the Cadastral Standard workflow. The old component is kept for reference only and is no longer actively maintained.

---

## Why Deprecated?

### Performance Issues
- **Leaflet**: Struggles with 500+ points, noticeable lag
- **MapLibre**: Handles 10,000+ points smoothly with GPU acceleration

### Feature Limitations
- **Leaflet**: No satellite imagery support
- **MapLibre**: Built-in satellite overlay with OSM fallback

### Label Management
- **Leaflet**: Manual collision detection (O(n) algorithm)
- **MapLibre**: Built-in collision detection engine (optimized)

### Cadastral Standards
- **Leaflet**: Generic circle markers
- **MapLibre**: SGO-compliant cadastral symbols (triangles for trig beacons)

### Maintenance Burden
- **Leaflet**: Required custom implementations for everything
- **MapLibre**: Industry-standard library with active development

---

## Migration Guide

### For Developers

**Old Import (Deprecated):**
```vue
import AreaComputationView from './AreaComputationView.vue';
```

**New Import (Current):**
```vue
import MapLibreAreaView from './MapLibreAreaView.vue';
```

**Old Usage (Deprecated):**
```vue
<AreaComputationView v-if="currentStep === 'area-computation'" />
```

**New Usage (Current):**
```vue
<MapLibreAreaView v-if="currentStep === 'area-computation'" />
```

### For Users

**No action required!** The cadastral workflow automatically uses MapLibreAreaView. If you somehow encounter the old Leaflet version, you'll see a prominent yellow warning banner.

---

## Feature Comparison

| Feature | Leaflet (Deprecated) | MapLibre (Current) |
|---------|---------------------|-------------------|
| **Performance** | ⚠️ Slow with 500+ points | ✅ Fast with 10,000+ points |
| **Satellite Imagery** | ❌ Not supported | ✅ Built-in overlay |
| **Label Collision** | ⚠️ Manual O(n) algorithm | ✅ GPU-accelerated engine |
| **Cadastral Symbols** | ❌ Generic circles | ✅ SGO-compliant triangles |
| **Zoom Performance** | ⚠️ Laggy animations | ✅ Smooth 60fps |
| **Memory Usage** | ⚠️ High (DOM elements) | ✅ Low (WebGL canvas) |
| **Mobile Support** | ⚠️ Limited touch gestures | ✅ Full touch support |
| **Coordinate Systems** | ✅ L.CRS.Simple | ✅ Proj4 + WGS84 |
| **Drawing Tools** | ✅ Click-to-digitize | ✅ Click-to-digitize |
| **Area Calculation** | ✅ Real-time | ✅ Real-time |
| **PDF Export** | ✅ Supported | ✅ Supported |
| **Database Integration** | ✅ Full CRUD | ✅ Full CRUD |

---

## What's Removed

### Viewer Toggle
The old component had a toggle between Leaflet and MapLibre viewers. This has been removed because:
- MapLibre is now the only viewer
- No need for dual maintenance
- Simpler user experience

### Manual Collision Detection
The custom O(n) collision detection algorithm has been replaced by MapLibre's built-in engine:

**Old (Deprecated):**
```typescript
const hasCollision = labelBounds.value.some(bound => {
  const distX = Math.abs(bound.minX - lng);
  const distY = Math.abs(bound.minY - lat);
  return distX < labelSpacing && distY < labelSpacing;
});
```

**New (Current):**
```javascript
layout: {
  'text-allow-overlap': false,
  'text-ignore-placement': false,
  'text-optional': true,
  'text-padding': [
    'interpolate', ['linear'], ['zoom'],
    12, 50, 16, 20, 20, 5
  ]
}
```

### L.CRS.Simple Coordinate System
Replaced by proper WGS84 projection with Proj4:

**Old (Deprecated):**
```typescript
const crs = L.CRS.Simple;
map = L.map(container, { crs: crs });
```

**New (Current):**
```typescript
// Transform Cape Lo to WGS84
const wgs84Points = capeLoArrayToWGS84(capeLoPoints);
// MapLibre uses standard WGS84 (EPSG:4326)
```

---

## Timeline

| Date | Event |
|------|-------|
| **2024-11** | MapLibreAreaView created as alternative viewer |
| **2025-01-15** | MapLibre made default in cadastral workflow |
| **2025-01-19** | AreaComputationView officially deprecated |
| **2025-02** | Planned removal from codebase (after 1 month grace period) |

---

## Deprecation Warnings

### In Code
The deprecated component now shows:
1. **HTML comment** at top of file
2. **Yellow warning banner** in UI
3. **"(DEPRECATED)"** in page title
4. **Disabled viewer toggle** buttons

### In Console
```
⚠️ AreaComputationView is deprecated. Use MapLibreAreaView instead.
See: AREA_COMPUTATION_DEPRECATION.md for details
```

---

## Breaking Changes

### None for End Users
The workflow seamlessly uses MapLibreAreaView. No user action required.

### For Developers
If you have custom code that imports AreaComputationView:

**Before:**
```vue
<script setup>
import AreaComputationView from '@/views/modules/cadastral-standard/AreaComputationView.vue';
</script>

<template>
  <AreaComputationView />
</template>
```

**After:**
```vue
<script setup>
import MapLibreAreaView from '@/views/modules/cadastral-standard/MapLibreAreaView.vue';
</script>

<template>
  <MapLibreAreaView />
</template>
```

---

## API Compatibility

Both components share the same interface for workflow integration:

### Props
- ✅ Both use injected `workflowState` (no props)

### Emits
- ❌ Old: `switch-viewer` event (removed)
- ✅ Both: No emits (self-contained)

### Composables
- ✅ Both: `usePolygonDrawing()`
- ✅ Both: `useParcelManagement()`
- ✅ Both: `useCadastralWorkflow()`

### Database Integration
- ✅ Both: Same `areaParcels` service
- ✅ Both: Same parcel schema
- ✅ Both: Same CRUD operations

---

## Testing

### Automated Tests
No tests exist for either component (manual testing only).

### Manual Testing Checklist
- [x] MapLibreAreaView loads in cadastral workflow
- [x] Survey points display correctly
- [x] Labels show/hide with toggle
- [x] Adaptive labeling prevents overlaps
- [x] Polygon drawing works
- [x] Area calculation accurate
- [x] Save to database works
- [x] PDF export works
- [x] Satellite overlay works
- [x] Performance with 1000+ points

---

## Support

### For the Deprecated Component
⚠️ **No support provided.** The component is kept for reference only.

### For MapLibreAreaView
✅ **Full support.** Report issues via:
- GitHub issues
- Project documentation
- Development team

---

## Removal Plan

### Phase 1: Deprecation (Current)
- ✅ Add deprecation warnings
- ✅ Update documentation
- ✅ Notify development team

### Phase 2: Grace Period (1 month)
- Monitor for any usage
- Assist with migrations
- Collect feedback

### Phase 3: Removal (February 2025)
- Delete AreaComputationView.vue
- Remove Leaflet dependency (if unused elsewhere)
- Clean up related code

---

## Related Files

### Deprecated (To Be Removed)
- `app-frontend/src/views/modules/cadastral-standard/AreaComputationView.vue`

### Current (Active)
- `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`
- `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue` (workflow)

### Shared (Used by Both)
- `app-frontend/src/composables/usePolygonDrawing.ts`
- `app-frontend/src/composables/useParcelManagement.ts`
- `app-frontend/src/composables/useCadastralWorkflow.ts`
- `app-frontend/src/services/areaParcels.ts`
- `app-frontend/src/utils/coordinateTransform.ts`

### Documentation
- `ADAPTIVE_LABELING_IMPLEMENTATION.md` (covers both implementations)
- `AREA_COMPUTATION_DEPRECATION.md` (this file)

---

## FAQ

### Q: Can I still use the Leaflet version?
**A:** Technically yes (the file still exists), but it's not recommended. It won't receive updates or bug fixes.

### Q: Will my existing parcels work with MapLibre?
**A:** Yes! Both components use the same database schema and services. All existing data is fully compatible.

### Q: What about the adaptive labeling I just implemented?
**A:** It's implemented in **both** components:
- **Leaflet**: Manual collision detection
- **MapLibre**: Built-in collision detection (better performance)

### Q: When will the file be deleted?
**A:** Planned for **February 2025** (1 month grace period).

### Q: Can I copy code from the old component?
**A:** Yes, for reference. But MapLibre uses different APIs (WebGL vs DOM), so direct copy-paste won't work.

### Q: What if I find a bug in MapLibre?
**A:** Report it! We're actively maintaining MapLibreAreaView.

### Q: Is Leaflet being removed from the entire project?
**A:** No, only from Area Computation. Other modules may still use Leaflet if appropriate.

---

## Acknowledgments

The Leaflet-based AreaComputationView served well during initial development and helped establish the workflow patterns now used in MapLibreAreaView. Thank you to all contributors!

---

**Last Updated:** 2025-01-19  
**Maintained By:** SurveyPro Development Team  
**Status:** ⚠️ DEPRECATED - Use MapLibreAreaView instead
