# Diagram adjoining (contiguous) parcels — terminal-aware offsets & labels

**Date:** 2026-07-26
**Status:** Design approved, pending spec review
**Scope:** Diagram + General Plan (PDF and DXF) adjoining-feature rendering, and the
click-a-side tagging UI. `contiguous` role only.

## Problem

When a surveyor tags a subject boundary side as abutting a **contiguous** (neighbouring)
parcel, the current code always renders the same thing:

- a dashed outward "offset" stub at **both** terminals of the side, and
- the neighbour's label at the **full-side midpoint**.

This only models the case where the abutting parcel is coincident with **both** terminals
(spans the whole side). Two real situations cannot be expressed:

1. An abutting parcel that meets the subject boundary at **one terminal only** (e.g. two
   different neighbours share one boundary, meeting partway along it). There is no way to
   place a single offset at one terminal.
2. Consequently, **two different abutting parcels on the same side** — one at each terminal
   — cannot be recorded at all: annotations are keyed by side letters and
   `upsertAnnotation` *replaces* any existing entry for that side.

The click position (which already tells us *where* along the side the surveyor clicked) is
currently discarded — only the side identity (`'AB'`) survives.

## Desired behaviour

> **Design revision (2026-07-26, post-implementation):** the label is **always centred on
> the side**, and **one label per side** is drawn. The click position (and the `end` field)
> controls **only where the stub(s) go** — never the label position or count. This replaced an
> earlier iteration that put a single-terminal label at the quarter-point and allowed two
> neighbours (two labels) per side; that proved cluttered and non-standard. The table below
> reflects the final behaviour.

| Case | Surveyor action | Offsets drawn | Label position |
|------|-----------------|---------------|----------------|
| 1. Spans the side (coincident with both terminals) | Click **midway** between terminals | Stubs at **both** terminals (A and B) | Side **midpoint** |
| 2. Abuts near one terminal | Click **near that terminal** | Stub at **that terminal only** | Side **midpoint** (centred) |

A side carries **one** contiguous label, always centred. The `end` field records which
terminal(s) the neighbour abuts and therefore which stub(s) are drawn.

## Data model (`app-frontend/.../sideAnnotations.ts`)

Add an `end` discriminator, meaningful only for `role: 'contiguous'`:

```ts
export interface SideAnnotation {
  side: string
  role: SideRole
  label?: string
  widthM?: number
  servitudeId?: string
  /** contiguous only: which terminal(s) the abutment offset sits at.
   *  'from' = first letter's vertex (A of 'AB'), 'to' = second (B), 'both' = whole side.
   *  Absent ⇒ treated as 'both' (back-compat with data saved before this change). */
  end?: 'from' | 'to' | 'both'
}
```

Rules:

- **Missing `end` ⇒ `'both'`.** Every annotation saved before this change renders exactly
  as today. No migration required.
- **One annotation per side, every role (contiguous included).** `upsertAnnotation` /
  `removeAnnotation` key on `side` alone; re-tagging a side replaces its entry. `end` is just
  a field on the single contiguous entry that controls stub placement — there is no `side`+`end`
  composite key and no two-neighbours-per-side. (An earlier iteration keyed contiguous entries
  by `side`+`end` to allow two neighbours; the design revision above dropped it.)

## Click → intent

Side-annotation tagging (the click-a-side road/servitude/contiguous picker) lives **only** in
`SurveyPlanMapView.vue` — this is the diagram / general-plan step. The digitize step's viewers
(`MapLibreAreaView.vue`, `AreaComputationView.vue`) have no side-tagging UI and are not touched.

The click-a-side handler already receives the map click point. Add a shared pure helper that
projects the click onto the hit side and returns a fraction `t ∈ [0, 1]` measured from the
`from` terminal:

```
t < 1/3            → end = 'from'   (near terminal A)
1/3 ≤ t ≤ 2/3      → end = 'both'   (midway)
t > 2/3            → end = 'to'     (near terminal B)
```

