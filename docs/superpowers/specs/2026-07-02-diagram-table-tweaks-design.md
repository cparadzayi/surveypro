# Diagram Table Tweaks — Design

**Status:** Approved (design phase)
**Date:** 2026-07-02
**Author:** cparadzayi (with Claude)

## Problem

Three refinements to the S.G. Diagram coordinate table (verified against the
STANDS 403-405 sample):

1. **Directions resolution.** Directions must be banker's-rounded to the nearest
   **10″ when the side distance < 6000 m**, else to the nearest **1″** (SI 727).
   Today `sidesTable.toDMS` always rounds to 1″, so e.g. `AB 322 18 31` should read
   `322 18 30`.
2. **"Const." column.** Add a **far-right column headed "Const."** carrying the
   actual beacon name for each vertex. Keep the existing `Const. 0.00 0.00` row.
3. **Beacon names from data.** The names (e.g. A→86B, B→87B, C→SD1, D→SD5, E→SD4)
   come **automatically** from the beacon data by matching each vertex to its
   beacon; blank if no beacon matches.

## Scope

- Diagram plan type only (`diagram/sidesTable.js`, new `diagram/beaconName.js`,
  and `drawTable` in `diagramPdf.js`). No General/Working/DXF change.
- Keep the `Const. 0.00 0.00` row where it is (full coordinates unchanged).

## Non-goals (YAGNI)

- No change to coordinate values (still full, signed, 2 dp), the figure, or any
  other table column's meaning.
- No manual beacon-name entry UI — names are resolved from the beacon data.

## Architecture

### 1. Directions rounding — `diagram/sidesTable.js`

Import `roundBearingSouth` from `../../utils/zim-geo.js` (already does banker's,
distance-agnostic resolution). In `buildSidesTable`, round each side's direction to
its resolution **before** formatting:

```js
const res = Number(s.distance) < 6000 ? 10 : 1
const { d, m, s: sec } = toDMS(roundBearingSouth(s.bearingDeg, res))
```

`toDMS` is unchanged (its own 1″ banker's rounding is a no-op on an already-10″-rounded value).

### 2. Beacon-name resolution — new pure helper `diagram/beaconName.js`

```
resolveVertexBeaconName(vertexYX, beacons, tolM = 0.5) => string
```

- `vertexYX` = `[y, x]` canonical `[Westing, Southing]` metres (a subject vertex).
- `beacons` = the `options.beacons` FeatureCollection (Point features).
- Normalizes each beacon coordinate via `normalizeCapeLoYX` (from
  `../pdfkitGeoPDF/geometry.js`), computes planar distance to `vertexYX`, and
  returns the **name** (`properties.name ?? properties.beacon_name ?? properties.id`,
  as a string) of the nearest beacon within `tolM` metres; `''` if none.

### 3. `sidesTable.buildSidesTable(geometry, beacons)`

Add a `beacons` parameter. Each `coordinateRow` gains `beaconName`:

```js
export function buildSidesTable(geometry, beacons) {
  const constRow = { y: '0.00', x: '0.00' }
  const coordinateRows = geometry.vertices.map(v => ({
    letter: v.letter,
    y: signed(v.y),
    x: signed(v.x),
    beaconName: resolveVertexBeaconName([v.y, v.x], beacons),
  }))
  // sideRows: distance-based rounding (section 1)
  …
}
```

Its caller in `diagramPdf.js` becomes `buildSidesTable(geometry, options.beacons)`.

### 4. Table layout — `drawTable` in `diagramPdf.js`

Add the far-right **"Const." column** (header + a beacon name on each vertex row),
keeping the `Const. 0.00 0.00` row. The A4 content box is narrow and the
`DIAGRAM S.G. No.` box occupies the top-right (`layout.sgNoBox.x ≈ R.x + 353` on
A4), so all seven data columns plus the name column must fit **left of** that box.

Re-space the columns (offsets relative to `R.x`, starting point; final spacing is a
**manual-visual acceptance item** — tune so the `Const.` values sit clear of the
`DIAGRAM S.G. No.` box on A4, and nothing collides on A3):

| Column | x (from R.x) |
|--------|--------------|
| SIDES / side label | 0 |
| Metres | 28 |
| DIRECTIONS | 76 |
| Lo NN / vertex letter | 158 |
| Y | 198 |
| X | 260 |
| **Const. (beacon name)** | 330 |

Header row: `SIDES`(0), `DIRECTIONS`(76), `loLabel`(158), `CO-ORDINATES`(198),
`Const.`(330), `DIAGRAM S.G. No.`(`layout.sgNoBox.x`). Sub-header: `Metres`(0),
`° ' "`(76), `Y`(198), `X`(260). The `Const.` beacon name is drawn on each
coordinate row at x=330. The `Const. 0.00 0.00` row keeps its label at the vertex
column (158) with values at Y(198)/X(260).

If, on A4, the `Const.` header (330) crowds the `DIAGRAM S.G. No.` header, drop the
font of the name column to 6 pt and/or nudge X/Const left — verified visually.

## Error handling / edge cases

- No beacon within tolerance → `beaconName = ''` (blank cell).
- `beacons` missing/empty → all beacon names blank; table still renders.
- Beacon coordinate order handled by `normalizeCapeLoYX` (same as vertices).

## Testing

- `sidesTable.js` (Jest): a side with distance < 6000 rounds its direction to the
  nearest 10″ (e.g. bearing giving `322 18 31` → `322 18 30`); a side ≥ 6000 rounds
  to 1″. `coordinateRows[i].beaconName` is populated from a matching beacon and `''`
  when none matches.
- `beaconName.js` (Jest): nearest beacon within tolerance returns its name; outside
  tolerance returns `''`; empty/missing beacons returns `''`.
- `diagramPdf.test.js`: still emits a valid `%PDF-` with `beacons` carrying names.
- Manual visual acceptance: regenerate the STANDS 403-405 diagram — directions to
  10″, a right-hand `Const.` column reading `86B / 87B / SD1 / SD5 / SD4`, the
  `Const. 0.00 0.00` row retained, no collision with the S.G. No. box on A4 or A3.

## Rollout

Single spec + plan. Order: `beaconName.js` + `sidesTable` rounding/beaconName (TDD)
→ `drawTable` layout (visual) → manual visual. Diagram-only.
