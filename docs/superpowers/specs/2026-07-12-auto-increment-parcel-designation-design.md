# Auto-incrementing parcel designation

**Date:** 2026-07-12
**Surface:** `app-frontend/src/views/modules/cadastral-standard/AreaComputationView.vue`

## Problem

When digitizing parcels, the surveyor re-types the designation for every parcel.
Designations are usually sequential (e.g. `STAND 314`, `STAND 315`, …), so the
next number can be predicted. Pre-filling it expedites digitizing many parcels.

## Behaviour

The next designation is pre-filled with **(last-entered + 1)**: the designation
the surveyor entered for the previous parcel **this session**, incremented by 1,
preserving its format and skipping any number already on the plan. It is empty
until the first parcel of the session is entered by hand (matching "…once the
user has completed digitizing the next parcel"). The field is always editable.

> **Why session-tracked, not list order:** an earlier version incremented the
> *last element* of the parcels array. After a DB reload that element is the
> **Outside Figure** parcel (loaded last), so it proposed nonsense like
> `OUTSIDE FIGURE MAG1 SH3`. "Last-entered" therefore means a value tracked in a
> `ref` that is set whenever the surveyor creates a parcel — never read from
> `parcels[]` order.

Examples:

| Last-entered designation | Pre-filled next |
|--------------------------|-----------------|
| `STAND 314`              | `STAND 315`     |
| `314`                    | `315`           |
| `LOT 2283A`              | `LOT 2284A`     |
| `Erf 007`                | `Erf 008`       |
| `Remainder` (no digits)  | `` (blank)      |
| (no parcels yet)         | `` (blank)      |

Rules:
- Increment the **last run of digits** in the string.
- Preserve everything before and after that run (prefix + suffix).
- Preserve zero-padding width (`007` → `008`).
- No digits anywhere, or no parcels yet → return empty string (no pre-fill).
- **Skip-to-next-free:** the candidate is stepped forward (keeping the same
  format) until it lands on a designation not already present on the plan, so a
  duplicate is never proposed. Comparison is case- and whitespace-insensitive.
  E.g. last-entered `STAND 314` with `STAND 315`/`STAND 316` already present →
  `STAND 317`.

## Design

### Pure helper — `app-frontend/src/utils/parcelNumbering.ts`

```ts
export function nextDesignation(last: string, existing?: Iterable<string>): string
```

Isolated, side-effect-free, unit-tested. Captures the last digit run of `last`
(`/^(.*?)(\d+)(\D*)$/`), increments it, re-pads to the original width, and
reassembles `prefix + next + suffix`; with `existing` supplied it steps forward
(bounded loop) until the candidate is not already present (normalised,
case/whitespace-insensitive), so a duplicate is never proposed. Returns `''` when
`last` has no digit run or is empty/nullish.

Each view tracks the last-entered designation in a `ref` (set when a parcel is
created) and calls `nextDesignation(lastEntered, existing)`; the `ref` is empty
until the first parcel of the session, so the first suggestion is blank.

### Wiring — BOTH digitizing viewers

The cadastral step has two interchangeable map viewers (a `switch-viewer`
toggle), and **each has its own parcel-designation `prompt()`**. Both must be
wired or the pre-fill silently does nothing on whichever viewer the surveyor is
actually using:

- **Leaflet** — `AreaComputationView.vue` (`handlePolygonComplete` prompt +
  Quick Parcel Builder inline field).
- **MapLibre** — `MapLibreAreaView.vue` (`completePolygon` prompt at the point
  the parcel is created; it already had a duplicate-designation guard).

#### `AreaComputationView.vue` (Leaflet)

Two creation paths both end at `addParcel(designation, points, polygon)`:

1. **Polygon drawing** (`handlePolygonComplete`): pass the computed value as the
   native prompt default — `prompt('Enter parcel designation …', suggestNextDesignation())`.

2. **Quick Parcel Builder** (inline `parcelDesignation` field): a watcher on
   `selectedPoints.length` pre-fills the field with `suggestNextDesignation()` the
   moment the user starts selecting points for a new parcel **and** the field is
   empty. After a save, `clearSelection` empties the field; the watcher re-fills
   it on the next selection.

State/helpers in the view:
- `lastEnteredDesignation` ref — set to the designation each time a parcel is
  created (in `handlePolygonComplete` and `saveManualParcel`).
- `existingDesignations()` returns every parcel's designation on the plan.
- `suggestNextDesignation()` = `lastEnteredDesignation ? nextDesignation(lastEnteredDesignation, existingDesignations()) : ''`.

#### `MapLibreAreaView.vue` (MapLibre)

Same `lastEnteredDesignation` ref, set right after the new parcel is pushed in
`completePolygon()`. That function pre-fills its `prompt()` default with
`nextDesignation(lastEnteredDesignation, existing)`. New parcels here are created
only through this prompt (no separate inline field), so this single call covers
the viewer.

## Testing

Unit test `app-frontend/src/utils/__tests__/parcelNumbering.test.ts` covering:
prefix, plain number, alpha suffix, zero-padding, no-digits, empty/nullish. The
Vue wiring (prompt default + watcher) is not separately tested — it is a one-line
default and a small watcher over the pure helper.

## Out of scope (YAGNI)

- Cross-session / database max-number lookup (existence check is scoped to the
  parcels currently on the plan in-session).
- Gap filling (e.g. 314, 316 → 315) — the skip-to-next-free rule always moves
  forward from last-entered + 1, never backwards into a lower gap.
- A new modal component (existing prompt + inline field are pre-filled in place).
