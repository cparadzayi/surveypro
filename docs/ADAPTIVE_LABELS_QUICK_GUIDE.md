# 🏷️ Adaptive Control Point Labels - Quick Guide

## ✅ **What Changed**

Replaced HTML emoji markers with **MapLibre symbol layers** that have **zoom-based adaptive labels** to prevent clutter.

---

## 🎯 **How It Works**

### **Zoom Behavior**

| Zoom Level | Label Display | Example |
|------------|---------------|---------|
| **< 9** | No labels | Just colored dots |
| **9-12** | Short ID | "105", "89" |
| **12-14** | Full monument number | "105/S", "89/N" |
| **14+** | Number + distance | "105/S<br>5 km" |

### **Visual Features**

**Selected Points:**
- 🔴 Red circle (larger)
- Dark red label
- Higher priority (shown first)

**Unselected Points:**
- 🔵 Blue circle (smaller)
- Dark blue label
- Lower priority

---

## 🎨 **Benefits**

1. **No Clutter** - Labels only show when there's space
2. **Auto Collision Detection** - MapLibre hides overlapping labels
3. **Better Performance** - GPU rendering, not DOM elements
4. **Progressive Detail** - More info as you zoom in
5. **Professional Look** - Matches trig beacon inset style

---

## 🔍 **What You'll See**

**Zoomed Out (Overview):**
```
Clean map with colored circles
No text labels
Easy to see point distribution
```

**Medium Zoom:**
```
Short IDs appear: 105, 89, 234
Only non-overlapping labels
Selected points prioritized
```

**Zoomed In (Detail):**
```
Full monument numbers: 105/S, 89/N
Distance info: "5 km", "12 km"
All details visible
```

---

## 🚀 **Test It**

1. Reload the workflow
2. Navigate to Control Point Selection
3. Zoom in/out on the map
4. Watch labels appear/disappear
5. Select points - see them turn red
6. Click points for popups

---

**Status**: ✅ Ready to test!  
**Inspired by**: Trig beacon inset map adaptive labels
