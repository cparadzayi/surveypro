# Survey-Plan DXF / PDF Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the survey-plan DXF export to 1:1 layout parity with the PDF, in south-up orientation, so the surveyor opens the DXF and sees what they will submit.

**Architecture:** Extend `app-backend/src/services/dxfGenerator.js` in place (~814 → ~1,400 lines). Six new emitters mirror their PDF counterparts (`drawNorthArrow`, `drawScaleBar`, `drawGridReferences`, `drawBeaconDescription`, `drawEndorsementArea`, `drawMarginGuides`) plus enhanced beacon-symbol differentiation. Four new layers (`NORTH_ARROW`, `SCALE_BAR`, `GRID`, `MARGIN_GUIDES`) and one UCS table entry (`CAD_NORTH_UP`) added. The coordinate transform swaps from east-up (`x = −Y, y = −X`) to south-up (`x = Y, y = X`). Generator return shape grows from raw `string` to `{ buffer, warnings }` with `X-DXF-Warning-Count` and `X-DXF-Warnings` response headers for graceful-degradation visibility.

**Tech Stack:** Node.js / Fastify (backend), Jest 30 with ESM (`--experimental-vm-modules`); Vue 3 + TypeScript (frontend); DXF R12 (AC1009) format throughout. No new runtime dependencies.

**Branch:** `feature/dxf-pdf-parity` (already created off main; spec committed at `801bd31`).

**Spec:** [`docs/superpowers/specs/2026-05-31-survey-plan-dxf-pdf-parity-design.md`](../specs/2026-05-31-survey-plan-dxf-pdf-parity-design.md)

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `app-backend/src/services/dxfGenerator.js` | **modify** | All emitters, layer + UCS definitions, coordinate transform, return-shape wrapping, warning aggregator. ~600 lines added. |
| `app-backend/src/services/__tests__/dxfGenerator.test.js` | **create** | Layer 1 unit tests: `capeLoToDxfSouthUp` (orientation), `parseScaleDenom` (fallbacks), warnings aggregator. |
| `app-backend/src/services/__tests__/dxfGenerator.integration.test.js` | **create** | Layer 2 structural integration test: section integrity, layer presence, entity counts per layer, orientation invariant, UCS presence; plus the graceful-degradation test. |
| `app-backend/src/services/__tests__/dxfParse.js` | **create** | ~30-line DXF parse helpers (`countLayerOnTable`, `entityCount`, `parseFirstEntityOf`) used by Layer 2. |
| `app-backend/src/services/__tests__/fixtures/sampleDxfPlan.js` | **create** | ~100-line synthetic fixture (outside figure + 2 parcels + 6 beacons + beaconGroups + priorDiagrams). |
| `app-backend/src/routes/geopdf-vector.js` | **modify** | Lines 178–195 — read `{ buffer, warnings }` from generator, attach `X-DXF-Warning-Count` and `X-DXF-Warnings` response headers. |
| `app-frontend/src/services/geopdf.ts` | **modify** | `VectorGeoPDFRequest` interface gains `beaconGroups?` and new optional `metadata` properties. `generateDXF()` returns `{ blob, warnings }` so the caller can surface the toast. |
| `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue` | **modify** | `exportToDXF()` (line 4455) extends the `metadata` payload, threads `beaconGroups`, reads warning headers from the response, toasts a one-line summary when `count > 0`. |

---

## Task 1: Set up the test directory and DXF parsing helpers

**Files:**
- Create: `app-backend/src/services/__tests__/dxfParse.js`
- Create: `app-backend/src/services/__tests__/dxfGenerator.test.js` (empty smoke test)

The DXF format is a stream of (group code, value) pairs, two lines per pair. We need a tiny parser that walks this stream and groups entities by their `0 EntityType` boundaries; richer DXF parsers exist as npm packages but R12 ASCII parsing is ~30 lines and avoids a new dep.

- [ ] **Step 1: Create the DXF parse helper file**

Create `app-backend/src/services/__tests__/dxfParse.js`:

```js
/**
 * Tiny DXF R12 ASCII parser for test assertions.
 * NOT a complete parser — only the inspection operations the tests need.
 * Each DXF line pair is (group code on one line, value on the next).
 */

/** Walk the LAYER table and return how many times `name` appears. */
export function countLayerOnTable(dxf, name) {
  // LAYER table block bounded by "0\nTABLE\n2\nLAYER" .. "0\nENDTAB"
  const m = dxf.match(/\bTABLE\b\s*\n\s*2\s*\n\s*LAYER\b[\s\S]*?\bENDTAB\b/)
  if (!m) return 0
  // Each layer entry is "0\nLAYER\n2\n<name>\n..."; count occurrences of "2\n<name>" inside the table block.
  const re = new RegExp(`\\b2\\s*\\n\\s*${name}\\b`, 'g')
  return (m[0].match(re) || []).length
}

/**
 * Walk the ENTITIES section and count entities of `entityType` on `layerName`.
 * Each entity is "0\n<Type>\n8\n<Layer>\n...".
 */
export function entityCount(dxf, entityType, layerName) {
  const ents = extractEntitiesSection(dxf)
  if (!ents) return 0
  // Split by "0\n<Type>" prefixes; each fragment's "8\n<layer>" is the layer.
  const re = new RegExp(
    `\\b0\\s*\\n\\s*${entityType}\\b[\\s\\S]*?(?=\\b0\\s*\\n\\s*(?:[A-Z]+)\\b|$)`,
    'g'
  )
  let count = 0
  for (const frag of ents.match(re) || []) {
    if (new RegExp(`\\b8\\s*\\n\\s*${layerName}\\b`).test(frag)) count++
  }
  return count
}

/**
 * Find the first entity of `entityType` on `layerName` and return parsed
 * coordinate (x, y) from group codes 10 (x) and 20 (y).
 */
export function parseFirstEntityOf(dxf, entityType, layerName) {
  const ents = extractEntitiesSection(dxf)
  if (!ents) return null
  const re = new RegExp(
    `\\b0\\s*\\n\\s*${entityType}\\b[\\s\\S]*?(?=\\b0\\s*\\n\\s*[A-Z]+\\b|$)`,
    'g'
  )
  for (const frag of ents.match(re) || []) {
    if (!new RegExp(`\\b8\\s*\\n\\s*${layerName}\\b`).test(frag)) continue
    const x = (frag.match(/\b10\s*\n\s*(-?[\d.]+)/) || [])[1]
    const y = (frag.match(/\b20\s*\n\s*(-?[\d.]+)/) || [])[1]
    if (x != null && y != null) return { x: parseFloat(x), y: parseFloat(y) }
  }
  return null
}

function extractEntitiesSection(dxf) {
  const m = dxf.match(/\bSECTION\b\s*\n\s*2\s*\n\s*ENTITIES\b([\s\S]*?)\bENDSEC\b/)
  return m ? m[1] : null
}
```

- [ ] **Step 2: Create the smoke unit-test file**

Create `app-backend/src/services/__tests__/dxfGenerator.test.js`:

```js
/**
 * Unit tests for dxfGenerator pure helpers.
 * Run with:  cd app-backend && npm run test -- dxfGenerator
 */
import { describe, test, expect } from '@jest/globals'
import { countLayerOnTable } from './dxfParse.js'

describe('dxfParse helpers (smoke)', () => {
  test('countLayerOnTable returns 0 for an empty input', () => {
    expect(countLayerOnTable('', 'NONEXISTENT')).toBe(0)
  })
})
```

- [ ] **Step 3: Run the smoke test and verify Jest is wired**

Run: `cd app-backend && npm run test -- --testPathPattern=dxfGenerator`
Expected: 1 passed, 0 failed.

- [ ] **Step 4: Commit**

```bash
git add app-backend/src/services/__tests__/dxfParse.js app-backend/src/services/__tests__/dxfGenerator.test.js
git commit -m "test(dxf): scaffold DXF parse helpers and Jest entry point"
```

---

## Task 2: Coordinate-transform swap (south-up)

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js:31-34` (replace `capeLoToAutoCAD` body and rename)
- Modify: `app-backend/src/services/__tests__/dxfGenerator.test.js` (add test for `capeLoToDxfSouthUp`)

The single highest-blast-radius change. We TDD it: write the test first, see it fail (export not present), implement, see it pass, swap call sites, delete the old function, run the existing test suite.

- [ ] **Step 1: Add failing test for `capeLoToDxfSouthUp`**

Append to `app-backend/src/services/__tests__/dxfGenerator.test.js`:

```js
import { capeLoToDxfSouthUp } from '../dxfGenerator.js'

