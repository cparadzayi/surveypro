# Diagram Contiguous Terminal-Aware Offsets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a surveyor tag a subject boundary side so an abutting (contiguous) parcel's dashed offset sits at both terminals (spans the side) or a single terminal (click near it), with the label centred on the abutting extent — and allow up to two contiguous neighbours per side.

**Architecture:** One pure backend helper (`contiguousMarks`) decides which terminal(s) get a stub and where the label anchors; the three renderers (diagram PDF, general-plan PDF, general-plan DXF) all consume it so they stay identical. The frontend adds an `end` discriminator (`from`/`to`/`both`) to the side-annotation model, derives it from the click position along the side, and exposes an override in the editor. Absent `end` means `both`, so all existing data renders unchanged.

**Tech Stack:** Node.js ESM (backend, Jest under `--experimental-vm-modules`), Vue 3 + TypeScript + Vitest (frontend), PDFKit, DXF text emission.

## Global Constraints

- Backend is ESM (`"type": "module"`). Run backend tests from `app-backend` with:
  `node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>` (bare `npx jest` fails).
- Frontend tests run with `npm run test` (Vitest) from `app-frontend`; a single file via
  `npx vitest run src/views/modules/cadastral-standard/__tests__/sideAnnotations.test.ts`.
- `contiguous` role ONLY. Roads/servitudes (whole-side strips) are untouched.
- `end` is `'from' | 'to' | 'both'`; **absent ⇒ `'both'`** (back-compat, no migration).
- `from` = the side's first-letter vertex (A of 'AB'); `to` = second (B).
- Follow existing file conventions; all coordinates the helper sees are already in the
  caller's device space (PDF points or DXF ground units).
- End every task by committing. Commit messages end with the repo's Co-Authored-By trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: Backend shared helper `contiguousMarks`

**Files:**
- Create: `app-backend/src/services/diagram/contiguousMarks.js`
- Test: `app-backend/src/services/diagram/__tests__/contiguousMarks.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `contiguousMarks(a, b, end) -> { stubFrom: boolean, stubTo: boolean, labelAnchor: [number, number] }`
  where `a`, `b` are `[x, y]` terminal points and `end` is `'from' | 'to' | 'both' | undefined`.
  `stubFrom`/`stubTo` say whether to draw an outward stub at `a`/`b`; `labelAnchor` is the
  pre-offset point the label centres on.

- [ ] **Step 1: Write the failing test**

```js
// app-backend/src/services/diagram/__tests__/contiguousMarks.test.js
import { describe, test, expect } from '@jest/globals'
import { contiguousMarks } from '../contiguousMarks.js'

const a = [0, 0]
const b = [100, 0]      // mid = [50, 0]

