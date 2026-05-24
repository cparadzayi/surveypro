# AreasView.vue Refactoring Plan

## Current Issues (Clutter & Redundancy)
1. ❌ Two input modes (Ad-hoc vs Load from DB) - confusing
2. ❌ Layer selection dropdowns everywhere
3. ❌ "Load Lines/Polygons" section - rarely used
4. ❌ QGIS instructions take up space
5. ❌ Duplicate export functionality
6. ❌ Mixed layer-based and project-based concepts

## New Clean Design (Normalized Schema)

### Simplified Workflow
1. **Select Project** (single dropdown)
2. **Add/Edit Coordinate Points** (simple table)
3. **Export to Database** (one button)
4. **Compute Areas** (one button)
5. **View Results** (clean table)

### UI Sections (Top to Bottom)
```
┌─────────────────────────────────────────┐
│ Areas - Land Parcel Computation         │
├─────────────────────────────────────────┤
│ [Project Dropdown ▼]  [QGIS Info]      │
├─────────────────────────────────────────┤
│ Coordinate Points (4)                   │
│ ┌───────────────────────────────────┐   │
│ │ Name    Y         X      [Actions]│   │
│ │ A    124.5    679.3    [×]        │   │
│ │ B    125.1    680.2    [×]        │   │
│ │ [+ Add Point]                     │   │
│ └───────────────────────────────────┘   │
│ [Export to Database]                    │
├─────────────────────────────────────────┤
│ Land Parcels (3)                        │
│ [Compute All Areas] [Refresh]           │
│ ┌───────────────────────────────────┐   │
│ │ Stand   Area(ha)  Status  [View] │   │
│ │ 2344    1.25      ✓        [→]   │   │
│ │ 2345    0.85      ✓        [→]   │   │
│ └───────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Removed Features
- ❌ Ad-hoc mode (always use project-based)
- ❌ Load from layer
- ❌ Load lines/polygons section
- ❌ Layer selection dropdowns
- ❌ Batch layer selection
- ❌ Inline QGIS instructions (move to modal)

### Key Improvements
- ✅ Single project selection
- ✅ Direct table editing
- ✅ One-click export
- ✅ One-click computation
- ✅ Clean results display
- ✅ 70% less UI clutter