describe('capeLoToDxfSouthUp', () => {
  // Fixtures spanning Cape Lo zones 25 (Bulawayo), 27 (Harare),
  // 29 (Mutare), 31 (eastern Zimbabwe). All Y, X positive by convention.
  const fixtures = [
    { name: 'Lo 25',  capeY:  35123.456, capeX: 1987654.321 },
    { name: 'Lo 27',  capeY:  72500.000, capeX: 2100000.000 },
    { name: 'Lo 29',  capeY:  50000.000, capeX: 2200000.000 },
    { name: 'Lo 31a', capeY:  18000.000, capeX: 2050000.000 },
    { name: 'Lo 31b', capeY: 110000.000, capeX: 2300000.000 },
    { name: 'origin', capeY:      1.000, capeX:       1.000 },
  ]
  test.each(fixtures)('$name → DXF X = capeY and DXF Y = capeX', ({ capeY, capeX }) => {
    const out = capeLoToDxfSouthUp(capeY, capeX)
    expect(out.x).toBeCloseTo(capeY, 6)
    expect(out.y).toBeCloseTo(capeX, 6)
  })
  test('regression sentinel: old (x = -y) formula would fail', () => {
    const out = capeLoToDxfSouthUp(50000, 2200000)
    expect(out.x).not.toBeLessThan(0)   // catches accidental sign-flip revert
    expect(out.y).not.toBeLessThan(0)
  })
})
```

- [ ] **Step 2: Run the test, expect failure**

Run: `cd app-backend && npm run test -- --testPathPattern=dxfGenerator`
Expected: FAIL with `SyntaxError: The requested module '../dxfGenerator.js' does not provide an export named 'capeLoToDxfSouthUp'` or similar.

- [ ] **Step 3: Replace the transform body and rename + export**

Edit `app-backend/src/services/dxfGenerator.js:31-34`. Find:

```js
function capeLoToAutoCAD(capeY, capeX) {
  const [y, x] = normalizeCapeLoYX(capeY, capeX);
  return { x: -y, y: -x };
}
```

Replace with:

```js
export function capeLoToDxfSouthUp(capeY, capeX) {
  const [y, x] = normalizeCapeLoYX(capeY, capeX);
  // Sanity guard: typical Cape Lo input is Y>0, X>0; result should be x>0, y>0.
  // A negative x from positive Y means a stale x = -y formula sneaked through.
  if (capeY > 0 && y < 0) {
    // Log once via the singleton flag; logger may not be in scope here.
    if (!capeLoToDxfSouthUp._warned) {
      // eslint-disable-next-line no-console
      console.error('[DXF] capeLoToDxfSouthUp: positive Westing produced negative x — stale east-up call?')
      capeLoToDxfSouthUp._warned = true
    }
  }
  return { x: y, y: x };
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `cd app-backend && npm run test -- --testPathPattern=dxfGenerator`
Expected: PASS for all `capeLoToDxfSouthUp` cases.

- [ ] **Step 5: Replace every internal call site of the old name**

There are ~20 call sites of `capeLoToAutoCAD` inside `dxfGenerator.js`. Use grep to find them:

Run: `grep -n capeLoToAutoCAD app-backend/src/services/dxfGenerator.js`

For each line returned, edit the file to replace `capeLoToAutoCAD(` with `capeLoToDxfSouthUp(`. All call sites are inside the same file; no other modules import the old name (verified during exploration).

Suggested approach using `sed` for bulk replacement (Bash on this Windows env):

```bash
sed -i 's/capeLoToAutoCAD/capeLoToDxfSouthUp/g' app-backend/src/services/dxfGenerator.js
```

- [ ] **Step 6: Verify the old name no longer appears anywhere**

Run: `grep -n capeLoToAutoCAD app-backend/src/services/dxfGenerator.js`
Expected: zero output.

- [ ] **Step 7: Run all backend tests to surface any unexpected coupling**

Run: `cd app-backend && npm run test`
Expected: all green. Existing tests don't reference the transform directly.

- [ ] **Step 8: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.test.js
git commit -m "feat(dxf): swap coordinate transform to south-up orientation

DXF X = Cape Lo Y (westing+), DXF Y = Cape Lo X (southing+). The previous
east-up flip (x = -y, y = -x) is replaced; old capeLoToAutoCAD is removed
so no caller can accidentally regress. Sanity guard inside the new
function logs once if a positive Westing produces negative x."
```

---

## Task 3: Wrap generator return as `{ buffer, warnings }` and adapt the route

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js` (initialize warnings object near top of `generateDXF`; change final return)
- Modify: `app-backend/src/routes/geopdf-vector.js:181-190`
- Modify: `app-backend/src/services/__tests__/dxfGenerator.test.js` (test the wrap)

The return shape change is invasive — every internal logger.warn call also bumps `warnings.count`. We do this BEFORE the emitter tasks so all subsequent emitters can rely on the warnings object.

- [ ] **Step 1: Add failing test for the wrapped return shape**

Append to `app-backend/src/services/__tests__/dxfGenerator.test.js`:

```js
import { generateDXF } from '../dxfGenerator.js'

describe('generateDXF return shape', () => {
  const minimalOptions = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: { surveyor: 'Test Surveyor', date: '2026-05-31' },
    projection: 'EPSG:22291',
    scale: '1:500',
    sheetSize: 'ISO_A2',
  }
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }

  test('returns { buffer, warnings } with Buffer and counters', () => {
    const result = generateDXF(minimalOptions, fakeLogger)
    expect(Buffer.isBuffer(result.buffer)).toBe(true)
    expect(typeof result.warnings).toBe('object')
    expect(result.warnings.count).toBe(0)
    expect(typeof result.warnings.summary).toBe('object')
  })

  test('returned DXF starts with HEADER and ends with EOF', () => {
    const { buffer } = generateDXF(minimalOptions, fakeLogger)
    const dxf = buffer.toString()
    expect(dxf).toMatch(/\bSECTION\b[\s\S]*?\bHEADER\b/)
    expect(dxf).toMatch(/\bEOF\b\s*$/)
  })
})
```

- [ ] **Step 2: Run the test, expect failure**

Run: `cd app-backend && npm run test -- --testPathPattern=dxfGenerator`
Expected: FAIL for `Buffer.isBuffer(result.buffer)` — current generator returns a string, not a `{ buffer, warnings }` object.

- [ ] **Step 3: Add warnings aggregator and Buffer wrapping**

Edit `app-backend/src/services/dxfGenerator.js`. Locate the `generateDXF` function start (around line 155) and right after `export function generateDXF(options, logger) {`, insert:

```js
  // Warnings accumulator. Mutated by guards inside the emitters; returned
  // alongside the Buffer so the route can surface counts to the surveyor.
  const warnings = {
    count: 0,
    summary: {
      beacons: 0,
      parcels: 0,
      scaleFallback: false,
      beaconDescTruncated: 0,
      priorDiagramsTruncated: 0,
      nonAscii: false,
    },
  }
  function warn(category, n = 1) {
    if (category === 'scaleFallback' || category === 'nonAscii') {
      warnings.summary[category] = true
    } else {
      warnings.summary[category] = (warnings.summary[category] || 0) + n
    }
    warnings.count += n
  }
```

Then locate the very end of `generateDXF` (around line 813) and change:

```js
  return dxf;
```

to:

```js
  return { buffer: Buffer.from(dxf, 'utf8'), warnings };
```

- [ ] **Step 4: Run the unit tests, expect pass**

Run: `cd app-backend && npm run test -- --testPathPattern=dxfGenerator`
Expected: PASS for both new tests.

- [ ] **Step 5: Update the route to consume `{ buffer, warnings }` and emit headers**

Edit `app-backend/src/routes/geopdf-vector.js:181-190`. Find:

```js
      const dxfContent = generateDXF(
        { parcels, beacons, outsideFigureData, metadata, projection, scale, sheetSize },
        fastify.log
      )

      const filename = `survey-plan-${Date.now()}.dxf`
      reply
        .type('application/dxf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(dxfContent)
```

Replace with:

```js
      const { buffer, warnings } = generateDXF(
        { parcels, beacons, outsideFigureData, metadata, projection, scale, sheetSize, beaconGroups: request.body.beaconGroups },
        fastify.log
      )

      const filename = `survey-plan-${Date.now()}.dxf`
      reply
        .type('application/dxf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('X-DXF-Warning-Count', String(warnings.count))
      if (warnings.count > 0) {
        reply.header('X-DXF-Warnings', JSON.stringify(warnings.summary))
      }
      reply.send(buffer)
```

- [ ] **Step 6: Smoke-test the route locally**

Restart the backend dev server. From a separate terminal:

```bash
curl -s -D - -X POST http://localhost:3050/api/geopdf/dxf \
  -H "Authorization: Bearer $(cat verification/verify_token.txt)" \
  -H "Content-Type: application/json" \
  -d '{"parcels":{"features":[]},"beacons":{"features":[]},"metadata":{}}' \
  -o /dev/null | grep -i '^x-dxf'
```

Expected output:
```
x-dxf-warning-count: 0
```

(If you don't have the token file, register a fresh user via the snippet in §3 of the beacon-comparison plan or use any other valid session token.)

- [ ] **Step 7: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/routes/geopdf-vector.js app-backend/src/services/__tests__/dxfGenerator.test.js
git commit -m "feat(dxf): wrap return as { buffer, warnings }; surface count via response header

Generator now returns a Buffer plus a warnings aggregator object so the
route can advertise graceful-degradation counts to the frontend via
X-DXF-Warning-Count and X-DXF-Warnings response headers. No emitters
populate the aggregator yet — that's wired in the subsequent tasks."
```

---

## Task 4: Add four new layers + UCS table entry

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js:232-241` (layers array); insert UCS block inside the TABLES section emission (around line 758).
- Modify: `app-backend/src/services/__tests__/dxfGenerator.test.js` (assert layers + UCS in output).

- [ ] **Step 1: Add failing test for the four new layers and UCS**

Append to `app-backend/src/services/__tests__/dxfGenerator.test.js`:

```js
import { countLayerOnTable } from './dxfParse.js'

describe('generateDXF — layers + UCS table additions', () => {
  const minimalOptions = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: {},
    scale: '1:500',
    sheetSize: 'ISO_A2',
  }
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }

  test('declares the four new layers', () => {
    const { buffer } = generateDXF(minimalOptions, fakeLogger)
    const dxf = buffer.toString()
    for (const layer of ['NORTH_ARROW', 'SCALE_BAR', 'GRID', 'MARGIN_GUIDES']) {
      expect(countLayerOnTable(dxf, layer)).toBe(1)
    }
  })

  test('declares the CAD_NORTH_UP UCS entry', () => {
    const { buffer } = generateDXF(minimalOptions, fakeLogger)
    const dxf = buffer.toString()
    // UCS table must appear with the named entry inside.
    expect(dxf).toMatch(/\bTABLE\b[\s\S]*?\bUCS\b[\s\S]*?\bCAD_NORTH_UP\b[\s\S]*?\bENDTAB\b/)
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `cd app-backend && npm run test -- --testPathPattern=dxfGenerator`
Expected: FAIL — layers missing, no UCS table.

- [ ] **Step 3: Add four new layer entries**

Edit `app-backend/src/services/dxfGenerator.js:232-241`. Find:

```js
  const layers = [
    { name: 'OUTSIDE_FIGURE',  color: 1 },
    { name: 'PARCELS',         color: 7 },
    { name: 'BEACONS',         color: 3 },
    { name: 'BEACON_LABELS',   color: 3 },
    { name: 'DISTANCES',       color: 4 },
    { name: 'DIRECTIONS',      color: 6 },
    { name: 'STAND_NUMBERS',   color: 2 },
    { name: 'TITLE_BLOCK',     color: 7 },
  ];
```

Replace with:

```js
  const layers = [
    { name: 'OUTSIDE_FIGURE',  color: 1 },
    { name: 'PARCELS',         color: 7 },
    { name: 'BEACONS',         color: 3 },
    { name: 'BEACON_LABELS',   color: 3 },
    { name: 'DISTANCES',       color: 4 },
    { name: 'DIRECTIONS',      color: 6 },
    { name: 'STAND_NUMBERS',   color: 2 },
    { name: 'TITLE_BLOCK',     color: 7 },
    { name: 'NORTH_ARROW',     color: 7 },
    { name: 'SCALE_BAR',       color: 7 },
    { name: 'GRID',            color: 8 },
    { name: 'MARGIN_GUIDES',   color: 8 },
  ];
```

- [ ] **Step 4: Locate the TABLES section emission and add the UCS table**

Find the existing LAYER table block (around line 758). It starts with `dxf += p(2, 'LAYER');`. Immediately AFTER the LAYER table's `0 ENDTAB` line — i.e., right before the BLOCKS section begins — insert the UCS table:

```js
  // UCS table — one entry so CAD users can toggle to north-up view.
  // Axes form a proper 180° rotation about Z (det = +1): X=(-1,0,0), Y=(0,-1,0).
  // After applying this UCS the view shows north at top with east at the left.
  dxf += p(0, 'TABLE');
  dxf += p(2, 'UCS');
  dxf += p(70, '1');
  dxf += p(0, 'UCS');
  dxf += p(2, 'CAD_NORTH_UP');
  dxf += p(70, '0');
  dxf += p(10, '0.0'); dxf += p(20, '0.0'); dxf += p(30, '0.0');   // origin
  dxf += p(11, '-1.0'); dxf += p(21, '0.0'); dxf += p(31, '0.0');  // X axis
  dxf += p(12, '0.0'); dxf += p(22, '-1.0'); dxf += p(32, '0.0');  // Y axis
  dxf += p(0, 'ENDTAB');
```

(The exact insertion point: walk down from the `LAYER` table; find its `ENDTAB` then add the UCS block right after.)

- [ ] **Step 5: Run tests, expect pass**

Run: `cd app-backend && npm run test -- --testPathPattern=dxfGenerator`
Expected: PASS for both new tests.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.test.js
git commit -m "feat(dxf): add NORTH_ARROW / SCALE_BAR / GRID / MARGIN_GUIDES layers and CAD_NORTH_UP UCS

The four new layers stay empty for now — emitters that populate them
land in the subsequent tasks. The CAD_NORTH_UP UCS is a proper 180°
rotation about Z (north-at-top, east-at-left); CAD users toggle via
'_UCS R CAD_NORTH_UP'."
```

---

## Task 5: Bad-coordinate guard for beacons and parcels

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js` (beacon emission loop ~ line 473; parcel emission loop ~ line 346).
- Modify: `app-backend/src/services/__tests__/dxfGenerator.test.js` (graceful-degradation cases).

We add the guards now, before the bulk emitter work, so the warnings infrastructure is exercised end-to-end before the spec's data-flow contract grows.

- [ ] **Step 1: Add failing tests for bad-coord guards**

Append to `app-backend/src/services/__tests__/dxfGenerator.test.js`:

```js
describe('generateDXF — graceful degradation on bad inputs', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }

  test('skips beacon with NaN coordinates and increments warnings.beacons', () => {
    const opts = {
      parcels: { features: [] },
      beacons: {
        features: [
          { type: 'Feature', geometry: { coordinates: [NaN, 2200000] },
            properties: { pointId: 'X1' } },
          { type: 'Feature', geometry: { coordinates: [50000, 2200000] },
            properties: { pointId: 'X2' } },
        ],
      },
      metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
    }
    const { warnings } = generateDXF(opts, fakeLogger)
    expect(warnings.summary.beacons).toBe(1)
    expect(warnings.count).toBeGreaterThanOrEqual(1)
  })

  test('skips parcel with fewer than 3 finite vertices and increments warnings.parcels', () => {
    const opts = {
      parcels: { features: [
        { type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[50000, 2200000], [50001, 2200000]]] },
          properties: { stand: 'X' } },
      ]},
      beacons: { features: [] },
      metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
    }
    const { warnings } = generateDXF(opts, fakeLogger)
    expect(warnings.summary.parcels).toBe(1)
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `cd app-backend && npm run test -- --testPathPattern=dxfGenerator`
Expected: FAIL — `warnings.summary.beacons` is 0.

- [ ] **Step 3: Add beacon guard**

In `app-backend/src/services/dxfGenerator.js`, find the beacon emission loop (around line 473; search for `// Filter: only beacons within outside figure + 2m buffer` or for `for (const b of beacons.features ?? [])`). Just before the loop body uses the coordinates, insert:

```js
    const [byRaw, bxRaw] = b.geometry?.coordinates ?? [NaN, NaN]
    if (!Number.isFinite(byRaw) || !Number.isFinite(bxRaw)
        || Math.abs(byRaw) > 1e7 || Math.abs(bxRaw) > 1e7) {
      logger.warn(`[DXF] dropped beacon ${b.properties?.pointId || '<unnamed>'}: bad coords`)
      warn('beacons')
      continue
    }
```

(`warn(...)` is the helper introduced in Task 3.)

- [ ] **Step 4: Add parcel guard**

In the parcel emission loop (around line 346; search for `// Build AutoCAD polygon (unique vertices, no closing duplicate)`), just before the polyline is added, insert:

```js
    const rawVerts = f.geometry?.coordinates?.[0] ?? []
    const finiteVerts = rawVerts.filter(([yy, xx]) =>
      Number.isFinite(yy) && Number.isFinite(xx))
    if (finiteVerts.length < 3) {
      logger.warn(`[DXF] dropped parcel ${f.properties?.stand || '<unnamed>'}: <3 finite vertices`)
      warn('parcels')
      continue
    }
```

- [ ] **Step 5: Run tests, expect pass**

Run: `cd app-backend && npm run test -- --testPathPattern=dxfGenerator`
Expected: PASS for both new tests; previous tests still green.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.test.js
git commit -m "feat(dxf): skip bad beacons / degenerate parcels and count them in warnings

Beacons with NaN/Infinity coords or coords beyond |1e7| are dropped.
Parcels with fewer than 3 finite vertices are skipped. Each emits a
logger.warn and increments warnings.summary so the frontend can surface
the count via the response header."
```

---

## Task 6: addBeaconSymbol — placed vs found differentiation

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js` (add `addBeaconSymbol` near the other primitives; update beacon emission to use it).
- Modify: `app-backend/src/services/__tests__/dxfGenerator.test.js` (assert distinct entity counts).

- [ ] **Step 1: Add failing test for placed vs found symbol differentiation**

Append to `app-backend/src/services/__tests__/dxfGenerator.test.js`:

```js
import { entityCount } from './dxfParse.js'

describe('generateDXF — beacon symbol differentiation', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  const opts = {
    parcels: { features: [] },
    beacons: { features: [
      { type: 'Feature', geometry: { coordinates: [50000, 2200000] },
        properties: { pointId: 'P1', type: 'placed' } },
      { type: 'Feature', geometry: { coordinates: [50050, 2200050] },
        properties: { pointId: 'F1', type: 'found' } },
    ] },
    outsideFigureData: null,
    metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
  }
  test('placed beacon emits CIRCLE + 8 radial LINEs', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    // 2 CIRCLE entities total (one per beacon), both on BEACONS layer
    expect(entityCount(dxf, 'CIRCLE', 'BEACONS')).toBe(2)
    // 8 LINEs for the placed fill + 2 LINEs for the found cross = 10 BEACONS lines
    expect(entityCount(dxf, 'LINE', 'BEACONS')).toBe(10)
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `cd app-backend && npm run test -- --testPathPattern=dxfGenerator`
Expected: FAIL — existing generator emits only CIRCLE, no LINEs on BEACONS.

- [ ] **Step 3: Add `addBeaconSymbol` helper**

Insert near the existing primitives (around line 280, after `addText`):

```js
  /**
   * Draw a beacon symbol differentiated by type.
   *   placed → solid-filled circle (CIRCLE + 8 radial LINEs since R12 has no HATCH)
   *   found  → open CIRCLE + crossing `+` (two LINEs through the centre)
   */
  function addBeaconSymbol(layer, cx, cy, type, sizeM) {
    const r = sizeM / 2
    addCircle(layer, cx, cy, r)
    if (type === 'placed') {
      // Eight short radial LINEs from centre outward at 45° intervals to mimic a fill
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4
        addLine(layer, cx, cy, cx + r * Math.cos(a), cy + r * Math.sin(a))
      }
    } else if (type === 'found') {
      // Two LINEs forming a "+" through the centre, length 1.4·r
      const h = r * 1.4
      addLine(layer, cx - h, cy, cx + h, cy)
      addLine(layer, cx, cy - h, cx, cy + h)
    }
  }
