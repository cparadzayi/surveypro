# 🧪 DMS Normalization - Test Cases

## Quick Test Reference

Copy these test cases into browser console to verify the fix:

### **Test Case 1: 60 Seconds → Carry to Minutes**

```javascript
// Test bearing that produces 60 seconds
const test1 = 301.1333333; // Should produce 301°08'00" not 301°07'60"

// Manual verification:
// 301 + 0.1333333
// 0.1333333 * 60 = 7.9999998 minutes
// 7 minutes + 0.9999998 * 60 = 7 minutes 59.999988 seconds
// Round 59.999988 = 60 seconds
// Normalize: 60s → 0s, add 1 to minutes = 8 minutes
// Result: 301°08'00"
```

### **Test Case 2: 60 Minutes → Carry to Degrees**

```javascript
// Test bearing that produces 60 minutes
const test2 = 123.9999722; // Should produce 124°00'00" not 123°59'60"

// Manual verification:
// 123 + 0.9999722
// 0.9999722 * 60 = 59.998332 minutes
// 59 minutes + 0.998332 * 60 = 59 minutes 59.89992 seconds
// Round 59.89992 = 60 seconds
// Normalize seconds: 60s → 0s, add 1 to minutes = 60 minutes
// Normalize minutes: 60m → 0m, add 1 to degrees = 124 degrees
// Result: 124°00'00"
```

### **Test Case 3: Cascade Normalization**

```javascript
// Test bearing that cascades through all normalizations
const test3 = 359.9999722; // Should produce 0°00'00" not 359°59'60"

// Manual verification:
// 359 + 0.9999722
// 0.9999722 * 60 = 59.998332 minutes
// 59 minutes + 0.998332 * 60 = 59 minutes 59.89992 seconds
// Round 59.89992 = 60 seconds
// Normalize seconds: 60s → 0s, minutes = 60
// Normalize minutes: 60m → 0m, degrees = 360
// Normalize degrees: 360° → 0° (wrap around)
// Result: 0°00'00"
```

### **Test Case 4: Normal Values (No Normalization)**

```javascript
// Test bearings that don't need normalization
const test4a = 308.3055556; // Should produce 308°18'20"
const test4b = 45.208333;   // Should produce 45°12'30"
const test4c = 180.0;       // Should produce 180°00'00"
```

## Expected Results

| Input Decimal | Expected DMS | Description |
|---------------|--------------|-------------|
| 301.1333333 | 301°08'00" | 60 seconds normalized |
| 123.9999722 | 124°00'00" | 60 seconds + 60 minutes normalized |
| 359.9999722 | 0°00'00" | Full cascade + wrap around |
| 308.3055556 | 308°18'20" | Normal (no normalization) |
| 45.208333 | 45°12'30" | Normal (no normalization) |
| 180.0 | 180°00'00" | Normal (no normalization) |
| 0.0 | 0°00'00" | Zero bearing |
| 89.5 | 89°30'00" | Half degree |
| 270.25 | 270°15'00" | Quarter degree |

## Visual Validation

### **Before Fix:**
```
❌ 301°07'60"  (Invalid)
❌ 123°59'60"  (Invalid)
❌ 359°59'60"  (Invalid)
❌ 89°60'00"   (Invalid)
```

### **After Fix:**
```
✅ 301°08'00"  (Valid)
✅ 124°00'00"  (Valid)
✅ 0°00'00"    (Valid)
✅ 90°00'00"   (Valid)
```

## Common Problem Bearings

These bearings are most likely to cause 60 seconds/minutes:

| Decimal | Problem Zone | Why |
|---------|--------------|-----|
| X.133333 | Near X°08'00" | 7.999... minutes rounds to 8 |
| X.999972 | Near (X+1)°00'00" | 59.998... seconds rounds to 60 |
| X.5 | Exact half | 30' 00" - safe |
| X.083333 | Near X°05'00" | 4.999... - edge case |

## Quick Console Test

Paste this into browser console after loading the app:

```javascript
// Quick DMS test function
function testDMS(decimal, expected) {
  const absolute = Math.abs(decimal);
  let degrees = Math.floor(absolute);
  const minutesDecimal = (absolute - degrees) * 60;
  let minutes = Math.floor(minutesDecimal);
  let seconds = Math.round((minutesDecimal - minutes) * 60);
  
  // Normalize
  if (seconds >= 60) { seconds -= 60; minutes += 1; }
  if (minutes >= 60) { minutes -= 60; degrees += 1; }
  if (degrees >= 360) { degrees = degrees % 360; }
  
  const result = `${degrees}°${minutes.toString().padStart(2, '0')}'${seconds.toString().padStart(2, '0')}"`;
  const pass = result === expected ? '✅' : '❌';
  console.log(`${pass} ${decimal}° → ${result} (expected ${expected})`);
  return result === expected;
}

// Run all tests
console.log('=== DMS Normalization Tests ===');
testDMS(301.1333333, "301°08'00\"");
testDMS(123.9999722, "124°00'00\"");
testDMS(359.9999722, "0°00'00\"");
testDMS(308.3055556, "308°18'20\"");
testDMS(45.208333, "45°12'30\"");
testDMS(180.0, "180°00'00\"");
console.log('=== Tests Complete ===');
```

## PDF Verification Steps

1. **Compute a parcel** in MapLibre
2. **Export PDF**
3. **Check Direction column** for any of these invalid patterns:
   ```
   ❌ XXX°XX'60"  (60 seconds)
   ❌ XXX°60'XX"  (60 minutes)
   ❌ 360°XX'XX"  (360 or more degrees)
   ```

4. **All values should be:**
   ```
   ✅ Seconds: 0-59
   ✅ Minutes: 0-59
   ✅ Degrees: 0-359
   ```

## Edge Cases to Watch

### **Boundary Values:**
- 0°00'00" (zero/north)
- 90°00'00" (west)
- 180°00'00" (north)
- 270°00'00" (east)
- 359°59'50" (near wrap-around)

### **Rounding Boundaries (10" resolution):**
- X°XX'05" (rounds from X°XX'04.5")
- X°XX'15" (rounds from X°XX'14.5")
- X°XX'25" (rounds from X°XX'24.5")
- X°XX'35" (rounds from X°XX'34.5")
- X°XX'45" (rounds from X°XX'44.5")
- X°XX'55" (rounds from X°XX'54.5")

### **Problem Zone: X°XX'55" → X°XX'60"**

If raw value is **X°XX'59.5"**, banker's rounding to 10" gives:
- 59.5 / 10 = 5.95
- Round to nearest even = 6
- 6 × 10 = 60" ❌

**Solution:** Normalization catches this and converts to **(X+1)°00'00"**

## Integration Test

After deploying the fix, test with real survey data:

1. Select a project with many coordinates
2. Draw 5-10 parcels with various shapes
3. Export PDF for all parcels
4. Scan the entire PDF for any occurrence of:
   - "60""
   - "'60"
   - "360°"

If found → Bug still exists  
If not found → Fix is working ✅

## Success Criteria

✅ All DMS values in valid range (0-59 seconds, 0-59 minutes, 0-359 degrees)  
✅ No "60" appearing in seconds or minutes position  
✅ No degrees >= 360  
✅ Proper carry-over cascade working  
✅ Edge cases handled correctly  

**Status:** READY FOR TESTING
