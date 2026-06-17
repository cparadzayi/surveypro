# Area Formatting Standard - Banker's Rounding

## Overview

SurveyPro now uses **banker's rounding** (round half to even) for all area calculations and displays throughout the application. This eliminates rounding bias and complies with cadastral surveying standards.

## Standards

### Area Display Rules

1. **Areas < 10,000 m²**
   - Display in **square meters (m²)**
   - **0 decimal places**
   - Banker's rounding applied
   - Example: `9,876.5 m²` → `9,876 m²` (rounds to even)

2. **Areas ≥ 10,000 m²**
   - Display in **hectares (ha)**
   - **4 decimal places**
   - Banker's rounding applied
   - Example: `12,345.67895 m²` → `1.2346 ha`

## Banker's Rounding Explained

**Banker's rounding** (also called "round half to even") is a rounding method where values exactly halfway between two numbers are rounded to the nearest **even** number.

### Why Banker's Rounding?

- **Eliminates bias**: Traditional rounding always rounds 0.5 up, creating an upward bias
- **IEEE 754 standard**: Used in financial and scientific calculations
- **Cadastral compliance**: Required for professional surveying documentation

### Examples

| Value | Traditional Rounding | Banker's Rounding | Reason |
|-------|---------------------|-------------------|---------|
| 2.5   | 3                   | **2**             | Rounds to even |
| 3.5   | 4                   | **4**             | Rounds to even |
| 4.5   | 5                   | **4**             | Rounds to even |
| 5.5   | 6                   | **6**             | Rounds to even |
| 2.51  | 3                   | **3**             | Not exactly halfway |
| 2.49  | 2                   | **2**             | Not exactly halfway |

## Implementation

### Centralized Utility

All area formatting is handled by `@/utils/areaFormatting.ts`:

```typescript
import { 
  bankersRound,           // Core rounding function
  formatArea,             // Auto-selects unit based on threshold
  formatAreaM2,           // Format in m² only
  formatAreaHa,           // Format in ha only
  formatAreaCompact,      // Compact format for labels
  formatAreaWithThreshold // Explicit threshold logic
} from '@/utils/areaFormatting'
```

### Usage Examples

#### 1. Auto-Format with Unit

```typescript
formatArea(9500)        // "9500 m²"
formatArea(15000)       // "1.5000 ha"
formatArea(9876.5)      // "9876 m²" (banker's rounding)
```

#### 2. Format for Tables (No Unit)

```typescript
formatAreaM2(9500)      // "9500"
formatAreaM2(15000)     // "15000.00"
formatAreaHa(15000)     // "1.5000"
```

#### 3. Compact Format (Labels)

```typescript
formatAreaCompact(9500)  // "9500"
formatAreaCompact(15000) // "1.5000Ha"
```

#### 4. Custom Banker's Rounding

```typescript
bankersRound(2.5, 0)     // 2
bankersRound(3.5, 0)     // 4
bankersRound(1.2345, 2)  // 1.23
bankersRound(1.2355, 2)  // 1.24 (rounds to even)
```

## Files Updated

### Core Utility
- ✅ `app-frontend/src/utils/areaFormatting.ts` - **NEW** centralized utility

### PDF Exporters
- ✅ `app-frontend/src/utils/professionalSurveyPlanExporter.ts` - Schedule of Areas
- ⏳ `app-frontend/src/utils/reportOnSurveyGenerator.ts` - Report on Survey
- ⏳ `app-frontend/src/utils/reportOnSurveyNarrativeGenerator.ts` - Narrative Report
- ⏳ `app-frontend/src/utils/comprehensiveDocumentGenerator.ts` - Comprehensive Doc

### UI Components
- ✅ `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`
- ✅ `app-frontend/src/views/modules/lite/areas/AreasView.vue`
- ⏳ `app-frontend/src/views/modules/cadastral-standard/AreaComputationView.vue`
- ⏳ `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`

### Services
- ⏳ `app-frontend/src/services/parcelDetection.ts`
- ⏳ `app-frontend/src/utils/automatedParcelDetector.ts`

## Migration Checklist

### Phase 1: Core Implementation ✅
- [x] Create centralized `areaFormatting.ts` utility
- [x] Implement banker's rounding function
- [x] Create formatArea functions with threshold logic
- [x] Add comprehensive documentation

### Phase 2: PDF Exporters ⏳
- [x] Update `professionalSurveyPlanExporter.ts`
- [ ] Update `reportOnSurveyGenerator.ts`
- [ ] Update `reportOnSurveyNarrativeGenerator.ts`
- [ ] Update `comprehensiveDocumentGenerator.ts`

### Phase 3: UI Components ⏳
- [x] Update `SurveyPlanMapView.vue`
- [x] Update `AreasView.vue`
- [ ] Update `AreaComputationView.vue`
- [ ] Update `MapLibreAreaView.vue`

### Phase 4: Services ⏳
- [ ] Update `parcelDetection.ts`
- [ ] Update `automatedParcelDetector.ts`

### Phase 5: Testing ⏳
- [ ] Test Schedule of Areas formatting
- [ ] Test Report on Survey area display
- [ ] Test Comprehensive Document areas
- [ ] Test UI area displays
- [ ] Verify banker's rounding edge cases

## Testing

### Test Cases

```typescript
// Test 1: Exact halfway values (banker's rounding)
formatArea(9500.5)   // Should be "9500 m²" or "9501 m²" (even)
formatArea(9501.5)   // Should be "9502 m²" (rounds to even)

// Test 2: Threshold boundary
formatArea(9999)     // "9999 m²"
formatArea(10000)    // "1.0000 ha"
formatArea(10001)    // "1.0001 ha"

// Test 3: Large areas
formatArea(123456)   // "12.3456 ha"
formatArea(123456.789) // "12.3457 ha" (4 decimals)

// Test 4: Small areas
formatArea(100)      // "100 m²"
formatArea(100.5)    // "100 m²" (rounds to even)
formatArea(101.5)    // "102 m²" (rounds to even)
```

### Manual Verification

1. **Schedule of Areas** (PDF)
   - Open Professional Survey Plan PDF
   - Check "AREAS SQUARE METRES" column
   - Verify no decimal places for areas < 10,000 m²
   - Verify 4 decimal places in hectares for areas ≥ 10,000 m²

2. **Report on Survey** (PDF)
   - Generate Report on Survey
   - Check area displays in parcel descriptions
   - Verify correct unit selection

3. **UI Displays**
   - Open Survey Plan Map View
   - Check parcel labels
   - Verify area formatting in tables

## Benefits

### 1. **Consistency**
- All area displays use the same formatting logic
- No discrepancies between UI and PDF
- Professional appearance

### 2. **Accuracy**
- Eliminates rounding bias
- Complies with cadastral standards
- IEEE 754 compliant

### 3. **Maintainability**
- Single source of truth
- Easy to update formatting rules
- Centralized testing

### 4. **Professional**
- SI 727 compliant
- Meets Zimbabwe cadastral standards
- Industry best practices

## Future Enhancements

- [ ] Add locale-specific formatting (thousands separators)
- [ ] Support for other area units (acres, square feet)
- [ ] Configurable decimal places per project
- [ ] Area formatting preferences in user settings

## References

- **IEEE 754**: Standard for Floating-Point Arithmetic
- **SI 727**: Zimbabwe Survey Plan Standards
- **Cadastral Surveying Standards**: Professional surveying guidelines

---

**Status**: ✅ Core implementation complete, migration in progress  
**Last Updated**: December 15, 2025  
**Version**: 1.0.0
