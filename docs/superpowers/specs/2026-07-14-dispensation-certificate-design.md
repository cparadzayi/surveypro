# Dispensation Certificate — Design

Date: 2026-07-14
Status: Approved (design)

## Goal

Generate SI 727 **Dispensation Certificates** for township surveys. A
dispensation certificate is the registered land surveyor's formal statement,
lodged with the Surveyor-General, that the physical placing/marking of beacons
has been dispensed with (stands being defined by the general plan and, on
developed portions, by existing walls/structures), and it declares the
servitudes affecting the stands so they are recorded against title.

Two variants exist, driven by the general-plan **plan type**:

- **Undeveloped portion** (`general-undeveloped`): STAND No. | AREA (m²) |
  DETAILS OF SERVITUDES table; servitudes column blank (undeveloped stands
  carry no built servitudes).
- **Developed portion** (`general-developed`): same table, but each affected
  stand carries a servitude sentence, e.g. *"The boundary (1620a – 1620b) is
  subject to a Party wall servitude"*.

A township surveyed in both portions produces **both** certificates.

## Scope

**In scope (v1 — "full common cases"):**

- A new **Servitudes** capture stage in the cadastral-standard workflow.
- A servitude data model covering single-boundary servitudes with type,
  width, beneficiary/burdened party, purpose, statute reference, and (for
  party walls) the adjoining stand.
- Generation of the developed and undeveloped certificate PDFs.
- Reconciliation of the existing `role:'servitude'` side-annotations as a
  derived mirror of the new servitude records (one writer).
- Lodgement-letter reclassification of "Dispensation Certificate" from
  external to generated.

**Out of scope (deferred, noted explicitly):**

- Multi-boundary / polyline servitudes spanning several boundary segments.
- Off-boundary strip or polygon servitude geometry not tied to a single edge.
- Notarial deed references.
- Any change to how the general plan / diagram render servitudes (that
  pipeline is deliberately left untouched — see §D).

## Background (as-found)

- **Plan type** is already chosen in the survey-plan module
  (`general-developed` / `general-undeveloped`); `planTypeOutputSubdir`
  (`app-frontend/src/utils/project-directory.ts`) maps both to the
  `general-plans` output folder. This selection is the certificate-variant
  trigger.
- **Existing servitude capture:** `sideAnnotations.ts`
  (`app-frontend/src/views/modules/cadastral-standard/`) defines
  `SideAnnotation { side, role: 'contiguous'|'road'|'servitude', label?, widthM? }`,
  stored per subject parcel in `Record<subjectId, SideAnnotation[]>` and
  persisted to `metadata.sideAnnotations` /
  `step_data['survey-plan'].sideAnnotations`. Captured via a click-a-stand →
  click-a-side interaction in both `SurveyPlanMapView.vue` (general plan) and
  `MapLibreAreaView.vue` (diagram). Servitudes already render on the general
  plan + diagram PDF/DXF (servitude = blue) via the backend
  `adjoiningFeatures.js`, which reads `metadata.sideAnnotations`.
- **Parcel data:** each `LandParcel` (`app-frontend/src/services/landParcels.ts`)
  has `stand` (→ Stand No.), `area_m2` (→ Area), and `metadata.edges` — edge
  `from`/`to` points resolvable to beacon names via `getBeaconName` (the same
  path `useAreaConsistencyPDF.ts` uses). There is **no** per-stand "developed"
  flag, and none is needed — the plan-type selection drives the split.
- **Certificate precedent:** the workflow already ends with a `dsg-certificate`
  step backed by `DSGCertificateView.vue` →
  `generateDSGCertificatePDF(certificateData)` (a frontend jsPDF util in
  `@/utils/dsgCertificateGenerator`) returning `{ blob, pageCount }`, with
  header data pulled from `workflowState.projectInfo` (township, district,
  standReference, name) and `workflowState.reportOnSurvey`. The dispensation
  certificate mirrors this pattern.
- **Lodgement matcher:** `lodgementDocuments.ts` currently classifies
  "Dispensation Certificate" as an **external** item (matched under `input/`
  by `/dispensation/i`). Once generated, it becomes a generated item.

