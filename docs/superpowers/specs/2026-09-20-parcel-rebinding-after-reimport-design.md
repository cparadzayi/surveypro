# Re-binding parcels to re-imported coordinates

**Date:** 2026-09-20
**Status:** design for review — no code written

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

### Materiality: SI 727 Second Schedule, para 7(1)

Para 7(1) governs the acceptance of a previous survey's co-ordinates under s.15(1) — precisely
the question being asked when a stored vertex meets a re-imported coordinate for the same beacon.
It is already the paragraph this codebase uses for found-beacon comparison, and deliberately not
para 5 (looser, and about a ground distance against the same survey's own co-ordinates) nor
para 7(2) (the angle subtended at a beacon).

```
allowable difference (m) = factor · √(0.075·f + 0.00015·f²)      f = shorter line length, metres
  class B  factor 0.01
  class C  factor 0.02
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

Class comes from the project. Where it is unknown, `si727Tolerances.js` already defaults to
class B, the tighter of the two; this design keeps that default and records the assumption on the
report rather than silently widening to C.

### Identity: name first, coordinates only as fallback

1. **By name.** Look up the vertex's stored `id` among the re-imported points. A hit is
   conclusive — no tolerance, no ambiguity, however far the beacon has moved.
2. **By position, only when the name is absent** (the beacon was renamed or dropped). Take the
   nearest re-imported point, and accept it only if it is **unambiguously** nearest: the
   second-nearest must be at least three times further away. This replaces the fixed radius with
   a separation test, so a match cannot silently pick the wrong peg in a dense network.
3. **Otherwise the vertex is unmatched**, and is reported. It is never guessed at.

## Behaviour

Re-binding runs after a CSV import, when the project has parcels whose vertices can be
reconciled. It is a **proposal**, not an automatic mutation: it computes the whole change set,
presents it, and writes nothing until the surveyor accepts.

For each parcel, for each stored vertex:

| Case | Outcome |
|---|---|
| Name found, moved ≤ para 7(1) | **Snap silently.** Within the limit the two co-ordinates are the same position in law. |
| Name found, moved > para 7(1) | **Snap, but report it.** Listed with old position, new position, distance moved, and the limit it exceeded. |
| Name absent, unambiguous nearest | **Adopt that beacon's name and position, and report it** as a rename. |
| Name absent, ambiguous or nothing near | **Unmatched.** Vertex left untouched, parcel flagged, reported. |

**Snapping is the point.** A vertex that adopts a new beacon name while keeping its old
co-ordinates would leave the area computed from superseded positions while the document cites
current beacons — a quieter and worse failure than an obvious break. A re-import exists precisely
because co-ordinates changed; the geometry must follow or it is stale by construction.

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

A report before anything is written, and it is the gate — nothing is applied until it is
accepted:

- Per parcel: area before, area after, the difference in m² and as a percentage.
- Every vertex that moved beyond its para 7(1) limit: beacon, old position, new position,
  distance, limit, and the shortest line the limit was derived from.
- Every rename adopted by position.
- Every unmatched vertex, and the parcels held back because of them.
- The survey class used, stated explicitly, including when it was defaulted.

Area changes flow into the Schedule of Areas, the plan and the diagram. A surveyor signs those,
so the change belongs in front of them, not in a log line.

## Scope

**In:** the re-binding proposal, the report, the accept path, geometry rewrite, closure
recomputation, the per-beacon para 7(1) tolerance.

**Out, and deliberately:**

- **Changing what reset deletes.** Reset keeps its current behaviour. This design makes the state
  it produces recoverable, which is the better answer than making reset more destructive.
- **Automatic re-binding on import.** Silent geometry changes to a lodged record are not
  acceptable, however good the matcher is.
- **The 0.5 m matcher in `MapLibreAreaView.vue`** (and the separate 2.0 m one at line 6388 in the
  same file). Two different tolerances for the same job is a real smell and worth a follow-up,
  but changing live digitising behaviour is not in this change's blast radius.

## Risks

1. **Snapping moves a boundary.** That is the intended effect, but it is a boundary in a legal
   record, and a neighbour may care. Mitigated by the report being a gate rather than a summary,
   and by reporting every move that exceeds the statutory limit individually.
2. **A beacon renamed *and* moved** matches neither by name nor unambiguously by position, so its
   parcel is held back. Correct — that is genuinely ambiguous and belongs with the surveyor — but
   it means a badly renamed import can hold back many parcels at once. The report must make the
   pattern obvious rather than listing fifty vertices.
3. **Class defaults to B.** Tighter, so it over-reports rather than under-reports. The failure
   direction is right, but a class C survey would show many "exceeds limit" entries that are in
   fact acceptable. Stating the class on the report is what makes that legible.
4. **`cape_lo_points` is metadata, not a column**, so nothing at the database level guarantees it
   matches `geom`. This design reads and rewrites both together; anything else that edits one
   without the other would break the pairing. Worth a follow-up to reconcile them, out of scope
   here.

## Open questions for review

1. **Is snapping right, or should a move beyond para 7(1) block rather than report?** This design
   reports and lets the surveyor accept. The stricter alternative refuses to re-bind that parcel
   at all and requires re-digitising.
2. **Should re-binding be offered automatically after an import that finds standing parcels, or
   invoked explicitly from the parcel screen?**
3. **Class B default** — acceptable, or should the project carry an explicit survey class before
   this feature can run at all?
