# Robust Transformation Workflow — Design

**Date:** 2026-05-26
**Status:** Approved (design)
**Component:** `app-frontend` — Lite → Beacon Comparison (`/modules/lite/compare`)

## Purpose

Close the gaps between the current adjustment and a rigorous robust-estimation
workflow, so the Beacon Comparison tool follows the recognised 5-step procedure:

1. **Initial robust fit** — Danish (Krarup) IRLS, so gross blunders don't bias the parameters.
2. **Outlier flagging** — data snooping on the *robust* residuals (σ̂₀-standardised), with the rigorous cofactor W-test applied to the final clean fit.
3. **Clean dataset** — drop confirmed outliers; re-fit.
4. **Final LS + quality** — standard OLS on the clean set; report σ̂₀, χ², **parameter standard errors**, and **per-beacon redundancy numbers**.
5. **Transformation & validation** — apply the parameters to the historical data (already done) and add **automated leave-one-out (LOO) cross-validation** as an independent accuracy check.

Decisions (from brainstorming): robust method = **Danish (Krarup) IRLS**; validation =
**automated LOO** (no manual check points, no human interaction); statistics =
**full** (SEs + redundancy); model stays **2-D 4-parameter** (Cape Lo plane — the 3-D
7-parameter Helmert is out of scope and not applicable to plane coordinates).

## Conventions (carried)

Cape Lo P(Y, X): Y = Westing, X = Southing. 4-parameter conformal Helmert with
unknowns `x = [TY, TX, a, b]`, `scale = √(a²+b²)`, `rotation θ = atan2(b, a)`,
coordinates reduced to the historical centroid `(yc, xc)` for conditioning. South-oriented
bearings. The W-test critical value `critW` (1.960 / 2.576 / 3.291) is reused as the
Danish cutoff `c` — no new input.

## Architecture (`app-frontend/src/utils/surveyMath.js`)

### 1. Weighted `helmertLS(points, weights)`

Extend the existing function with an optional per-observation weight vector
`weights` (length 2n; one for the Y row and one for the X row of each point;
default all 1 → identical to today).

- Normal equations: `N = AᵀWA`, `x = N⁻¹ AᵀW l`, `W = diag(weights)`.
- Residuals `v = A x − l` (unchanged).
- `σ̂₀ = √( Σ wᵢ vᵢ² / DOF )`, `DOF = 2n − 4`.
- Residual cofactor diagonal `q_vv,i = (1/wᵢ) − (A N⁻¹ Aᵀ)_ii` (clamped ≥ 1e-14).
  W-test: `wᵢ = |vᵢ| / (σ̂₀ √q_vv,i)`. (For `weights = 1`, `q_vv,i = 1 − (A N⁻¹ Aᵀ)_ii`,
  i.e. the current `diagQvv` and current W-test — fully backward-compatible.)
- **New return fields:** full parameter covariance `Cxx = σ̂₀² · N⁻¹` (4×4) and the
  redundancy diagonal `r = q_vv · w` (for `weights = 1`, `r_i = q_vv,i = diagQvv_i`).

### 2. `danishFit(points, c)` — robust pre-fit (Step 1)

Iteratively-reweighted LS:
```
weights = all 1
repeat (max 10):
  fit = helmertLS(points, weights)
  ū_i = |fit.v_i| / fit.σ̂₀                       // σ̂₀-standardised residual
  w_i' = 1            if ū_i ≤ c
       = exp(−(ū_i/c)²)  otherwise               // Krarup down-weighting
  stop when max|w_i' − w_i| < 1e-3
  weights = w_i'
return { params: fit.params, v: fit.v, sigma0: fit.σ̂₀, weights, iterations, log }
```
`c = critW`. The σ̂₀-only standardisation (no cofactor in the loop) is the stable,
deterministic Danish variant — its sole job is to drive gross blunders toward zero
weight so the parameters are unbiased; rigorous flagging uses the W-test below.

### 3. `looResiduals(points)` — LOO cross-validation (Step 5)

For each point i in the clean set (requires ≥ 4 clean points so ≥ 3 remain):
```
p_i = helmertLS(points without i).params
(yT, xT) = helmertApply(p_i, yH_i, xH_i)
looY = yT − yS_i ; looX = xT − xS_i ; looDist = hypot(looY, looX)
```
Return `{ rows:[{id, name, looY, looX, looDist}], rmsLoo, maxLoo }`
(`rmsLoo = √(mean(looDist²))`). If < 4 clean points, return `{ rows:[], rmsLoo:null, maxLoo:null, note:'too few points for LOO' }`.

### 4. Reworked `iterativeAdjust(points, critW, sig0)` pipeline