```

- [ ] **Step 4: Replace the existing `addCircle(layer, cx, cy, r)` call for beacons with `addBeaconSymbol`**

Locate the beacon emission loop (after the guard from Task 5). Find the existing line that draws the beacon (something like `addCircle('BEACONS', dx, dy, mm(1.2));`) and replace with:

```js
      const beaconType = b.properties?.type || 'placed'
      addBeaconSymbol('BEACONS', dx, dy, beaconType, mm(2.4))
```

(`mm(2.4)` matches the PDF's 2.4 mm beacon diameter. `dx, dy` are the DXF-space coords already computed via `capeLoToDxfSouthUp`.)

- [ ] **Step 5: Run tests, expect pass**

Run: `cd app-backend && npm run test -- --testPathPattern=dxfGenerator`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.test.js
git commit -m "feat(dxf): differentiated beacon symbols — placed (filled) vs found (open + cross)

addBeaconSymbol() reads properties.type from the GeoJSON beacon features
(falls back to 'placed' when absent). Matches drawBeaconSymbol in the
PDF exporter at typical zoom."
```

---

## Task 7: addNorthArrow

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js` (new emitter + invocation).
- Modify: `app-backend/src/services/__tests__/dxfGenerator.test.js`.

- [ ] **Step 1: Add failing test**

Append to `app-backend/src/services/__tests__/dxfGenerator.test.js`:

```js
describe('generateDXF — north arrow', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  const opts = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
  }
  test('emits 3 LINEs and 1 TEXT on NORTH_ARROW layer', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    expect(entityCount(dxf, 'LINE', 'NORTH_ARROW')).toBe(3)   // arrowhead triangle
    expect(entityCount(dxf, 'TEXT', 'NORTH_ARROW')).toBe(1)   // "S" label
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `cd app-backend && npm run test -- --testPathPattern=dxfGenerator`
Expected: FAIL — NORTH_ARROW layer empty.

- [ ] **Step 3: Add the emitter**

Insert near the chrome emitters (after the title-block section, around line 690 — search for `// ── A) TITLE ZONE`):

```js
  /**
   * Draw a south-pointing arrow (page is south-up, so the arrow points to +DXF-Y).
   * Three LINEs form the arrowhead triangle; one TEXT entity reads "S" above the apex.
   * sizeM is the arrowhead height in ground metres at the chosen scale.
   */
  function addNorthArrow(layer, cx, cy, sizeM) {
    const half = sizeM / 2
    const baseHalf = sizeM * 0.3
    const apex = { x: cx, y: cy + half }
    const baseL = { x: cx - baseHalf, y: cy - half }
    const baseR = { x: cx + baseHalf, y: cy - half }
    addLine(layer, apex.x, apex.y, baseL.x, baseL.y)
    addLine(layer, apex.x, apex.y, baseR.x, baseR.y)
    addLine(layer, baseL.x, baseL.y, baseR.x, baseR.y)
    addText(layer, cx, cy + half + mm(5), 'S', mm(4), 0)
  }
```

- [ ] **Step 4: Wire the emitter into the layout — call once during chrome assembly**

Find the title block assembly section (the function that lays out chrome, around line 560-700 — search for `// ── A) TITLE ZONE`). After the title block lines but before the bottom-zone tables, add:

```js
  // North/south arrow in the upper-right of the drawing zone
  addNorthArrow('NORTH_ARROW', cntR - mm(15), cntT - mm(20), mm(20))
```

- [ ] **Step 5: Run, expect pass**

Run: `cd app-backend && npm run test -- --testPathPattern=dxfGenerator`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.test.js
git commit -m "feat(dxf): emit south-pointing arrow in drawing-zone upper-right

Three LINEs for the arrowhead triangle + one TEXT 'S' label above
the apex. 20 mm tall at paper scale, anchored 15 mm from the right
edge and 20 mm from the top of the content area."
```

---

## Task 8: addScaleBar

**Files:** same pattern as Task 7.

- [ ] **Step 1: Add failing test**

```js
describe('generateDXF — scale bar', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  const opts = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
  }
  test('emits centreline + tick LINEs and metre labels on SCALE_BAR', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    // Outer rect (2 LINEs) + centreline (1) + 4 tick verticals = 7 LINEs
    expect(entityCount(dxf, 'LINE', 'SCALE_BAR')).toBeGreaterThanOrEqual(7)
    // Tick labels (4) + "1:<scale>" footer (1) = 5 TEXT entities
    expect(entityCount(dxf, 'TEXT', 'SCALE_BAR')).toBeGreaterThanOrEqual(5)
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `cd app-backend && npm run test -- --testPathPattern=dxfGenerator`
Expected: FAIL.

- [ ] **Step 3: Add the emitter**

Insert next to `addNorthArrow`:

```js
  /**
   * Graduated horizontal scale bar.
   * Bar length is chosen so the value at the right end rounds to a "nice"
   * number at the supplied scale (e.g., 100 m at 1:500, 500 m at 1:2500).
   */
  function addScaleBar(layer, cx, cy, scaleDenom) {
    const niceLengthM = pickNiceScaleBarLengthM(scaleDenom)
    const barWidthGround = mmToGround(60, scaleDenom)   // 60 mm bar on paper
    const halfW = barWidthGround / 2
    const halfH = mm(2)
    // Outer rectangle (2 horizontal LINEs)
    addLine(layer, cx - halfW, cy + halfH, cx + halfW, cy + halfH)
    addLine(layer, cx - halfW, cy - halfH, cx + halfW, cy - halfH)
    // Centreline
    addLine(layer, cx - halfW, cy, cx + halfW, cy)
    // Four vertical tick lines at 0 / ¼ / ½ / 1
    for (const f of [0, 0.25, 0.5, 1]) {
      const x = cx - halfW + f * barWidthGround
      addLine(layer, x, cy - halfH, x, cy + halfH)
      const labelM = Math.round(f * niceLengthM).toString()
      addText(layer, x, cy - halfH - mm(3), labelM, mm(2), 0)
    }
    // "1:<scale>" footer
    addText(layer, cx, cy - halfH - mm(8), `1:${scaleDenom}`, mm(2.5), 0)
  }

  /** Pick a round metre length suitable for a 60 mm bar at the given scale. */
  function pickNiceScaleBarLengthM(scaleDenom) {
    if (scaleDenom <= 500) return 50
    if (scaleDenom <= 1000) return 100
    if (scaleDenom <= 2500) return 250
    if (scaleDenom <= 5000) return 500
    return 1000
  }
```

- [ ] **Step 4: Wire the invocation**

After the `addNorthArrow(...)` call from Task 7, add:

```js
  // Scale bar in the lower-right of the drawing zone
  addScaleBar('SCALE_BAR', cntR - mm(40), cntB + mm(20), S)
```

(`S` is the scale denominator already in scope.)

- [ ] **Step 5: Run tests, expect pass**

Run: `cd app-backend && npm run test -- --testPathPattern=dxfGenerator`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.test.js
git commit -m "feat(dxf): emit graduated scale bar in drawing-zone lower-right

60 mm bar on paper with 0/¼/½/1 tick marks, metre labels, and a
'1:<scale>' footer. Bar's value rounds to a nice number (50, 100,
250, 500, 1000 m) selected by pickNiceScaleBarLengthM(scale)."
```

---

## Task 9: addGridReferences

**Files:** same pattern.

- [ ] **Step 1: Add failing test**

```js
describe('generateDXF — coordinate grid ticks', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  // Fixture with an outside figure spanning a 200 m × 200 m area at 1:500.
  // Should produce grid ticks at 50 m intervals along the four borders.
  const opts = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: {
      edges: [
        { side: 'A-B', distance: 200, direction: '90°00\'00"', pointId: 'A', y: 50000, x: 2200000 },
        { side: 'B-C', distance: 200, direction: '180°00\'00"', pointId: 'B', y: 50200, x: 2200000 },
        { side: 'C-D', distance: 200, direction: '270°00\'00"', pointId: 'C', y: 50200, x: 2200200 },
        { side: 'D-A', distance: 200, direction: '0°00\'00"',   pointId: 'D', y: 50000, x: 2200200 },
      ],
      constants: { pointId: 'A', y: 50000, x: 2200000 },
    },
    metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
  }
  test('emits at least some tick LINEs and coordinate labels on GRID layer', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    expect(entityCount(dxf, 'LINE', 'GRID')).toBeGreaterThan(0)
    expect(entityCount(dxf, 'TEXT', 'GRID')).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `cd app-backend && npm run test -- --testPathPattern=dxfGenerator`
Expected: FAIL — GRID layer empty.

- [ ] **Step 3: Add the emitter**

Insert next to `addScaleBar`:

```js
  /**
   * Coordinate-grid edge ticks. For every Cape Lo Y, X that falls on a round
   * `gridStepM` multiple within the drawing bounds, emit short ticks inward
   * from each border with the rounded coordinate as a label.
   * No interior grid lines — matches the PDF exporter's drawGridReferences.
   * drawL/R/T/B are in DXF coordinate space (after south-up swap).
   */
  function addGridReferences(layer, drawL, drawR, drawT, drawB, gridStepM) {
    const tickLen = mm(5)
    // Horizontal axis ticks (DXF X = Cape Lo Y / westings)
    const xStart = Math.ceil(drawL / gridStepM) * gridStepM
    for (let x = xStart; x <= drawR; x += gridStepM) {
      addLine(layer, x, drawB, x, drawB + tickLen)
      addLine(layer, x, drawT, x, drawT - tickLen)
      const label = Math.round(x).toString()
      addText(layer, x, drawB - mm(3), label, mm(2), 0)
      addText(layer, x, drawT + mm(3), label, mm(2), 0)
    }
    // Vertical axis ticks (DXF Y = Cape Lo X / southings)
    const yStart = Math.ceil(drawB / gridStepM) * gridStepM
    for (let y = yStart; y <= drawT; y += gridStepM) {
      addLine(layer, drawL, y, drawL + tickLen, y)
      addLine(layer, drawR, y, drawR - tickLen, y)
      const label = Math.round(y).toString()
      addText(layer, drawL - mm(8), y, label, mm(2), 0)
      addText(layer, drawR + mm(2), y, label, mm(2), 0)
    }
  }

  /** Round grid step in metres for the given scale denominator. */
  function pickGridStepM(scaleDenom) {
    if (scaleDenom <= 500) return 100
    if (scaleDenom <= 1000) return 250
    if (scaleDenom <= 2500) return 500
    return 1000
  }
```

- [ ] **Step 4: Wire the invocation**

After the scale bar call, add:

```js
  // Coordinate grid ticks along the drawing-zone borders
  addGridReferences('GRID', dL, dR, dT, dB, pickGridStepM(S))
```

(`dL, dR, dT, dB` are the drawing bounds already in scope at the top of `generateDXF`.)

- [ ] **Step 5: Run tests, expect pass**

Run: `cd app-backend && npm run test -- --testPathPattern=dxfGenerator`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.test.js
git commit -m "feat(dxf): emit coordinate-grid ticks along the drawing-zone borders

5 mm ticks at round Cape Lo Y / X intervals, with rounded coordinate
labels just outside each border. Step size auto-selected from the
scale denominator (100 m / 250 m / 500 m / 1000 m)."
```

---

## Task 10: addMarginGuides

**Files:** same pattern.

- [ ] **Step 1: Add failing test**

```js
describe('generateDXF — margin guides', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  const opts = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
  }
  test('emits corner tick + crop-mark LINEs on MARGIN_GUIDES', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    // 4 corners × 2 ticks (one X-axis tick + one Y-axis tick) = 8 content-corner LINEs
    // 4 page corners × 2 crop-mark legs = 8 crop-mark LINEs
    // Total >= 16
    expect(entityCount(dxf, 'LINE', 'MARGIN_GUIDES')).toBeGreaterThanOrEqual(16)
  })
})
```

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Add the emitter**

Insert next to `addGridReferences`:

```js
  /**
   * Drafting-table convention: short tick marks at each content-area corner +
   * tiny crop-mark crosses at each page corner.
   */
  function addMarginGuides(layer, pageL, pageR, pageT, pageB, cntL, cntR, cntT, cntB) {
    const tick = mm(5)
    const crop = mm(3)
    // Content-area corner ticks (2 LINEs per corner, one X-axis one Y-axis)
    const corners = [
      { x: cntL, y: cntT, dx: tick, dy: -tick },   // top-left
      { x: cntR, y: cntT, dx: -tick, dy: -tick },  // top-right
      { x: cntL, y: cntB, dx: tick, dy: tick },    // bottom-left
      { x: cntR, y: cntB, dx: -tick, dy: tick },   // bottom-right
    ]
    for (const c of corners) {
      addLine(layer, c.x, c.y, c.x + c.dx, c.y)
      addLine(layer, c.x, c.y, c.x, c.y + c.dy)
    }
    // Page-corner crop-mark crosses (2 LINEs per corner)
    const pageCorners = [
      { x: pageL, y: pageT }, { x: pageR, y: pageT },
      { x: pageL, y: pageB }, { x: pageR, y: pageB },
    ]
    for (const c of pageCorners) {
      addLine(layer, c.x - crop, c.y, c.x + crop, c.y)
      addLine(layer, c.x, c.y - crop, c.x, c.y + crop)
    }
  }
