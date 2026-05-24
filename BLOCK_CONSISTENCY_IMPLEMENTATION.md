# Block Consistency Implementation Guide

## Overview

We've created a **single source of truth** for all survey plan blocks in `app-shared/block-definitions.js`. This ensures UI and PDF outputs are always consistent.

## Current Status

### ✅ Completed
1. **Schedule of Areas** - Both UI and PDF use full SI 727 6-column format
2. **Outside Figure Data** - Both use same table structure with coordinates
3. **Shared Block Definitions** - Created `app-shared/block-definitions.js`

### ⏳ In Progress
4. **Beacon Description** - Needs alignment between UI and PDF
5. **Survey Statement** - Needs standardization
6. **Title Block** - Needs verification

## Implementation Approach

### Backend (PDFKit) - Already Using Shared Logic

The backend `pdfkitGeoPDF.js` already implements the shared definitions for:
- Schedule of Areas (lines 985-1274)
- Outside Figure Data (lines 1284-1395)
- Area formatting with banker's rounding (lines 922-959)

**Next Steps for Backend:**
1. Import shared definitions: `import BLOCKS from '../../../app-shared/block-definitions.js'`
2. Replace hardcoded values with `BLOCKS.BEACON_DESCRIPTION`, etc.
3. Use shared helper functions: `formatAreaValue()`, `formatCoordinate()`, `formatBearing()`

### Frontend (Vue) - Integration Steps

#### Option 1: Direct Import (Recommended)
```vue
<script setup lang="ts">
import BLOCKS from '@/../../app-shared/block-definitions.js'

// Use shared definitions
const scheduleColumns = BLOCKS.SCHEDULE_OF_AREAS.singleColumn.columns
const beaconFormat = BLOCKS.BEACON_DESCRIPTION.groupFormat
</script>

<template>
  <table class="schedule-table-si727">
    <thead>
      <tr>
        <th v-for="col in scheduleColumns" :key="col.key" :style="{ width: col.width + 'px' }">
          {{ col.label }}
        </th>
      </tr>
    </thead>
    <!-- ... -->
  </table>
</template>
```

#### Option 2: Composable Wrapper
```typescript
// composables/useBlockDefinitions.ts
import BLOCKS from '@/../../app-shared/block-definitions.js'

export function useBlockDefinitions() {
  return {
    scheduleOfAreas: BLOCKS.SCHEDULE_OF_AREAS,
    outsideFigureData: BLOCKS.OUTSIDE_FIGURE_DATA,
    beaconDescription: BLOCKS.BEACON_DESCRIPTION,
    formatArea: BLOCKS.formatAreaValue,
    formatCoordinate: BLOCKS.formatCoordinate,
    formatBearing: BLOCKS.formatBearing
  }
}
```

## Specific Block Implementations

### 1. Beacon Description - Alignment Needed

**Current UI Format:**
```html
<div class="beacon-group">
  <span class="beacon-points">BP 1, 2, 3</span>
  <span class="beacon-separator">:</span>
  <span class="beacon-desc">50mm x 50mm concrete beacons</span>
</div>
```

**Current PDF Format:**
```
Table with columns: Beacon | Type | Condition | Coordinates
```

**Recommended Format (Both):**
Use grouped text format from shared definitions:
```
BP 1, 2, 3: 50mm x 50mm concrete beacons
BP 4, 5: Steel pegs, 25mm diameter
```

**Implementation:**

**Frontend Update:**
```vue
<script setup>
import { BEACON_DESCRIPTION } from '@/../../app-shared/block-definitions.js'

const beaconGroups = computed(() => {
  // Group beacons by description
  const groups = {}
  coordinatePoints.value.forEach(point => {
    const desc = point.description || 'Concrete beacon'
    if (!groups[desc]) groups[desc] = []
    groups[desc].push(point.name)
  })
  
  return Object.entries(groups).map(([description, points]) => ({
    points: points.join(', '),
    description
  }))
})
</script>

<template>
  <div class="beacon-description">
    <div class="title">{{ BEACON_DESCRIPTION.title }}</div>
    <div v-for="group in beaconGroups" :key="group.description" class="beacon-group">
      <span class="points">{{ group.points }}</span>
      <span class="separator">{{ BEACON_DESCRIPTION.groupFormat.separator }}</span>
      <span class="desc">{{ group.description }}</span>
    </div>
  </div>
</template>
```

