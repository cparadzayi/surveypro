# Auto-incrementing parcel designation

**Date:** 2026-07-12
**Surface:** `app-frontend/src/views/modules/cadastral-standard/AreaComputationView.vue`

## Problem

When digitizing parcels, the surveyor re-types the designation for every parcel.
Designations are usually sequential (e.g. `STAND 314`, `STAND 315`, …), so the
next number can be predicted. Pre-filling it expedites digitizing many parcels.

## Behaviour

After a parcel is created, the next designation is pre-filled by taking the
**last-entered** parcel's designation and incrementing its trailing number by 1,
while preserving the surrounding format. The field is always editable, so a wrong
guess costs one keystroke to correct.

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

Isolated, side-effect-free, unit-tested. Uses a regex that captures the last
digit run: `/^(.*?)(\d+)(\D*)$/`. Increments the captured digits, re-pads to the
original width, and reassembles `prefix + next + suffix`. Returns `''` when the
input has no digit run or is empty/nullish. When `existing` is supplied it steps
the number forward (bounded loop) until the candidate is not already present
(normalised, case/whitespace-insensitive), so a duplicate is never proposed.

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

Helpers in the view:
- `lastDesignation()` reads `parcels.value[parcels.value.length - 1]?.designation ?? ''`.
- `existingDesignations()` returns every parcel's designation on the plan.
- `suggestNextDesignation()` = `nextDesignation(lastDesignation(), existingDesignations())`.

#### `MapLibreAreaView.vue` (MapLibre)

`completePolygon()` pre-fills its `prompt()` default with
`nextDesignation(last, existing)`, deriving `last`/`existing` inline from the
same `parcels` ref. New parcels here are created only through this prompt (no
separate inline field), so this single call covers the viewer.

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
