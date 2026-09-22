# Re-binding parcels to re-imported coordinates

**Date:** 2026-09-20
**Status:** reviewed; decisions recorded 2026-09-20 — no code written

## Problem

Resetting the CSV import deletes a project's coordinate points but leaves its land parcels
standing. The project is then in a state it should not be able to reach: parcels whose vertices
refer to beacons that no longer exist. Observed on project 20 (`brackenhurst_september-2026`),
which has 4 parcels and 0 coordinate points. The Survey Plan draws the outlines and nothing else
— no beacons, no labels — and `/survey-plan/preview` returns 404 because its handler requires at
least one coordinate point.

Re-importing restores the points, but nothing currently reconciles the standing parcels with
them. That reconciliation is what this design specifies.

The alternative — having reset delete the parcels too — was rejected. Digitising is the
expensive work; the coordinates are cheap to re-import. Throwing away the parcels to avoid an
inconsistency is the wrong trade.

## What already exists

Three things make this far smaller than it first appears. Each was verified against the running
database, not assumed.

**Parcels store their vertices WITH beacon names.** `land_parcels.metadata.cape_lo_points` is an
array of `{ id, y, x, status, description }`, where `id` is the beacon name:

```json
{ "id": "SD6", "y": -85723.4, "x": 2144076.45, "status": "P", "description": "12mm iron peg in concrete" }
```

So identity does not have to be re-derived from coordinates. The parcel already knows which
beacons it was built from.

**Areas are generated columns.** `area_m2`, `area_ha` and `perimeter_m` are
`GENERATED ALWAYS AS (ST_Area(geom))` and friends. Change `geom` and they follow with no
application code. `closure_error_m` and `closure_ratio` are `NEVER` generated — those are stored
at digitise time and must be recomputed explicitly.

**The statutory tolerance kernel is already implemented.** `app-shared/si727Tolerances.js` carries
the Second Schedule limits, shared by the backend write doors and the frontend, and pinned by
`si727.test.ts`.

## The tolerance

### Identity and materiality are different questions

The existing vertex matcher in `MapLibreAreaView.vue` uses a flat **0.5 m** radius to decide
which beacon a vertex belongs to. That number governs identity, and it is far too loose to
govern anything else: SI 727 would call two positions 0.5 m apart demonstrably different. Using
one number for both questions is the mistake to avoid here.

- **Identity** — is this the same physical beacon? A re-surveyed beacon may legitimately move
  well beyond any statutory limit and still be the same peg in the ground.
- **Materiality** — has it moved far enough that the surveyor must see and approve the change?

This design answers identity by **name** and materiality by **statute**.

### Materiality: SI 727 Second Schedule, para 7(5) — Limits of Error (distances)

Para 7(5) (Limits of Error) sets the class-by-class distance tolerance used when comparing a
re-determination against stored co-ordinates — precisely the question being asked when a stored
vertex meets a re-imported coordinate for the same beacon, and the same paragraph the found-beacon
comparison and the bnr-part8 duplicate adjudication use. Corrected 2026-09-21: earlier drafts cited
para 7(1) acceptance with factors 0.01/0.02 (a misreading); the Limits of Error are 0.04/0.06 with
the 0.075 coefficient the Second Schedule prescribes. Para 7(2) (the angle
subtended at a beacon) is a different test we do not use here.

```
allowable difference (m) = factor · √(0.075·f + 0.00015·f²)      f = shorter line length, metres
  class B  factor 0.04
  class C  factor 0.06
```

Para 7(1) bounds a **line**, not a point. A beacon that moves by δ changes every line at that
beacon by up to δ, so the binding constraint is its **shortest** line. Hence:

> **Positional tolerance at beacon P = `distanceToleranceM(fₘᵢₙ, class)`**, where `fₘᵢₙ` is the
> distance from P to the nearest other survey beacon, and `class` is the project's survey class.

This is per-beacon and needs no new constant: it calls the existing function. Representative
magnitudes, for sanity-checking the implementation:

| shortest line at the beacon | class B | class C |
|---|---|---|
| 10 m | 8.7 mm | 17.5 mm |
| 20 m | 12.5 mm | 25.0 mm |
| 50 m | 20.3 mm | 40.6 mm |
| 100 m | 30.0 mm | 60.0 mm |
| 300 m | 60.0 mm | 120.0 mm |

So for typical township geometry (20–60 m lines) the threshold lands around **12–22 mm class B**
and **25–45 mm class C** — between 20 and 40 times tighter than the 0.5 m currently in use.

### The survey class is carried by the project, explicitly

Decided 2026-09-20: the project records its own survey class, and re-binding will not run without
one.

