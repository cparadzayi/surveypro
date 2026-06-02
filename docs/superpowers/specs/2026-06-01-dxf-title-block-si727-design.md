# DXF Title-Block SI 727 Lines — Design

**Date:** 2026-06-01
**Status:** Approved (design)
**Component:** `app-backend` — `services/dxfGenerator.js`
**Part of:** Re-baselining DXF parity against the production PDF generator
(`app-backend/src/services/pdfkitGeoPDF.js`, 14,222 lines). This is the
**second** of six independent sub-projects in that re-baselining; the others
(outside-figure annotation — shipped, beacon enrichment — deferred,
schedule-of-areas multi-column, cartographic label collision avoidance,
multi-sheet tiling) get their own spec → plan → implementation cycles.

## Purpose

The DXF title block already carries the headline material the prior parity
work added — `GENERAL PLAN`, the `metadata.surveyOf` designation, scale,
firm, PLS number, parent property, district, township, plus the full
endorsement zone (SG approval, dispensation certificate, plan number, prior
diagrams, certification). Three SI 727 Seventh Schedule (b) lines that the
PDF emits on every general plan are still missing from the DXF:

1. The templated **figure-description sentence** (e.g. *"The figure M4, M5,
   M6, M7, M8, M9, M4 represents Maglas Township comprising 60 stands
   numbered 1–60 and public places being the whole of Maglas Township of
   Shabani Mine Surface Rights A, situate in the district of Zvishavane."*).
   The DXF currently emits an ad-hoc `Survey of Stands X, Y Township, Z
   District` line instead — readable, but not SI 727-compliant wording.

2. The **"Vide diagram S.G. No. ..."** annotation line — entirely absent
   from the DXF.

3. The conditional **"SHEET N"** label — entirely absent. The DXF generator
   doesn't currently thread `sheetInfo` through its options at all.

Goal: **emit the SI 727 figure-description sentence and the Vide line on
every DXF; emit a "SHEET N" placeholder when the caller signals a
multi-sheet plan**. Plumb `sheetInfo` through `generateDXF()` so sub-project
#6 (multi-sheet tiling) has the channel ready to populate.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Sub-project priority | Title-block SI 727 lines after the outside-figure sub-project; beacon enrichment deferred until the collision-avoidance sub-project ships (constraint circles are dead PDF code; leader lines depend on label-displacement infrastructure that lives in sub-project #4) |
| Which SI 727 lines this sub-project adds | Figure description + Vide line on every plan; SHEET N placeholder only when `sheetInfo.totalSheets > 1` |
| Multi-sheet figure-description variant | Defer to sub-project #6. This sub-project uses the single-sheet `figureDescription.template` always |
| File structure | Approach A — extend `dxfGenerator.js` in place with three pure helpers and a small wrap helper, called inline from the existing title-zone emission |
| Template source | Read `TITLE_BLOCK.figureDescription.template` and `TITLE_BLOCK.vide.template` directly from `app-shared/block-definitions.js` — single source of truth shared with the PDF |
| New layer | None — all new emissions land on the existing `TITLE_BLOCK` layer |
| New warning category | None — missing metadata fields fall back to placeholder text (same as PDF behaviour) |
| Helper return type | `string[]` (one entry per visual line); helpers wrap internally to fit `maxLineChars` |
| `generateDXF()` option | Add optional `sheetInfo?: { sheetNumber: number, totalSheets: number }`; default `null` |
| Route changes | None in this sub-project — `geopdf-vector.js` becomes a passthrough; the frontend wires `sheetInfo` in sub-project #6 |
| DXF version target | R12 (AC1009) unchanged |

## Conventions (carried)

DXF `TEXT` is single-line — no native word-wrap. Wrap is the helper's
responsibility, character-budget-based using `maxLineChars` derived once at
the emission site from the content-area width divided by the chosen
text-height-derived character width.

`addText(layer, x, y, str, h, rotation, style)` is the existing primitive.
The standard inter-line spacing is `h * 1.6`, matching the prior title-zone
lines.

## Architecture

Single file change: `app-backend/src/services/dxfGenerator.js`.

Four structural moves:

1. **Import extension.** The existing import of `app-shared/block-definitions.js`
   for `SI727_SHEET_SIZES` is widened to also pull `TITLE_BLOCK` (and
   `formatStandRanges` if it lives there; see below).

2. **Three pure helpers** added near the top of the file (alongside
   `computeOutsideFigureVertices`):
   - `formatFigureDescription(metadata, outsideFigureData, surveyedParcels, maxLineChars) → string[]`
   - `formatVideLine(maxLineChars) → string[]`
   - `formatSheetLabel(sheetInfo) → string[]`
   Plus one shared utility:
   - `splitToWidth(str, maxChars) → string[]` — word-boundary wrap, no
     mid-word splits, never produces empty entries.

3. **One new `generateDXF()` option** — `sheetInfo` — destructured with
   default `null`. No validation; helper is null-safe.

4. **One new emission block** in the title-zone — three calls in sequence
   after the existing district/portion lines, iterating each helper's
   `string[]` and `addText`-ing each entry with `ty -= h * 1.6` between
   lines. Order:
   - `formatSheetLabel(sheetInfo)` (only emits when multi-sheet)
   - `formatFigureDescription(...)` (centered, body text height)
   - `formatVideLine(...)` (centered, body text height)

## Components

### `formatFigureDescription(metadata, outsideFigureData, surveyedParcels, maxLineChars) → string[]`

Reads `TITLE_BLOCK.figureDescription.template` from
`app-shared/block-definitions.js` and substitutes:

| Placeholder | Source | Fallback when missing |
|---|---|---|
| `{beaconSequence}` | Closed sequence built from `outsideFigureData.edges` joined with `, ` and the first vertex repeated to close (matches PDF's `vertices.sequence`) | `[]` returned (no figure to describe) |
| `{township}` | `metadata.township`, run through title-case (matches PDF's `toTitleCase`) | `"the township"` |
| `{standCount}` | `surveyedParcels.length` | `[]` returned (no stands) |
| `{standRange}` | Compressed range notation over `surveyedParcels.map(s => s.stand)` (e.g. `"1-18, 22, 30-32"`) using a `formatStandRanges()` utility (see note below) | `"-"` |
| `{wholePortion}` | `metadata.wholePortion` | `"the whole"` (PDF's default) |
| `{ofTarget}` | `${township} of ${toTitleCase(metadata.parentProperty)}` when parent set, else `township` | falls back to whatever `township` resolved to |
| `{district}` | `metadata.district`, title-cased | `"the district"` |

**`formatStandRanges` source:** already exported from
`app-shared/block-definitions.js` (line 293). Import alongside `TITLE_BLOCK`
in the same `import` statement. No file moves required.

After substitution the resulting sentence is wrapped via `splitToWidth`
and returned. Single-line short sentences come back as a one-element array.

Returns `[]` when: `outsideFigureData?.edges` is missing or empty;
`surveyedParcels` is empty. Matches PDF's silent-skip behaviour.

### `formatVideLine(maxLineChars) → string[]`

Returns `TITLE_BLOCK.vide.template` from `app-shared/block-definitions.js`,
wrapped via `splitToWidth`. The literal template — `"Vide diagram S.G. No.
........................ annexed to ........................ No.
........................"` — is long enough that wrapping is realistic at
typical title-zone widths.

No inputs other than the wrap budget. Always returns at least one entry.

### `formatSheetLabel(sheetInfo) → string[]`

Returns `["SHEET ${sheetInfo.sheetNumber}"]` when **all** of these hold:
- `sheetInfo` is a non-null object;
- `sheetInfo.totalSheets` is a number `> 1`;
- `sheetInfo.sheetNumber` is a positive integer (`Number.isInteger` and `> 0`).

Otherwise returns `[]`. No wrapping (label is always short). No warning on
malformed input.

### `splitToWidth(str, maxChars) → string[]`

Word-boundary wrap. Splits `str` into chunks no longer than `maxChars`
characters, never breaking inside a word. Single words longer than
`maxChars` are emitted as their own line (no truncation, no hyphenation —
acceptable here because the templates don't contain unbreakable runs that
long at realistic widths). Never returns empty entries. Empty input returns
`[]`.

## Data flow

```
geopdf-vector.js route
  └─ request.body.sheetInfo (optional, undefined today)
     └─ generateDXF({ ..., sheetInfo })
        └─ destructure: const { sheetInfo = null } = options
           └─ (title-zone emission, after district/portion lines)
              ├─ formatSheetLabel(sheetInfo)        → string[]
              ├─ formatFigureDescription(metadata, outsideFigureData,
              │                          surveyedParcels, maxLineChars) → string[]
              └─ formatVideLine(maxLineChars)       → string[]
                 └─ for each line in each array:
                      addText('TITLE_BLOCK', txC, ty, line, hBody, 0, centered)
                      ty -= hBody * 1.6
```

`maxLineChars` is computed once at emission time as `Math.floor(contentW /
(hBody * 0.55))`. The `0.55` factor is an average character-width-to-height
ratio for the DXF default font at ASCII text — wider than monospace's
`0.6`, narrower than Helvetica's `~0.5` average — chosen as a conservative
approximation so wrapped lines stay clear of the content-area right edge.
This is a new heuristic, not borrowed from existing code in the file. If
manual CAD verification shows lines running too short or too long, the
factor is the one knob to tune.

## Error handling

Three principles, mirroring how the existing DXF title-zone handles its own
optional fields:

**Missing required fields → graceful fallback, no warning, no throw.**
Specific fallbacks are listed in the table above. Each missing field
substitutes a SI 727-readable placeholder that a surveyor can fix in CAD.

**Malformed `sheetInfo` → silently skip.** `formatSheetLabel` returns `[]`
on any malformed shape; no warning, no throw, no breakage of the rest of
the title-zone.

**Block-definition import failure → fail loud.** If `TITLE_BLOCK.figureDescription.template`
or `TITLE_BLOCK.vide.template` is missing from the shared export, that's a
configuration bug — throw `Error('TITLE_BLOCK template missing from
app-shared/block-definitions.js')`. The PDF would fail the same way.

**No new warning categories** in `warnings.summary`. Missing-metadata-with-fallback
is not a data-integrity problem worth reporting alongside `outsideFigureVertices`
/ `beacons` / `parcels`.

## Testing

Three layers, mirroring the outside-figure sub-project.

### Layer 1 — Unit tests

New file: `app-backend/src/services/__tests__/dxfGenerator.titleBlock.test.js`.

Tests run against the exported helpers directly; no DXF parsing needed.

**`formatFigureDescription`:**
- Full happy path against a fixture — asserts the exact SI 727 wording
  character-for-character against `TITLE_BLOCK.figureDescription.template`
  with the fixture's substitutions applied. Goal: catches template drift
  between PDF and DXF without re-asserting the template content in the test.
- Empty edges → `[]`.
- Empty surveyed parcels → `[]`.
- Missing `metadata.township` → output contains `"the township"`.
- Missing `metadata.district` → output contains `"the district"`.
- Missing `metadata.parentProperty` → `{ofTarget}` collapses to the
  township alone (no `" of …"` suffix).
- Missing `metadata.wholePortion` → output contains `"the whole"`.
- Long substitution input → multiple entries returned; no entry exceeds
  `maxLineChars`; no mid-word splits (assert by joining and checking no
  word disappeared, and by checking each entry's length).

**`formatVideLine`:**
- Returns the literal SI 727 template from `app-shared/block-definitions.js`
  (joined, the array reconstructs the template up to whitespace).
- Wraps to multiple entries at small `maxLineChars`.

**`formatSheetLabel`:** parametrised test over inputs:
- `null` → `[]`
- `undefined` → `[]`
- `{}` → `[]`
- `{ totalSheets: 1 }` → `[]`
- `{ sheetNumber: 1, totalSheets: 1 }` → `[]` (single-sheet plan suppresses label)
- `{ sheetNumber: -1, totalSheets: 3 }` → `[]`
- `{ sheetNumber: 0, totalSheets: 3 }` → `[]`
- `{ sheetNumber: NaN, totalSheets: 3 }` → `[]`
- `{ sheetNumber: 1.5, totalSheets: 3 }` → `[]` (non-integer)
- `{ sheetNumber: 2, totalSheets: 3 }` → `["SHEET 2"]`

**`splitToWidth`:**
- Empty string → `[]`.
- Short string ≤ `maxChars` → single-element array containing the input.
- Long string → multi-element; every entry's length ≤ `maxChars`.
- No mid-word splits — assert no entry contains a leading or trailing
  partial token vs. the input.
- Single word longer than `maxChars` → emitted as its own line (no
  truncation).

### Layer 2 — Structural integration

Extend `dxfGenerator.integration.test.js`. Tests run against
`generateDXF()` output for the existing `sampleFixture`.

- Title block contains a `TEXT` entity whose value matches the SI 727
  figure-description's distinctive opening: `/^The figure .+ represents .+ comprising \d+ stands/`.
- Title block contains a `TEXT` entity whose value contains
  `"Vide diagram S.G. No."`.
- All new emissions live on the `TITLE_BLOCK` layer (no leaks to other
  layers; matched by the same line-pair stream walker the existing tests
  use).
- Without `sheetInfo` in the call: no `TEXT` entity on `TITLE_BLOCK` matches
  `/^SHEET \d+$/`.
- With `sheetInfo: { sheetNumber: 1, totalSheets: 3 }`: exactly one `TEXT`
  entity on `TITLE_BLOCK` matches `/^SHEET 1$/`.
- Clean fixture (no malformed inputs) → `warnings.count` unchanged from
  the pre-change baseline (no new warning categories added).

### Layer 3 — Manual CAD verification

Add a new section to `verification/manual-cad-verification.md` (or
whichever doc the prior outside-figure sub-project updated):

- Open the merged DXF in QGIS / AutoCAD / LibreCAD.
- Confirm the figure-description sentence renders inside the title-zone
  column, reads as a coherent paragraph, and doesn't overflow the content
  area horizontally.
- Confirm word-wrap doesn't break inside a word.
- Confirm the Vide line renders below the figure description, dotted blanks
  visible.
- Re-export with a synthetic multi-sheet payload (set `sheetInfo` via test
  fixture or temporary route patch) — confirm `SHEET 1` appears above the
  figure description in the expected position.

## Non-goals

- **Multi-sheet figure-description template.** The PDF switches to
  `multiSheetTemplate` (with `{otherSheets}` / `{fullFigureLabel}`) on
  multi-sheet plans. This sub-project always uses the single-sheet
  template, even when `sheetInfo.totalSheets > 1`. Sub-project #6
  (multi-sheet tiling) owns that switch.
- **Frontend wiring of `sheetInfo`.** This sub-project plumbs the option
  through `generateDXF()` and accepts it as a passthrough at the route
  layer, but the frontend continues sending `undefined`. Sub-project #6
  populates it.
- **Label collision avoidance for wrapped lines.** Wrapped lines stack
  vertically with the standard `h * 1.6` spacing; no detection of overlap
  with neighbouring title-zone content. Sub-project #4 (cartographic label
  collision avoidance) owns global collision handling.
- **SI 727 endorsement lines.** Already shipped (`c66b54b`); not in scope
  here.
