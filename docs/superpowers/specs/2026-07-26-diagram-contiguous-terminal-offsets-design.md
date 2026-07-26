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

| Case | Surveyor action | Offsets drawn | Label position |
|------|-----------------|---------------|----------------|
| 1. Spans the side (coincident with both terminals) | Click **midway** between terminals | Stubs at **both** terminals (A and B) | Side **midpoint** |
| 2. Abuts near one terminal | Click **near that terminal** | Stub at **that terminal only** | **Quarter-point** — midway between the tagged terminal and the side midpoint |

A single side may carry **up to two** contiguous neighbours (one per terminal), each with
its own label and single-terminal offset; each occupies its half of the side.

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
- **Contiguous keying is `side` + `end`.** A side holds **either** one `'both'` entry
  **or** up to two single-end entries (`'from'` and `'to'`). `'both'` is exclusive:
  - adding a single-end entry to a side that already has a `'both'` entry removes the
    `'both'` entry;
  - adding a `'both'` entry removes any `'from'`/`'to'` entries on that side.
- **Roads / servitudes are unchanged** — still one-per-side, keyed by `side` alone, `end`
  ignored.

`upsertAnnotation` / `removeAnnotation` are updated to honour the composite key for
contiguous entries while preserving side-only behaviour for road/servitude.

## Click → intent (both digitizing viewers)

The click-a-side handlers already receive the map click point. Add a shared helper that
projects the click onto the hit side and returns a fraction `t ∈ [0, 1]` measured from the
`from` terminal:

```
t < 1/3            → end = 'from'   (near terminal A)
1/3 ≤ t ≤ 2/3      → end = 'both'   (midway)
t > 2/3            → end = 'to'     (near terminal B)
```

- The projection helper lives in `sideAnnotations.ts` (pure, unit-tested) and is called by
  **both** `SurveyPlanMapView.vue` and `MapLibreAreaView.vue` — the cadastral digitize step
  has two map viewers and side-tagging UX must be wired into both (existing convention).
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
// a, b, mid: {x, y} in the caller's coordinate space (PDF points or DXF ground units).
// end: 'from' | 'to' | 'both' (undefined ⇒ 'both').
// Returns which vertices get a dashed outward stub and where the label anchors.
contiguousMarks(a, b, mid, end) -> {
  stubs: Array<{x, y}>,   // terminal points to draw an outward stub from (1 or 2 entries)
  labelAnchor: {x, y},    // point the label is centred on (before outward offset)
}
```

Anchor geometry:

- `end: 'both'`  → `stubs = [a, b]`, `labelAnchor = mid`
- `end: 'from'`  → `stubs = [a]`,   `labelAnchor = midpoint(a, mid)`   (quarter-point A↔mid)
- `end: 'to'`    → `stubs = [b]`,   `labelAnchor = midpoint(mid, b)`   (quarter-point mid↔B)

Each renderer keeps its own drawing primitives (PDFKit `dash().stroke()`, general-plan
variant, DXF `addLine`/`addText`) and its own outward-offset + collision handling. Only the
**terminal set** and the **label anchor** now come from `contiguousMarks`. The diagram's
collision-aware label placement (`placeVertexLabel`) is unchanged; it simply starts from the
new anchor instead of always `mid`.

Because a single-end neighbour occupies half the side, two neighbours tagged on one side
(`from` + `to`) yield stubs at A and B with two labels, one per half — visually distinct
from the single `both` neighbour (stubs at A and B, one centred label).

## Scope boundaries (YAGNI)

- **Contiguous only.** Roads and servitudes are whole-side strips; partial strips are out of
  scope.
- **No fractional extent stored.** The click fraction only selects the terminal; the abutting
  extent is always "half the side". No per-annotation offset fraction is persisted.
- **No new beacon/corner** is introduced at the meeting point of two neighbours; the midpoint
  is implied, not a surveyed vertex.

## Testing

- `contiguousMarks` (new, backend unit test): all of `both` / `from` / `to`, plus the
  `undefined ⇒ both` default; assert stub count (1 vs 2) and label-anchor coordinates.
- Click → `t` → `end` projection (frontend unit test): points near each terminal and midway,
  including degenerate zero-length guard.
- Model rules (frontend unit test): two-per-side upsert (`from` + `to` coexist), `both`
  exclusivity (adding a single end drops `both` and vice-versa), road/servitude unaffected.
- Renderer smoke assertions: extend the existing `diagramPdf` / adjoining suites to cover a
  single-terminal annotation producing **one** stub vs a `both`/legacy annotation producing
  **two**.

## Files touched

Frontend:
- `app-frontend/src/views/modules/cadastral-standard/sideAnnotations.ts` (model, projection helper, keying)
- `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue` (click handler, editor `end` control)
- `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` (click handler parity)

Backend:
- `app-backend/src/services/diagram/contiguousMarks.js` (new shared helper)
- `app-backend/src/services/diagramPdf.js`
- `app-backend/src/services/adjoiningFeatures.js`
- `app-backend/src/services/adjoiningFeaturesDxf.js`

Tests alongside each.