## Design

### A. Servitude data model

New module `app-frontend/src/views/modules/cadastral-standard/servitudes.ts`,
alongside `sideAnnotations.ts`. A servitude is a first-class row (a flat array,
not a per-subject map, because the certificate iterates rows):

```ts
export type ServitudeType =
  | 'party-wall' | 'right-of-way' | 'sewer' | 'water' | 'electricity'
  | 'storm-water' | 'pipeline' | 'telecom' | 'other';

export interface Servitude {
  id: string;                 // uuid — stable link target for the mirror
  subjectId: string;          // parcel/stand this servitude burdens (matches sideAnnotations key)
  side: string;               // 'BC' — same letter model as SubjectSide
  type: ServitudeType;
  typeLabelOther?: string;    // free text when type === 'other'
  widthM?: number;            // null/absent for party walls; strip width for services
  beneficiary?: string;       // "in favour of Stand 87" / council / ZESA / water authority
  burdenedStand?: string;     // the stand carrying the burden, when it differs from subjectId's stand label
  adjoiningStand?: string;    // party walls: the reciprocal stand (emit on BOTH stands)
  purpose?: string;           // free text for the certificate sentence
  statuteRef?: string;        // optional legal citation
  fromBeacon?: string;        // resolved from the subject parcel's metadata.edges
  toBeacon?: string;          // for the certificate reference, e.g. "1620a – 1620b"
}
```

`fromBeacon`/`toBeacon` are resolved when the servitude is saved (or at
certificate build time) from the subject parcel's `metadata.edges`, by matching
the letter `side` (e.g. `'BC'`) to the edge whose endpoints correspond to
beacon positions B and C, then reading their beacon names via the same
`getBeaconName` resolution `useAreaConsistencyPDF` uses. Storing them makes the
certificate self-contained and robust to later edge recomputation.

Helper functions in `servitudes.ts` (pure, unit-tested):

- `upsertServitude(list, s)` / `removeServitude(list, id)` — immutable list ops.
- `servitudesForSubject(list, subjectId)` — filter by subject.
- `hydrateServitudes(raw)` — coerce a loaded value into `Servitude[]` (drop
  malformed entries), mirroring `hydrateAnnotationsMap`.
- `resolveBeaconPair(parcel, side)` → `{ fromBeacon, toBeacon } | null` —
  letter-side → beacon-name pair from `metadata.edges`.

### B. Servitudes stage (capture)

Insert a step into `workflowSteps` (`CadastralStandardView.vue`, ~L1536)
**between `area-computation` and `report-on-survey`**:

```
{ id: 'servitudes', name: 'Servitudes' }
```

(Geometry, beacons, and edges are fixed by area computation; both the plan
render and the certificate need servitudes upstream of report/plan output.)

The stage view reuses the existing map + side-click interaction rather than
reinventing it: it hosts the same map component under an `isServitudeStage`
mode flag so that clicking a stand then a side opens the **rich servitude
editor** (type dropdown + custom, width, beneficiary, burdened/adjoining stand,
purpose, statute ref) instead of the 3-way road/servitude/contiguous picker.
Parcel selection reuses the shared `ParcelSelect` component. The editor
pre-fills the beacon pair for the clicked side via `resolveBeaconPair`.

**Type entry:** a dropdown of `ServitudeType` values with human labels
(Party wall, Right of way, Sewer, Water, Electricity, Storm-water / drainage,
Pipeline, Telecom, Other), plus a free-text field shown when "Other" is
selected (persisted as `typeLabelOther`).

**Party-wall reciprocity:** when `type === 'party-wall'` and `adjoiningStand`
is set, the certificate builder emits the servitude row on **both** the subject
stand and the adjoining stand (see §E). Only one `Servitude` record is stored
(on the subject); reciprocity is expanded at certificate-build time, not
duplicated in storage.

### C. Persistence

Servitudes persist under their own workflow key,
`step_data['servitudes'].servitudes` (a `Servitude[]`), through the same
`PATCH /survey-projects/:id/workflow` mechanism `persistSideAnnotations`
already uses. Loading hydrates via `hydrateServitudes`.

