# SI 727 Weighting (σ₀) + Edge Compliance — Design

**Date:** 2026-05-25
**Status:** Approved (design)
**Component:** `app-frontend` — Lite → Beacon Comparison (`/modules/lite/compare`)

## Purpose

Strengthen the beacon comparison / least-squares adjustment with the Zimbabwe SI 727
comparison-sketch logic, in two complementary ways:

- **(A) Principled a-priori σ₀** derived from the survey class, replacing the
  hand-typed value, so the chi-square test becomes defensible.
- **(B) Edge (ray) compliance** check: per inter-beacon line, test the distance
  difference and the swing-residual direction difference against the SI 727
  class B/C tolerances, and report pass/fail — an independent regulatory check
  alongside the statistical W-test.

The core `helmertLS` / `iterativeAdjust` are NOT changed (equal-weight LS retained);
we change only where σ₀ comes from and ADD the edge computation + reporting.

## Decisions (from brainstorming)

- (A) = **scalar class-derived σ₀** (no differential per-point weighting — the two
  coordinate sets carry no information to weight beacons differently). The W-test
  uses the a-posteriori s0 and is unchanged; σ₀ affects the chi-square test only.
- Survey class: **B/C selector, default B.**
- Edge set: **all pairs among ACCEPTED beacons.**
- Edge role: **independent compliance check** — the W-test alone decides
  accept/reject; the edge table corroborates and provides the SG-regulatory result.

## Expert basis

- **Swing-residual** matches standard LS Helmert practice: estimate parameters
  (incl. rotation = swing), then test residuals *after* applying the transform
  (data snooping). (Helmert transformation literature; J. Geodesy.)
- **σ₀ from tolerance** uses tolerance = k·σ plus error propagation
  σ_d ≈ √2·σ_pos ⇒ σ_Δd ≈ 2·σ_pos. Modern standards (ICSM SP1, ICSM spatial-cadastre
  standard, FGDC) express tolerances at the **95 % confidence level**, which for a
  **2-D positional** quantity is ≈2.45σ ⇒ DIV ≈ 2.45 × 2 ≈ **5**. SI 727 (1979)
  does not state its statistical basis, so DIV defaults to 5 ("95 % 2-D"),
  is documented, and remains adjustable; σ₀ stays editable.

## SI 727 formulas

- Distance allowable difference: `Δd_allow = factor · √(0.075·f + 0.00015·f²)`,
  `factor` = 0.01 (class B) / 0.015 (class C), `f` = length (m) of the **shorter**
  of the two compared lines.
- Direction allowable difference: `T_allow = K / (S + 300)` arc-seconds,
  `K` = 15000 (class B) / 45000 (class C), `S` = ray length (m).

## Architecture

### New module: `app-frontend/src/utils/si727.js` (pure — no jsPDF/Vue)

```js
export const SI727_CLASS = {
  B: { distFactor: 0.01,  dirK: 15000 },
  C: { distFactor: 0.015, dirK: 45000 },
}
export function distanceToleranceM(f, cls)       // factor·√(0.075f + 0.00015f²)
export function directionToleranceArcsec(S, cls) // K/(S+300)
export function distanceBetween(a, b)            // hypot(ΔY, ΔX) on {yX or yS/xS supplied by caller}
export function medianPairwiseDistance(points, useSurvey=false)
export function suggestedSigma0(points, cls, div = 5)  // see below
export function edgeCompliance(points, cls, swingDeg)  // see below
```

Reuses `bearingSouth(dY, dX)` from `surveyMath.js`. Pure → Node-testable.

### (A) σ₀ derivation

```
L  = medianPairwiseDistance(points)            // historical coords; network scale
σ₀ = distanceToleranceM(L, cls) / div          // div default 5  ("95% 2-D")
```
`L` is computed from ALL input beacons (stable to dropping 1–2). The result is the
suggested a-priori σ₀ (metres); the operator may override it in the σ₀ field.

### (B) edgeCompliance(points, cls, swingDeg)