`si727Tolerances.js` currently defaults to class B when asked for an unknown class. That default
is right for a library — B is the tighter of the two, so it errs toward reporting — but it is
wrong as the basis for a decision that refuses a surveyor's parcels. A class C survey judged
against class B limits would be refused for discrepancies that are perfectly acceptable, and the
surveyor would have no way to see why. Guessing the class and disclosing the guess is worse than
requiring it: the guess is silently load-bearing either way.

So this brings a small piece of work of its own, in the shape of the assistant/instruments change
that preceded it:

- **Migration**: `survey_class` on `survey_projects`, a nullable `VARCHAR(1)` constrained to
  `'B'` or `'C'`. Nullable because existing projects have none, and this feature must say so
  rather than assume. Per the established pattern, the migration alters every surveyor schema AND
  redefines `create_surveyor_schema()` so projects created afterwards carry the column.
- **API and model**: `surveyClass` accepted and returned; the column added to `SurveyProject`'s
  `allowedColumns`, without which `update()` drops it silently.
- **Project setup**: a Class B / Class C selector. Paras 7 and 8 define only those two — class A
  genuinely does not exist for this test — so it is a two-way choice, not a free field.
- **Re-binding**: refuses to run at all on a project with no class, with a message pointing at
  project setup. It does not fall back to B.

Whether the class should become **required** for all new projects, rather than just for
re-binding, is a separate question about project setup and is not decided here.

### Identity: name first, coordinates only as fallback

1. **By name.** Look up the vertex's stored `id` among the re-imported points. A hit is
   conclusive — no tolerance, no ambiguity, however far the beacon has moved.
2. **By position, only when the name is absent** (the beacon was renamed or dropped). Take the
   nearest re-imported point, and accept it only if it is **unambiguously** nearest: the
   second-nearest must be at least three times further away. This replaces the fixed radius with
   a separation test, so a match cannot silently pick the wrong peg in a dense network.
3. **Otherwise the vertex is unmatched**, and is reported. It is never guessed at.

## Implementation note: the two coordinate conventions do not agree

`metadata.cape_lo_points` names its axes the way a surveyor does — `y` is the westing
(≈ -85 723) and `x` the southing (≈ 2 144 076). PostGIS names them the other way round, so for
the same beacon:

```
ST_X(geom)  ==  cape_lo_points.y      (westing)
ST_Y(geom)  ==  cape_lo_points.x      (southing)
```

Comparing `y` to `ST_Y` therefore does not produce a small error. Verified on project 20: it
reports every beacon as having moved about **3 153 km**, because the discrepancy is the gap
between the two magnitudes, taken twice. A displacement that large is obvious; one derived from a
subtler mistake in the same family would not be.

Every comparison and every geometry rewrite in this feature crosses that boundary, so the mapping
belongs in one helper with the pairing asserted in a test, rather than being re-derived at each
call site.

## Behaviour

Re-binding is **invoked explicitly from the parcel screen** (decided 2026-09-20). It does not run
automatically after an import: silently reshaping a lodged record's geometry is not something a
surveyor should discover after the fact. It computes the whole change set, presents it, and
writes nothing until accepted.

For each parcel, for each stored vertex:

| Case | Outcome |
|---|---|
| Name found, moved ≤ para 7(1) | **Snap.** Within the limit the two co-ordinates are the same position in law. |
| Name found, moved > para 7(1) | **Refuse the parcel.** It is reported and left untouched; the surveyor re-digitises it. |
| Name absent, unambiguous nearest | **Adopt that beacon's name and position**, and report it as a rename. |
| Name absent, ambiguous or nothing near | **Refuse the parcel.** Reported, left untouched. |

**Refusal rather than snapping, for any beacon that moved beyond the statutory limit** (decided
2026-09-20). The earlier draft proposed snapping such a vertex and reporting it for approval. The
stricter rule is better, for a reason that only becomes clear once it is adopted:

> If a parcel is refused whenever ANY of its vertices exceeded para 7(1), then every parcel that
> does re-bind has all of its vertices within the limit — and a set of sub-tolerance shifts
> cannot materially change an area. The whole class of "this re-bind quietly moved a boundary"
> failures disappears by construction rather than by review.

Snapping survives only for within-tolerance vertices, where it is a refinement rather than a
change: it keeps the parcel consistent with the current coordinate set for future comparisons,
and cannot move the boundary in any sense the Schedule recognises.

A beacon that genuinely moved further than para 7(1) allows has been re-surveyed, not re-measured.
The parcel built on it is a statement about the old position. Re-digitising is the honest response,
and it is what a surveyor would do on paper.