Same signature (store unchanged). New internal flow:
1. **Robust fit:** `rob = danishFit(points, critW)`.
2. **Flag (Step 2):** flag a beacon REJECT where its **σ̂₀-standardised robust
   residual** `ūᵢ = |vᵢ| / rob.σ̂₀ > c` on either coordinate (equivalently, its Danish
   weight fell below `exp(−1) ≈ 0.37`) — i.e. data snooping on the *robust* residuals.
   We deliberately do NOT use the cofactor-normalised W-test here: a down-weighted
   blunder has a tiny effective weight, so `1/wᵢ` inflates its residual cofactor and
   *deflates* its W-statistic (re-promotion). The rigorous cofactor W-test runs instead
   on the final equal-weight OLS (step 4 below). Record `danishWeight` per beacon.
3. **Clean + final fit (Steps 3–4):** OLS `helmertLS(survivors)` (weights = 1).
4. **W-test backstop:** if any survivor's `wMax > critW`, reject the worst and re-fit;
   repeat (the existing loop) — guarantees a clean standard adjustment.
5. **Quality:** from the final fit compute parameter SEs (below), attach per-beacon
   redundancy `r`, keep σ̂₀ + χ² (existing), and run `looResiduals(survivors)`.
6. Attach transformed coords (existing `yT/xT/tv*`) to all points.

Returns the existing shape plus: `adj.params.se = { TY, TX, scale, ppm, rotSec }`,
`adj.loo = { rows, rmsLoo, maxLoo }`, `danishLog`, and per-point `redundancy {rY, rX}`
and `danishWeight {wY, wX}`. Rejected beacons keep raw diffs (existing) and are tagged
with their rejection source (`'danish'` or `'wtest'`).

### Parameter standard errors (Step 4)

From `Cxx = σ̂₀²·N⁻¹` (indices `[TY, TX, a, b] = [0,1,2,3]`):
```
σ_TY = √Cxx₀₀ ;  σ_TX = √Cxx₁₁
s = √(a²+b²)
σ_scale = (1/s)·√(a²·Cxx₂₂ + b²·Cxx₃₃ + 2ab·Cxx₂₃)
σ_ppm   = σ_scale · 1e6
σ_θ(rad)= (1/s²)·√(b²·Cxx₂₂ + a²·Cxx₃₃ − 2ab·Cxx₂₃)
σ_rotSec= σ_θ(rad) · 206265
```

### Redundancy numbers (Step 4)

`r_i = q_vv,i` (final OLS, weights = 1). Per beacon `{rY = r[2i], rX = r[2i+1]}`,
with `Σ r_i = DOF`. Interpretation surfaced in the report: `r → 0` = poorly
controlled / not independently checkable; `r → 1` = well controlled.

## Surfacing (no new inputs — keeps it human-interaction-free)

- **Store:** unchanged call; passes the augmented result through.
- **Report (`beaconAdjustmentReport.js`):**
  - *Transformation & Statistics* gains SE rows: `ΔY = … ± σ m`, `ΔX = … ± σ m`,
    `scale = … ± σ (± ppm)`, `rotation = … ± σ″`.
  - New landscape **"Reliability & Validation"** section: per beacon `rY`, `rX`,
    LOO ΔY, LOO ΔX, LOO dist; summary `Σr = DOF`, `RMS-LOO`, `max-LOO`; footnote
    explaining redundancy and LOO. ASCII/WinAnsi-safe; single-line footnotes.
  - The Danish iteration log is appended to the existing data-snooping log section.
- **CompareView:** the Statistics tab shows parameter SEs; a new **"Reliability"** tab
  mirrors the redundancy + LOO table. No new inputs.

## Error handling / edge cases

- `danishFit` non-convergence in 10 iters → use the last iterate (it only seeds flagging).
- All-equal residuals / no outliers → Danish weights stay 1 → behaves like today's OLS.
- < 4 clean beacons → LOO skipped with a stated note (still report the fit + SEs;
  with exactly 4, LOO leaves 3 = minimum, allowed).
- Singular `N` (collinear/duplicate) → `helmertLS` already throws → surfaced as `error`.
- Backstop loop reuses the existing ≤25-iteration guard.

## Verification

1. **Node (pure):** `danishFit` recovers known outliers (a planted gross blunder gets
   weight ≈ 0 and the robust params are unbiased vs the blunder); weighted `helmertLS`
   with weights = 1 reproduces today's results exactly; parameter SEs match a hand-
   computed/analytic case; `looResiduals` gives looDist ≥ in-sample residual; sample
   data still rejects BM 001/BM 004 via the new path.
2. `npm run build` green.
3. Edge render: Reliability & Validation section + SE rows present; no page errors.

## Files touched

- **Edit:** `app-frontend/src/utils/surveyMath.js` (weighted `helmertLS`, `danishFit`,
  `looResiduals`, reworked `iterativeAdjust`, parameter-SE + redundancy outputs).
- **Edit:** `app-frontend/src/utils/beaconAdjustmentReport.js` (SE rows + Reliability/Validation section).
- **Edit:** `app-frontend/src/views/modules/lite/compare/CompareView.vue` (SEs in Statistics tab; new Reliability tab).
- **New (spec):** this document.
- (`si727.js` unchanged — edge compliance stays independent.)
