# Unified PDF Generation Design

## Goal

Retire the jsPDF client-side plan generation path and route all survey plan types (developed and undeveloped township) through the single PDFKit backend path, with plan type communicated via a `planType` flag.

## Background

SurveyPro currently has two separate PDF generation engines:

| | Developed Township | Undeveloped Township |
|---|---|---|
| Engine | jsPDF (client-side) | PDFKit (backend) |
| Entry point | `professionalSurveyPlanExporter.ts` | `POST /api/geopdf/vector` |
| Vector output | No (raster overlays) | Yes |
| GeoPDF georeferencing | No | Yes (EPSG:22291) |
| Intelligent label placement | No | Yes |
| Sheet escalation (A2→A1→A0) | No | Yes |
| Summary report accuracy | Unreliable | Reliable (X-Used-Sheet-Size header) |

The PDFKit backend path is significantly more capable. Consolidating to a single path eliminates the maintenance burden of two engines and brings all plan types up to the same output quality.

## Content Difference Between Plan Types

The only rendering difference between developed and undeveloped township plans is **edge annotations**:

- **Undeveloped township:** Edge distances and edge bearings are rendered along boundary lines, wholly within each parcel.
- **Developed township:** Edge distances and edge bearings are omitted. All other elements (beacon labels, stand numbers, parcel fill, title block, north arrow, scale bar, GeoPDF georeferencing) are identical.

## Architecture

### Data Flow (After)

```
Both plan types:
  SurveyPlanMapView.vue
    → geopdf.ts (generateVectorGeoPDF)
    → POST /api/geopdf/vector  { planType: 'developed' | 'undeveloped', ... }
    → geopdf-vector.js (route)
    → pdfkitGeoPDF.js (service, skips edge annotations when planType === 'developed')
    → PDF blob (GeoPDF, vector, with X-Used-Sheet-Size header)
    → download
```

### planType Flag

- **Type:** `'developed' | 'undeveloped'`
- **Origin:** User's plan type selection in the export dialog in `SurveyPlanMapView.vue`
- **Travel path:** Vue component → `geopdf.ts` options → POST body → route handler → service options → `_generateGeoPDFInner()` options
- **Default:** `'undeveloped'` if absent (backwards compatibility)

## Backend Changes

### `app-backend/src/routes/geopdf-vector.js`

- Extract `planType` from request body alongside existing fields
- Validate: must be `'developed'` or `'undeveloped'`; default to `'undeveloped'` if absent or invalid
- Pass `planType` through to the `pdfkitGeoPDF` service call

### `app-backend/src/services/pdfkitGeoPDF.js`

- Accept `planType` in the options object passed to `_generateGeoPDFInner()`
- Add `if (planType !== 'developed')` guard around the edge distance rendering block
- Add `if (planType !== 'developed')` guard around the edge bearing rendering block
- No other rendering logic changes

### `app-backend/src/services/pdfkitLabeling.js`

- No changes required. Edge annotation rendering lives in `pdfkitGeoPDF.js`.

## Frontend Changes

### `app-frontend/src/services/geopdf.ts`

- Add `planType: 'developed' | 'undeveloped'` to the `GenerateVectorGeoPDFOptions` interface
- Include `planType` in the POST body sent to `/api/geopdf/vector`

### `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`

- Both plan type selections (developed and undeveloped) call `generateVectorGeoPDF()` from `geopdf.ts`
- Pass `planType: 'developed'` or `planType: 'undeveloped'` based on the user's selection
- Remove the call to `exportProfessionalGeneralPlan()` entirely

### `app-frontend/src/services/professionalSurveyPlanExporter.ts`

- Delete this file. It becomes dead code once `SurveyPlanMapView.vue` no longer references it.

## Error Handling

- Invalid `planType` values in the request body are silently defaulted to `'undeveloped'` to avoid breaking existing clients during transition.
- No new error states are introduced — the PDFKit path already handles all failure cases (database errors, geometry issues, sheet escalation failures).

## Testing

- Backend: add Jest test cases to the existing geopdf route tests asserting that a request with `planType: 'developed'` produces a PDF with no edge distance or bearing text
- Backend: assert that omitting `planType` defaults to `'undeveloped'` behavior
- Manual: generate a developed township plan and confirm edge annotations are absent; confirm GeoPDF can be imported into QGIS
- Manual: generate an undeveloped township plan and confirm edge annotations are present and unchanged
- Manual: confirm the summary report (sheet size, scale) is accurate for both plan types after consolidation