For every unordered pair (i, j) of ACCEPTED beacons:
```
dH  = distanceBetween(hist_i, hist_j)          // historical coords
dS  = distanceBetween(surv_i, surv_j)          // survey coords
dDiff   = dS - dH
f       = min(dH, dS)
dAllow  = distanceToleranceM(f, cls)
distOk  = |dDiff| <= dAllow

brgH = bearingSouth(yHj - yHi, xHj - xHi)       // S-oriented
brgS = bearingSouth(ySj - ySi, xSj - xSi)
dirDiffRaw = wrapDeg(brgS - brgH)               // to (-180,180]
dirResidualSec = (dirDiffRaw - swingDeg) * 3600 // remove common swing → arc-sec
dirAllowSec = directionToleranceArcsec(dH, cls) // S = historical ray length
dirOk = |dirResidualSec| <= dirAllowSec
```
Returns `{ rows:[{ from, to, dH, dS, dDiff, dAllow, distOk, dirResidualSec, dirAllowSec, dirOk, pass }], summary }`.
`summary` = `{ totalLines, distPass, dirPass, bothPass, meanScale, meanSwingDeg }`
where `meanScale` = mean(dS/dH) and `meanSwingDeg` = mean(dirDiffRaw) over lines that
pass BOTH checks (cross-check against the Helmert scale/rotation).

`swingDeg` = the Helmert rotation `result.adj.params.rotDeg`.

### Wiring

- **`surveyAdjustmentStore.js`:** add `surveyClass` ref (default `'B'`) and
  `sigma0Auto` flag (true until the user edits σ₀). `compute()`:
  1. if `sigma0Auto`, set `sigma0 = suggestedSigma0(points, surveyClass)`;
  2. run `iterativeAdjust(points, critW, sigma0)` (unchanged);
  3. if converged, attach `edges = edgeCompliance(acceptedPts, surveyClass, adj.params.rotDeg)`
     to the result object.
- **`CompareView.vue`:** add a **Survey class** B/C `<select>` in Configuration; the
  σ₀ input shows the suggested value with a "(SI 727 class B @ L=…m)" note and an
  `@input` that sets `sigma0Auto = false`; add an **"Edge compliance"** tab rendering
  the table + summary (rejected-failing rows tinted).
- **`beaconAdjustmentReport.js`:** add an **"SI 727 Edge Compliance"** landscape
  section — per-line table (From, To, dHist, dSurv, Δd, dist-allow, ✓/✗, swing-resid ″,
  dir-allow ″, ✓/✗), a summary line (lines passing; SI 727 mean swing/scale vs Helmert),
  and a footnote stating the tolerance formulas + the σ₀ derivation. All strings
  ASCII/WinAnsi-safe, drawn as discrete single-line `text()` calls (per prior lesson).
  Pass `surveyClass` + `edges` into the report via `meta`/`result`.

## Error handling / edge cases

- < 3 accepted beacons never reaches edgeCompliance (adjustment won't converge).
- Degenerate/duplicate beacons → `dH` or `dS` = 0 → `f = 0` → `distanceToleranceM(0)=0`;
  guard so a zero-length line is skipped (not a divide-by-zero; just excluded with a note).
- `dirDiffRaw` wrapped to (−180, 180] before removing swing; swing also wrapped.
- σ₀ derivation guards `L > 0`; if all points coincide, fall back to the existing
  default 0.010 and flag.

## Verification

1. `si727.js` Node assertion check: tolerance values at known lengths (e.g. class B,
   f=100 ⇒ Δd_allow = 0.03 m; f=1000 ⇒ 0.15 m; dir B S=300 ⇒ 25″), σ₀ derivation,
   and a hand-computed 3-point edge case (incl. a deliberately failing line).
2. `npm run build` green.
3. One CLEAN Edge render (restart `preview` AFTER the build): confirm the class
   selector, suggested σ₀, the on-screen Edge-compliance tab, and the report section
   render, with a known-failing line flagged.

## Files touched

- **New:** `app-frontend/src/utils/si727.js`
- **Edit:** `app-frontend/src/stores/surveyAdjustmentStore.js` (class, σ₀ auto, edges)
- **Edit:** `app-frontend/src/views/modules/lite/compare/CompareView.vue` (class selector, σ₀ note, Edge tab)
- **Edit:** `app-frontend/src/utils/beaconAdjustmentReport.js` (SI 727 edge-compliance section)
- **New (spec):** this document.
