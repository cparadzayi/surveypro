# Fixing Crossing Polygons

## Problem

When points are in the wrong order, the polygon crosses itself, resulting in incorrect area calculations.

---

## Example

### **Wrong Order** ❌
```
Current: 2399A → 2400B → 2399B → 2400A

Polygon:
    2400A ---- 2400B
      |    ╲  ╱  |
      |     ╳    |  ← Self-intersecting!
      |    ╱  ╲  |
    2399A ---- 2399B

Result: Incorrect area, crossing lines
```

### **Correct Order** ✅
```
Correct: 2399A → 2399B → 2400B → 2400A

Polygon:
    2400A ---- 2400B
      |          |
      |          |  ← Clean rectangle!
      |          |
    2399A ---- 2399B

Result: Correct area, no crossing
```

---

## Solution: Drag-and-Drop Reordering

### **How to Reorder Points**

1. **Locate the drag handle** in the points table
   - Look for the `⋮⋮` symbol in the first column
   - The column has a gray background

2. **Click and hold** on the drag handle (the number column)
   - The cursor will change to a move cursor

3. **Drag the row** to its correct position
   - Drag up or down to reorder
   - Drop it between other rows

4. **Release** to drop the row in the new position
   - The polygon will update automatically
   - Area will be recalculated

### **Visual Indicators**
- **⋮⋮ symbol**: Indicates draggable row
- **Gray background**: Drag handle column
- **Hover effect**: Row highlights when you hover
- **Cursor change**: Shows move cursor when dragging

---

## Step-by-Step Example

### **Current (Wrong) Order**
```
# | Point  | Y         | X
1 | 2399A  | 96710.68  | 2247735.40
2 | 2400B  | 96685.33  | 2247765.24  ← Wrong position
3 | 2399B  | 96717.24  | 2247746.65  ← Wrong position
4 | 2400A  | 96679.02  | 2247753.85
```

### **Step 1: Move 2399B to Position 2**
```
1. Click and hold on row 3 (2399B)
2. Drag up to position 2
3. Release

Result:
# | Point  | Y         | X
1 | 2399A  | 96710.68  | 2247735.40
2 | 2399B  | 96717.24  | 2247746.65  ✅ Moved
3 | 2400B  | 96685.33  | 2247765.24
4 | 2400A  | 96679.02  | 2247753.85
```

### **Step 2: Verify Order**
```
Check the polygon on the map:
- Does it cross itself? ❌ Need more reordering
- Is it a clean shape? ✅ Correct!

Check the traverse:
2399A → 2399B → 2400B → 2400A → 2399A (close)
✅ Correct traverse order!
```

---

## Alternative: Keyboard Shortcuts

You can also use keyboard shortcuts to reorder:

- **Alt + ↑**: Move current row up
- **Alt + ↓**: Move current row down

### **How to Use**
1. Click on a row to focus it
2. Hold **Alt** and press **↑** or **↓**
3. Row will move up or down
4. Polygon updates automatically

---

## Tips

### **1. Check the Map**
The polygon on the map shows if points are in the correct order:
- **Crossing lines**: Wrong order
- **Clean shape**: Correct order

### **2. Follow the Traverse**
Points should follow the field traverse order:
- Start at corner 1
- Walk to corner 2
- Walk to corner 3
- Walk to corner 4
- Return to corner 1 (close)

### **3. Check Edge Analysis**
After reordering, verify the edge analysis table:
- Distances should match field notes
- Directions should match field notes
- Residuals (ΣdY, ΣdX) should be near zero

### **4. Use Point Names**
Give points meaningful names that indicate their order:
- **Good**: 2399A, 2399B, 2400B, 2400A
- **Bad**: Point1, Point2, Point3, Point4

---

## Common Mistakes

### **Mistake 1: Random Selection Order**
```
User clicks points randomly on map:
C → A → D → B

Result: Crossing polygon
Fix: Reorder to A → B → C → D
```

### **Mistake 2: Counter-Clockwise Traverse**
```
User walks boundary counter-clockwise:
A → D → C → B

Result: Negative area
Fix: Reverse order to A → B → C → D
```

### **Mistake 3: Starting at Wrong Corner**
```
User starts at corner 3:
C → D → A → B

Result: Crossing polygon
Fix: Reorder to A → B → C → D
```

---

## Verification Checklist

After reordering, verify:

✅ **Polygon doesn't cross itself**
- Check the map display
- Lines should not intersect

✅ **Traverse order makes sense**
- Points follow the boundary
- Each point connects to the next

✅ **Edge analysis matches field notes**
- Distances are correct
- Directions are correct

✅ **Residuals are near zero**
- ΣdY ≈ 0.00
- ΣdX ≈ 0.00

✅ **Area is positive**
- Clockwise traverse gives positive area
- Counter-clockwise gives negative

---

## Technical Details

### **How Drag-and-Drop Works**

```typescript
// When you start dragging
function onDragStart(i: number) {
  dragIndex.value = i  // Remember which row
}

// When you drop
function onDrop(i: number) {
  // Remove from old position
  const [item] = points.value.splice(dragIndex.value, 1)
  
  // Insert at new position
  points.value.splice(i, 0, item)
  
  // Recalculate area
  recomputeIfReady()
}
```

### **Automatic Updates**

When you reorder points:
1. Points array is updated
2. Map polygon is redrawn
3. Area is recalculated
4. Edge analysis is updated
5. Residuals are recalculated

All happens automatically!

---

## Summary

✅ **Use drag-and-drop** to reorder points  
✅ **Look for ⋮⋮ symbol** in the first column  
✅ **Drag rows** to correct positions  
✅ **Check the map** for crossing lines  
✅ **Verify edge analysis** matches field notes  
✅ **Alternative**: Use Alt+↑/↓ keyboard shortcuts  

Correct point order is essential for accurate area calculations! 📐✨
