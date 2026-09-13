### Task 6: Suffix-derivation sites — replace every numeric-prefix regex with the shared rule; delete the dead ones

**Files:**
- Test: `app-backend/src/services/__tests__/beaconLabel-derivation.test.js` *(new)*
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue` — sites #1 (`:1209`, `:1229`) and #2 (`:4250-4268`)
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` — site #6 (`:6756-6761`)
- Modify: `app-backend/src/services/dxfGenerator.js` — site #3 (`:1515-1538`), extract `fallbackBeaconLabel`
- Modify: `app-backend/src/services/pdfkitGeoPDF.js` — site #4 (`:2870-2903`); delete dead #5 `findParcelWithBeaconPrefix` (`:3307-3332`)
- Modify: `app-backend/src/routes/surveyPlanPreview.js` — site #7 (`:792-811`)
- Modify: `app-shared/block-definitions.js` — delete dead #8 `extractBeaconSuffix` (`:631-640`) and its default-export entry (`:834`)

**Interfaces:**
- Consumes: `splitBeaconName`, `normalizeBeaconName`, `labelParts` from `app-shared/beaconName.js` (Task 1). `labelParts(name)` = `splitBeaconName(normalizeBeaconName(name))` — prefix to find the stand, suffix to print, so `2474a` prints `A` while `1464An` prints `An`.
- Produces:
  - `fallbackBeaconLabel(beaconName, findPolygon): { text: string; isInsideParcel: boolean; polygon: any | null }` in `dxfGenerator.js` (site #3's PRIORITY-2 branch, extracted and exported for test).
  - No new API. Nothing else is added; sites #1/#2/#6/#7 derive the suffix with `labelParts(...).suffix`.

**Spec anchors:** `docs/superpowers/specs/2026-09-12-beacon-name-reconciliation-design.md` Part 4 (`:496-504`), Part 5 (`:506-522`); out-of-scope note (`:588-604`). Do **not** touch: `topologyBuilder.extractBeaconSuffix` (`topologyBuilder.js:260`, site #9), `automatedParcelDetector.ts` (#10), `beaconNameMatch.ts` (#11), any of the five spatial matchers, or the Outside Figure on-load auto-update.

**Why sites differ:** #1/#2/#6/#7 uppercase/`[A-Z][a-z]*` before matching, so a `1464An` or `2474a` beacon falls out as a full-name label. #4's regex `/^(\d+)([A-Z]+)$/` (`:2870`) the same way. The shared `labelParts` fixes all of them with no casing logic at the site.

**Line-number drift:** Tasks 1-5 do not touch SurveyPlanMapView.vue, surveyPlanPreview.js, dxfGenerator.js, pdfkitGeoPDF.js, or block-definitions.js. Line numbers are as of `HEAD 44e1df1`.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/services/__tests__/beaconLabel-derivation.test.js`:

```js
/**
 * Part 4 suffix-derivation sites — the shared label rule (`app-shared/beaconName.js`)
 * against the two pure fallback derivations. Run:
 * cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js beaconLabel-derivation
 */
import { describe, test, expect } from '@jest/globals'
import { fallbackBeaconLabel } from '../dxfGenerator.js'
import { splitBeaconName, normalizeBeaconName, labelParts } from '../../../../app-shared/beaconName.js'

describe('shared rule (surface, so a site break is visible in its own suite)', () => {
  test('2474a → suffix A; 1464An → suffix An; SD4 → no prefix', () => {
    expect(labelParts('2474a')).toEqual({ prefix: '2474', suffix: 'A' })
    expect(labelParts('1464An')).toEqual({ prefix: '1464', suffix: 'An' })
    expect(labelParts('2474AB')).toEqual({ prefix: '2474', suffix: 'AB' })
    expect(labelParts('SD4')).toBeNull()
    expect(labelParts('2474A1')).toBeNull() // trailing digit is not a suffix
    expect(labelParts('')).toBeNull()
  })
  test('normalizeBeaconName only uppercases an ALL-lowercase suffix', () => {
    expect(normalizeBeaconName('2474a')).toBe('2474A')
    expect(normalizeBeaconName('1464An')).toBe('1464An')
    expect(normalizeBeaconName('2474A')).toBe('2474A')
  })
})

describe('fallbackBeaconLabel (site #3, extracted)', () => {
  test('2474a on stand 2474 → suffix A INSIDE the stand', () => {
    const result = fallbackBeaconLabel('2474a', prefix => (prefix === '2474' ? { stand: '2474' } : null))
    expect(result).toEqual({ text: 'A', isInsideParcel: true, polygon: { stand: '2474' } })
  })

  test('1464An on stand 1464 → suffix An INSIDE the stand (mixed-case preserved)', () => {
    const result = fallbackBeaconLabel('1464An', prefix => (prefix === '1464' ? { stand: '1464' } : null))
    expect(result?.text).toBe('An')
    expect(result?.isInsideParcel).toBe(true)
  })

  test('2474AB on stand 2474 → suffix AB INSIDE', () => {
    const result = fallbackBeaconLabel('2474AB', prefix => (prefix === '2474' ? {} : null))
    expect(result?.text).toBe('AB')
    expect(result?.isInsideParcel).toBe(true)
  })

  test('numeric-prefix name with no matching stand → full name OUTSIDE', () => {
    const result = fallbackBeaconLabel('2474a', () => null)
    expect(result).toEqual({ text: '2474a', isInsideParcel: false, polygon: null })
  })

  test('letter-only name (SD4) → full name OUTSIDE, untouched', () => {
    const result = fallbackBeaconLabel('SD4', () => null)
    expect(result).toEqual({ text: 'SD4', isInsideParcel: false, polygon: null })
  })

  test('empty/undefined is safe', () => {
    expect(fallbackBeaconLabel('', () => null).text).toBe('')
    expect(fallbackBeaconLabel(undefined, () => null).text).toBeUndefined()
  })
})
```

- [ ] **Step 2: `dxfGenerator.js` — site #3 (`:1515-1538`)**

Add the import at `:37` (next to the existing `block-definitions.js` import):

```js
import { splitBeaconName, labelParts } from '../../../app-shared/beaconName.js';
```

Add before `labelDecision` (`:1515`):

```js
/**
 * PRIORITY-2 fallback for a beacon with no UI-supplied label: derive the suffix
 * from the shared rule (Part 4 site #3). prefix finds the stand, suffix prints —
 * so 2474a prints A inside stand 2474, 1464An prints An, and a letter-only or
 * non-matching name prints in full outside. `findPolygon(prefix)` resolves the
 * parcel polygon (the `parcelByStand` lookup inside the generator).
 */
export function fallbackBeaconLabel(beaconName, findPolygon) {
  const parts = splitBeaconName(beaconName);
  const polygon = parts ? findPolygon(parts.prefix) : null;
  if (parts && polygon) {
    return { text: labelParts(beaconName).suffix, isInsideParcel: true, polygon };
  }
  return { text: beaconName, isInsideParcel: false, polygon: null };
}
```

And replace the PRIORITY-2 branch (`:1530-1537`):

```js
    // PRIORITY 2: pattern-matched fallback (matches PDF:4855-4951).
    return fallbackBeaconLabel(beaconName, (prefix) => parcelByStand.get(prefix));
```

The UI-label branch (`:1518-1528`) stays verbatim — it is fed by the frontend's sites #1/#2.

- [ ] **Step 3: `pdfkitGeoPDF.js` — site #4 (`:2870-2903`), delete dead #5**

Add the import at `:16` (next to the `block-definitions.js` import):

```js
import { splitBeaconName, labelParts } from "../../../app-shared/beaconName.js";
```

Replace the FALLBACK block's match line (`:2870`) and the inside-branch (`:2888-2903`):

```js
      const parts = splitBeaconName(beaconName);

      // Control/reference beacons (no numeric prefix) - always show full name
      if (!parts) {
        config = labelConfig.outsideParcel;
        displayLabel = beaconName;
        isInsideLabel = false;

        const closeOffset = beaconRadius + 3;
        labelPos = {
          x: pos.x + closeOffset,
          y: pos.y - closeOffset,
        };

        fullNameOutsideCount++;
        logger.info(
          `[PDFKit] 🎯 Control beacon "${beaconName}": showing full name`
        );
      } else {
        const beaconSuffix = labelParts(beaconName).suffix;

        // PRIMARY: Find the display parcel directly by stand name.
        const displayParcel = parcels.features.find(
          (p) => p.properties.stand?.toString() === parts.prefix &&
                 !p.properties.isOutsideFigure
        );

        if (displayParcel) {
          config = labelConfig.insideParcel;
          displayLabel = beaconSuffix;
          isInsideLabel = true;
          // ... rest of the branch unchanged (:2906 onwards)
```

`splitBeaconName` accepts lowercase (`2474a`), mixed-case (`1464An`) and multi-uppercase (`2474AB`) suffixes; `labelParts` normalises the emitted suffix (`2474a` → `A`, `1464An` → `An`).

The bold gate (`:3011-3016`, `/^[A-Z]+$/.test(displayLabel)`) is **left as is**: an uppercased suffix passes it, and a mixed-case `An` keeps plain type (spec Part 4 site #4 note).

Delete dead #5 — `findParcelWithBeaconPrefix` (`:3307-3332`) plus its JSDoc (`:3301-3306` is `isBeaconLabelInsideParcel`'s doc — delete only `:3307-3332`). Verified a `rg "findParcelWithBeaconPrefix"` shows the only occurrence is the definition at `:3307` — no caller anywhere.

- [ ] **Step 4: `surveyPlanPreview.js` — site #7 (`:792-811`)**

Add the import at `:15` (next to the `block-definitions.js` import):

```js
import { splitBeaconName, labelParts } from '../../../app-shared/beaconName.js';
```

Replace the match + suffix inside the standard-beacon branch (`:790-797`):

```js
          // Parse beacon name to extract stand number and suffix (supports multi-character suffixes)
          // Examples: "1464A" → ["1464", "A"], "1464An" → ["1464", "An"], "2474a" → ["2474", "A"]
          const labelParts_ = labelParts(beaconName);

          if (labelParts_) {
            // STANDARD BEACON NAMING
            const beaconStand = labelParts_.prefix;
            const suffix = labelParts_.suffix;
```

The rest of the branch (`:799-825`) is unchanged — `beaconStand` and `suffix` after the `if` still gate on the parent-parcel rule and emit `displayLabel: suffix` (`:811`). (Do not introduce `labelParts_` as a name in the plan's shipped code — use `const parts = labelParts(beaconName)`; the underscore is only to avoid shadowing the imported function in the sketch.)

- [ ] **Step 5: `SurveyPlanMapView.vue` — sites #1 (`:1209`, `:1229`) and #2 (`:4250`, `:4268`)**

Add the import at `:615` (next to the `si727SheetSizes.js` import):

```ts
import { splitBeaconName, labelParts } from '../../../../../app-shared/beaconName.js'
```

Site #1 (`:1207-1229`) — replace the two lines:

```ts
  beaconMap.forEach(beacon => {
    // Extract numeric prefix via the shared rule (Part 4 site #1)
    const beaconParts = splitBeaconName(beacon.name)

    // Control/reference beacons (no numeric prefix) - always show full name
    if (!beaconParts) {
      // ... unchanged full-name branch
      return
    }

    const beaconPrefix = beaconParts.prefix
    const beaconSuffix = labelParts(beacon.name).suffix
```

Site #2 (`:4249-4268`) — same replacement (`beaconParts` / `labelParts(beacon.name).suffix`). The surrounding logic (`matchingParcelIds`, `:4271-4288`) is unchanged.

- [ ] **Step 6: `MapLibreAreaView.vue` — site #6 (`:6756-6761`)**

Add the import at `:945-949` (next to the `normalizeBeaconName` import added in Task 5):

```ts
import { splitBeaconName, labelParts } from '../../../../app-shared/beaconName.js';
```

Replace the match + suffix lines (`:6753-6761`):

```ts
      // Parse beacon name via the shared rule (Part 4 site #6)
      // Examples: "1425A" -> stand: "1425", suffix: "A"
      //           "1464An" -> stand: "1464", suffix: "An"
      //           "2474a" -> stand: "2474", suffix: "A"
      //           "2474AB" -> stand: "2474", suffix: "AB"
      const beaconParts = splitBeaconName(beaconName);

      if (beaconParts) {
        // STANDARD BEACON NAMING
        const beaconStand = beaconParts.prefix;
        const suffix = labelParts(beaconName).suffix;
```

The rest (`:6771-6784`) is unchanged. This now matches `2474a` and `2474AB`; previously both fell into the non-standard branch and printed full-name outside the parent (spec Part 4 site #6).

- [ ] **Step 7: `block-definitions.js` — delete dead #8 (`:631-640` + `:834`)**

Delete the `extractBeaconSuffix` function and its JSDoc at `:631-640`, and remove `extractBeaconSuffix` from the default export (`:834`). Verified: the only references are the definition (`:632`) and the default-export entry (`:834`) — no importer anywhere (the `topologyBuilder.js:260` function of the same name is a different, in-scope-adjacent utility and is **not** touched).

- [ ] **Step 8: Verify**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js beaconLabel-derivation
```

Expected: PASS.

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js
```

Expected: baseline + new tests, no new failures. **Snapshot risk (spec Part 5 `:519-522`):** no committed fixture holds a lowercase or mixed-case numeric-suffix name, so `pdfkitGeoPDF.snapshot.test.js` / `dxfGenerator.snapshot.test.js` should not move. If a snapshot does fire, inspect every moved label before regenerating — do not blindly update.

```bash
cd app-frontend && npm test && npm run build
```

Expected: all frontend suites green and BUILD SUCCESSFUL.

**Manual browser checklist (mandatory, Task 6):**

1. With a project containing `2474a` (lowercase) and `1464An` (mixed-case) beacons, open the survey-plan preview map → `A` is drawn inside stand 2474 and `An` inside stand 1464; the full names no longer appear outside the stands.
2. The Area/Consistency PDF → page 1 beacon figure shows the same inside-stand suffixes; regardless, every area, distance, direction, dy/dx is unchanged from before this task (labels only, no geometry).
3. The general-plan DXF export → `2474a` beacons lay this out as `A` inside parcel 2474 (fed by #1/#2; the fallback path is unchanged).
4. Add a new beacon named `2474AB` → it prints `AB` inside stand 2474 on map and PDF (previously full-name outside).
5. Control beacons (`SD4`, `TSM5025`) still print their full names outside, untouched.
6. The `pdfkitGeoPDF`/`dxfGenerator` suites still pass; regenerate a plan PDF and DXF and confirm zero `⚠️ No UI label for ...` fallback warnings for these beacons.

- [ ] **Step 9: Commit**

```bash
git add app-backend/src/services/__tests__/beaconLabel-derivation.test.js app-backend/src/services/dxfGenerator.js app-backend/src/services/pdfkitGeoPDF.js app-backend/src/routes/surveyPlanPreview.js app-shared/block-definitions.js app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
git commit -m "feat(beacon-names): derive beacon label suffixes from the shared rule at every site"
```