```

- [ ] **Step 4: Wire the invocation**

After the page-frame and margin-divider lines (around line 565-570 — search for `addRect(TB, pageL, pageB, pageR, pageT);` for the outer paper border), add:

```js
  addMarginGuides('MARGIN_GUIDES', pageL, pageR, pageT, pageB, cntL, cntR, cntT, cntB)
```

- [ ] **Step 5: Run tests, expect pass**

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.test.js
git commit -m "feat(dxf): emit drafting margin guides + page corner crop marks

Four content-corner ticks (5 mm each axis) and four page-corner
crop crosses (3 mm legs) on the MARGIN_GUIDES layer. Matches
drawMarginGuides in the PDF exporter."
```

---

## Task 11: addBeaconDescription

**Files:** same pattern.

- [ ] **Step 1: Add failing test**

```js
describe('generateDXF — beacon description block', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  const opts = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: {}, scale: '1:500', sheetSize: 'ISO_A2',
    beaconGroups: [
      { points: 'BM 001–BM 003', description: 'Permanent concrete pillars' },
      { points: 'BM 004–BM 008', description: 'Iron pegs with cement collar' },
    ],
  }
  test('emits header + per-group TEXT entities on TITLE_BLOCK layer', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    // Header "BEACON DESCRIPTIONS" + 2 entries = at least 3 new TEXT entities.
    // (The existing title-block emits ~5 TEXTs, so we assert a baseline lift.)
    expect(dxf).toMatch(/BEACON DESCRIPTIONS/)
    expect(dxf).toMatch(/Permanent concrete pillars/)
    expect(dxf).toMatch(/Iron pegs/)
  })
})
```

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Add the emitter**