- The `t → end` classifier lives in `sideAnnotations.ts` (pure, unit-tested). The projection
  itself is done in the viewer using screen-space pixel coordinates (`map.project()` of the
  side endpoints vs the click's `e.point`) for metric-accurate results on short sides.
- The editor pre-fills `end` from `t`, and — because `end` is now a first-class field — the
  editor exposes an **`end` override control** (From terminal / Midway / To terminal) so the
  surveyor can correct a mis-registered click. The control is shown only for the contiguous
  role.

## Rendering — one shared decision helper feeding all three renderers

The contiguous stub/label geometry is currently duplicated verbatim in three places:

- `app-backend/src/services/diagramPdf.js` — `drawAdjoiningFeatures`
- `app-backend/src/services/adjoiningFeatures.js` — `drawSubjectAdjoiningFeatures` (General Plan PDF)
- `app-backend/src/services/adjoiningFeaturesDxf.js` — `emitSubjectAdjoiningFeaturesDxf` (DXF)

Introduce a small pure helper so the decision lives in **one** place and the three
renderers stay in lockstep:

```
// app-backend/src/services/diagram/contiguousMarks.js
// a, b: [x, y] terminal points in the caller's coordinate space (PDF points or DXF ground units).
// end: 'from' | 'to' | 'both' (undefined ⇒ 'both').
// Returns which terminal(s) get a dashed outward stub and where the label anchors.
contiguousMarks(a, b, end) -> {
  stubFrom: boolean,          // draw an outward stub at terminal a?
  stubTo: boolean,            // draw an outward stub at terminal b?
  labelAnchor: [x, y],        // point the label is centred on (before outward offset)
}
```

Geometry (the label anchor is the side midpoint for **every** `end`; only the stubs vary):

- `end: 'both'`  → `stubFrom = true,  stubTo = true`,  `labelAnchor = mid`
- `end: 'from'`  → `stubFrom = true,  stubTo = false`, `labelAnchor = mid`
- `end: 'to'`    → `stubFrom = false, stubTo = true`,  `labelAnchor = mid`

Each renderer keeps its own drawing primitives (PDFKit `dash().stroke()`, general-plan
variant, DXF `addLine`/`addText`) and its own outward-offset + collision handling. It gates
each stub on `stubFrom` / `stubTo` and centres the label on `labelAnchor`. The diagram's
collision-aware label placement (`placeVertexLabel`) is unchanged; it starts from the anchor
(the side midpoint) exactly as before.

## Scope boundaries (YAGNI)

- **Contiguous only.** Roads and servitudes are whole-side strips; partial strips are out of
  scope.
- **No fractional extent stored.** The click fraction only selects which terminal(s) get a
  stub (`end`); no per-annotation offset fraction is persisted, and the label is always centred.
- **One label per side.** A side never carries more than one contiguous label; the abutment is
  a property of that single neighbour.

## Testing

- `contiguousMarks` (new, backend unit test): all of `both` / `from` / `to`, plus the
  `undefined ⇒ both` default; assert stub gating (`stubFrom`/`stubTo`) and that `labelAnchor`
  is the side midpoint for every `end`.
- Click → `t` → `end` projection (frontend unit test): points near each terminal and midway,
  including degenerate zero-length guard.
- Model rules (frontend unit test): one entry per side (re-tagging replaces), `end` round-trips
  on the stored entry, tagging as road replaces a contiguous entry, road/servitude unaffected.
- Renderer smoke assertions: extend the existing `diagramPdf` / adjoining suites to cover a
  single-terminal annotation producing **one** stub vs a `both`/legacy annotation producing
  **two**.

## Files touched

Frontend:
- `app-frontend/src/views/modules/cadastral-standard/sideAnnotations.ts` (model, `t → end` classifier, keying)
- `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue` (click handler, editor `end` control)

Backend:
- `app-backend/src/services/diagram/contiguousMarks.js` (new shared helper)
- `app-backend/src/services/diagramPdf.js`
- `app-backend/src/services/adjoiningFeatures.js`
- `app-backend/src/services/adjoiningFeaturesDxf.js`

Tests alongside each.
