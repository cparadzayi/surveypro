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

## Design

### Pure helper — `app-frontend/src/utils/parcelNumbering.ts`

```ts
export function nextDesignation(last: string): string
```

Isolated, side-effect-free, unit-tested. Uses a regex that captures the last
digit run: `/^(.*?)(\d+)(\D*)$/`. Increments the captured digits, re-pads to the
original width, and reassembles `prefix + next + suffix`. Returns `''` when the
input has no digit run or is empty/nullish.

### Wiring in `AreaComputationView.vue`

Two creation paths both end at `addParcel(designation, points, polygon)`:

1. **Polygon drawing** (`handlePolygonComplete`): pass the computed value as the
   native prompt default —
   `prompt('Enter parcel designation …', nextDesignation(lastDesignation()))`.

2. **Quick Parcel Builder** (inline `parcelDesignation` field): a watcher on
   `selectedPoints.length` pre-fills the field with `nextDesignation(...)` the
   moment the user starts selecting points for a new parcel **and** the field is
   empty. After a save, `clearSelection` empties the field; the watcher re-fills
   it on the next selection.

`lastDesignation()` reads `parcels.value[parcels.value.length - 1]?.designation ?? ''`.

## Testing

Unit test `app-frontend/src/utils/__tests__/parcelNumbering.test.ts` covering:
prefix, plain number, alpha suffix, zero-padding, no-digits, empty/nullish. The
Vue wiring (prompt default + watcher) is not separately tested — it is a one-line
default and a small watcher over the pure helper.

## Out of scope (YAGNI)

- Cross-session / database max-number lookup.
- Gap filling (e.g. 314, 316 → 315).
- A new modal component (existing prompt + inline field are pre-filled in place).