Insert next to the other chrome emitters:

```js
  /**
   * Beacon descriptions table — one row per beaconGroups[] entry.
   * Truncates with "+ N more — see PDF" if rows would overflow zoneBottom.
   */
  function addBeaconDescription(layer, zoneL, zoneR, zoneTop, zoneBottom, beaconGroups) {
    if (!Array.isArray(beaconGroups) || beaconGroups.length === 0) return
    const headerH = mm(4)
    const rowH = mm(3.5)
    let y = zoneTop
    addText(layer, zoneL, y, 'BEACON DESCRIPTIONS', headerH, 0, 'BOLD')
    y -= headerH * 1.4
    // Separator LINE
    addLine(layer, zoneL, y, zoneR, y)
    y -= mm(1)
    let printed = 0
    for (const g of beaconGroups) {
      if (y - rowH < zoneBottom) break
      const text = `${g.points}: ${g.description || ''}`
      addText(layer, zoneL, y, text, mm(2.4), 0)
      y -= rowH
      printed++
    }
    const remaining = beaconGroups.length - printed
    if (remaining > 0) {
      if (y - rowH < zoneBottom) y = zoneBottom + rowH    // squeeze in the footer
      addText(layer, zoneL, y, `+ ${remaining} more — see PDF for full list`, mm(2.2), 0)
      warn('beaconDescTruncated', remaining)
    }
  }
```

- [ ] **Step 4: Wire the invocation**

In the bottom-zone assembly section (search for `// ── C1) SCHEDULE OF AREAS` around line 622), after the schedule and survey statement, add:

