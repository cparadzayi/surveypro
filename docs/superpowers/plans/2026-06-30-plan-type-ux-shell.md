# Plan-Type UX Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the **Plan Type** selection drive a single Generate action that produces both PDF and DXF (delivered as one ZIP), with PDF-only/DXF-only toggles and map-click subject selection for Diagram.

**Architecture:** Extract the duplicated payload-building from `exportGeneralPlan`/`exportToDXF` into pure, unit-tested helper modules (`planTypes.ts`, `planPayload.ts`). A single component orchestrator `generatePlanDocuments()` gathers component state into a context, calls those pure helpers, calls the existing `generateVectorGeoPDF`/`generateDXF` services, then bundles the results with JSZip. Renderer output is unchanged — Diagram is merely the existing rendering filtered to one parcel.

**Tech Stack:** Vue 3 + TypeScript, MapLibre GL, JSZip (already a dependency), Vitest (added by this plan — the frontend currently has `.test.ts` files but no installed runner).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-30-plan-type-ux-shell-design.md`.
- **No renderer changes.** Do not edit `app-backend/src/services/pdfkitGeoPDF.js`, `dxfGenerator.js`, or any backend renderer. No backend route changes.
- **Keep** the "Download Complete Survey Record" button (`generateComprehensivePDF`) exactly as-is.
- Plan types (exact keys): `general-undeveloped`, `general-developed`, `diagram`, `working-plan`. `planType` already accepts all four in `VectorGeoPDFRequest` (`src/services/geopdf.ts:42`).
- Subject mode: `diagram` = `single-parcel`; the other three = `whole-set`.
- Delivery: both formats → one `.zip`; single format → that file directly.
- Naming base: `{planType}-{designation || projectId}-{timestamp}`.
- Preserve existing behaviour: PDF scale auto-retry on `suggestedScale`; store `pdfFinalScale` so DXF matches the PDF scale; multi-sheet (`tileGrid`) alert; DXF warning surfacing; plan-statistics summary PDF for general-plan types only.
- All new frontend code is TypeScript under `app-frontend/src/`.
- Cape Lo geometry coordinates are `[Y, X]` (Westing, Southing) in metres.

---

### Task 1: Add Vitest test harness

**Files:**
- Modify: `app-frontend/package.json` (scripts + devDependencies)
- Create: `app-frontend/vitest.config.ts`
- Create: `app-frontend/src/views/modules/cadastral-standard/__tests__/harness.smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` (Vitest) with `globals: true` and Node environment, so later tasks can write `describe`/`it`/`expect` tests.

- [ ] **Step 1: Install Vitest**

Run (from `app-frontend/`):
```bash
npm install -D vitest@^2.0.0
```
Expected: `vitest` added to `devDependencies`; no peer-dependency errors.

- [ ] **Step 2: Add the test script**

In `app-frontend/package.json`, add to `"scripts"`:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create the Vitest config**

Create `app-frontend/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,js}'],
  },
})
```

- [ ] **Step 4: Write a smoke test**

Create `app-frontend/src/views/modules/cadastral-standard/__tests__/harness.smoke.test.ts`:
```ts
describe('vitest harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run the smoke test**

Run: `npm test -- harness.smoke`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add app-frontend/package.json app-frontend/package-lock.json app-frontend/vitest.config.ts app-frontend/src/views/modules/cadastral-standard/__tests__/harness.smoke.test.ts
git commit -m "test(frontend): add Vitest harness for plan-type UX shell"
```

---

### Task 2: Plan-type metadata module

**Files:**
- Create: `app-frontend/src/views/modules/cadastral-standard/planTypes.ts`
- Test: `app-frontend/src/views/modules/cadastral-standard/__tests__/planTypes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type PlanType = 'general-undeveloped' | 'general-developed' | 'diagram' | 'working-plan'`
  - `type SubjectMode = 'whole-set' | 'single-parcel'`
  - `interface PlanTypeMeta { key: PlanType; label: string; subjectMode: SubjectMode; includesSummary: boolean }`
  - `const PLAN_TYPE_META: Record<PlanType, PlanTypeMeta>`
  - `function getPlanTypeMeta(planType: string): PlanTypeMeta` (falls back to `general-undeveloped` for unknown input)

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/views/modules/cadastral-standard/__tests__/planTypes.test.ts`:
```ts
import { getPlanTypeMeta, PLAN_TYPE_META } from '../planTypes'

describe('getPlanTypeMeta', () => {
  it('marks diagram as single-parcel with no summary', () => {
    const m = getPlanTypeMeta('diagram')
    expect(m.subjectMode).toBe('single-parcel')
    expect(m.includesSummary).toBe(false)
    expect(m.label).toBe('Diagram')
  })

  it('marks the two general plans as whole-set with a summary', () => {
    expect(getPlanTypeMeta('general-undeveloped').subjectMode).toBe('whole-set')
    expect(getPlanTypeMeta('general-undeveloped').includesSummary).toBe(true)
    expect(getPlanTypeMeta('general-developed').includesSummary).toBe(true)
  })

  it('marks working-plan as whole-set with no summary', () => {
    const m = getPlanTypeMeta('working-plan')
    expect(m.subjectMode).toBe('whole-set')
    expect(m.includesSummary).toBe(false)
  })

  it('falls back to general-undeveloped for unknown input', () => {
    expect(getPlanTypeMeta('nonsense').key).toBe('general-undeveloped')
  })

  it('exposes all four keys', () => {
    expect(Object.keys(PLAN_TYPE_META).sort()).toEqual(
      ['diagram', 'general-developed', 'general-undeveloped', 'working-plan']
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- planTypes`
Expected: FAIL — cannot find module `../planTypes`.

- [ ] **Step 3: Write the implementation**

Create `app-frontend/src/views/modules/cadastral-standard/planTypes.ts`:
```ts
export type PlanType =
  | 'general-undeveloped'
  | 'general-developed'
  | 'diagram'
  | 'working-plan'

export type SubjectMode = 'whole-set' | 'single-parcel'

export interface PlanTypeMeta {
  key: PlanType
  /** User-facing label; also drives the Generate button text. */
  label: string
  /** single-parcel ⇒ the user must click one parcel; whole-set ⇒ all parcels. */
  subjectMode: SubjectMode
  /** Whether to also emit the plan-statistics summary PDF in the bundle. */
  includesSummary: boolean
}

export const PLAN_TYPE_META: Record<PlanType, PlanTypeMeta> = {
  'general-undeveloped': {
    key: 'general-undeveloped',
    label: 'General Plan (Undeveloped Portion)',
    subjectMode: 'whole-set',
    includesSummary: true,
  },
  'general-developed': {
    key: 'general-developed',
    label: 'General Plan (Developed Portion)',
    subjectMode: 'whole-set',
    includesSummary: true,
  },
  diagram: {
    key: 'diagram',
    label: 'Diagram',
    subjectMode: 'single-parcel',
    includesSummary: false,
  },
  'working-plan': {
    key: 'working-plan',
    label: 'Working Plan',
    subjectMode: 'whole-set',
    includesSummary: false,
  },
}

export function getPlanTypeMeta(planType: string): PlanTypeMeta {
  return PLAN_TYPE_META[planType as PlanType] ?? PLAN_TYPE_META['general-undeveloped']
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- planTypes`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/planTypes.ts app-frontend/src/views/modules/cadastral-standard/__tests__/planTypes.test.ts
git commit -m "feat(plan-shell): plan-type metadata map"
```

---

### Task 3: Payload builder + single-parcel filtering

**Files:**
- Create: `app-frontend/src/views/modules/cadastral-standard/planPayload.ts`
- Test: `app-frontend/src/views/modules/cadastral-standard/__tests__/planPayload.test.ts`

**Interfaces:**
- Consumes: `getPlanTypeMeta`, `PlanType` from `./planTypes`; `VectorGeoPDFRequest` from `../../../services/geopdf`.
- Produces:
  - `interface PlanPayloadContext { planType: PlanType; subjectParcelId: string | number | null; parcels: GeoJSON.FeatureCollection; beacons: GeoJSON.FeatureCollection; beaconLabels: any[]; projection: string; projectId?: number; metadata: any; extent?: any; scale?: string; sheetSize?: string; orientation: 'landscape' | 'portrait'; outsideFigureData: any; beaconGroups: any[]; annotations?: GeoJSON.FeatureCollection; renderEngine?: 'gdal' | 'pdfkit' }`
  - `function beaconsForParcel(beacons, parcelFeature): GeoJSON.FeatureCollection`
  - `function buildPlanPayload(ctx: PlanPayloadContext): VectorGeoPDFRequest`

**Context for the engineer:** Parcel features carry `properties.id` and `properties.stand` (see `exportParcelsAsGeoJSON`, `SurveyPlanMapView.vue:~3245`). Beacon features carry `properties.name` and coordinates `[Y, X]` (see `exportBeaconsAsGeoJSON`, `:~3300`); they do **not** carry a parcel id, so a beacon belongs to a parcel when its coordinate matches a vertex of that parcel's outer ring. Beacon labels (`refinedBeaconLabels`) carry `parcelId`.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/views/modules/cadastral-standard/__tests__/planPayload.test.ts`:
```ts
import { buildPlanPayload, beaconsForParcel, type PlanPayloadContext } from '../planPayload'

const parcelA: GeoJSON.Feature = {
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]] },
  properties: { id: 'A', stand: '301' },
}
const parcelB: GeoJSON.Feature = {
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[20, 20], [20, 30], [30, 30], [30, 20], [20, 20]]] },
  properties: { id: 'B', stand: '302' },
}
const beacons: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'A1' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [10, 10] }, properties: { name: 'A2' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [20, 20] }, properties: { name: 'B1' } },
  ],
}

function ctx(over: Partial<PlanPayloadContext>): PlanPayloadContext {
  return {
    planType: 'general-undeveloped',
    subjectParcelId: null,
    parcels: { type: 'FeatureCollection', features: [parcelA, parcelB] },
    beacons,
    beaconLabels: [{ text: 'A', parcelId: 'A' }, { text: 'B', parcelId: 'B' }],
    projection: 'EPSG:22291',
    metadata: { title: 'T' },
    orientation: 'landscape',
    outsideFigureData: null,
    beaconGroups: [],
    ...over,
  }
}

describe('beaconsForParcel', () => {
  it('keeps only beacons on the parcel ring', () => {
    const fc = beaconsForParcel(beacons, parcelA)
    expect(fc.features.map(f => f.properties!.name)).toEqual(['A1', 'A2'])
  })
})

describe('buildPlanPayload — whole-set', () => {
  it('passes every parcel/beacon/label through unchanged', () => {
    const p = buildPlanPayload(ctx({ planType: 'general-undeveloped' }))
    expect(p.parcels.features).toHaveLength(2)
    expect(p.beacons.features).toHaveLength(3)
    expect(p.beaconLabels).toHaveLength(2)
    expect(p.planType).toBe('general-undeveloped')
    expect(p.renderEngine).toBe('pdfkit')
  })
})

describe('buildPlanPayload — single-parcel (diagram)', () => {
  it('filters parcels, beacons, and labels to the subject', () => {
    const p = buildPlanPayload(ctx({ planType: 'diagram', subjectParcelId: 'A' }))
    expect(p.parcels.features.map(f => f.properties!.id)).toEqual(['A'])
    expect(p.beacons.features.map(f => f.properties!.name)).toEqual(['A1', 'A2'])
    expect(p.beaconLabels).toEqual([{ text: 'A', parcelId: 'A' }])
  })

  it('returns empty sets when the subject id is not found', () => {
    const p = buildPlanPayload(ctx({ planType: 'diagram', subjectParcelId: 'Z' }))
    expect(p.parcels.features).toHaveLength(0)
    expect(p.beacons.features).toHaveLength(0)
  })

  it('does NOT filter when subjectParcelId is null even in diagram mode', () => {
    const p = buildPlanPayload(ctx({ planType: 'diagram', subjectParcelId: null }))
    expect(p.parcels.features).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- planPayload`
Expected: FAIL — cannot find module `../planPayload`.

- [ ] **Step 3: Write the implementation**

Create `app-frontend/src/views/modules/cadastral-standard/planPayload.ts`:
```ts
import type { VectorGeoPDFRequest } from '../../../services/geopdf'
import { getPlanTypeMeta, type PlanType } from './planTypes'

export interface PlanPayloadContext {
  planType: PlanType
  subjectParcelId: string | number | null
  parcels: GeoJSON.FeatureCollection
  beacons: GeoJSON.FeatureCollection
  beaconLabels: any[]
  projection: string
  projectId?: number
  metadata: VectorGeoPDFRequest['metadata']
  extent?: VectorGeoPDFRequest['extent']
  scale?: string
  sheetSize?: string
  orientation: 'landscape' | 'portrait'
  outsideFigureData: any
  beaconGroups: any[]
  annotations?: GeoJSON.FeatureCollection
  renderEngine?: 'gdal' | 'pdfkit'
}

/** Vertex match tolerance in Cape Lo metres. */
const VERTEX_TOL = 0.05

/**
 * Beacons whose coordinate matches a vertex of the parcel's outer ring.
 * Beacon features carry no parcel id, so vertex coincidence is the link.
 */
export function beaconsForParcel(
  beacons: GeoJSON.FeatureCollection,
  parcelFeature: GeoJSON.Feature,
): GeoJSON.FeatureCollection {
  const ring = (((parcelFeature.geometry as any)?.coordinates?.[0]) ?? []) as number[][]
  const onRing = (c: number[]) =>
    ring.some(v => Math.abs(v[0] - c[0]) <= VERTEX_TOL && Math.abs(v[1] - c[1]) <= VERTEX_TOL)
  return {
    type: 'FeatureCollection',
    features: beacons.features.filter(
      f => f.geometry?.type === 'Point' && onRing((f.geometry as any).coordinates as number[]),
    ),
  }
}

/**
 * Assemble the request shared by the PDF and DXF endpoints. For single-parcel
 * plan types (Diagram) with a chosen subject, the parcels/beacons/labels are
 * filtered to that one parcel. Renderer behaviour is otherwise unchanged.
 */
export function buildPlanPayload(ctx: PlanPayloadContext): VectorGeoPDFRequest {
  const meta = getPlanTypeMeta(ctx.planType)
  let parcels = ctx.parcels
  let beacons = ctx.beacons
  let beaconLabels = ctx.beaconLabels

  if (meta.subjectMode === 'single-parcel' && ctx.subjectParcelId != null) {
    const subject = ctx.parcels.features.find(
      f => String(f.properties?.id) === String(ctx.subjectParcelId),
    )
    parcels = { type: 'FeatureCollection', features: subject ? [subject] : [] }
    beacons = subject
      ? beaconsForParcel(ctx.beacons, subject)
      : { type: 'FeatureCollection', features: [] }
    beaconLabels = (ctx.beaconLabels ?? []).filter(
      l => String(l?.parcelId) === String(ctx.subjectParcelId),
    )
  }

  return {
    parcels,
    beacons,
    annotations: ctx.annotations ?? { type: 'FeatureCollection', features: [] },
    projection: ctx.projection,
    projectId: ctx.projectId,
    renderEngine: ctx.renderEngine ?? 'pdfkit',
    extent: ctx.extent,
    scale: ctx.scale,
    sheetSize: ctx.sheetSize,
    orientation: ctx.orientation,
    metadata: ctx.metadata,
    outsideFigureData: ctx.outsideFigureData,
    beaconGroups: ctx.beaconGroups,
    beaconLabels,
    planType: ctx.planType,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- planPayload`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/planPayload.ts app-frontend/src/views/modules/cadastral-standard/__tests__/planPayload.test.ts
git commit -m "feat(plan-shell): shared payload builder with single-parcel filtering"
```

---

### Task 4: Filename composition + ZIP bundling

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/planPayload.ts`
- Modify: `app-frontend/src/views/modules/cadastral-standard/__tests__/planPayload.test.ts`

**Interfaces:**
- Consumes: `JSZip` from `jszip`.
- Produces:
  - `function composePlanBaseName(planType: string, designation: string | undefined, projectId: number | string | undefined, ts: number): string`
  - `interface PlanDocumentSet { pdf?: Blob; dxf?: Blob; summary?: Blob }`
  - `function bundlePlanDocuments(docs: PlanDocumentSet, baseName: string): Promise<{ blob: Blob; filename: string }>`

- [ ] **Step 1: Write the failing test**

Append to `app-frontend/src/views/modules/cadastral-standard/__tests__/planPayload.test.ts`:
```ts
import { composePlanBaseName, bundlePlanDocuments } from '../planPayload'

describe('composePlanBaseName', () => {
  it('uses the designation when present and sanitises it', () => {
    expect(composePlanBaseName('diagram', 'Stand 302', 7, 123)).toBe('diagram-Stand_302-123')
  })
  it('falls back to projectId when designation is blank', () => {
    expect(composePlanBaseName('working-plan', '   ', 7, 123)).toBe('working-plan-7-123')
  })
})

describe('bundlePlanDocuments', () => {
  const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
  const dxf = new Blob(['0\nSECTION'], { type: 'application/dxf' })

  it('returns the single file directly when only one format is present', async () => {
    const r = await bundlePlanDocuments({ pdf }, 'diagram-302-1')
    expect(r.filename).toBe('diagram-302-1.pdf')
    expect(r.blob).toBe(pdf)
  })

  it('names a lone dxf with the .dxf extension', async () => {
    const r = await bundlePlanDocuments({ dxf }, 'diagram-302-1')
    expect(r.filename).toBe('diagram-302-1.dxf')
  })

  it('zips when both formats are present', async () => {
    const r = await bundlePlanDocuments({ pdf, dxf }, 'diagram-302-1')
    expect(r.filename).toBe('diagram-302-1.zip')
    expect(r.blob.size).toBeGreaterThan(0)
  })

  it('throws when nothing is supplied', async () => {
    await expect(bundlePlanDocuments({}, 'x')).rejects.toThrow(/No documents/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- planPayload`
Expected: FAIL — `composePlanBaseName`/`bundlePlanDocuments` are not exported.

- [ ] **Step 3: Write the implementation**

Append to `app-frontend/src/views/modules/cadastral-standard/planPayload.ts`:
```ts
import JSZip from 'jszip'

export function composePlanBaseName(
  planType: string,
  designation: string | undefined,
  projectId: number | string | undefined,
  ts: number,
): string {
  const id = (designation && designation.trim()) || String(projectId ?? 'project')
  const safe = id.replace(/[^\w.-]+/g, '_')
  return `${planType}-${safe}-${ts}`
}

export interface PlanDocumentSet {
  pdf?: Blob
  dxf?: Blob
  summary?: Blob
}

/**
 * One file ⇒ returned directly with the right extension. Two or more ⇒ zipped
 * into `${baseName}.zip` containing `<base>.pdf`, `<base>.dxf`, `<base>-summary.pdf`.
 */
export async function bundlePlanDocuments(
  docs: PlanDocumentSet,
  baseName: string,
): Promise<{ blob: Blob; filename: string }> {
  const present = (Object.entries(docs) as [keyof PlanDocumentSet, Blob | undefined][])
    .filter((e): e is [keyof PlanDocumentSet, Blob] => e[1] instanceof Blob)
  if (present.length === 0) throw new Error('No documents to bundle')

  if (present.length === 1) {
    const [kind, blob] = present[0]
    const ext = kind === 'dxf' ? 'dxf' : 'pdf'
    const suffix = kind === 'summary' ? '-summary' : ''
    return { blob, filename: `${baseName}${suffix}.${ext}` }
  }

  const zip = new JSZip()
  if (docs.pdf) zip.file(`${baseName}.pdf`, docs.pdf)
  if (docs.dxf) zip.file(`${baseName}.dxf`, docs.dxf)
  if (docs.summary) zip.file(`${baseName}-summary.pdf`, docs.summary)
  const blob = await zip.generateAsync({ type: 'blob' })
  return { blob, filename: `${baseName}.zip` }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- planPayload`
Expected: PASS (all planPayload tests, 12 total).

> If `Blob` is undefined under the Node test environment, the runner's Node is <18. Confirm with `node -v`; Node 18+ provides a global `Blob`. Do not add jsdom — Node 18+ suffices.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/planPayload.ts app-frontend/src/views/modules/cadastral-standard/__tests__/planPayload.test.ts
git commit -m "feat(plan-shell): filename composition + JSZip bundling"
```

---

### Task 5: Generate-request validation

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/planPayload.ts`
- Modify: `app-frontend/src/views/modules/cadastral-standard/__tests__/planPayload.test.ts`

**Interfaces:**
- Consumes: `SubjectMode` from `./planTypes`.
- Produces:
  - `interface GenerateFormats { pdf: boolean; dxf: boolean }`
  - `function validateGenerateRequest(meta: { subjectMode: SubjectMode }, subjectParcelId: unknown, parcelCount: number, formats: GenerateFormats): { ok: boolean; error?: string }`

- [ ] **Step 1: Write the failing test**

Append to `app-frontend/src/views/modules/cadastral-standard/__tests__/planPayload.test.ts`:
```ts
import { validateGenerateRequest } from '../planPayload'

describe('validateGenerateRequest', () => {
  const whole = { subjectMode: 'whole-set' as const }
  const single = { subjectMode: 'single-parcel' as const }

  it('rejects when no format is chosen', () => {
    expect(validateGenerateRequest(whole, null, 5, { pdf: false, dxf: false }).ok).toBe(false)
  })
  it('rejects single-parcel mode with no subject', () => {
    const r = validateGenerateRequest(single, null, 5, { pdf: true, dxf: true })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/click a parcel/i)
  })
  it('accepts single-parcel mode with a subject', () => {
    expect(validateGenerateRequest(single, 'A', 5, { pdf: true, dxf: false }).ok).toBe(true)
  })
  it('rejects whole-set mode with zero parcels', () => {
    expect(validateGenerateRequest(whole, null, 0, { pdf: true, dxf: true }).ok).toBe(false)
  })
  it('accepts whole-set mode with parcels', () => {
    expect(validateGenerateRequest(whole, null, 3, { pdf: true, dxf: false }).ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- planPayload`
Expected: FAIL — `validateGenerateRequest` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `app-frontend/src/views/modules/cadastral-standard/planPayload.ts`:
```ts
import type { SubjectMode } from './planTypes'

export interface GenerateFormats {
  pdf: boolean
  dxf: boolean
}

export function validateGenerateRequest(
  meta: { subjectMode: SubjectMode },
  subjectParcelId: unknown,
  parcelCount: number,
  formats: GenerateFormats,
): { ok: boolean; error?: string } {
  if (!formats.pdf && !formats.dxf) {
    return { ok: false, error: 'Select at least one format (PDF or DXF).' }
  }
  if (meta.subjectMode === 'single-parcel') {
    if (subjectParcelId == null || subjectParcelId === '') {
      return { ok: false, error: 'Click a parcel on the map to choose the diagram subject.' }
    }
  } else if (parcelCount < 1) {
    return { ok: false, error: 'No parcels available to generate.' }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- planPayload`
Expected: PASS (all planPayload tests, 17 total).

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/planPayload.ts app-frontend/src/views/modules/cadastral-standard/__tests__/planPayload.test.ts
git commit -m "feat(plan-shell): generate-request validation"
```

---

### Task 6: Diagram subject selection on the map

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`

**Interfaces:**
- Consumes: `getPlanTypeMeta` from `./planTypes`.
- Produces (component state, used by Task 7): `selectedDiagramParcelId` ref; `selectedDiagramStand` computed; map-click selection that sets them; outline highlight of the chosen parcel.

**Context:** Parcels are MapLibre sources `parcel-${parcel.id}` with layers `parcel-${id}-fill` and `parcel-${id}-outline`, created in the `parcelsToRender.forEach` at `SurveyPlanMapView.vue:~1597`. The outside-figure parcel id is `outsideFigureParcelId` and is drawn red. `config.value.planType` holds the current type. `parcels.value` is the parcel array (each has `.id`, `.stand`).

- [ ] **Step 1: Add imports and reactive state**

Near the other imports in `<script setup>` (the `import` block around `:515`), add:
```ts
import { getPlanTypeMeta } from './planTypes'
```
Near the other `ref(...)` declarations (e.g. after `refinedBeaconLabels` at `:657`), add:
```ts
const selectedDiagramParcelId = ref<string | number | null>(null)
const selectedDiagramStand = computed(() => {
  const p = parcels.value.find((x: any) => String(x.id) === String(selectedDiagramParcelId.value))
  return p?.stand ?? null
})
const isDiagramMode = computed(() => getPlanTypeMeta(config.value.planType).subjectMode === 'single-parcel')
```
(`computed` is already imported in this file; if not, add it to the `vue` import.)

- [ ] **Step 2: Add the highlight + click helpers**

Add these functions in `<script setup>` (place them just after the parcel-render function that contains the `parcelsToRender.forEach`, near `:1650`):
```ts
function applyDiagramHighlight(selectedId: string | number | null) {
  if (!map.value) return
  parcels.value.forEach((p: any) => {
    const layerId = `parcel-${p.id}-outline`
    if (!map.value!.getLayer(layerId)) return
    const isOutsideFig = p.id === outsideFigureParcelId
    const isSelected = selectedId != null && String(p.id) === String(selectedId)
    map.value!.setPaintProperty(
      layerId, 'line-color',
      isOutsideFig ? '#ef4444' : isSelected ? '#2563eb' : '#0f172a',
    )
    map.value!.setPaintProperty(
      layerId, 'line-width',
      isOutsideFig ? 3 : isSelected ? 4 : 2,
    )
  })
}

function onMapClickSelectParcel(e: maplibregl.MapMouseEvent) {
  if (!map.value || !isDiagramMode.value) return
  const fillLayers = parcels.value
    .map((p: any) => `parcel-${p.id}-fill`)
    .filter((id: string) => map.value!.getLayer(id))
  if (fillLayers.length === 0) return
  const hits = map.value.queryRenderedFeatures(e.point, { layers: fillLayers })
  if (hits.length === 0) return
  const layerId = hits[0].layer.id // 'parcel-<id>-fill'
  const id = layerId.replace(/^parcel-/, '').replace(/-fill$/, '')
  const match = parcels.value.find((p: any) => String(p.id) === id)
  selectedDiagramParcelId.value = match ? match.id : null
  applyDiagramHighlight(selectedDiagramParcelId.value)
}
```

- [ ] **Step 3: Register the click handler once, after parcels render**

At the end of the parcel-render function (right after the `parcelsToRender.forEach(...)` block closes, `:~1649`), register the handler idempotently:
```ts
  // Diagram subject picking (single registration; handler no-ops unless in diagram mode)
  map.value!.off('click', onMapClickSelectParcel)
  map.value!.on('click', onMapClickSelectParcel)
  applyDiagramHighlight(selectedDiagramParcelId.value)
```

- [ ] **Step 4: Clear selection when leaving diagram mode**

Add a watcher near the other `watch(...)` calls (e.g. by the watcher at `:5562`):
```ts
watch(() => config.value.planType, () => {
  if (!isDiagramMode.value) {
    selectedDiagramParcelId.value = null
  }
  applyDiagramHighlight(selectedDiagramParcelId.value)
})
```

- [ ] **Step 5: Add the hint UI under the Plan Type select**

In the template, right after the Plan Type `config-group` `</div>` (the block at `:260-268`), add:
```html
        <div v-if="isDiagramMode" class="config-group diagram-subject-hint">
          <p v-if="!selectedDiagramParcelId" class="text-xs text-amber-600">
            👆 Click the parcel on the map to choose the diagram subject.
          </p>
          <p v-else class="text-xs text-green-700">
            ✓ Diagram subject: <strong>Stand {{ selectedDiagramStand }}</strong>
          </p>
        </div>
```

- [ ] **Step 6: Verify build + manual behaviour**

Run: `npm run build`
Expected: build succeeds (no TS errors).

Then `npm run dev`, open a project in the cadastral-standard map view:
- Set Plan Type = **Diagram** → hint "Click the parcel…" appears.
- Click a parcel → its outline turns blue, hint shows "Diagram subject: Stand N".
- Switch Plan Type to **General Plan (Undeveloped)** → highlight clears, hint disappears.

- [ ] **Step 7: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue
git commit -m "feat(plan-shell): map-click diagram subject selection + highlight"
```

---

### Task 7: Action group + generation orchestrator

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`

**Interfaces:**
- Consumes: `getPlanTypeMeta` (already imported in Task 6); `buildPlanPayload`, `composePlanBaseName`, `bundlePlanDocuments`, `validateGenerateRequest`, `type PlanPayloadContext`, `type PlanDocumentSet` from `./planPayload`; existing `generateVectorGeoPDF`, `generateDXF`, `downloadBlob`, `generatePlanStatisticsPDF`, `exportParcelsAsGeoJSON`, `exportBeaconsAsGeoJSON`, `generateBeaconLabelsForPDF`, `loadData`.
- Produces: `exportFormats` reactive; `planTypeLabel` computed; `gatherPlanContext()`; `generatePlanDocuments()`. Removes `exportGeneralPlan` and `exportToDXF`.

- [ ] **Step 1: Add imports + UI state**

Add to the `./planPayload` import (new line near the Task 6 import):
```ts
import {
  buildPlanPayload, composePlanBaseName, bundlePlanDocuments, validateGenerateRequest,
  type PlanPayloadContext, type PlanDocumentSet,
} from './planPayload'
```
Add reactive UI state near `selectedDiagramParcelId`:
```ts
const exportFormats = reactive({ pdf: true, dxf: true })
const planTypeLabel = computed(() => getPlanTypeMeta(config.value.planType).label)
```
(`reactive` is from `vue`; add it to the existing `vue` import if missing.)

- [ ] **Step 2: Add `gatherPlanContext()` (folds in the old export gathering)**

Add this function (it reproduces the gathering currently in `exportGeneralPlan`, `:3705-3817`):
```ts
function gatherPlanContext(): PlanPayloadContext {
  const parcelsGeoJSON = exportParcelsAsGeoJSON()
  const beaconsGeoJSON = exportBeaconsAsGeoJSON()

  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity
  parcelsGeoJSON.features.forEach((feature: any) => {
    if (feature.geometry.type === 'Polygon') {
      feature.geometry.coordinates[0].forEach((coord: number[]) => {
        minY = Math.min(minY, coord[0]); maxY = Math.max(maxY, coord[0])
        minX = Math.min(minX, coord[1]); maxX = Math.max(maxX, coord[1])
      })
    }
  })
  beaconsGeoJSON.features.forEach((feature: any) => {
    if (feature.geometry.type === 'Point') {
      minY = Math.min(minY, feature.geometry.coordinates[0]); maxY = Math.max(maxY, feature.geometry.coordinates[0])
      minX = Math.min(minX, feature.geometry.coordinates[1]); maxX = Math.max(maxX, feature.geometry.coordinates[1])
    }
  })
  const extent = { minY, maxY, minX, maxX }

  const metadata = {
    title: `${getPlanTypeMeta(config.value.planType).label} - ${props.projectInfo.designation || 'Survey Plan'}`,
    planType: config.value.planType,
    surveyor: config.value.surveyorName,
    date: config.value.surveyDate,
    designation: props.projectInfo.designation,
    surveyOf: props.projectInfo.surveyOf || '',
    district: props.projectInfo.district,
    township: props.projectInfo.township,
    firm: config.value.firm,
    licenseNumber: config.value.licenseNumber,
    parentProperty: props.projectInfo.parentProperty || '',
    wholePortion: props.projectInfo.wholePortion || 'the whole',
    priorDiagrams: props.projectInfo.priorDiagrams || [],
  }

  let beaconLabels = generateBeaconLabelsForPDF()
  if (beaconLabels.length === 0 && validatedLabels.value.beacons.length > 0) {
    beaconLabels = validatedLabels.value.beacons.map((label: any) => ({
      text: label.text, coordinates: label.coordinates, parcelId: label.parcelId,
      type: 'beacon' as const, beaconName: label.beaconName, isInsideParcel: label.isInsideParcel,
      displayInParcel: label.displayInParcel ?? null,
      labelType: label.labelType ?? (label.isInsideParcel ? 'suffix' : 'full'),
    }))
  }

  const epsgCode = `EPSG:${22260 + parseInt(config.value.centralMeridian || '31')}`
  const resolvedScale = intelligentPreview.value?.scale?.label || undefined
  const resolvedSheetSize = intelligentPreview.value?.sheetSize || undefined
  const _sheet = intelligentPreview.value?.layout?.sheet
  const orientation: 'landscape' | 'portrait' =
    _sheet ? (_sheet.width > _sheet.height ? 'landscape' : 'portrait') : 'landscape'

  return {
    planType: config.value.planType as any,
    subjectParcelId: selectedDiagramParcelId.value,
    parcels: parcelsGeoJSON,
    beacons: beaconsGeoJSON,
    beaconLabels,
    projection: epsgCode,
    projectId: props.projectId,
    metadata,
    extent,
    scale: resolvedScale,
    sheetSize: resolvedSheetSize,
    orientation,
    outsideFigureData: outsideFigureData.value,
    beaconGroups: props.projectInfo.beaconGroups || [],
    annotations: { type: 'FeatureCollection', features: [] },
    renderEngine: 'pdfkit',
  }
}
```

- [ ] **Step 3: Add the `generatePlanDocuments()` orchestrator**

```ts
async function generatePlanDocuments() {
  const meta = getPlanTypeMeta(config.value.planType)
  const v = validateGenerateRequest(meta, selectedDiagramParcelId.value, parcels.value.length, exportFormats)
  if (!v.ok) { alert(v.error); return }

  isExporting.value = true
  try {
    await loadData()
    const ctx = gatherPlanContext()
    const payload = buildPlanPayload(ctx)
    const docs: PlanDocumentSet = {}
    let usedScale: string | undefined

    if (exportFormats.pdf) {
      let result = await generateVectorGeoPDF(payload)
      if (result.suggestedScale) {
        result = await generateVectorGeoPDF({ ...payload, scale: result.suggestedScale })
      }
      docs.pdf = result.blob
      usedScale = result.usedScale || undefined
      if (result.usedScale) pdfFinalScale.value = result.usedScale

      if (result.tileGrid) {
        const tg = result.tileGrid
        alert(
          `SI 727 Reg 32(3) — Multi-sheet plan.\n\n` +
          `${tg.totalSheets} sheets (${tg.cols}×${tg.rows}) at ${tg.scaleLabel} on ${tg.sheetSize}.\n` +
          `Sheet 0: Key Plan; Sheets 1–${tg.totalSheets}: tiles with 5% overlap.`
        )
      }

      if (meta.includesSummary) {
        try {
          docs.summary = generatePlanStatisticsPDF({
            projectInfo: {
              designation: props.projectInfo.designation || '',
              surveyOf: props.projectInfo.surveyOf || '',
              district: props.projectInfo.district,
              township: props.projectInfo.township,
              surveyDate: props.projectInfo.surveyDate || new Date().toISOString(),
              surveyorName: props.projectInfo.surveyorName || config.value.surveyorName,
              licenseNumber: props.projectInfo.licenseNumber || config.value.licenseNumber,
              firm: props.projectInfo.firm,
            },
            parcels: parcels.value.map((p: any) => ({
              id: p.id, stand: p.stand, area_m2: p.area_m2 || 0, description: p.description,
            })),
            outsideFigureData: outsideFigureData.value || undefined,
            beaconGroups: formatBeaconDescriptionGroups(coordinatePoints.value),
            scale: usedScale || intelligentPreview.value?.scale?.label || config.value.scale || '1:1000',
            sheetSize: result.usedSheetSize || intelligentPreview.value?.sheetSize || 'ISO_A0',
            orientation: 'landscape',
            centralMeridian: parseInt(config.value.centralMeridian || '31'),
            generatedAt: new Date(),
          })
        } catch (summaryErr: any) {
          console.warn('[PlanDocs] Summary PDF failed (plan still generated):', summaryErr?.message)
        }
      }
    }

    if (exportFormats.dxf) {
      const dxfPayload = { ...payload, scale: usedScale || payload.scale }
      const { blob, warningCount, warningsSummary } = await generateDXF(dxfPayload)
      docs.dxf = blob
      if (warningCount > 0 && warningsSummary) {
        const parts: string[] = []
        if (warningsSummary.beacons) parts.push(`${warningsSummary.beacons} beacon(s) skipped`)
        if (warningsSummary.parcels) parts.push(`${warningsSummary.parcels} parcel(s) skipped`)
        if (parts.length) console.warn('[PlanDocs] DXF warnings:', parts.join(', '))
      }
    }

    const ts = Date.now()
    const baseName = composePlanBaseName(config.value.planType, props.projectInfo.designation, props.projectId, ts)
    const { blob, filename } = await bundlePlanDocuments(docs, baseName)
    downloadBlob(blob, filename)
    emit('export-complete', { format: config.value.planType, filename })
  } catch (error: any) {
    console.error('[PlanDocs] Generation failed:', error)
    alert(`Generation failed: ${error.message}`)
  } finally {
    isExporting.value = false
  }
}
```

- [ ] **Step 4: Replace the export-button markup**

Replace the three-button block at `:468-481` (the `<div class="export-buttons">…</div>` containing `exportGeneralPlan`, `generateComprehensivePDF`, `exportToDXF`) with:
```html
          <div class="export-buttons" style="display: flex; flex-direction: column; gap: 12px;">
            <div class="format-toggles" style="display: flex; gap: 16px; font-size: 14px;">
              <label><input type="checkbox" v-model="exportFormats.pdf" /> PDF</label>
              <label><input type="checkbox" v-model="exportFormats.dxf" /> DXF</label>
            </div>
            <button @click="generatePlanDocuments" :disabled="isExporting"
                    class="btn-export btn-geopdf" style="width: 100%; font-size: 16px; padding: 16px;">
              <span v-if="!isExporting">📋 Generate {{ planTypeLabel }}</span>
              <span v-else>⏳ Generating…</span>
            </button>
            <button @click="generateComprehensivePDF" :disabled="isExporting"
                    class="btn-export btn-professional" style="width: 100%; font-size: 16px; padding: 16px;">
              <span v-if="!isExporting">📚 Download Complete Survey Record</span>
              <span v-else>⏳ Generating…</span>
            </button>
          </div>
```

- [ ] **Step 5: Remove the dead export functions**

Delete the now-unused `async function exportGeneralPlan() { … }` (`:3705-3907`) and `async function exportToDXF() { … }` (`:4455-` through its closing brace, ~`:4540`). Leave `generateComprehensivePDF` and the jsPDF map-capture `exportToPDF` (if separate) untouched.

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds. If TS reports `exportGeneralPlan`/`exportToDXF` referenced elsewhere, search:
```bash
grep -rn "exportGeneralPlan\|exportToDXF" app-frontend/src
```
Expected: no references remain (template + script both updated). Remove any stragglers.

- [ ] **Step 7: Manual verification**

`npm run dev`, open a project map view:
- **General Plan (Undeveloped)**, both toggles on → click Generate → a `.zip` downloads containing `<base>.pdf`, `<base>.dxf`, `<base>-summary.pdf`.
- Untick DXF → Generate → a single `.pdf` downloads (no zip).
- Untick both → Generate button still clickable but → alert "Select at least one format".
- **Diagram** without clicking a parcel → Generate → alert "Click a parcel…". Click a parcel, Generate → `.zip` with PDF+DXF for the single stand.
- **Download Complete Survey Record** still works unchanged.

- [ ] **Step 8: Run the full frontend test suite + commit**

Run: `npm test`
Expected: all plan-shell tests pass (Tasks 1–5).
```bash
git add app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue
git commit -m "feat(plan-shell): plan-type-driven Generate (PDF+DXF zip) + format toggles"
```

---

## Self-Review

**Spec coverage:**
- Plan-type metadata map → Task 2. ✓
- Diagram subject selection (map-click + highlight + hint) → Task 6. ✓
- Action group (Generate + PDF/DXF toggles, keep Complete Survey Record) → Task 7 Step 4. ✓
- Generation orchestrator (validate, build once, per-format, bundle, warnings) → Task 7 Steps 2–3. ✓
- Single ZIP delivery / single-file fallback → Task 4 + Task 7. ✓
- `buildPlanPayload` refactor + removal of `exportGeneralPlan`/`exportToDXF` → Task 3 + Task 7 Step 5. ✓
- Naming `{planType}-{designation|projectId}-{ts}` → Task 4. ✓
- Error handling (no subject / no format / scale fallback / warnings) → Tasks 5 + 7. ✓
- Testing (buildPlanPayload single vs whole, filename/zip, format selection, validation) → Tasks 2–5. ✓
- Scope boundary: no renderer changes → Global Constraints; Diagram = existing render filtered to one parcel → Task 3. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full code.

**Type consistency:** `PlanPayloadContext`, `PlanDocumentSet`, `GenerateFormats`, `buildPlanPayload`, `bundlePlanDocuments`, `composePlanBaseName`, `validateGenerateRequest`, `getPlanTypeMeta` are defined in Tasks 2–5 and consumed with matching signatures in Tasks 6–7. `selectedDiagramParcelId` (Task 6) is read in Task 7. `exportFormats`/`planTypeLabel` defined and used in Task 7.

**Added vs spec:** Vitest harness (Task 1) — the spec assumes frontend unit tests but no runner is installed; this is the minimal enabling change. The plan-statistics summary PDF is preserved (now inside the zip for GP types) to avoid regressing current `exportGeneralPlan` behaviour.