### D. Reconciliation with existing side-annotations (one writer)

The Servitudes stage is the **sole writer** of servitude data. The existing
`role:'servitude'` entries in `metadata.sideAnnotations` become a **derived
mirror** of the servitude records so the render pipeline is untouched:

- Add a single additive field to `SideAnnotation`: `servitudeId?: string`.
  (`road` and `contiguous` annotations are unchanged and still authored in
  place — they are render hints, not legal objects.)
- On save in the Servitudes stage, rebuild the `role:'servitude'` subset of
  `sideAnnotationsBySubject` from the servitude records:
  `{ side, role: 'servitude', label: beneficiary || purpose || typeLabel, widthM, servitudeId: id }`.
  Non-servitude annotations are left as-is.
- `adjoiningFeatures.js` and the general-plan/diagram PDF/DXF rendering read
  `metadata.sideAnnotations` exactly as today; `servitudeId` is additive and
  ignored by the renderer — **zero renderer changes**, and nothing breaks if
  the Servitudes stage is never visited (legacy annotations still render).

**Migration (self-healing):** on first load of the Servitudes stage, any
existing `role:'servitude'` annotation with no matching `servitudeId` is
back-filled into a `Servitude` record (carry over `side`, `widthM`, and
`label`→`purpose`; default `type` to `party-wall` for the surveyor to confirm).
This lets legacy projects adopt the new model without manual re-entry.

**Guard:** going forward the Servitudes stage owns servitude authoring. The
general-plan/diagram side-editor either defers servitude authoring to the stage
or continues writing the old shape flagged (no `servitudeId`) for back-fill on
the next stage visit — so the mirror cannot silently diverge.

### E. Certificate generation

New frontend generator
`app-frontend/src/utils/dispensationCertificateGenerator.ts` (jsPDF, mirroring
`dsgCertificateGenerator`). Exposes:

```ts
generateDispensationCertificatePDF(data: DispensationCertificateData):
  Promise<{ blob: Blob; pageCount: number }>
```

**Variant selection:** the caller passes `portion: 'developed' | 'undeveloped'`
derived from the plan type. Developed renders the servitudes column/sentences;
undeveloped renders STAND No. | AREA only (servitudes column blank).

**Row assembly** (a pure, unit-tested `buildCertificateRows(parcels,
servitudes, portion)`): for each parcel, a row `{ stand, areaM2,
servitudeText }`. On the developed variant, `servitudeText` is the joined set
of sentences for that stand's servitudes:
*"The boundary (<fromBeacon> – <toBeacon>) is subject to a <type label>[,
<width> m] servitude[ in favour of <beneficiary>][ between Stand <subject> and
Stand <adjoiningStand>]"*. Party-wall records with an `adjoiningStand` also
contribute a reciprocal sentence to the adjoining stand's row.

**Certificate content** (from `workflowState.projectInfo` / `reportOnSurvey`
with the same fallbacks DSG uses; surfaced as editable form fields, defaulted):

- Heading: "DISPENSATION CERTIFICATE" + portion indicator (developed/undeveloped).
- Township + parent property (Stand/Lot X of … / Remainder of …).
- District / Province / local authority.
- General Plan number and associated SG/diagram number(s).
- Lo zone / central meridian and area units (m²), consistent with the GP.
- The STAND No. | AREA (m²) | DETAILS OF SERVITUDES table, with **total stand
  count and total area** (checksum against the GP).
- Dispensation-clause citation (SI 727 / Land Survey regulation reference).
- Surveyor declaration + registration number, signature, place, date.
- Surveyor-General endorsement block (space for SG signature/date/stamp).

### F. Output & lodgement wiring

- Save each generated PDF via `saveDocument` (`overwrite: true`) into
  `output/certificates/`:
  - developed → `DispensationDeveloped.pdf`
  - undeveloped → `DispensationUndeveloped.pdf`
  `documentStorage` routes a `dispensation-certificate` documentType to
  `structure.certificates` (add the mapping in `resolveTargetFolder`,
  mirroring the `areas-consistency` addition).