```js
  // Beacon descriptions immediately below the Schedule of Areas
  const beaconDescTop = (typeof afterScheduleY === 'number') ? afterScheduleY - mm(4) : drawDivY - mm(20)
  addBeaconDescription(TB, col1L, col1L + col1W - mm(2),
                        beaconDescTop, cntB + mm(4),
                        options.beaconGroups || [])
```

(`afterScheduleY` will be whatever Y coordinate the schedule section ends at — pick the local variable used by the existing schedule code. If unclear, default to `drawDivY - mm(20)`.)

- [ ] **Step 5: Run tests, expect pass**

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.test.js
git commit -m "feat(dxf): emit beacon description block below Schedule of Areas

Header + one TEXT line per beaconGroups[] entry. Soft-truncates with
'+ N more — see PDF' and increments warnings.beaconDescTruncated when
rows overflow the zone height."
```

---

## Task 12: Title-block field completion (firm, license, parent property, whole/portion, district)

**Files:** same pattern.

- [ ] **Step 1: Add failing test**

```js
describe('generateDXF — title block field completion', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  const opts = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: {
      designation: 'STAND 123 BORROWDALE',
      surveyOf: 'A portion of Stand 456 Borrowdale',
      township: 'Borrowdale',
      firm: 'Acme Surveying & Mapping (Pvt) Ltd',
      licenseNumber: 'PLS 1234',
      parentProperty: 'Shabani Mine Surface Rights A',
      wholePortion: 'a portion',
      district: 'Harare',
      surveyor: 'J. Doe',
      date: '2026-05-31',
    },
    scale: '1:500', sheetSize: 'ISO_A2',
  }
  test('renders firm, license, parent property, whole/portion, district in the title block', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    expect(dxf).toMatch(/Acme Surveying & Mapping/)
    expect(dxf).toMatch(/PLS 1234/)
    expect(dxf).toMatch(/Shabani Mine Surface Rights A/)
    expect(dxf).toMatch(/a portion/)
    expect(dxf).toMatch(/Harare/)
  })
})
```

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Extend the title-block section**

Find the existing title-zone block (search for `addText(TB, txC, ty, 'GENERAL PLAN', hTitle, 0, 'BOLD');`). After the existing `if (metadata.township && standList)` chain ends and before the next major section, append:

```js
  // New SI 727 fields the PDF carries
  if (metadata.firm) {
    ty -= hSub * 1.4
    addText(TB, txC, ty, metadata.firm, hSub, 0)
  }
  if (metadata.licenseNumber) {
    ty -= hSub * 1.4
    addText(TB, txC, ty, `PLS ${metadata.licenseNumber}`, hSub, 0)
  }
  if (metadata.parentProperty) {
    ty -= hSub * 1.4
    addText(TB, txC, ty, `Parent property: ${metadata.parentProperty}`, hSub, 0)
  }
  if (metadata.wholePortion) {
    ty -= hSub * 1.4
    addText(TB, txC, ty, `Survey covers: ${metadata.wholePortion}`, hSub, 0)
  }
  if (metadata.district && !standList) {
    ty -= hSub * 1.4
    addText(TB, txC, ty, `District: ${metadata.district}`, hSub, 0)
  }
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.test.js
git commit -m "feat(dxf): complete title-block field set — firm / license / parent / portion / district