After the vertices settle, per parcel:

1. Rebuild `geom` from the updated vertex ring. `area_m2`, `area_ha` and `perimeter_m` regenerate
   on their own.
2. Recompute `closure_error_m`, `closure_ratio` and the residuals in `metadata.closure` — these
   are stored, not generated, and would otherwise describe the old geometry.
3. Rewrite `metadata.cape_lo_points` with the new names and positions.
4. Stamp `metadata.rebound_at` and the reason, matching the existing `recomputed_at` /
   `recomputed_reason` convention already in that object.

**A parcel with any unmatched vertex is not written at all.** Partially re-bound geometry is
worse than untouched geometry: it mixes two surveys in one ring. It is reported and left alone.

## What the surveyor sees

A report before anything is written, and it is the gate — nothing is applied until it is accepted.
Refusal makes this lighter than the earlier draft: no accepted parcel can have moved materially,
so the report is about what was NOT done at least as much as what was.

- **Parcels refused, and why**: the beacon, how far it moved, the para 7(1) limit it exceeded, and
  the shortest line that limit was derived from. These need re-digitising.
- **Parcels re-bound**: area before and after. Expected to be identical or to differ only in the
  last decimal; anything larger is a defect in this feature, not a finding about the survey, and
  the report should make that reading obvious.
- **Renames adopted by position**, with the old and new names.
- **The survey class used**, and the project it was read from.

Area changes flow into the Schedule of Areas, the plan and the diagram, which a surveyor signs.

## Scope

**In:** the re-binding proposal, the report, the accept path, geometry rewrite, closure
recomputation, the per-beacon para 7(1) tolerance, and the `survey_class` project field that
tolerance depends on (migration, API, project-setup selector).

**Out, and deliberately:**

- **Changing what reset deletes.** Reset keeps its current behaviour. This design makes the state
  it produces recoverable, which is the better answer than making reset more destructive.
- **Automatic re-binding on import.** Decided 2026-09-20: invocation is explicit, from the parcel
  screen. Silent geometry changes to a lodged record are not acceptable, however good the matcher.
- **Making `survey_class` mandatory for every project.** Re-binding requires it; whether project
  setup should refuse without it is a separate decision.
- **The 0.5 m matcher in `MapLibreAreaView.vue`** (and the separate 2.0 m one at line 6388 in the
  same file). Two different tolerances for the same job is a real smell and worth a follow-up,
  but changing live digitising behaviour is not in this change's blast radius.

## Risks

1. **Refusal is the common case on a corrected re-import.** If the re-import exists because
   co-ordinates were adjusted, many beacons may exceed para 7(1) and most parcels will be refused
   — which is correct, but it means the feature can legitimately do almost nothing and still have
   worked. The report has to make that outcome legible rather than reading as a failure, or a
   surveyor will reasonably conclude the tool is broken.
2. **A beacon renamed *and* moved** matches neither by name nor unambiguously by position, so its
   parcel is held back. Correct — that is genuinely ambiguous and belongs with the surveyor — but
   it means a badly renamed import can hold back many parcels at once. The report must make the
   pattern obvious rather than listing fifty vertices.
3. **A wrong survey class silently changes every verdict.** Class B limits are half class C's, so
   a class C survey recorded as B would have parcels refused for acceptable discrepancies, and a
   B recorded as C would have parcels accepted that should not be. Requiring the class rather than
   defaulting it removes the silent case; what remains is ordinary data entry, and the report
   states the class it used so a mistake is visible in the output rather than only in its effects.
4. **`cape_lo_points` is metadata, not a column**, so nothing at the database level guarantees it
   matches `geom`. This design reads and rewrites both together; anything else that edits one
   without the other would break the pairing. Worth a follow-up to reconcile them, out of scope
   here.

## Decisions

All three questions this design opened were answered on 2026-09-20, and the body above reflects
the answers rather than the original proposals.

1. **A move beyond para 7(1) refuses the parcel; it does not snap and report.** The surveyor
   re-digitises. This is stricter than the first draft and turned out to simplify the design:
   because no accepted parcel can contain a beyond-tolerance vertex, no accepted parcel can have
   moved materially, so a whole class of failure is excluded by construction rather than caught by
   review.
2. **Re-binding is invoked explicitly from the parcel screen**, not offered automatically after an
   import.
3. **The project carries an explicit survey class.** Re-binding refuses to run without one rather
   than defaulting to B, which adds a migration, an API field and a project-setup selector to this
   change's scope.

## Open questions

None outstanding. One deliberate non-decision is recorded above: whether `survey_class` should be
mandatory for all new projects, or only required by the features that depend on it.
