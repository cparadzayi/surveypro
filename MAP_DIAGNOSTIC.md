# 🔍 Map Display Diagnostic Guide

## 🚨 **Run This in Browser Console (F12)**

Copy and paste this entire block:

```javascript
// === MAP DIAGNOSTIC SCRIPT ===
console.log('='.repeat(50));
console.log('🔍 MAP DISPLAY DIAGNOSTIC');
console.log('='.repeat(50));

// 1. Check map container
const mapContainer = document.querySelector('.leaflet-container');
console.log('\n📦 Map Container:');
console.log('  Exists:', !!mapContainer);
console.log('  Width:', mapContainer?.offsetWidth || 0, 'px');
console.log('  Height:', mapContainer?.offsetHeight || 0, 'px');
console.log('  Visible:', mapContainer?.offsetParent !== null);

// 2. Check points (circle markers)
const circles = document.querySelectorAll('circle.leaflet-interactive');
console.log('\n🔵 Point Markers (Circles):');
console.log('  Count:', circles.length);
if (circles.length > 0) {
  const first = circles[0];
  const styles = window.getComputedStyle(first);
  console.log('  First marker:');
  console.log('    → fill:', first.getAttribute('fill'));
  console.log('    → fill-opacity:', first.getAttribute('fill-opacity'));
  console.log('    → stroke:', first.getAttribute('stroke'));
  console.log('    → radius:', first.getAttribute('r'));
  console.log('    → display:', styles.display);
  console.log('    → visibility:', styles.visibility);
  console.log('    → opacity:', styles.opacity);
}

// 3. Check polygons (parcels)
const polygons = document.querySelectorAll('path.leaflet-interactive');
const parcelPolygons = Array.from(polygons).filter(p => 
  p.classList.contains('land-parcel-pending') || 
  p.classList.contains('land-parcel-computed')
);
console.log('\n🏘️ Land Parcel Polygons:');
console.log('  Total paths:', polygons.length);
console.log('  Parcel polygons:', parcelPolygons.length);
if (parcelPolygons.length > 0) {
  const first = parcelPolygons[0];
  console.log('  First parcel:');
  console.log('    → Class:', first.className.baseVal);
  console.log('    → fill:', first.getAttribute('fill'));
  console.log('    → fill-opacity:', first.getAttribute('fill-opacity'));
  console.log('    → stroke:', first.getAttribute('stroke'));
}

// 4. Check labels
const labels = document.querySelectorAll('.leaflet-tooltip');
console.log('\n🏷️ Point Labels:');
console.log('  Count:', labels.length);

// 5. Check all interactive elements
const allInteractive = document.querySelectorAll('.leaflet-interactive');
console.log('\n✅ Total Interactive Elements:', allInteractive.length);
console.log('  (Should be: points + polygons + parcel stand labels)');

// 6. Check map state
console.log('\n🗺️ Map State:');
const map = mapContainer?._leaflet_map || window.L?.map;
console.log('  Map object exists:', !!map);

// 7. Summary
console.log('\n' + '='.repeat(50));
console.log('📊 SUMMARY');
console.log('='.repeat(50));
if (circles.length === 0) {
  console.error('❌ No point markers found!');
  console.log('   → Check if data is loading');
  console.log('   → Check console for [DataMap] messages');
}
if (parcelPolygons.length === 0) {
  console.warn('⚠️ No parcel polygons found');
  console.log('   → Check if landParcels data is loaded');
}
if (mapContainer?.offsetHeight === 0) {
  console.error('❌ Map height is 0px!');
  console.log('   → Parent container collapsed');
}
if (circles.length > 0 && parcelPolygons.length > 0) {
  console.log('✅ Both points and parcels are in DOM!');
  console.log('   → If not visible, check CSS or z-index');
}
console.log('='.repeat(50));
```

---

## 📋 **What To Look For:**

### **✅ GOOD Output:**
```
🔵 Point Markers (Circles):
  Count: 542
  First marker:
    → fill: #3b82f6  (blue)
    → fill-opacity: 0.9
    → radius: 6

🏘️ Land Parcel Polygons:
  Parcel polygons: 4
  First parcel:
    → Class: land-parcel-pending
    → fill: #fde047  (yellow)

✅ Total Interactive Elements: 550
```

### **❌ BAD Output (Problems):**

**Problem A: No circles**
```
🔵 Point Markers (Circles):
  Count: 0  ❌ NO POINTS!
```
**Fix:** Data not loading. Check Network tab for failed API calls.

---

**Problem B: Height is zero**
```
📦 Map Container:
  Height: 0 px  ❌ COLLAPSED!
```
**Fix:** Parent container has no height. Check CSS.

---

**Problem C: Circles exist but invisible**
```
🔵 Point Markers (Circles):
  Count: 542
  First marker:
    → display: none  ❌ HIDDEN!
```
**Fix:** CSS issue. Check for conflicting styles.

---

## 🔧 **Common Fixes:**

### **Fix 1: Data Not Loading**
Check Network tab (F12 → Network):
```
Should see these successful requests:
✅ GET /coordinate-points?project_id=23  (200 OK)
✅ GET /land-parcels?project_id=23       (200 OK)
```

If 404 or 500, backend issue.

---

### **Fix 2: Hard Refresh**
Clear cache and reload:
- **Windows:** `Ctrl + Shift + R`
- **Or:** `Ctrl + F5`

---

### **Fix 3: Check Component Mount**
In console:
```javascript
// Should show DataMap component
document.querySelector('[data-v-app]')?.__vnode?.component
```

---

## 📸 **Screenshot Needed**

If diagnostic shows elements exist but aren't visible, take screenshot of:
1. **The map area** (what you see)
2. **Browser console** (F12 → Console tab)
3. **Elements panel** showing `.leaflet-interactive` elements

---

## 🎯 **Next Steps:**

1. **Run diagnostic script** (copy/paste above)
2. **Share console output** - Especially the SUMMARY section
3. **Check for [DataMap] messages** - Should see "Rendering X background points"
4. **Share any errors** - Red text in console

---

**Once you share the diagnostic output, I can pinpoint the exact issue!** 🔍✨