- Reclassify the lodgement item in `lodgementDocuments.ts`: change
  "Dispensation Certificate" from `{ kind: 'external', keyword: /dispensation/i }`
  to `{ kind: 'generated', folders: ['certificates'], keyword: /dispensation/i }`,
  so a generated file in `output/certificates/` ticks the letter box the same
  way the other generated documents do.

## Data flow

Area Computation (edges + beacon names fixed) → **Servitudes stage**: surveyor
clicks stands/sides, records rich servitudes → persist to
`step_data['servitudes'].servitudes` AND rebuild the `role:'servitude'` mirror
in `metadata.sideAnnotations` → general plan / diagram render unchanged from the
mirror → **Generate dispensation certificate**: pick variant from plan type,
assemble rows (beacon pairs from edges, party-wall reciprocity expanded), render
PDF(s), save to `output/certificates/`, reclassified lodgement item ticks.

## Error handling

- `resolveBeaconPair` returning `null` (side not found in edges) → the servitude
  still stores; the certificate falls back to the raw letter side (e.g. "BC")
  and the stage surfaces a non-blocking warning so the surveyor can fix the
  beacon data.
- Certificate generation for a portion with zero qualifying rows still produces
  a valid (empty-table) certificate rather than failing.
- Save is best-effort per file, consistent with the survey-record split-save
  convention (`overwrite: true`, failure recorded and surfaced, not fatal).

## Testing

Unit (vitest):

- `servitudes.ts` helpers: upsert/remove/hydrate; `resolveBeaconPair` maps a
  letter side to the correct beacon-name pair from `metadata.edges`, and
  returns `null` for an unknown side.
- Reconciliation: saving servitudes rebuilds only the `role:'servitude'`
  mirror entries (road/contiguous untouched), each carrying `servitudeId`;
  legacy `role:'servitude'` annotations without `servitudeId` back-fill into
  `Servitude` records on load.
- `buildCertificateRows`: developed variant emits servitude sentences with the
  resolved beacon pair; a party-wall record with `adjoiningStand` emits a
  reciprocal row on the adjoining stand; undeveloped variant emits area-only
  rows with a blank servitudes column; totals (count + area) are correct.
- Variant routing: `general-developed` → developed certificate,
  `general-undeveloped` → undeveloped certificate.
- `lodgementDocuments.ts`: a `DispensationDeveloped.pdf` in
  `output/certificates/` ticks "Dispensation Certificate"; a `/dispensation/i`
  file under `input/` no longer ticks it (now folder-gated to `certificates`);
  existing regression tests still pass.

Manual QA:

- Generate from a `general-developed` project and a `general-undeveloped`
  project; confirm the correct PDF(s) land in `output/certificates/`, the
  lodgement box ticks, and the general-plan/diagram servitude rendering is
  visually unchanged.

## Approaches considered

- **Servitude capture — standalone stage owning a rich model, with the
  side-annotation servitude entries as a derived mirror (chosen)** vs.
  extending `SideAnnotation`'s `role`/`label` in place (couples map-render
  concerns to legal concerns; grows the enum unboundedly) vs. a parallel
  servitude store that independently re-tags boundaries (two sources of truth).
  The chosen hybrid gives one writer, an untouched render pipeline, and a
  richer legal model.
- **Developed/undeveloped split — driven by plan type (chosen)** vs. a
  per-stand developed flag (no such flag exists; the surveyor already declares
  the portion via plan type) vs. deriving "developed" from has-servitude
  (conflates a legal portion with servitude presence).
- **Certificate rendering — frontend jsPDF generator mirroring
  `dsgCertificateGenerator` (chosen)** vs. a backend pdfkit route (heavier; the
  DSG precedent and the survey-record section generators are all frontend).
- **Servitude type — dropdown + custom (chosen)** vs. fixed dropdown only (can't
  express uncommon types) vs. free text (no consistency).
- **Boundary reference — pick from the stand's computed edges (chosen)** vs.
  manual text entry (typo-prone, may not match the plan).

## Out of scope

- Multi-boundary/polyline and off-boundary strip/polygon servitude geometry.
- Notarial deed references.
- Changes to the general-plan/diagram servitude rendering pipeline.
- Backfilling certificates for previously-generated projects (they appear on
  the next generation).