describe('contiguousMarks', () => {
  test("both: stubs at both terminals, label at the side midpoint", () => {
    expect(contiguousMarks(a, b, 'both')).toEqual({
      stubFrom: true, stubTo: true, labelAnchor: [50, 0],
    })
  })

  test("missing end defaults to both (back-compat)", () => {
    expect(contiguousMarks(a, b, undefined)).toEqual({
      stubFrom: true, stubTo: true, labelAnchor: [50, 0],
    })
  })

  test("from: stub at A only, label at the A-half quarter-point", () => {
    expect(contiguousMarks(a, b, 'from')).toEqual({
      stubFrom: true, stubTo: false, labelAnchor: [25, 0],
    })
  })

  test("to: stub at B only, label at the B-half quarter-point", () => {
    expect(contiguousMarks(a, b, 'to')).toEqual({
      stubFrom: false, stubTo: true, labelAnchor: [75, 0],
    })
  })

  test("works off-axis (diagonal side)", () => {
    // a=(0,0) b=(40,80) -> mid (20,40); from-anchor = midpoint(a,mid) = (10,20)
    expect(contiguousMarks([0, 0], [40, 80], 'from')).toEqual({
      stubFrom: true, stubTo: false, labelAnchor: [10, 20],
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js contiguousMarks`
Expected: FAIL — `Cannot find module '../contiguousMarks.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// app-backend/src/services/diagram/contiguousMarks.js
/**
 * Decide the offset stubs and label anchor for a contiguous (abutting) neighbour
 * on ONE subject side, shared by the diagram PDF, general-plan PDF and DXF renderers
 * so all three stay identical. Coordinate-space agnostic (PDF points or DXF ground units).
 *
 * @param {[number, number]} a  First terminal of the side (the 'from' / first-letter vertex).
 * @param {[number, number]} b  Second terminal (the 'to' / second-letter vertex).
 * @param {'from'|'to'|'both'|undefined} end  Which terminal(s) the neighbour abuts.
 *        Absent ⇒ 'both' (spans the side) for back-compat with pre-`end` data.
 * @returns {{stubFrom: boolean, stubTo: boolean, labelAnchor: [number, number]}}
 */
export function contiguousMarks(a, b, end) {
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const e = end || 'both'
  if (e === 'from') {
    return { stubFrom: true, stubTo: false, labelAnchor: [(a[0] + mid[0]) / 2, (a[1] + mid[1]) / 2] }
  }
  if (e === 'to') {
    return { stubFrom: false, stubTo: true, labelAnchor: [(mid[0] + b[0]) / 2, (mid[1] + b[1]) / 2] }
  }
  return { stubFrom: true, stubTo: true, labelAnchor: mid }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js contiguousMarks`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagram/contiguousMarks.js app-backend/src/services/diagram/__tests__/contiguousMarks.test.js
git commit -m "feat(diagram): contiguousMarks helper for terminal-aware offsets

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Frontend model — `end` field, keying rules, and click-fraction math

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/sideAnnotations.ts`
- Test: `app-frontend/src/views/modules/cadastral-standard/__tests__/sideAnnotations.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `SideAnnotation.end?: 'from' | 'to' | 'both'` (contiguous only; absent ⇒ 'both').
  - `upsertAnnotation(list, ann)` — for `role:'contiguous'`, keys on `side`+`end` with `both`
    exclusivity; road/servitude unchanged (one per side).
  - `removeAnnotation(list, side, end?)` — `end` omitted removes all entries on `side` (legacy);
    `end` given removes the matching contiguous entry (or the road/servitude entry) on `side`.
  - `fractionAlongSide(pa, pb, p) -> number` — clamped projection of screen point `p` onto
    segment `pa→pb`, returned as `t ∈ [0, 1]` from `pa`.
  - `endFromFraction(t) -> 'from' | 'to' | 'both'` — thirds classifier.

- [ ] **Step 1: Write the failing tests (append to the existing describe file)**

```ts
// append to app-frontend/src/views/modules/cadastral-standard/__tests__/sideAnnotations.test.ts
import { fractionAlongSide, endFromFraction } from '../sideAnnotations'

describe('contiguous end keying', () => {
  test('two contiguous neighbours coexist on one side (from + to)', () => {
    let list: SideAnnotation[] = []
    list = upsertAnnotation(list, { side: 'AB', role: 'contiguous', label: 'N1', end: 'from' })
    list = upsertAnnotation(list, { side: 'AB', role: 'contiguous', label: 'N2', end: 'to' })
    const ab = list.filter(a => a.side === 'AB')
    expect(ab).toHaveLength(2)
    expect(ab.map(a => a.end).sort()).toEqual(['from', 'to'])
  })

  test("'both' is exclusive: it replaces any single-end entries on the side", () => {
    let list: SideAnnotation[] = [
      { side: 'AB', role: 'contiguous', label: 'N1', end: 'from' },
      { side: 'AB', role: 'contiguous', label: 'N2', end: 'to' },
    ]
    list = upsertAnnotation(list, { side: 'AB', role: 'contiguous', label: 'N3', end: 'both' })
    const ab = list.filter(a => a.side === 'AB')
    expect(ab).toHaveLength(1)
    expect(ab[0]).toMatchObject({ end: 'both', label: 'N3' })
  })

  test('adding a single end replaces an existing both on the side', () => {
    let list: SideAnnotation[] = [{ side: 'AB', role: 'contiguous', label: 'B', end: 'both' }]
    list = upsertAnnotation(list, { side: 'AB', role: 'contiguous', label: 'F', end: 'from' })
    const ab = list.filter(a => a.side === 'AB')
    expect(ab).toHaveLength(1)
    expect(ab[0]).toMatchObject({ end: 'from', label: 'F' })
  })

  test('re-tagging the same end replaces just that entry', () => {
    let list: SideAnnotation[] = [
      { side: 'AB', role: 'contiguous', label: 'F1', end: 'from' },
      { side: 'AB', role: 'contiguous', label: 'T1', end: 'to' },
    ]
    list = upsertAnnotation(list, { side: 'AB', role: 'contiguous', label: 'F2', end: 'from' })
    const ab = list.filter(a => a.side === 'AB')
    expect(ab).toHaveLength(2)
    expect(ab.find(a => a.end === 'from')).toMatchObject({ label: 'F2' })
    expect(ab.find(a => a.end === 'to')).toMatchObject({ label: 'T1' })
  })

  test('tagging a side as road drops any contiguous entries on it', () => {
    let list: SideAnnotation[] = [
      { side: 'AB', role: 'contiguous', label: 'F', end: 'from' },
      { side: 'AB', role: 'contiguous', label: 'T', end: 'to' },
    ]
    list = upsertAnnotation(list, { side: 'AB', role: 'road', label: 'Klein Road' })
    expect(list.filter(a => a.side === 'AB')).toEqual([{ side: 'AB', role: 'road', label: 'Klein Road' }])
  })

  test('removeAnnotation with end removes only the matching contiguous entry', () => {
    const list: SideAnnotation[] = [
      { side: 'AB', role: 'contiguous', label: 'F', end: 'from' },
      { side: 'AB', role: 'contiguous', label: 'T', end: 'to' },
    ]
    const out = removeAnnotation(list, 'AB', 'from')
    expect(out).toEqual([{ side: 'AB', role: 'contiguous', label: 'T', end: 'to' }])
  })

  test('removeAnnotation without end removes all entries on the side (legacy)', () => {
    const list: SideAnnotation[] = [
      { side: 'AB', role: 'contiguous', label: 'F', end: 'from' },
      { side: 'BC', role: 'road', label: 'R' },
    ]
    expect(removeAnnotation(list, 'AB')).toEqual([{ side: 'BC', role: 'road', label: 'R' }])
  })
})

describe('click-fraction math', () => {
  test('projects a point onto the side and clamps to [0,1]', () => {
    expect(fractionAlongSide([0, 0], [100, 0], [50, 10])).toBeCloseTo(0.5, 5)
    expect(fractionAlongSide([0, 0], [100, 0], [-20, 5])).toBe(0)
    expect(fractionAlongSide([0, 0], [100, 0], [120, 5])).toBe(1)
  })

  test('degenerate zero-length side returns 0', () => {
    expect(fractionAlongSide([10, 10], [10, 10], [10, 10])).toBe(0)
  })

  test('thirds classifier maps t to end', () => {
    expect(endFromFraction(0.1)).toBe('from')
    expect(endFromFraction(0.5)).toBe('both')
    expect(endFromFraction(0.9)).toBe('to')
    expect(endFromFraction(1 / 3)).toBe('both')  // boundary inclusive to middle
    expect(endFromFraction(2 / 3)).toBe('both')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app-frontend && npx vitest run src/views/modules/cadastral-standard/__tests__/sideAnnotations.test.ts`
Expected: FAIL — `fractionAlongSide`/`endFromFraction` not exported; keying assertions fail.

- [ ] **Step 3: Implement — add `end` to the interface**

In `sideAnnotations.ts`, extend the interface (after `servitudeId?`):

```ts
export interface SideAnnotation {
  side: string
  role: SideRole
  label?: string
  widthM?: number
  /** Set on role:'servitude' entries that are a derived mirror of a Servitude record. */
  servitudeId?: string
  /** contiguous only: which terminal(s) the abutment offset sits at.
   *  'from' = first-letter vertex (A of 'AB'), 'to' = second (B), 'both' = whole side.
   *  Absent ⇒ 'both' (back-compat with data saved before this field existed). */
  end?: 'from' | 'to' | 'both'
}
```

- [ ] **Step 4: Implement — replace `upsertAnnotation` and `removeAnnotation`**

Replace the existing `upsertAnnotation` and `removeAnnotation` functions with:

```ts
/** Effective end for a contiguous entry (absent ⇒ 'both'). */
function contigEnd(a: SideAnnotation): 'from' | 'to' | 'both' {
  return a.end ?? 'both'
}

/**
 * Insert/replace an annotation. Roads & servitudes are one-per-side (any existing
 * entry for the side is replaced). Contiguous entries are keyed by side+end with
 * 'both' exclusive: a side holds EITHER one 'both' OR up to two single-end entries.
 * Returns a new array.
 */
export function upsertAnnotation(list: SideAnnotation[], ann: SideAnnotation): SideAnnotation[] {
  if (ann.role === 'contiguous') {
    const end = ann.end ?? 'both'
    const out = list.filter((a) => {
      if (a.side !== ann.side) return true          // other sides untouched
      if (a.role !== 'contiguous') return false     // side changes to contiguous: drop road/servitude
      if (end === 'both') return false              // 'both' replaces every contiguous entry here
      // single end: drop any 'both' on this side and the same-end entry
      return contigEnd(a) !== 'both' && contigEnd(a) !== end
    })
    out.push({ ...ann, end })
    return out
  }
  // road / servitude: exactly one entry per side.
  const out = list.filter((a) => a.side !== ann.side)
  out.push(ann)
  return out
}

/**
 * Drop annotations for `side`. With `end` omitted, removes ALL entries on the side
 * (legacy behaviour). With `end` given, removes the matching contiguous entry (by
 * effective end) or the side's road/servitude entry. Returns a new array.
 */
export function removeAnnotation(
  list: SideAnnotation[],
  side: string,
  end?: 'from' | 'to' | 'both',
): SideAnnotation[] {
  if (end == null) return list.filter((a) => a.side !== side)
  return list.filter((a) => {
    if (a.side !== side) return true
    if (a.role !== 'contiguous') return false       // remove the road/servitude on this side
    return contigEnd(a) !== end                     // keep other-end contiguous neighbours
  })
}
```

- [ ] **Step 5: Implement — add the click-fraction helpers (append to the file)**

```ts
/** Clamp of the scalar projection of `p` onto segment `pa→pb`, as t ∈ [0,1] from pa.
 *  Points are screen-space [x, y]. Degenerate (zero-length) segment returns 0. */
export function fractionAlongSide(
  pa: [number, number],
  pb: [number, number],
  p: [number, number],
): number {
  const dx = pb[0] - pa[0], dy = pb[1] - pa[1]
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return 0
  const t = ((p[0] - pa[0]) * dx + (p[1] - pa[1]) * dy) / len2
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/** Map a click fraction to a contiguous `end`: outer thirds → nearest terminal,
 *  middle third → both. Boundaries (1/3, 2/3) fall in the middle band. */
export function endFromFraction(t: number): 'from' | 'to' | 'both' {
  if (t < 1 / 3) return 'from'
  if (t > 2 / 3) return 'to'
  return 'both'
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/views/modules/cadastral-standard/__tests__/sideAnnotations.test.ts`
Expected: PASS (existing cases + all new cases).

- [ ] **Step 7: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/sideAnnotations.ts app-frontend/src/views/modules/cadastral-standard/__tests__/sideAnnotations.test.ts
git commit -m "feat(diagram): side-annotation end field, keying rules, click-fraction math

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wire the diagram PDF renderer to `contiguousMarks`

**Files:**
- Modify: `app-backend/src/services/diagramPdf.js` (import ~line 11; `drawAdjoiningFeatures` contiguous branch ~247 and label branch ~279)
- Test: `app-backend/src/services/__tests__/diagramPdf.test.js` (extend)

**Interfaces:**
- Consumes: `contiguousMarks(a, b, end)` from Task 1.
- Produces: no new exports (internal wiring).

- [ ] **Step 1: Write the failing test (append to the existing describe block)**

```js
// append inside describe('generateDiagramPDF', …) in app-backend/src/services/__tests__/diagramPdf.test.js
test('renders single-terminal and both contiguous annotations without error', async () => {
  for (const end of ['from', 'to', 'both', undefined]) {
    const withContig = {
      ...options,
      metadata: {
        ...options.metadata,
        sideAnnotations: [{ side: 'AB', role: 'contiguous', label: 'STAND 86', end }],
      },
    }
    const r = await generateDiagramPDF(withContig, logger)
    expect(r.pdfBuffer.slice(0, 5).toString()).toBe('%PDF-')
    expect(r.pdfBuffer.length).toBeGreaterThan(2000)
  }
})
```

> Note: the diagram's side letters are assigned by ring index; `subject` in the test file is
> a 4-vertex square so side `'AB'` (edge 0→1) always resolves. `sideAnnotations` is read from
> `metadata.sideAnnotations` (see `generateDiagramPDF`'s `drawAdjoiningFeatures` call).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramPdf`
Expected: FAIL — currently the `end` field is ignored, so this test would still *pass* on the
old code. To make it a true red step, first confirm the wiring change is needed by asserting
stub behaviour via the shared helper (covered in Task 1). Here the test is a **regression
guard**: run it now and expect PASS on old code, then keep it green after the change. Proceed
to Step 3 without requiring a red result for this integration guard.

- [ ] **Step 3: Add the import**

At the top of `diagramPdf.js`, next to the `edgeStrip` import (line 11):

```js
import { edgeStrip } from './diagram/edgeStrip.js'
import { contiguousMarks } from './diagram/contiguousMarks.js'
```

- [ ] **Step 4: Replace the contiguous stub branch**

Find (≈ lines 247–254):

```js
    } else if (ann.role === 'contiguous') {
      // Short dashed outward stubs at each endpoint to hint the neighbour continues.
      const st = edgeStrip(a, b, CONTIG_STUB_PT, cen) // st[3]=a+out, st[2]=b+out
      doc.save().dash(3, { space: 2 }).lineWidth(0.6).strokeColor('#000000')
      doc.moveTo(a[0], a[1]).lineTo(st[3][0], st[3][1]).stroke()
      doc.moveTo(b[0], b[1]).lineTo(st[2][0], st[2][1]).stroke()
      doc.undash().restore()
    }
```

Replace with:

```js
    } else if (ann.role === 'contiguous') {
      // Dashed outward stub at each abutting terminal (both when the neighbour spans the
      // side; one when it abuts near a single terminal). Which ends + the label anchor
      // come from the shared contiguousMarks helper.
      const marks = contiguousMarks(a, b, ann.end)
      const st = edgeStrip(a, b, CONTIG_STUB_PT, cen) // st[3]=a+out, st[2]=b+out
      doc.save().dash(3, { space: 2 }).lineWidth(0.6).strokeColor('#000000')
      if (marks.stubFrom) doc.moveTo(a[0], a[1]).lineTo(st[3][0], st[3][1]).stroke()
      if (marks.stubTo) doc.moveTo(b[0], b[1]).lineTo(st[2][0], st[2][1]).stroke()
      doc.undash().restore()
    }
```

- [ ] **Step 5: Anchor the contiguous label at the marks anchor**

Find the contiguous label branch (≈ lines 279–286):

```js
      } else {
        const pos = placeVertexLabel(mid, subjCentroid, {
          beaconR: 0, gap: 2, labelW, labelH: 7,
          segments: subjSegs.concat(neighbourSegs, labelObstacles),
        })
        doc.text(labelText, pos.x, pos.y)
        labelObstacles.push(...boxToSegs({ x: pos.x, y: pos.y, w: labelW, h: 7 }))
      }
```

Replace with:

```js
      } else {
        // Centre the neighbour label on the abutting extent (whole side, or the tagged
        // half) rather than always the side midpoint.
        const m = contiguousMarks(a, b, ann.end)
        const anchor = { px: m.labelAnchor[0], py: m.labelAnchor[1] }
        const pos = placeVertexLabel(anchor, subjCentroid, {
          beaconR: 0, gap: 2, labelW, labelH: 7,
          segments: subjSegs.concat(neighbourSegs, labelObstacles),
        })
        doc.text(labelText, pos.x, pos.y)
        labelObstacles.push(...boxToSegs({ x: pos.x, y: pos.y, w: labelW, h: 7 }))
      }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramPdf`
Expected: PASS (8 existing + new regression guard).

- [ ] **Step 7: Commit**

```bash
git add app-backend/src/services/diagramPdf.js app-backend/src/services/__tests__/diagramPdf.test.js
git commit -m "feat(diagram): terminal-aware contiguous offsets in the diagram PDF

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Wire the general-plan PDF renderer to `contiguousMarks`

**Files:**
- Modify: `app-backend/src/services/adjoiningFeatures.js` (import ~line 18; contiguous branch ~97; label branch ~130)
- Test: `app-backend/src/services/__tests__/adjoiningFeatures.test.js` (extend)

**Interfaces:**
- Consumes: `contiguousMarks(a, b, end)` from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test (append to the existing file)**

```js
// append to app-backend/src/services/__tests__/adjoiningFeatures.test.js
import { drawSubjectAdjoiningFeatures } from '../adjoiningFeatures.js'

// Minimal chainable PDFKit stand-in that records moveTo/lineTo/text.
function fakeDoc() {
  const calls = { moveTo: [], lineTo: [], text: [] }
  const doc = new Proxy({}, {
    get(_t, k) {
      if (k === 'widthOfString') return () => 10
      if (k === 'moveTo') return (x, y) => { calls.moveTo.push([x, y]); return doc }
      if (k === 'lineTo') return (x, y) => { calls.lineTo.push([x, y]); return doc }
      if (k === 'text') return (t, x, y) => { calls.text.push([t, x, y]); return doc }
      return () => doc  // save/restore/dash/undash/lineWidth/strokeColor/fillColor/font/fontSize
    },
  })
  return { doc, calls }
}

// Square subject ring in PDF points; side 'AB' = edge 0→1, a=(0,0) b=(100,0).
const ptRing = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]

describe('drawSubjectAdjoiningFeatures — contiguous terminal offsets', () => {
  test("end:'both' draws two stubs", () => {
    const { doc, calls } = fakeDoc()
    drawSubjectAdjoiningFeatures(doc, {
      ptRing, ptPerGroundM: 1,
      annotations: [{ side: 'AB', role: 'contiguous', label: 'N', end: 'both' }],
    })
    expect(calls.moveTo).toHaveLength(2)
  })

  test('missing end draws two stubs (back-compat)', () => {
    const { doc, calls } = fakeDoc()
    drawSubjectAdjoiningFeatures(doc, {
      ptRing, ptPerGroundM: 1,
      annotations: [{ side: 'AB', role: 'contiguous', label: 'N' }],
    })
    expect(calls.moveTo).toHaveLength(2)
  })

  test("end:'from' draws one stub, starting at terminal A", () => {
    const { doc, calls } = fakeDoc()
    drawSubjectAdjoiningFeatures(doc, {
      ptRing, ptPerGroundM: 1,
      annotations: [{ side: 'AB', role: 'contiguous', label: 'N', end: 'from' }],
    })
    expect(calls.moveTo).toHaveLength(1)
    expect(calls.moveTo[0]).toEqual([0, 0])
  })

  test("end:'to' draws one stub, starting at terminal B", () => {
    const { doc, calls } = fakeDoc()
    drawSubjectAdjoiningFeatures(doc, {
      ptRing, ptPerGroundM: 1,
      annotations: [{ side: 'AB', role: 'contiguous', label: 'N', end: 'to' }],
    })
    expect(calls.moveTo).toHaveLength(1)
    expect(calls.moveTo[0]).toEqual([100, 0])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js adjoiningFeatures.test`
Expected: FAIL — old code always draws two stubs, so the `'from'`/`'to'` cases fail
(`moveTo` length 2, not 1).

- [ ] **Step 3: Add the import**

At the top of `adjoiningFeatures.js`, next to the `edgeStrip` import (line 18):

```js
import { edgeStrip } from './diagram/edgeStrip.js'
import { contiguousMarks } from './diagram/contiguousMarks.js'
```

- [ ] **Step 4: Replace the contiguous stub branch**

Find (≈ lines 97–103):

```js
    } else if (ann.role === 'contiguous') {
      const st = edgeStrip(a, b, CONTIG_STUB_PT, cen) // st[3]=a+out, st[2]=b+out
      doc.save().dash(3, { space: 2 }).lineWidth(0.6).strokeColor('#000000')
      doc.moveTo(a[0], a[1]).lineTo(st[3][0], st[3][1]).stroke()
      doc.moveTo(b[0], b[1]).lineTo(st[2][0], st[2][1]).stroke()
      doc.undash().restore()
    }
```

Replace with:

```js
    } else if (ann.role === 'contiguous') {
      const marks = contiguousMarks(a, b, ann.end)
      const st = edgeStrip(a, b, CONTIG_STUB_PT, cen) // st[3]=a+out, st[2]=b+out
      doc.save().dash(3, { space: 2 }).lineWidth(0.6).strokeColor('#000000')
      if (marks.stubFrom) doc.moveTo(a[0], a[1]).lineTo(st[3][0], st[3][1]).stroke()
      if (marks.stubTo) doc.moveTo(b[0], b[1]).lineTo(st[2][0], st[2][1]).stroke()
      doc.undash().restore()
    }
```

- [ ] **Step 5: Anchor the contiguous label**

Find the contiguous label branch (≈ lines 130–135):

```js
      } else {
        // Contiguous: horizontal outward label beyond the dashed stub.
        const off = CONTIG_LABEL_OFF_PT
        const lx = mid.x + perpX * off, ly = mid.y + perpY * off
        doc.text(labelText, lx - labelW / 2, ly - LABEL_FONT_PT / 2, { lineBreak: false })
      }
```

Replace with:

```js
      } else {
        // Contiguous: horizontal outward label beyond the dashed stub, centred on the
        // abutting extent (whole side, or the tagged half).
        const m = contiguousMarks([p1.x, p1.y], [p2.x, p2.y], ann.end)
        const off = CONTIG_LABEL_OFF_PT
        const lx = m.labelAnchor[0] + perpX * off, ly = m.labelAnchor[1] + perpY * off
        doc.text(labelText, lx - labelW / 2, ly - LABEL_FONT_PT / 2, { lineBreak: false })
      }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js adjoiningFeatures.test`
Expected: PASS (existing + 4 new).

- [ ] **Step 7: Commit**

```bash
git add app-backend/src/services/adjoiningFeatures.js app-backend/src/services/__tests__/adjoiningFeatures.test.js
git commit -m "feat(general-plan): terminal-aware contiguous offsets in the PDF renderer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Wire the general-plan DXF renderer to `contiguousMarks`

**Files:**
- Modify: `app-backend/src/services/adjoiningFeaturesDxf.js` (import ~line 18; contiguous branch ~76; label branch ~103)
- Test: `app-backend/src/services/__tests__/adjoiningFeaturesDxf.test.js` (extend)

**Interfaces:**
- Consumes: `contiguousMarks(a, b, end)` from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests (append to the existing file)**

```js
// append to app-backend/src/services/__tests__/adjoiningFeaturesDxf.test.js
import { emitSubjectAdjoiningFeaturesDxf } from '../adjoiningFeaturesDxf.js'

const ring = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
const geo = { textHeight: 2, stubLen: 3, bandLen: 2, standoff: 1 }

function collect(annotations) {
  const lines = [], texts = []
  emitSubjectAdjoiningFeaturesDxf({
    addLine: (layer, x1, y1, x2, y2) => lines.push([x1, y1, x2, y2]),
    addText: (layer, x, y, t) => texts.push([x, y, t]),
    ptRing: ring, annotations, geo,
    servitudeLayer: 'SERV', defaultLayer: 'DEF',
  })
  return { lines, texts }
}

describe('emitSubjectAdjoiningFeaturesDxf — contiguous terminal offsets', () => {
  test("end:'both' emits two stub lines", () => {
    expect(collect([{ side: 'AB', role: 'contiguous', label: 'N', end: 'both' }]).lines).toHaveLength(2)
  })
  test('missing end emits two stub lines (back-compat)', () => {
    expect(collect([{ side: 'AB', role: 'contiguous', label: 'N' }]).lines).toHaveLength(2)
  })
  test("end:'from' emits one stub line from terminal A", () => {
    const { lines } = collect([{ side: 'AB', role: 'contiguous', label: 'N', end: 'from' }])
    expect(lines).toHaveLength(1)
    expect(lines[0].slice(0, 2)).toEqual([0, 0])
  })
  test("end:'to' emits one stub line from terminal B", () => {
    const { lines } = collect([{ side: 'AB', role: 'contiguous', label: 'N', end: 'to' }])
    expect(lines).toHaveLength(1)
    expect(lines[0].slice(0, 2)).toEqual([100, 0])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js adjoiningFeaturesDxf`
Expected: FAIL — old code emits two stub lines for every contiguous side.

- [ ] **Step 3: Add the import**

At the top of `adjoiningFeaturesDxf.js` (near line 18–20):

```js
import { edgeStrip } from './diagram/edgeStrip.js'
import { formatSI } from './diagram/numberFormat.js'
import { sideToEdgeIndex } from './adjoiningFeatures.js'
import { contiguousMarks } from './diagram/contiguousMarks.js'
```

- [ ] **Step 4: Replace the contiguous stub branch**

Find (≈ lines 76–80):

```js
    } else if (ann.role === 'contiguous') {
      const st = edgeStrip(a, b, stubLen, cen) // st[3]=a+out, st[2]=b+out
      addLine(defaultLayer, a[0], a[1], st[3][0], st[3][1])
      addLine(defaultLayer, b[0], b[1], st[2][0], st[2][1])
    }
```

Replace with:

```js
    } else if (ann.role === 'contiguous') {
      const marks = contiguousMarks(a, b, ann.end)
      const st = edgeStrip(a, b, stubLen, cen) // st[3]=a+out, st[2]=b+out
      if (marks.stubFrom) addLine(defaultLayer, a[0], a[1], st[3][0], st[3][1])
      if (marks.stubTo) addLine(defaultLayer, b[0], b[1], st[2][0], st[2][1])
    }
```

- [ ] **Step 5: Anchor the contiguous label**

Find the contiguous label branch (≈ lines 103–108):

```js
      } else {
        // Contiguous: horizontal outward label beyond the stub.
        const off = stubLen + bandLen * 0.5
        const cx = mid.x + perpX * off, cy = mid.y + perpY * off
        addText(defaultLayer, cx - lw / 2, cy - textHeight / 2, labelText, textHeight, 0)
      }
```

Replace with:

```js
      } else {
        // Contiguous: horizontal outward label beyond the stub, centred on the abutting
        // extent (whole side, or the tagged half).
        const m = contiguousMarks(a, b, ann.end)
        const off = stubLen + bandLen * 0.5
        const cx = m.labelAnchor[0] + perpX * off, cy = m.labelAnchor[1] + perpY * off
        addText(defaultLayer, cx - lw / 2, cy - textHeight / 2, labelText, textHeight, 0)
      }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js adjoiningFeaturesDxf`
Expected: PASS (existing + 4 new).

- [ ] **Step 7: Commit**

```bash
git add app-backend/src/services/adjoiningFeaturesDxf.js app-backend/src/services/__tests__/adjoiningFeaturesDxf.test.js
git commit -m "feat(general-plan): terminal-aware contiguous offsets in the DXF renderer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Frontend UI — derive `end` from the click and expose the override

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`
  (editor template ~12–34; `activeSideEditor` type ~740; click handler `onMapClickSelectParcel` ~1979; `saveSideEditor` ~2014; `clearSideEditor` ~2030)

**Interfaces:**
- Consumes: `fractionAlongSide`, `endFromFraction`, `upsertAnnotation`, `removeAnnotation`
  (Task 2), `contiguousMarks` semantics (via the `end` field).
- Produces: no new exports (view wiring). Verified by typecheck + build + manual smoke.

- [ ] **Step 1: Extend the import**

Change the `sideAnnotations` import (line 629) to add the two helpers:

```ts
import { subjectSides, upsertAnnotation, removeAnnotation, annotationsForSubject, withSubjectAnnotations, hydrateAnnotationsMap, fractionAlongSide, endFromFraction, type SideAnnotation, type SideRole } from './sideAnnotations'
```

- [ ] **Step 2: Extend the `activeSideEditor` ref type**

Change line 740:

```ts
const activeSideEditor = ref<{ side: string; role: SideRole; label: string; widthM: number | null; end: 'from' | 'to' | 'both' } | null>(null)
```

- [ ] **Step 3: Derive `end` from the click and prefill the editor**

Replace the side-hit block in `onMapClickSelectParcel` (≈ lines 1985–1993):

```js
    if (sideHits.length) {
      const side = String(sideHits[0].properties?.side ?? '')
      if (side) {
        const cur = currentSideAnnotations.value.find(a => a.side === side)
        activeSideEditor.value = {
          side, role: cur?.role ?? 'contiguous', label: cur?.label ?? '', widthM: cur?.widthM ?? null,
        }
        return
      }
    }
```

with:

```js
    if (sideHits.length) {
      const side = String(sideHits[0].properties?.side ?? '')
      if (side) {
        // Which terminal(s)? Project the click onto the side in SCREEN space (metric-accurate
        // for short sides) to get a fraction from the 'from' terminal, then classify.
        const coords = (sideHits[0].geometry as any)?.coordinates as [number, number][] | undefined
        let end: 'from' | 'to' | 'both' = 'both'
        if (coords && coords.length >= 2) {
          const pa = map.value!.project(coords[0] as any)
          const pb = map.value!.project(coords[1] as any)
          end = endFromFraction(fractionAlongSide([pa.x, pa.y], [pb.x, pb.y], [e.point.x, e.point.y]))
        }
        // Prefer an existing entry that matches this end (contiguous), else the side's
        // road/servitude entry, else start fresh.
        const cur = currentSideAnnotations.value.find(a =>
          a.side === side && (a.role !== 'contiguous' || (a.end ?? 'both') === end))
          ?? currentSideAnnotations.value.find(a => a.side === side)
        activeSideEditor.value = {
          side,
          role: cur?.role ?? 'contiguous',
          label: cur?.label ?? '',
          widthM: cur?.widthM ?? null,
          end: cur?.role === 'contiguous' ? (cur.end ?? 'both') : end,
        }
        return
      }
    }
```

- [ ] **Step 4: Add the `end` override control to the editor template**

In the modal (after the Width `<label>` block that ends at line 27, before `<div class="side-modal-actions">`):

```html
          <label v-if="activeSideEditor.role === 'contiguous'">Abutment
            <select v-model="activeSideEditor.end">
              <option value="from">From terminal ({{ activeSideEditor.side[0] }})</option>
              <option value="both">Midway (spans side)</option>
              <option value="to">To terminal ({{ activeSideEditor.side[1] }})</option>
            </select>
          </label>
```

- [ ] **Step 5: Persist `end` on save**

Replace `saveSideEditor`'s annotation build (≈ lines 2017–2022):

```js
  const ann: SideAnnotation = {
    side: ed.side,
    role: ed.role,
    label: ed.label?.trim() || undefined,
    widthM: (ed.role === 'servitude' || ed.role === 'road') && ed.widthM != null ? ed.widthM : undefined,
  }
```

with:

```js
  const ann: SideAnnotation = {
    side: ed.side,
    role: ed.role,
    label: ed.label?.trim() || undefined,
    widthM: (ed.role === 'servitude' || ed.role === 'road') && ed.widthM != null ? ed.widthM : undefined,
    end: ed.role === 'contiguous' ? ed.end : undefined,
  }
```

- [ ] **Step 6: Remove the correct entry on Clear**

Replace the `removeAnnotation` call in `clearSideEditor` (line 2033):

```js
  const list = removeAnnotation(currentSideAnnotations.value, ed.side)
```

with:

```js
  const list = removeAnnotation(
    currentSideAnnotations.value, ed.side, ed.role === 'contiguous' ? ed.end : undefined)
```

- [ ] **Step 7: Typecheck and build**

Run: `cd app-frontend && npx vue-tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 8: Manual smoke (diagram module, dev servers already running)**

1. Open the diagram/general-plan step, select the subject/Outside Figure.
2. Click a side **midway** → editor opens with Abutment = *Midway*; save a contiguous label →
   the diagram shows stubs at both terminals, label centred.
3. Click the **same side near terminal A**, save a second contiguous label → the side now shows
   two labels (one per half) with a single stub at each terminal.
4. Reload; confirm both annotations restore (persistence round-trips `end`).

- [ ] **Step 9: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue
git commit -m "feat(diagram): click-position abutment end + editor override in the side picker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Data model `end` + missing⇒both → Task 2 (Step 3) + Tasks 1/3/4/5 default handling. ✓
- Contiguous keying side+end, `both` exclusive → Task 2 (Step 4) + tests. ✓
- Click → `t` → thirds classifier → Task 2 (Steps 5, tests) + Task 6 (Step 3). ✓
- Editor `end` override (contiguous only) → Task 6 (Step 4). ✓
- Shared `contiguousMarks` feeding all three renderers → Task 1 + Tasks 3/4/5. ✓
- Case 1 both stubs + midpoint label; Case 2 single stub + quarter-point label → Task 1 anchors
  + renderer wiring, asserted in Tasks 4/5. ✓
- Contiguous-only scope; roads/servitudes untouched → Task 2 keying + renderers leave
  road/servitude branches unchanged; Task 2 test "tagging a side as road drops contiguous". ✓
- Back-compat (no migration) → missing-`end` tests in Tasks 1/3/4/5. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `contiguousMarks(a, b, end) -> {stubFrom, stubTo, labelAnchor}` used
identically in Tasks 3/4/5. `end` union `'from'|'to'|'both'` consistent across model, editor,
and renderers. `fractionAlongSide(pa, pb, p)` and `endFromFraction(t)` signatures match between
Task 2 definition and Task 6 usage. `removeAnnotation(list, side, end?)` back-compatible with the
existing 2-arg call replaced in Task 6 Step 6. ✓

**Note on Task 3 red step:** the diagram integration test is a regression guard (green on old
and new code) because `drawAdjoiningFeatures` is not exported; precise single-vs-double stub
behaviour is proven in Task 1 (helper) and Tasks 4/5 (renderers consuming the same helper the
same way).