**Backend Update:**
```javascript
import { BEACON_DESCRIPTION, formatCoordinate } from '../../../app-shared/block-definitions.js'

function drawBeaconDescription(doc, beacons, mapBounds) {
  if (!beacons || beacons.features.length === 0) return
  
  // Group beacons by description
  const groups = {}
  beacons.features.forEach(beacon => {
    const desc = beacon.properties.description || 'Concrete beacon'
    if (!groups[desc]) groups[desc] = []
    groups[desc].push(beacon.properties.name || beacon.properties.id)
  })
  
  const tableX = mapBounds.x + 10
  const tableY = mapBounds.y + mapBounds.height - 100
  
  doc.save()
  
  // Title
  doc.fontSize(BEACON_DESCRIPTION.titleFont.size)
     .font(BEACON_DESCRIPTION.titleFont.family)
     .text(BEACON_DESCRIPTION.title, tableX, tableY - 12)
  
  // Grouped text
  let currentY = tableY
  const format = BEACON_DESCRIPTION.groupFormat
  
  Object.entries(groups).forEach(([description, points]) => {
    const pointsText = points.join(', ')
    
    doc.fontSize(format.pointsFont.size)
       .font(format.pointsFont.family)
       .text(pointsText, tableX, currentY, { continued: true })
       .text(format.separator, { continued: true })
       .fontSize(format.descriptionFont.size)
       .font(format.descriptionFont.family)
       .text(' ' + description)
    
    currentY += format.lineHeight
  })
  
  doc.restore()
}
```

### 2. Survey Statement - Standardization

**Shared Template:**
```javascript
SURVEY_STATEMENT = {
  template: 'I certify that this plan correctly represents the survey carried out by me.',
  format: {
    statementFont: { family: 'Helvetica', size: 8 },
    surveyorNameFont: { family: 'Helvetica-Bold', size: 8 },
    // ...
  }
}
```

**Frontend:**
```vue
<script setup>
import { SURVEY_STATEMENT } from '@/../../app-shared/block-definitions.js'

const statementText = SURVEY_STATEMENT.template
</script>

<template>
  <div class="survey-statement">
    <div class="statement-text" :style="{ fontSize: SURVEY_STATEMENT.format.statementFont.size + 'pt' }">
      {{ statementText }}
    </div>
    <div class="surveyor-signature">
      <!-- ... -->
    </div>
  </div>
</template>
```

**Backend:**
```javascript
import { SURVEY_STATEMENT } from '../../../app-shared/block-definitions.js'

function drawSurveyStatement(doc, metadata, mapBounds) {
  const format = SURVEY_STATEMENT.format
  
  doc.fontSize(format.statementFont.size)
     .font(format.statementFont.family)
     .text(SURVEY_STATEMENT.template, blockX, blockY)
  
  // Surveyor name
  doc.fontSize(format.surveyorNameFont.size)
     .font(format.surveyorNameFont.family)
     .text(metadata.surveyor, blockX, blockY + 15)
  // ...
}
```

### 3. Title Block - Verification

**Shared Template:**
```javascript
TITLE_BLOCK = {
  mainTitle: { text: 'GENERAL PLAN', font: { family: 'Helvetica-Bold', size: 14 } },
  designation: {
    template: 'Survey of {designation}, {district} District',
    font: { family: 'Helvetica-Bold', size: 8 }
  }
  // ...
}
```

Both frontend and backend should use these exact values.

## Migration Checklist

### Phase 1: Immediate (Current Session)
- [x] Create `app-shared/block-definitions.js`
- [x] Document implementation approach
- [ ] Update backend Beacon Description
- [ ] Update frontend Beacon Description

### Phase 2: Next Session
- [ ] Standardize Survey Statement
- [ ] Verify Title Block consistency
- [ ] Update North Arrow to use shared SVG
- [ ] Standardize Scale Bar calculation

### Phase 3: Testing
- [ ] Visual comparison: UI vs PDF for each block
- [ ] Test with small dataset (14 stands)
- [ ] Test with large dataset (174 stands)
- [ ] Test with edge cases (empty data, special characters)

### Phase 4: Documentation
- [ ] Update developer documentation
- [ ] Create visual style guide
- [ ] Document any SI 727 deviations with justification

## Benefits

1. **Single Source of Truth** - Change once, applies everywhere
2. **Type Safety** - Shared definitions prevent typos
3. **Consistency** - UI and PDF always match
4. **Maintainability** - Easy to update formatting
5. **Testability** - Can validate against shared schema
6. **SI 727 Compliance** - Documented standard format

## Example: Adding a New Block

1. **Define in shared file:**
```javascript
export const NEW_BLOCK = {
  title: 'NEW BLOCK TITLE',
  columns: [...],
  format: {...}
}
```

2. **Use in frontend:**
```vue
<script setup>
import { NEW_BLOCK } from '@/../../app-shared/block-definitions.js'
</script>
```

3. **Use in backend:**
```javascript
import { NEW_BLOCK } from '../../../app-shared/block-definitions.js'

function drawNewBlock(doc, data, bounds) {
  doc.fontSize(NEW_BLOCK.titleFont.size)
     .text(NEW_BLOCK.title, x, y)
  // ...
}
```

4. **Both automatically consistent!**

## Next Steps

1. **Review** this implementation guide
2. **Update** backend Beacon Description to use shared format
3. **Update** frontend Beacon Description to match
4. **Test** with current dataset
5. **Iterate** on remaining blocks

## Questions?

- How to handle dynamic data (e.g., variable number of beacons)?
  → Use shared formatting rules, data comes from database
  
- What if UI needs different layout than PDF?
  → Use same data structure, different rendering (HTML vs PDF)
  
- How to handle responsive sizing in UI?
  → Use shared proportions, scale to container

- What about print vs screen?
  → Shared definitions use points (pt), convert to pixels for screen
