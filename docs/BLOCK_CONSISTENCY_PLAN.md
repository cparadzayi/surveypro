# Block Consistency Implementation Plan

## Problem
UI and PDF outputs have inconsistent block formatting, leading to:
- Different table structures
- Different column widths
- Different text formatting
- Maintenance burden (changes must be made in two places)

## Solution: Shared Block Data Structure

### Architecture

```
┌─────────────────────────────────────────┐
│   Shared Block Definition (JSON/TS)    │
│   - Column definitions                  │
│   - Row heights                         │
│   - Font sizes                          │
│   - Formatting rules                    │
└─────────────────────────────────────────┘
           ↓                    ↓
    ┌──────────┐          ┌──────────┐
    │ Frontend │          │ Backend  │
    │   Vue    │          │  PDFKit  │
    └──────────┘          └──────────┘
```

### Implementation Phases

#### Phase 1: Create Shared Block Definitions ✅
**Status:** Completed for Schedule of Areas and Outside Figure Data

**Files:**
- Schedule of Areas: Both use SI 727 6-column format
- Outside Figure Data: Both use same table structure

#### Phase 2: Extend to Remaining Blocks

**2.1 Beacon Description Block**

**Current State:**
- **UI:** Simple text groups (points: description)
- **PDF:** Table with Beacon, Type, Condition, Coordinates columns

**Inconsistency:** Completely different formats

**Proposed Solution:**
```typescript
// Shared definition
const BEACON_DESCRIPTION_FORMAT = {
  type: 'grouped-text', // or 'table'
  format: {
    groupSeparator: ':',
    lineHeight: 12,
    fontSize: 7
  }
}
```

**Action:** Align both to use grouped text format (simpler, more professional)

**2.2 Survey Statement Block**

**Current State:**
- **UI:** Statement text + surveyor name/license
- **PDF:** Similar but may have different formatting

**Proposed Solution:**
```typescript
const SURVEY_STATEMENT_FORMAT = {
  template: 'I certify that this plan...',
  surveyorFormat: {
    nameSize: 8,
    titleSize: 7,
    licenseSize: 7
  }
}
```

**2.3 Title Block**

**Current State:**
- Both use similar format but may have spacing differences

**Proposed Solution:**
```typescript
const TITLE_BLOCK_FORMAT = {
  mainTitle: {
    text: 'GENERAL PLAN',
    fontSize: 14,
    font: 'Helvetica-Bold'
  },
  ofText: {
    fontSize: 10,
    font: 'Helvetica-Oblique'
  },
  designation: {
    fontSize: 8,
    font: 'Helvetica-Bold'
  }
}
```

### Implementation Strategy

#### Option A: JSON Configuration Files (Recommended)
**Pros:**
- Language-agnostic
- Easy to maintain
- Single source of truth
- Can be validated with JSON schema

**Cons:**
- Requires parsing on both sides
- Less type-safe

**Structure:**
```
app-shared/
  block-definitions/
    schedule-of-areas.json
    outside-figure-data.json
    beacon-description.json
    survey-statement.json
    title-block.json
```

#### Option B: TypeScript Shared Module
**Pros:**
- Type-safe
- Can include helper functions
- Better IDE support

**Cons:**
- Backend is JavaScript (would need to transpile or convert)
- More complex setup

#### Option C: Backend as Source of Truth (Current Approach)
**Pros:**
- Simple to implement
- Backend already has all logic
- Frontend just renders what backend provides

**Cons:**
- Frontend can't work independently
- Requires API calls for preview

### Recommended Approach

**Hybrid: JSON Definitions + Helper Functions**

1. **Create JSON definitions** for each block type
2. **Backend:** Read JSON and render to PDF
3. **Frontend:** Read JSON and render to HTML/Canvas
4. **Share via API:** Backend can also serve block data as structured JSON

### Implementation Steps

1. ✅ **Schedule of Areas** - Already consistent
2. ✅ **Outside Figure Data** - Already consistent
3. **Beacon Description** - Align formats
4. **Survey Statement** - Create shared template
5. **Title Block** - Standardize spacing
6. **North Arrow** - Ensure same SVG/drawing
7. **Scale Bar** - Standardize calculation

### Testing Strategy

1. **Visual Regression Testing**
   - Screenshot UI block
   - Generate PDF block
   - Compare pixel-by-pixel

2. **Data Validation**
   - Ensure same data source
   - Validate formatting rules applied consistently

3. **Integration Tests**
   - Test with various dataset sizes
   - Test with edge cases (empty data, large data)

### Maintenance Guidelines

**When adding a new block:**
1. Create JSON definition first
2. Implement in backend
3. Implement in frontend
4. Add visual regression test
5. Document in this file

**When modifying a block:**
1. Update JSON definition
2. Both frontend and backend automatically pick up changes
3. Run visual regression tests

## Current Status

- ✅ Schedule of Areas: Consistent
- ✅ Outside Figure Data: Consistent
- ⏳ Beacon Description: Needs alignment
- ⏳ Survey Statement: Needs alignment
- ⏳ Title Block: Needs verification
- ⏳ North Arrow: Needs verification
- ⏳ Scale Bar: Needs verification

## Next Actions

1. Create shared block definition files
2. Refactor Beacon Description to use shared format
3. Standardize Survey Statement
4. Verify and document Title Block format
5. Create visual regression test suite