Five new TEXT entities centred on txC at hSub height; each guarded
by metadata field presence so absent fields collapse without leaving
blank lines."
```

---

## Task 13: Expanded `drawEndorsementZone` (replace existing stub)

**Files:** same pattern.

- [ ] **Step 1: Add failing test**

```js
describe('generateDXF — endorsement zone', () => {
  const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }
  const opts = {
    parcels: { features: [] },
    beacons: { features: [] },
    outsideFigureData: null,
    metadata: {
      surveyor: 'J. Doe',
      licenseNumber: 'PLS 1234',
      priorDiagrams: ['Diagram-GP No. 4567', 'Diagram-GP No. 8910'],
    },
    scale: '1:500', sheetSize: 'ISO_A2',
  }
  test('emits all five endorsement sub-blocks', () => {
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    expect(dxf).toMatch(/APPROVED FOR LODGEMENT/)
    expect(dxf).toMatch(/Dispensation Certificate/)
    expect(dxf).toMatch(/Plan No\.:/)
    expect(dxf).toMatch(/Diagram-GP No\. 4567/)
    expect(dxf).toMatch(/Diagram-GP No\. 8910/)
    expect(dxf).toMatch(/certify this plan correct/)
  })
  test('falls back to "Prior diagrams: None" when the list is empty', () => {
    const noprior = { ...opts, metadata: { ...opts.metadata, priorDiagrams: [] } }
    const { buffer } = generateDXF(noprior, fakeLogger)
    expect(buffer.toString()).toMatch(/Prior diagrams: None/)
  })
})
```

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Add the new endorsement assembler**

Locate the existing endorsement stub (around line 588-605 — search for `addText(TB, eX + mm(10), eY, 'Dispensation Certificate No.`). Replace the entire short stub with a call to a new helper:

```js
  drawEndorsementZone(eX, endorseR, cntT - mm(5), cntB + mm(5))
```

Then define the helper next to the other chrome emitters:

```js
  /**
   * Full endorsement zone in the right-margin column. Five sub-blocks,
   * top to bottom:
   *   1. APPROVED FOR LODGEMENT header + Date / Surveyor-General / Reference lines
   *   2. Dispensation Certificate slot
   *   3. Plan number stamp box (RECT 30 × 15 mm)
   *   4. Prior diagram references (list or "None")
   *   5. Surveyor certification footer
   */
  function drawEndorsementZone(zoneL, zoneR, zoneTop, zoneBottom) {
    let y = zoneTop
    const lineH = mm(4)
    // ── 1) SG approval header ──
    addText(TB, zoneL, y, 'APPROVED FOR LODGEMENT', mm(3.5), 0, 'BOLD')
    y -= lineH
    for (const lbl of ['Date', 'Surveyor-General', 'Reference']) {
      addText(TB, zoneL, y, `${lbl}: `, mm(2.4), 0)
      addLine(TB, zoneL + mm(20), y - mm(1), zoneR - mm(2), y - mm(1))
      y -= lineH
    }
    y -= mm(2)
    // ── 2) Dispensation Certificate slot ──
    addText(TB, zoneL, y,
            'Dispensation Certificate No. ........... relates to this plan',
            mm(2.4), 0)
    y -= lineH * 1.5
    // ── 3) Plan number stamp box ──
    const boxW = mm(30), boxH = mm(15)
    addRect(TB, zoneL, y - boxH, zoneL + boxW, y)
    addText(TB, zoneL + mm(2), y - mm(4), 'Plan No.:', mm(2.4), 0)
    y -= boxH + mm(4)
    // ── 4) Prior diagrams ──
    const priors = metadata.priorDiagrams || []
    if (priors.length === 0) {
      addText(TB, zoneL, y, 'Prior diagrams: None', mm(2.4), 0)
      y -= lineH
    } else {
      addText(TB, zoneL, y, 'Prior diagrams:', mm(2.4), 0, 'BOLD')
      y -= lineH
      let printed = 0
      for (const d of priors) {
        if (y - lineH < zoneBottom + mm(15)) break
        addText(TB, zoneL + mm(3), y, d, mm(2.4), 0)
        y -= lineH
        printed++
      }
      const remaining = priors.length - printed
      if (remaining > 0) {
        addText(TB, zoneL + mm(3), y, `+ ${remaining} more (see PDF)`, mm(2.2), 0)
        y -= lineH
        warn('priorDiagramsTruncated', remaining)
      }
    }
    // ── 5) Surveyor certification footer ──
    if (zoneBottom + mm(15) <= y) {
      const surv = metadata.surveyor || '<surveyor>'
      const lic = metadata.licenseNumber || ''
      addText(TB, zoneL, zoneBottom + mm(10),
              `I, ${surv} (PLS ${lic}), certify this plan correct`,
              mm(2.4), 0)
      addLine(TB, zoneL, zoneBottom + mm(6), zoneR - mm(2), zoneBottom + mm(6))
    }
  }
```

- [ ] **Step 4: Run tests, expect pass**

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.test.js
git commit -m "feat(dxf): full endorsement zone — SG approval, dispensation, plan number, priors, certification

Replaces the previous one-line stub with the five sub-blocks the PDF
exporter has long carried. Prior-diagrams list soft-truncates with
'+ N more (see PDF)' and increments warnings.priorDiagramsTruncated."
```

---

## Task 14: Frontend wiring — metadata payload extension + warning toast

**Files:**
- Modify: `app-frontend/src/services/geopdf.ts` (extend interface, surface headers).
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue:4455` (extend metadata, surface toast).

- [ ] **Step 1: Extend the TypeScript interface**

Edit `app-frontend/src/services/geopdf.ts`. Find the `VectorGeoPDFRequest` interface and add the new optional metadata fields + `beaconGroups`:

```ts
export interface VectorGeoPDFRequest {
  // ...existing fields...
  metadata: {
    title?: string
    surveyor?: string
    date?: string
    designation?: string
    surveyOf?: string
    district?: string
    township?: string
    // New (DXF/PDF parity)
    firm?: string
    licenseNumber?: string
    parentProperty?: string
    wholePortion?: string
    priorDiagrams?: string[]
  }
  // New top-level field for the beacon-description block
  beaconGroups?: Array<{ points: string; description: string }>
  // ...rest unchanged...
}
```

- [ ] **Step 2: Update `generateDXF` to expose warning headers to the caller**

Find the existing `generateDXF` in `services/geopdf.ts:186`. Replace its body to return `{ blob, warningCount, warningsSummary }`:

```ts
export async function generateDXF(request: VectorGeoPDFRequest): Promise<{
  blob: Blob
  warningCount: number
  warningsSummary: Record<string, number | boolean> | null
}> {
  const response = await api.post('/geopdf/dxf', {
    parcels: request.parcels,
    beacons: request.beacons,
    projection: request.projection,
    metadata: request.metadata,
    outsideFigureData: request.outsideFigureData,
    scale: request.scale,
    sheetSize: request.sheetSize,
    beaconGroups: request.beaconGroups,
  }, {
    responseType: 'blob',
    timeout: 30000,
  })

  const warningCount = parseInt(response.headers['x-dxf-warning-count'] || '0', 10) || 0
  let warningsSummary: Record<string, number | boolean> | null = null
  const raw = response.headers['x-dxf-warnings']
  if (raw) {
    try { warningsSummary = JSON.parse(raw) } catch { warningsSummary = null }
  }

  console.log('[DXF] Received DXF blob:', {
    size: `${(response.data.size / 1024).toFixed(2)} KB`,
    type: response.data.type,
    warningCount,
  })

  return { blob: response.data, warningCount, warningsSummary }
}
```

- [ ] **Step 3: Extend `exportToDXF()` in SurveyPlanMapView.vue**

Edit `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue:4455`. Find the existing `const metadata = { ... }` block and extend it:

```ts
    const metadata = {
      title: `General Plan - ${props.projectInfo.designation || 'Survey Plan'}`,
      surveyor: config.value.surveyorName,
      date: config.value.surveyDate,
      designation: props.projectInfo.designation,
      surveyOf: props.projectInfo.surveyOf || '',
      district: props.projectInfo.district,
      township: props.projectInfo.township,
      // New SI-727 fields the PDF carries
      firm: config.value.firm,
      licenseNumber: config.value.licenseNumber,
      parentProperty: props.projectInfo.parentProperty,
      wholePortion: props.projectInfo.wholePortion,
      priorDiagrams: props.projectInfo.priorDiagrams || [],
    }
```

In the same function, locate the `await generateDXF(...)` call. Change destructuring:

```ts
    const { blob: dxfBlob, warningCount, warningsSummary } = await generateDXF({
      parcels: parcelsGeoJSON,
      beacons: beaconsGeoJSON,
      projection: epsgCode,
      metadata,
      outsideFigureData: outsideFigureData.value,
      scale: resolvedScale,
      sheetSize: resolvedSheetSize,
      beaconGroups: props.projectInfo.beaconGroups || [],
    })
```

After the existing `downloadBlob(dxfBlob, filename)` and `console.log('[DXF Export] Download complete:', filename)` lines, before the `emit(...)` call, surface the warning toast:

```ts
    if (warningCount > 0 && warningsSummary) {
      const parts: string[] = []
      if (warningsSummary.beacons) parts.push(`${warningsSummary.beacons} beacon(s) skipped`)
      if (warningsSummary.parcels) parts.push(`${warningsSummary.parcels} parcel(s) skipped`)
      if (warningsSummary.beaconDescTruncated) parts.push(`${warningsSummary.beaconDescTruncated} beacon description(s) truncated`)
      if (warningsSummary.priorDiagramsTruncated) parts.push(`${warningsSummary.priorDiagramsTruncated} prior diagram(s) truncated`)
      if (warningsSummary.scaleFallback) parts.push('scale fell back to 1:500')
      const summary = parts.length ? parts.join(', ') : `${warningCount} warning(s)`
      // The component already imports the toast helper; if not, use console.warn.
      // eslint-disable-next-line no-console
      console.warn(`[DXF Export] ${summary}. See the PDF for the complete record.`)
      // If there's an existing toast/notify helper in the component, call it here:
      // toast.warning(`DXF generated with ${summary}. See the PDF for the complete record.`)
    }
```

- [ ] **Step 4: Commit**

```bash
git add app-frontend/src/services/geopdf.ts app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue
git commit -m "feat(dxf-frontend): thread new metadata fields and surface warning toast

VectorGeoPDFRequest carries firm, licenseNumber, parentProperty,
wholePortion, priorDiagrams[], beaconGroups[]. generateDXF() returns
{ blob, warningCount, warningsSummary }. exportToDXF() builds the
extended metadata payload and surfaces a console.warn (placeholder for
the project's toast helper) when the response carries warnings."
```

---

## Task 15: Layer 2 — Structural integration test with the synthetic fixture

**Files:**
- Create: `app-backend/src/services/__tests__/fixtures/sampleDxfPlan.js`
- Create: `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`

- [ ] **Step 1: Create the fixture**

Create `app-backend/src/services/__tests__/fixtures/sampleDxfPlan.js`:

```js
/**
 * Representative survey-plan fixture for Layer 2 integration tests.
 * Outside figure (4 edges) + 2 surveyed parcels + 6 beacons (3 placed, 3 found)
 * + beaconGroups (2) + priorDiagrams (2) + scale 1:1000 + ISO_A2.
 */
export const sampleFixture = {
  parcels: {
    features: [
      // Surveyed parcel 1 — triangle
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [50000, 2200000],
            [50100, 2200000],
            [50050, 2200100],
            [50000, 2200000],
          ]],
        },
        properties: { stand: '123', area_m2: 5000 },
      },
      // Surveyed parcel 2 — quad
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [50100, 2200000],
            [50200, 2200000],
            [50200, 2200100],
            [50100, 2200100],
            [50100, 2200000],
          ]],
        },
        properties: { stand: '124', area_m2: 10000 },
      },
    ],
  },
  beacons: {
    features: [
      { type: 'Feature', geometry: { coordinates: [50000, 2200000] }, properties: { pointId: 'A', type: 'placed' } },
      { type: 'Feature', geometry: { coordinates: [50100, 2200000] }, properties: { pointId: 'B', type: 'placed' } },
      { type: 'Feature', geometry: { coordinates: [50200, 2200000] }, properties: { pointId: 'C', type: 'placed' } },
      { type: 'Feature', geometry: { coordinates: [50050, 2200100] }, properties: { pointId: 'D', type: 'found' } },
      { type: 'Feature', geometry: { coordinates: [50100, 2200100] }, properties: { pointId: 'E', type: 'found' } },
      { type: 'Feature', geometry: { coordinates: [50200, 2200100] }, properties: { pointId: 'F', type: 'found' } },
    ],
  },
  outsideFigureData: {
    edges: [
      { side: 'A-B', distance: 100, direction: '90°00\'00"',  pointId: 'A', y: 50000, x: 2200000 },
      { side: 'B-C', distance: 100, direction: '180°00\'00"', pointId: 'B', y: 50100, x: 2200000 },
      { side: 'C-D', distance: 100, direction: '270°00\'00"', pointId: 'C', y: 50100, x: 2200100 },
      { side: 'D-A', distance: 100, direction: '0°00\'00"',   pointId: 'D', y: 50000, x: 2200100 },
    ],
    constants: { pointId: 'A', y: 50000, x: 2200000 },
  },
  metadata: {
    designation: 'STAND 123-124 BORROWDALE',
    surveyOf: 'Two stands at Borrowdale Heights',
    township: 'Borrowdale',
    district: 'Harare',
    surveyor: 'J. Doe',
    date: '2026-05-31',
    firm: 'Acme Surveying & Mapping (Pvt) Ltd',
    licenseNumber: '1234',
    parentProperty: 'Lot 9 of Borrowdale',
    wholePortion: 'a portion',
    priorDiagrams: ['Diagram-GP No. 4567', 'Diagram-GP No. 8910'],
  },
  beaconGroups: [
    { points: 'A–C', description: 'Permanent concrete pillars' },
    { points: 'D–F', description: 'Iron pegs with cement collar' },
  ],
  projection: 'EPSG:22291',
  scale: '1:1000',
  sheetSize: 'ISO_A2',
}
```

- [ ] **Step 2: Create the integration test**

Create `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`:

```js
/**
 * Layer 2 structural integration tests for dxfGenerator.
 * Asserts section integrity, layer presence, entity counts per layer,
 * orientation invariant, and UCS presence — without snapshotting full output.
 */
import { describe, test, expect } from '@jest/globals'
import { generateDXF } from '../dxfGenerator.js'
import { countLayerOnTable, entityCount, parseFirstEntityOf } from './dxfParse.js'
import { sampleFixture } from './fixtures/sampleDxfPlan.js'

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }

describe('dxfGenerator integration — sample fixture', () => {
  let dxf, warnings
  beforeAll(() => {
    const r = generateDXF(sampleFixture, fakeLogger)
    dxf = r.buffer.toString()
    warnings = r.warnings
  })

  test('overall section integrity (HEADER … ENTITIES … EOF)', () => {
    expect(dxf).toMatch(/\bSECTION\b[\s\S]*?\bHEADER\b/)
    expect(dxf).toMatch(/\bSECTION\b[\s\S]*?\bENTITIES\b/)
    expect(dxf).toMatch(/\bEOF\b\s*$/)
  })

  test('all 12 required layers are declared exactly once', () => {
    const required = [
      'OUTSIDE_FIGURE','PARCELS','BEACONS','BEACON_LABELS',
      'DISTANCES','DIRECTIONS','STAND_NUMBERS','TITLE_BLOCK',
      'NORTH_ARROW','SCALE_BAR','GRID','MARGIN_GUIDES',
    ]
    for (const l of required) {
      expect(countLayerOnTable(dxf, l)).toBe(1)
    }
  })

  test('entity counts on key layers match the fixture', () => {
    expect(entityCount(dxf, 'POLYLINE', 'PARCELS'))
      .toBe(sampleFixture.parcels.features.length)
    expect(entityCount(dxf, 'CIRCLE', 'BEACONS'))
      .toBe(sampleFixture.beacons.features.length)
    expect(entityCount(dxf, 'LINE', 'NORTH_ARROW')).toBeGreaterThanOrEqual(3)
    expect(entityCount(dxf, 'LINE', 'SCALE_BAR')).toBeGreaterThanOrEqual(7)
    expect(entityCount(dxf, 'LINE', 'GRID')).toBeGreaterThan(0)
    expect(entityCount(dxf, 'LINE', 'MARGIN_GUIDES')).toBeGreaterThanOrEqual(16)
    expect(entityCount(dxf, 'TEXT', 'TITLE_BLOCK')).toBeGreaterThanOrEqual(8)
  })

  test('orientation invariant — DXF X = Cape Lo Y, DXF Y = Cape Lo X', () => {
    const beacon = parseFirstEntityOf(dxf, 'CIRCLE', 'BEACONS')
    expect(beacon).not.toBeNull()
    expect(beacon.x).toBeCloseTo(sampleFixture.beacons.features[0].geometry.coordinates[0], 3)
    expect(beacon.y).toBeCloseTo(sampleFixture.beacons.features[0].geometry.coordinates[1], 3)
  })

  test('UCS table contains CAD_NORTH_UP entry', () => {
    expect(dxf).toMatch(/\bUCS\b[\s\S]{0,500}\bCAD_NORTH_UP\b/)
  })

  test('endorsement block, beacon descriptions, and prior diagrams all rendered', () => {
    expect(dxf).toMatch(/APPROVED FOR LODGEMENT/)
    expect(dxf).toMatch(/Dispensation Certificate/)
    expect(dxf).toMatch(/BEACON DESCRIPTIONS/)
    expect(dxf).toMatch(/Permanent concrete pillars/)
    expect(dxf).toMatch(/Diagram-GP No\. 4567/)
    expect(dxf).toMatch(/certify this plan correct/)
  })

  test('clean fixture produces zero warnings', () => {
    expect(warnings.count).toBe(0)
  })
})

describe('dxfGenerator integration — graceful degradation', () => {
  test('one bad beacon + one bad parcel ⇒ warnings.count === 2, no throw', () => {
    const bad = JSON.parse(JSON.stringify(sampleFixture))
    bad.beacons.features.push({
      type: 'Feature',
      geometry: { coordinates: [NaN, NaN] },
      properties: { pointId: 'BAD', type: 'placed' },
    })
    bad.parcels.features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[50000, 2200000], [50001, 2200000]]] },
      properties: { stand: 'BAD' },
    })
    const { buffer, warnings } = generateDXF(bad, fakeLogger)
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(warnings.count).toBe(2)
    expect(warnings.summary.beacons).toBe(1)
    expect(warnings.summary.parcels).toBe(1)
  })
})
```

- [ ] **Step 3: Run, expect pass**

Run: `cd app-backend && npm run test`
Expected: all tests green, including all unit tests from Tasks 1-13.

- [ ] **Step 4: Commit**

```bash
git add app-backend/src/services/__tests__/fixtures/sampleDxfPlan.js app-backend/src/services/__tests__/dxfGenerator.integration.test.js
git commit -m "test(dxf): Layer 2 structural integration coverage + graceful-degradation regression

Synthetic fixture (2 parcels, 6 beacons, 2 beacon groups, 2 priors)
exercises section integrity, layer registry, per-layer entity counts,
orientation invariant, UCS presence, and the chrome blocks. Separate
regression case feeds NaN-coord beacon + 2-vertex parcel and asserts
the warnings counter increments correctly."
```

---

## Task 16: Manual CAD verification — checklist + screenshots

**Files:**
- Reuse: `verification/drive.mjs` (from the beacon-comparison work — re-purpose to navigate to the survey-plan map view and click the DXF button).

This task is not automated. It produces evidence (screenshots) that goes in the PR description.

- [ ] **Step 1: Make sure backend + frontend are running**

Two terminals:
```bash
cd app-backend && npm run dev      # port 3050
cd app-frontend && npm run dev     # port 5173 or 5174
```

- [ ] **Step 2: Use a logged-in browser session**

If you don't have a test user from prior work, register one:
```bash
EMAIL="verify-$(date +%s)@local.test"
PASS="VerifyPass!42"
curl -s -X POST http://localhost:3050/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"Verify Bot\",\"surveyorType\":\"registered\",\"licenseNumber\":\"PLS-V-001\"}"
TOKEN=$(curl -s -X POST http://localhost:3050/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d).token)})")
echo "$TOKEN" > verification/verify_token.txt
```

Manually load the dev server URL in a browser; inject the token into localStorage:
```js
localStorage.setItem('token', '<paste TOKEN here>')
localStorage.setItem('lastActivity', Date.now())
```

Navigate to a project that has sample plan data (Cadastral Standard module → a project with parcels). If none exists, seed one via `npm run seed:sample` in `app-backend/`.

- [ ] **Step 3: Click `📐 Export AutoCAD DXF` and download**

The browser saves `survey-plan-<id>-<ts>.dxf`. Open the file in **LibreCAD** (Windows installer: https://librecad.org) or **QCAD** — both free, no AutoCAD license required.

- [ ] **Step 4: Walk the visual checklist; capture screenshots**

Confirm each item below by visual inspection. Take a screenshot per major area; save them under `verification/dxf-verification/` (already gitignored).

  - [ ] Title block at the top of the sheet; designation, surveyOf, firm, parent-property all visible.
  - [ ] Drawing zone shows the parcel(s) with **south at the top**.
  - [ ] North/south arrow in upper-right of the drawing zone, pointing up.
  - [ ] Scale bar in lower-right of the drawing zone with metre labels.
  - [ ] Coordinate-grid tick marks along the four drawing borders with rounded Cape Lo values.
  - [ ] Beacons render with distinct placed (filled circle) vs found (open circle + cross) symbols.
  - [ ] Schedule of areas + beacon descriptions in lower-left.
  - [ ] Outside-figure data in lower-centre.
  - [ ] Endorsement column in right margin with all five sub-blocks visible (APPROVED FOR LODGEMENT, Dispensation Certificate, Plan No. box, Prior diagrams list, Surveyor certification).

- [ ] **Step 5: UCS toggle works**

In LibreCAD command line, type `_UCS R CAD_NORTH_UP`. Verify the view flips so north is at the top. Type `_UCS World` to restore.

(Some CAD tools render the UCS rotation immediately; others require a `regen` first. If the toggle doesn't visibly flip, type `regen` and retry.)

- [ ] **Step 6: Add screenshots to the PR description**

When opening the PR for this branch, embed the verification screenshots in the description under a "Manual verification" heading.

---

## Self-Review Checklist (run after all tasks merged)

Run through this once before merging:

1. **Spec coverage** — every spec section pointed to a task:
   - §Components/a Coordinate transform → Task 2
   - §Components/b Drawing-area emitters → Tasks 7, 8, 9
   - §Components/c Beacon symbol differentiation → Task 6
   - §Components/d Beacon-description → Task 11
   - §Components/e Endorsement zone → Task 13
   - §Components/f Title-block fields → Task 12
   - §Components/g Margin guides → Task 10
   - §Components/h UCS table entry → Task 4
   - §Data flow extension → Task 14
   - §Error handling guards → Tasks 3 + 5 + the per-emitter `warn(...)` calls
   - §Testing Layer 1 (unit) → distributed across Tasks 2, 3, 6-13
   - §Testing Layer 2 (integration) → Task 15
   - §Testing Layer 3 (manual CAD) → Task 16
2. **No placeholders** — every step has concrete code; every file path is exact; every commit message complete.
3. **Type consistency** — `warn(category, n)` signature consistent across Tasks 3, 5, 11, 13. `capeLoToDxfSouthUp(y, x)` signature consistent across the test fixtures and source.
4. **TDD discipline maintained** — every emitter task starts with a failing test, runs to confirm failure, then implements; tests live next to the source.
5. **Frequent commits** — sixteen commits across the task set; each commit produces a working backend (tests stay green).
