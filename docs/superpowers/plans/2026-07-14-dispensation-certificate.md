# Dispensation Certificate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate SI 727 Dispensation Certificates (developed + undeveloped variants) from a new Servitudes capture stage that owns a rich servitude model, with the existing `role:'servitude'` side-annotations as a derived mirror.

**Architecture:** A dedicated Servitudes workflow stage authors `Servitude[]` records (persisted at `step_data['servitudes'].servitudes`). Those records are the single source of truth; on save they rebuild the `role:'servitude'` entries in `metadata.sideAnnotations` so the existing general-plan/diagram PDF/DXF render pipeline (`adjoiningFeatures.js`) stays untouched. A frontend jsPDF generator (mirroring `dsgCertificateGenerator`) renders one certificate per portion (variant chosen by plan type), saved to `output/certificates/` and ticked on the lodgement letter.

**Tech Stack:** Vue 3 + TypeScript + Pinia, jsPDF, vitest. Frontend-only (no backend route).

## Global Constraints

- Frontend jsPDF generator only, mirroring `app-frontend/src/utils/dsgCertificateGenerator.ts` — no backend PDF route.
- The Servitudes stage is the SOLE writer of `role:'servitude'` annotation entries. The render pipeline (`adjoiningFeatures.js` reading `metadata.sideAnnotations`) MUST stay unchanged; `servitudeId` is an additive optional field only. `road`/`contiguous` annotations are never touched by the mirror.
- Plan-type drives the variant: `general-developed` → developed certificate (servitudes shown); `general-undeveloped` → undeveloped certificate (area-only, servitudes column blank).
- Output filenames are fixed: `DispensationDeveloped.pdf` / `DispensationUndeveloped.pdf`, saved to `output/certificates/` with `overwrite: true`.
- Lodgement item "Dispensation Certificate" becomes generated: `{ kind: 'generated', folders: ['certificates'], keyword: /dispensation/i }`. Existing lodgement regression tests must still pass.
- Servitudes persist at `step_data['servitudes'].servitudes` via the existing workflow PATCH used by `persistSideAnnotations`.
- Beacon pair resolves from `metadata.edges` by mapping the letter-side to its edge index; unresolved → the certificate falls back to the raw letter side (never throws).
- v1 defers: multi-boundary/polyline servitudes, off-boundary strip/polygon geometry, notarial deed references.
- Servitude type is a fixed enum + free-text "other".
- Typecheck: `npx vue-tsc --noEmit` bails at a pre-existing tsconfig `baseUrl` (TS5101) deprecation and cannot gate this repo; verify no NEW error is reachable from the changed files, and rely on the vitest suites. Run vitest from `app-frontend`.
- Never stage the pre-existing untracked root files (`20260527 beacon-comparison-claude.csv`, `namibian example.txt`, `survey-plan-dxf-sample.dxf`, `verification/`).

---

## File Structure

- `app-frontend/src/views/modules/cadastral-standard/servitudes.ts` — **new.** Servitude type/enum, pure list helpers, `resolveBeaconPair`, mirror-sync + legacy back-fill. One responsibility: the servitude data model and its reconciliation with side-annotations.
- `app-frontend/src/views/modules/cadastral-standard/sideAnnotations.ts` — **modify.** Add the additive `servitudeId?: string` field only.
- `app-frontend/src/utils/dispensationCertificate.ts` — **new.** Pure certificate row/sentence assembly (`CertificateRow`, `buildServitudeSentence`, `buildCertificateRows`).
- `app-frontend/src/utils/dispensationCertificateGenerator.ts` — **new.** jsPDF renderer `generateDispensationCertificatePDF(data)`.
- `app-frontend/src/services/documentStorage.ts` — **modify.** Add `'dispensation-certificate'` document type + folder mapping.
- `app-frontend/src/utils/lodgementDocuments.ts` — **modify.** Reclassify "Dispensation Certificate" external → generated.
- `app-frontend/src/composables/useDispensationCertificate.ts` — **new.** Orchestration: build data → generate → save (best-effort).
- `app-frontend/src/views/modules/cadastral-standard/ServitudesView.vue` — **new.** The stage UI (parcel picker + side list + servitude editor + Generate).
- `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue` — **modify.** Register the step + render the view.
- Test files colocated under `__tests__/` next to each new module.

---

### Task 1: Servitude data model + pure helpers

**Files:**
- Create: `app-frontend/src/views/modules/cadastral-standard/servitudes.ts`
- Modify: `app-frontend/src/views/modules/cadastral-standard/sideAnnotations.ts`
- Test: `app-frontend/src/views/modules/cadastral-standard/__tests__/servitudes.test.ts`

**Interfaces:**
- Consumes: `SubjectSide` from `./sideAnnotations` (`{ side, from, to, a, b }`).
- Produces: `ServitudeType`, `Servitude`, `SERVITUDE_TYPE_LABELS`, `servitudeTypeLabel(s)`, `newServitudeId()`, `upsertServitude(list,s)`, `removeServitude(list,id)`, `servitudesForSubject(list,subjectId)`, `hydrateServitudes(raw)`, `resolveBeaconPair(sides, edges, side)`.

- [ ] **Step 1: Add the additive field to `sideAnnotations.ts`**

In `app-frontend/src/views/modules/cadastral-standard/sideAnnotations.ts`, add `servitudeId?: string` to the `SideAnnotation` interface (it currently has `side`, `role`, `label?`, `widthM?`):

```ts
export interface SideAnnotation {
  side: string
  role: SideRole
  label?: string
  widthM?: number
  /** Set on role:'servitude' entries that are a derived mirror of a Servitude record. */
  servitudeId?: string
}
```

- [ ] **Step 2: Write the failing test**

Create `app-frontend/src/views/modules/cadastral-standard/__tests__/servitudes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  upsertServitude, removeServitude, servitudesForSubject, hydrateServitudes,
  servitudeTypeLabel, resolveBeaconPair, type Servitude,
} from '../servitudes'
import { subjectSides } from '../sideAnnotations'

const s = (over: Partial<Servitude> = {}): Servitude => ({
  id: 'x', subjectId: '10', side: 'AB', type: 'party-wall', ...over,
})

describe('servitude list helpers', () => {
  it('upsert replaces by id, else appends', () => {
    const a = s({ id: '1' }); const b = s({ id: '2' })
    expect(upsertServitude([a], b).map(x => x.id)).toEqual(['1', '2'])
    expect(upsertServitude([a, b], s({ id: '1', side: 'CD' })).find(x => x.id === '1')!.side).toBe('CD')
    expect(upsertServitude([a, b], s({ id: '1', side: 'CD' }))).toHaveLength(2)
  })
  it('remove drops by id', () => {
    expect(removeServitude([s({ id: '1' }), s({ id: '2' })], '1').map(x => x.id)).toEqual(['2'])
  })
  it('servitudesForSubject filters by subjectId', () => {
    const list = [s({ id: '1', subjectId: '10' }), s({ id: '2', subjectId: '20' })]
    expect(servitudesForSubject(list, '10').map(x => x.id)).toEqual(['1'])
  })
  it('hydrate drops malformed entries', () => {
    expect(hydrateServitudes([s({ id: '1' }), null, { id: '2' }, 42])).toHaveLength(2)
    expect(hydrateServitudes('nope')).toEqual([])
  })
})

describe('servitudeTypeLabel', () => {
  it('maps enum to human label; uses typeLabelOther for other', () => {
    expect(servitudeTypeLabel(s({ type: 'party-wall' }))).toBe('Party wall')
    expect(servitudeTypeLabel(s({ type: 'storm-water' }))).toBe('Storm-water / drainage')
    expect(servitudeTypeLabel(s({ type: 'other', typeLabelOther: 'Eaves' }))).toBe('Eaves')
    expect(servitudeTypeLabel(s({ type: 'other' }))).toBe('Other')
  })
})

describe('resolveBeaconPair', () => {
  // Square ring -> sides AB, BC, CD, DA (index 0..3). edges align by index.
  const ring: [number, number][] = [[0, 0], [0, 10], [10, 10], [10, 0]]
  const sides = subjectSides(ring)
  const edges = [
    { from: { id: '10a' }, to: { id: '10b' } },
    { from: { id: '10b' }, to: { id: '10c' } },
    { from: { id: '10c' }, to: { id: '10d' } },
    { from: { name: '10d' }, to: { name: '10a' } },
  ]
  it('maps a letter side to the edge beacon pair', () => {
    expect(resolveBeaconPair(sides, edges, 'BC')).toEqual({ fromBeacon: '10b', toBeacon: '10c' })
    expect(resolveBeaconPair(sides, edges, 'DA')).toEqual({ fromBeacon: '10d', toBeacon: '10a' })
  })
  it('returns null for an unknown side or a missing/nameless edge', () => {
    expect(resolveBeaconPair(sides, edges, 'ZZ')).toBeNull()
    expect(resolveBeaconPair(sides, [{ from: {}, to: {} }], 'AB')).toBeNull()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from `app-frontend`): `npx vitest run servitudes`
Expected: FAIL — `../servitudes` cannot be resolved (module does not exist yet).

- [ ] **Step 4: Implement `servitudes.ts`**

Create `app-frontend/src/views/modules/cadastral-standard/servitudes.ts`:

```ts
import type { SideAnnotation, SubjectSide } from './sideAnnotations'

export type ServitudeType =
  | 'party-wall' | 'right-of-way' | 'sewer' | 'water' | 'electricity'
  | 'storm-water' | 'pipeline' | 'telecom' | 'other'

export const SERVITUDE_TYPE_LABELS: Record<ServitudeType, string> = {
  'party-wall': 'Party wall',
  'right-of-way': 'Right of way',
  sewer: 'Sewer',
  water: 'Water',
  electricity: 'Electricity',
  'storm-water': 'Storm-water / drainage',
  pipeline: 'Pipeline',
  telecom: 'Telecom',
  other: 'Other',
}

export interface Servitude {
  id: string
  subjectId: string            // String(parcel.id) — the burdened stand's parcel
  side: string                 // 'BC' — same letter model as SubjectSide
  type: ServitudeType
  typeLabelOther?: string
  widthM?: number
  beneficiary?: string
  burdenedStand?: string
  adjoiningStand?: string       // party walls: the reciprocal stand
  purpose?: string
  statuteRef?: string
  fromBeacon?: string
  toBeacon?: string
}

export function newServitudeId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `sv_${Date.now()}_${Math.random().toString(36).slice(2)}`)
}

export function servitudeTypeLabel(s: Servitude): string {
  if (s.type === 'other') return s.typeLabelOther?.trim() || 'Other'
  return SERVITUDE_TYPE_LABELS[s.type]
}

export function upsertServitude(list: Servitude[], s: Servitude): Servitude[] {
  const out = list.filter((x) => x.id !== s.id)
  out.push(s)
  return out
}

export function removeServitude(list: Servitude[], id: string): Servitude[] {
  return list.filter((x) => x.id !== id)
}

export function servitudesForSubject(list: Servitude[], subjectId: string): Servitude[] {
  return list.filter((x) => x.subjectId === subjectId)
}

export function hydrateServitudes(raw: unknown): Servitude[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (x): x is Servitude =>
      !!x && typeof x === 'object' && typeof (x as any).id === 'string' &&
      typeof (x as any).subjectId === 'string' && typeof (x as any).side === 'string' &&
      typeof (x as any).type === 'string',
  )
}

const beaconOf = (pt: any): string | null => (pt?.id || pt?.name || null)

/**
 * Map a letter side (e.g. 'BC') to its beacon-name pair using the parcel's
 * ring-ordered edges. `sides` (from subjectSides) and `edges` (metadata.edges)
 * are both in ring order, so the side's index indexes the edge. Returns null
 * when the side is unknown or the edge endpoints have no beacon name.
 */
export function resolveBeaconPair(
  sides: SubjectSide[],
  edges: any[],
  side: string,
): { fromBeacon: string; toBeacon: string } | null {
  const idx = sides.findIndex((s) => s.side === side)
  if (idx < 0) return null
  const edge = edges?.[idx]
  if (!edge) return null
  const fromBeacon = beaconOf(edge.from)
  const toBeacon = beaconOf(edge.to)
  if (!fromBeacon || !toBeacon) return null
  return { fromBeacon, toBeacon }
}

// Re-export for consumers that build the mirror (Task 2 adds functions here too).
export type { SideAnnotation }
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `app-frontend`): `npx vitest run servitudes`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/servitudes.ts app-frontend/src/views/modules/cadastral-standard/sideAnnotations.ts app-frontend/src/views/modules/cadastral-standard/__tests__/servitudes.test.ts
git commit -m "feat(servitudes): servitude model + helpers + beacon-pair resolution"
```

---

### Task 2: Mirror sync + legacy back-fill

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/servitudes.ts`
- Test: `app-frontend/src/views/modules/cadastral-standard/__tests__/servitudeMirror.test.ts`

**Interfaces:**
- Consumes: `Servitude`, `newServitudeId` (Task 1); `SideAnnotation` from `./sideAnnotations`.
- Produces: `syncServitudeMirror(annotationsBySubject, servitudes)`, `backfillServitudesFromAnnotations(annotationsBySubject)`.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/views/modules/cadastral-standard/__tests__/servitudeMirror.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { syncServitudeMirror, backfillServitudesFromAnnotations, type Servitude } from '../servitudes'
import type { SideAnnotation } from '../sideAnnotations'

const sv = (over: Partial<Servitude> = {}): Servitude => ({
  id: 's1', subjectId: '10', side: 'AB', type: 'party-wall', ...over,
})

describe('syncServitudeMirror', () => {
  it('rebuilds only role:servitude entries, preserving road/contiguous, tagging servitudeId', () => {
    const before: Record<string, SideAnnotation[]> = {
      '10': [
        { side: 'AB', role: 'servitude', servitudeId: 'OLD' }, // stale, must be replaced
        { side: 'CD', role: 'road', widthM: 6 },               // preserved
        { side: 'DA', role: 'contiguous' },                    // preserved
      ],
    }
    const out = syncServitudeMirror(before, [sv({ id: 's1', subjectId: '10', side: 'AB', widthM: 0.2, beneficiary: 'Stand 11' })])
    const bySide = Object.fromEntries(out['10'].map(a => [a.side, a]))
    expect(bySide['CD'].role).toBe('road')
    expect(bySide['DA'].role).toBe('contiguous')
    expect(bySide['AB']).toMatchObject({ role: 'servitude', servitudeId: 's1', widthM: 0.2, label: 'Stand 11' })
    // exactly one servitude entry, no leftover OLD
    expect(out['10'].filter(a => a.role === 'servitude')).toHaveLength(1)
  })
  it('creates a subject bucket when servitude targets a subject with no prior annotations', () => {
    const out = syncServitudeMirror({}, [sv({ subjectId: '99', side: 'EF' })])
    expect(out['99']).toEqual([{ side: 'EF', role: 'servitude', servitudeId: 's1', widthM: undefined, label: undefined }])
  })
})

describe('backfillServitudesFromAnnotations', () => {
  it('back-fills legacy servitude annotations lacking servitudeId, defaulting type party-wall', () => {
    const map: Record<string, SideAnnotation[]> = {
      '10': [
        { side: 'AB', role: 'servitude', widthM: 0.2, label: 'wall' }, // legacy -> back-fill
        { side: 'BC', role: 'servitude', servitudeId: 'already' },     // already linked -> skip
        { side: 'CD', role: 'road' },                                   // not a servitude -> skip
      ],
    }
    const out = backfillServitudesFromAnnotations(map)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ subjectId: '10', side: 'AB', type: 'party-wall', widthM: 0.2, purpose: 'wall' })
    expect(typeof out[0].id).toBe('string')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `app-frontend`): `npx vitest run servitudeMirror`
Expected: FAIL — `syncServitudeMirror` / `backfillServitudesFromAnnotations` are not exported.

- [ ] **Step 3: Implement the two functions in `servitudes.ts`**

Append to `app-frontend/src/views/modules/cadastral-standard/servitudes.ts`:

```ts
/**
 * Rebuild the role:'servitude' mirror in a per-subject annotation map from the
 * servitude records (the single source of truth). road/contiguous entries are
 * left untouched. Each servitude entry carries servitudeId back to its record.
 */
export function syncServitudeMirror(
  annotationsBySubject: Record<string, SideAnnotation[]>,
  servitudes: Servitude[],
): Record<string, SideAnnotation[]> {
  const out: Record<string, SideAnnotation[]> = {}
  for (const [subjectId, list] of Object.entries(annotationsBySubject)) {
    out[subjectId] = list.filter((a) => a.role !== 'servitude')
  }
  for (const s of servitudes) {
    const entry: SideAnnotation = {
      side: s.side,
      role: 'servitude',
      label: s.beneficiary || s.purpose || undefined,
      widthM: s.widthM,
      servitudeId: s.id,
    }
    if (!out[s.subjectId]) out[s.subjectId] = []
    out[s.subjectId].push(entry)
  }
  return out
}

/**
 * One-time migration: turn legacy role:'servitude' annotations (no servitudeId)
 * into Servitude records so pre-existing projects adopt the model. Type defaults
 * to 'party-wall' for the surveyor to confirm; the annotation label becomes purpose.
 */
export function backfillServitudesFromAnnotations(
  annotationsBySubject: Record<string, SideAnnotation[]>,
): Servitude[] {
  const out: Servitude[] = []
  for (const [subjectId, list] of Object.entries(annotationsBySubject)) {
    for (const a of list) {
      if (a.role === 'servitude' && !a.servitudeId) {
        out.push({
          id: newServitudeId(),
          subjectId,
          side: a.side,
          type: 'party-wall',
          widthM: a.widthM,
          purpose: a.label || undefined,
        })
      }
    }
  }
  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `app-frontend`): `npx vitest run servitudeMirror`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/servitudes.ts app-frontend/src/views/modules/cadastral-standard/__tests__/servitudeMirror.test.ts
git commit -m "feat(servitudes): mirror sync + legacy annotation back-fill"
```

---

### Task 3: Certificate row + sentence assembly

**Files:**
- Create: `app-frontend/src/utils/dispensationCertificate.ts`
- Test: `app-frontend/src/utils/__tests__/dispensationCertificate.test.ts`

**Interfaces:**
- Consumes: `Servitude`, `servitudeTypeLabel` from `../views/modules/cadastral-standard/servitudes`.
- Produces: `CertificateRow` (`{ stand: string; areaM2: number; servitudeText: string }`), `buildServitudeSentence(s, subjectStand)`, `buildCertificateRows(parcels, servitudes, portion)`.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/dispensationCertificate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildServitudeSentence, buildCertificateRows } from '../dispensationCertificate'
import type { Servitude } from '../../views/modules/cadastral-standard/servitudes'

const sv = (over: Partial<Servitude> = {}): Servitude => ({
  id: 's', subjectId: '10', side: 'AB', type: 'party-wall', ...over,
})
const parcels = [
  { id: 10, stand: '1620', area_m2: 174 },
  { id: 11, stand: '1621', area_m2: 169 },
  { id: 12, stand: '1650', area_m2: 300 },
]

describe('buildServitudeSentence', () => {
  it('uses the beacon pair and type label', () => {
    expect(buildServitudeSentence(sv({ type: 'sewer', fromBeacon: '1620a', toBeacon: '1620b', widthM: 3 }), '1620'))
      .toBe('The boundary (1620a – 1620b) is subject to a Sewer, 3 m servitude')
  })
  it('falls back to the raw side when beacons are missing, and names both stands for a party wall', () => {
    expect(buildServitudeSentence(sv({ type: 'party-wall', side: 'BC', adjoiningStand: '1621' }), '1620'))
      .toBe('The boundary (BC) is subject to a Party wall servitude between Stand 1620 and Stand 1621')
  })
  it('adds in-favour-of for a beneficiary (non party-wall)', () => {
    expect(buildServitudeSentence(sv({ type: 'electricity', fromBeacon: '1620a', toBeacon: '1620b', beneficiary: 'ZESA' }), '1620'))
      .toBe('The boundary (1620a – 1620b) is subject to a Electricity servitude in favour of ZESA')
  })
})

describe('buildCertificateRows', () => {
  it('undeveloped: area-only rows, blank servitudes, all parcels', () => {
    const rows = buildCertificateRows(parcels, [sv()], 'undeveloped')
    expect(rows).toHaveLength(3)
    expect(rows.every(r => r.servitudeText === '')).toBe(true)
    expect(rows[0]).toMatchObject({ stand: '1620', areaM2: 174 })
  })
  it('developed: emits the servitude on its stand and reciprocally on the adjoining stand', () => {
    const servitudes = [sv({ id: 's1', subjectId: '10', side: 'AB', type: 'party-wall', fromBeacon: '1620a', toBeacon: '1620b', adjoiningStand: '1621' })]
    const rows = buildCertificateRows(parcels, servitudes, 'developed')
    const byStand = Object.fromEntries(rows.map(r => [r.stand, r.servitudeText]))
    expect(byStand['1620']).toContain('between Stand 1620 and Stand 1621')
    expect(byStand['1621']).toContain('between Stand 1620 and Stand 1621')
    expect(byStand['1650']).toBe('')
  })
  it('developed: joins multiple servitudes on one stand with "; "', () => {
    const servitudes = [
      sv({ id: 's1', subjectId: '10', type: 'sewer', fromBeacon: '1620a', toBeacon: '1620b' }),
      sv({ id: 's2', subjectId: '10', type: 'water', fromBeacon: '1620b', toBeacon: '1620c' }),
    ]
    const text = buildCertificateRows(parcels, servitudes, 'developed').find(r => r.stand === '1620')!.servitudeText
    expect(text.split('; ')).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `app-frontend`): `npx vitest run dispensationCertificate`
Expected: FAIL — `../dispensationCertificate` does not exist.

- [ ] **Step 3: Implement `dispensationCertificate.ts`**

Create `app-frontend/src/utils/dispensationCertificate.ts`:

```ts
import { servitudeTypeLabel, type Servitude } from '../views/modules/cadastral-standard/servitudes'

export interface CertificateRow {
  stand: string
  areaM2: number
  servitudeText: string
}

export interface CertificateParcel {
  id: string | number
  stand: string
  area_m2?: number
}

export function buildServitudeSentence(s: Servitude, subjectStand: string): string {
  const boundary = s.fromBeacon && s.toBeacon ? `${s.fromBeacon} – ${s.toBeacon}` : s.side
  const label = servitudeTypeLabel(s)
  const width = s.widthM ? `, ${s.widthM} m` : ''
  let qualifier = ''
  if (s.type === 'party-wall' && s.adjoiningStand) {
    qualifier = ` between Stand ${subjectStand} and Stand ${s.adjoiningStand}`
  } else if (s.beneficiary) {
    qualifier = ` in favour of ${s.beneficiary}`
  }
  return `The boundary (${boundary}) is subject to a ${label}${width} servitude${qualifier}`
}

export function buildCertificateRows(
  parcels: CertificateParcel[],
  servitudes: Servitude[],
  portion: 'developed' | 'undeveloped',
): CertificateRow[] {
  // Accumulate sentences per parcel (keyed by parcel id as string).
  const sentences = new Map<string, string[]>()
  parcels.forEach((p) => sentences.set(String(p.id), []))

  if (portion === 'developed') {
    const standToId = new Map(parcels.map((p) => [p.stand, String(p.id)]))
    for (const s of servitudes) {
      const subjParcel = parcels.find((p) => String(p.id) === s.subjectId)
      if (!subjParcel) continue
      const sentence = buildServitudeSentence(s, subjParcel.stand)
      sentences.get(s.subjectId)!.push(sentence)
      // Party-wall reciprocity: same mutual sentence on the adjoining stand's row.
      if (s.type === 'party-wall' && s.adjoiningStand) {
        const adjId = standToId.get(s.adjoiningStand)
        if (adjId && adjId !== s.subjectId) sentences.get(adjId)!.push(sentence)
      }
    }
  }

  return parcels.map((p) => ({
    stand: p.stand,
    areaM2: p.area_m2 ?? 0,
    servitudeText: sentences.get(String(p.id))!.join('; '),
  }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `app-frontend`): `npx vitest run dispensationCertificate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/dispensationCertificate.ts app-frontend/src/utils/__tests__/dispensationCertificate.test.ts
git commit -m "feat(dispensation): certificate row + sentence assembly"
```

---

### Task 4: jsPDF certificate generator

**Files:**
- Create: `app-frontend/src/utils/dispensationCertificateGenerator.ts`
- Test: `app-frontend/src/utils/__tests__/dispensationCertificateGenerator.test.ts`

**Interfaces:**
- Consumes: `CertificateRow` from `./dispensationCertificate`.
- Produces: `DispensationCertificateData`, `generateDispensationCertificatePDF(data): Promise<{ blob: Blob; pageCount: number }>`.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/dispensationCertificateGenerator.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generateDispensationCertificatePDF, type DispensationCertificateData } from '../dispensationCertificateGenerator'

const base: DispensationCertificateData = {
  portion: 'developed',
  heading: 'DISPENSATION CERTIFICATE — DEVELOPED PORTION',
  township: 'MAGLAS TOWNSHIP',
  district: 'SHABANI',
  generalPlanNumber: 'GP 1234',
  dispensationClause: 'Regulation 78 of the Land Survey Regulations',
  surveyorName: 'F. Chitsike',
  licenseNumber: 'RL 123',
  date: '2026-07-14',
  standCount: 2,
  totalArea: 349,
  rows: [
    { stand: '1620', areaM2: 174, servitudeText: 'The boundary (1620a – 1620b) is subject to a Party wall servitude between Stand 1620 and Stand 1621' },
    { stand: '1621', areaM2: 175, servitudeText: 'The boundary (1620a – 1620b) is subject to a Party wall servitude between Stand 1620 and Stand 1621' },
  ],
}

describe('generateDispensationCertificatePDF', () => {
  it('returns a non-empty PDF blob and at least one page (developed)', async () => {
    const { blob, pageCount } = await generateDispensationCertificatePDF(base)
    expect(blob.size).toBeGreaterThan(0)
    expect(pageCount).toBeGreaterThanOrEqual(1)
  })
  it('renders the undeveloped variant with many rows across pages', async () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ stand: String(1600 + i), areaM2: 200, servitudeText: '' }))
    const { blob, pageCount } = await generateDispensationCertificatePDF({ ...base, portion: 'undeveloped', rows, standCount: 80 })
    expect(blob.size).toBeGreaterThan(0)
    expect(pageCount).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `app-frontend`): `npx vitest run dispensationCertificateGenerator`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `dispensationCertificateGenerator.ts`**

Create `app-frontend/src/utils/dispensationCertificateGenerator.ts`:

```ts
import jsPDF from 'jspdf'
import type { CertificateRow } from './dispensationCertificate'

export interface DispensationCertificateData {
  portion: 'developed' | 'undeveloped'
  heading: string
  township: string
  parentProperty?: string
  district?: string
  province?: string
  generalPlanNumber?: string
  sgNumber?: string
  loZone?: string
  rows: CertificateRow[]
  standCount: number
  totalArea: number
  dispensationClause: string
  surveyorName: string
  licenseNumber?: string
  place?: string
  date: string
}

const M = { top: 20, right: 18, bottom: 22, left: 18 }

export async function generateDispensationCertificatePDF(
  data: DispensationCertificateData,
): Promise<{ blob: Blob; pageCount: number }> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const contentW = pageW - M.left - M.right
  let y = M.top

  const line = (txt: string, opts: { size?: number; style?: 'normal' | 'bold'; align?: 'left' | 'center'; gap?: number } = {}) => {
    doc.setFont('helvetica', opts.style ?? 'normal')
    doc.setFontSize(opts.size ?? 10)
    const x = opts.align === 'center' ? pageW / 2 : M.left
    doc.text(txt, x, y, { align: opts.align ?? 'left' })
    y += opts.gap ?? 6
  }

  // Header
  line(data.heading, { size: 13, style: 'bold', align: 'center', gap: 9 })
  const metaLine = (label: string, value?: string) => { if (value) line(`${label}: ${value}`) }
  metaLine('Township', data.township)
  metaLine('Parent property', data.parentProperty)
  metaLine('District / Province', [data.district, data.province].filter(Boolean).join(' / ') || undefined)
  metaLine('General Plan', data.generalPlanNumber)
  metaLine('SG number', data.sgNumber)
  metaLine('System', data.loZone)
  y += 3

  // Table
  const showServ = data.portion === 'developed'
  const cols = showServ
    ? [{ w: 28, t: 'STAND No.' }, { w: 34, t: 'AREA (m²)' }, { w: contentW - 62, t: 'DETAILS OF SERVITUDES' }]
    : [{ w: 40, t: 'STAND No.' }, { w: 46, t: 'AREA (m²)' }, { w: contentW - 86, t: 'DETAILS OF SERVITUDES' }]

  const drawHeaderRow = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    let x = M.left
    const rowY = y
    for (const c of cols) { doc.rect(x, rowY - 4, c.w, 7); doc.text(c.t, x + 1.5, rowY, { maxWidth: c.w - 3 }); x += c.w }
    y += 7
  }
  drawHeaderRow()

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  for (const r of data.rows) {
    const servLines = showServ && r.servitudeText ? doc.splitTextToSize(r.servitudeText, cols[2].w - 3) : ['']
    const rowH = Math.max(6, servLines.length * 4 + 2)
    if (y + rowH > pageH - M.bottom) { doc.addPage(); y = M.top; drawHeaderRow(); doc.setFont('helvetica', 'normal'); doc.setFontSize(9) }
    let x = M.left
    const cells = [r.stand, r.areaM2 ? String(Math.round(r.areaM2)) : '', showServ ? servLines : ['']]
    for (let i = 0; i < cols.length; i++) {
      doc.rect(x, y - 4, cols[i].w, rowH)
      const val = cells[i]
      doc.text(Array.isArray(val) ? val : [val], x + 1.5, y, { maxWidth: cols[i].w - 3 })
      x += cols[i].w
    }
    y += rowH
  }

  // Totals
  y += 2
  line(`Total stands: ${data.standCount}    Total area: ${Math.round(data.totalArea)} m²`, { style: 'bold' })
  y += 2

  // Footer blocks
  const footer = (txt: string, style: 'normal' | 'bold' = 'normal') => {
    const wrapped = doc.splitTextToSize(txt, contentW)
    if (y + wrapped.length * 5 > pageH - M.bottom) { doc.addPage(); y = M.top }
    doc.setFont('helvetica', style); doc.setFontSize(9)
    doc.text(wrapped, M.left, y); y += wrapped.length * 5 + 3
  }
  footer(`Dispensation is granted under ${data.dispensationClause}.`)
  footer(`I, ${data.surveyorName}${data.licenseNumber ? ` (${data.licenseNumber})` : ''}, Registered Land Surveyor, certify the above.`)
  footer(`Signed: ____________________     Place: ${data.place || '____________'}     Date: ${data.date}`)
  y += 6
  footer('For office use — Surveyor-General:', 'bold')
  footer('Approved: ____________________     Date: ____________________')

  const pageCount = doc.getNumberOfPages()
  const blob = doc.output('blob')
  return { blob, pageCount }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `app-frontend`): `npx vitest run dispensationCertificateGenerator`
Expected: PASS (both cases; the 80-row case spans ≥2 pages).

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/dispensationCertificateGenerator.ts app-frontend/src/utils/__tests__/dispensationCertificateGenerator.test.ts
git commit -m "feat(dispensation): jsPDF certificate generator"
```

---

### Task 5: documentStorage type + lodgement reclassification

**Files:**
- Modify: `app-frontend/src/services/documentStorage.ts:12` (union) and `:48-49` (`resolveTargetFolder`)
- Modify: `app-frontend/src/utils/lodgementDocuments.ts:45` ("Dispensation Certificate" rule)
- Test: `app-frontend/src/services/__tests__/resolveTargetFolder.test.ts`, `app-frontend/src/utils/__tests__/lodgementDocuments.test.ts`

**Interfaces:**
- Produces: `documentType` accepts `'dispensation-certificate'` → `structure.certificates`; lodgement "Dispensation Certificate" ticks on a `output/certificates/` file matching `/dispensation/i`.

- [ ] **Step 1: Write the failing tests**

Add to `app-frontend/src/services/__tests__/resolveTargetFolder.test.ts` (it already imports `resolveTargetFolder` and builds a structure — match the existing structure fixture in that file):

```ts
  it('routes dispensation-certificate to the certificates folder', () => {
    expect(resolveTargetFolder('dispensation-certificate', structure)).toBe(structure.certificates)
  })
```

Add to `app-frontend/src/utils/__tests__/lodgementDocuments.test.ts` inside the "generated docs" describe block:

```ts
  it('ticks Dispensation Certificate from a generated file in output/certificates', () => {
    const files = [f('DispensationDeveloped.pdf', 'output/certificates')]
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]))
    expect(by['Dispensation Certificate']).toBe(true)
  })

  it('does NOT tick Dispensation Certificate from a /dispensation/ file under input/ any more (now folder-gated)', () => {
    const files = [f('my-dispensation.pdf', 'input')]
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]))
    expect(by['Dispensation Certificate']).toBe(false)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `app-frontend`): `npx vitest run resolveTargetFolder lodgementDocuments`
Expected: FAIL — union rejects `'dispensation-certificate'` (TS/throw); Dispensation still matches under `input/`.

- [ ] **Step 3: Update `documentStorage.ts`**

In `app-frontend/src/services/documentStorage.ts`, add `'dispensation-certificate'` to the `documentType` union (line 12), and add a case in `resolveTargetFolder` next to `dsg-certificate`:

```ts
    case 'dsg-certificate':
    case 'dispensation-certificate':
      return structure.certificates
```

- [ ] **Step 4: Update `lodgementDocuments.ts`**

In `app-frontend/src/utils/lodgementDocuments.ts`, change the "Dispensation Certificate" rule (currently `{ kind: 'external', keyword: /dispensation/i }`) to:

```ts
  'Dispensation Certificate': { kind: 'generated', folders: ['certificates'], keyword: /dispensation/i },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `app-frontend`): `npx vitest run resolveTargetFolder lodgementDocuments`
Expected: PASS, including the pre-existing lodgement regression tests.

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/services/documentStorage.ts app-frontend/src/services/__tests__/resolveTargetFolder.test.ts app-frontend/src/utils/lodgementDocuments.ts app-frontend/src/utils/__tests__/lodgementDocuments.test.ts
git commit -m "feat(dispensation): certificates document type + lodgement reclassification"
```

---

### Task 6: Orchestration composable

**Files:**
- Create: `app-frontend/src/composables/useDispensationCertificate.ts`
- Test: `app-frontend/src/composables/__tests__/useDispensationCertificate.test.ts`

**Interfaces:**
- Consumes: `buildCertificateRows`/`CertificateParcel` (Task 3), `generateDispensationCertificatePDF`/`DispensationCertificateData` (Task 4), `Servitude` (Task 1), `saveDocument` (Task 5 type).
- Produces: `DispensationHeader`, `GenerateDispensationOptions`, `generateAndSaveDispensation(opts): Promise<{ saved?: string; failed?: string }>`.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/composables/__tests__/useDispensationCertificate.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/documentStorage', () => ({
  saveDocument: vi.fn(),
}))
vi.mock('@/utils/dispensationCertificateGenerator', () => ({
  generateDispensationCertificatePDF: vi.fn(async () => ({ blob: new Blob(['x']), pageCount: 1 })),
}))

import { saveDocument } from '@/services/documentStorage'
import { generateDispensationCertificatePDF } from '@/utils/dispensationCertificateGenerator'
import { generateAndSaveDispensation } from '../useDispensationCertificate'
import type { Servitude } from '../../views/modules/cadastral-standard/servitudes'

const header = { township: 'MAGLAS', dispensationClause: 'Reg 78', surveyorName: 'F.C.', date: '2026-07-14' }
const parcels = [{ id: 10, stand: '1620', area_m2: 174 }]
const sv: Servitude = { id: 's', subjectId: '10', side: 'AB', type: 'party-wall', fromBeacon: '1620a', toBeacon: '1620b' }

beforeEach(() => { vi.clearAllMocks() })

describe('generateAndSaveDispensation', () => {
  it('developed: builds data with rows/totals, saves DispensationDeveloped.pdf to certificates, overwrite', async () => {
    ;(saveDocument as any).mockResolvedValue({ success: true, filePath: '/p/DispensationDeveloped.pdf' })
    const out = await generateAndSaveDispensation({ workingDirectory: 'C:/proj', portion: 'developed', parcels, servitudes: [sv], header })
    const genArg = (generateDispensationCertificatePDF as any).mock.calls[0][0]
    expect(genArg.portion).toBe('developed')
    expect(genArg.standCount).toBe(1)
    expect(genArg.totalArea).toBe(174)
    expect(genArg.rows[0].servitudeText).toContain('1620a – 1620b')
    expect(saveDocument).toHaveBeenCalledWith(expect.objectContaining({
      workingDirectory: 'C:/proj', documentType: 'dispensation-certificate',
      fileName: 'DispensationDeveloped.pdf', overwrite: true,
    }))
    expect(out.saved).toBeTruthy()
    expect(out.failed).toBeUndefined()
  })
  it('undeveloped: uses DispensationUndeveloped.pdf', async () => {
    ;(saveDocument as any).mockResolvedValue({ success: true, filePath: '/p/DispensationUndeveloped.pdf' })
    await generateAndSaveDispensation({ workingDirectory: 'C:/proj', portion: 'undeveloped', parcels, servitudes: [], header })
    expect(saveDocument).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'DispensationUndeveloped.pdf' }))
  })
  it('records a failure without throwing when saveDocument reports failure', async () => {
    ;(saveDocument as any).mockResolvedValue({ success: false, error: 'locked' })
    const out = await generateAndSaveDispensation({ workingDirectory: 'C:/proj', portion: 'developed', parcels, servitudes: [sv], header })
    expect(out.saved).toBeUndefined()
    expect(out.failed).toBe('locked')
  })
  it('records a failure without throwing when the generator throws', async () => {
    ;(generateDispensationCertificatePDF as any).mockRejectedValueOnce(new Error('boom'))
    const out = await generateAndSaveDispensation({ workingDirectory: 'C:/proj', portion: 'developed', parcels, servitudes: [sv], header })
    expect(out.failed).toBe('boom')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `app-frontend`): `npx vitest run useDispensationCertificate`
Expected: FAIL — `../useDispensationCertificate` does not exist.

- [ ] **Step 3: Implement `useDispensationCertificate.ts`**

Create `app-frontend/src/composables/useDispensationCertificate.ts`:

```ts
import { saveDocument } from '@/services/documentStorage'
import { generateDispensationCertificatePDF } from '@/utils/dispensationCertificateGenerator'
import { buildCertificateRows, type CertificateParcel } from '@/utils/dispensationCertificate'
import type { Servitude } from '@/views/modules/cadastral-standard/servitudes'

export interface DispensationHeader {
  township: string
  parentProperty?: string
  district?: string
  province?: string
  generalPlanNumber?: string
  sgNumber?: string
  loZone?: string
  dispensationClause: string
  surveyorName: string
  licenseNumber?: string
  place?: string
  date: string
}

export interface GenerateDispensationOptions {
  workingDirectory: string
  portion: 'developed' | 'undeveloped'
  parcels: CertificateParcel[]
  servitudes: Servitude[]
  header: DispensationHeader
}

export async function generateAndSaveDispensation(
  opts: GenerateDispensationOptions,
): Promise<{ saved?: string; failed?: string }> {
  const { workingDirectory, portion, parcels, servitudes, header } = opts
  try {
    const rows = buildCertificateRows(parcels, servitudes, portion)
    const heading = `DISPENSATION CERTIFICATE — ${portion === 'developed' ? 'DEVELOPED' : 'UNDEVELOPED'} PORTION`
    const { blob } = await generateDispensationCertificatePDF({
      portion,
      heading,
      ...header,
      rows,
      standCount: parcels.length,
      totalArea: parcels.reduce((sum, p) => sum + (p.area_m2 ?? 0), 0),
    })
    const fileName = portion === 'developed' ? 'DispensationDeveloped.pdf' : 'DispensationUndeveloped.pdf'
    const result = await saveDocument({
      workingDirectory,
      documentType: 'dispensation-certificate',
      fileName,
      pdfBlob: blob,
      overwrite: true,
    })
    if (result.success) return { saved: result.filePath || fileName }
    return { failed: result.error || 'Unknown error' }
  } catch (error: any) {
    return { failed: error?.message || 'Unknown error' }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `app-frontend`): `npx vitest run useDispensationCertificate`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/composables/useDispensationCertificate.ts app-frontend/src/composables/__tests__/useDispensationCertificate.test.ts
git commit -m "feat(dispensation): orchestration composable (generate + best-effort save)"
```

---

### Task 7: Servitudes stage view + workflow wiring

**Files:**
- Create: `app-frontend/src/views/modules/cadastral-standard/ServitudesView.vue`
- Modify: `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue:1536-1548` (workflowSteps) and `:1086` area (step render)
- Test: manual QA (Vue view; the repo does not unit-test `.vue` render, and `vue-tsc` cannot gate — see Global Constraints).

**Interfaces:**
- Consumes: everything above — `Servitude`/helpers/`resolveBeaconPair`/`syncServitudeMirror`/`backfillServitudesFromAnnotations` (Tasks 1-2), `subjectSides` (`sideAnnotations.ts`), `generateAndSaveDispensation` (Task 6), the shared `ParcelSelect` component (`@/components/inputs/ParcelSelect.vue`).

> **v1 scoping note (surface to the reviewer):** the spec calls for reusing the in-map click-a-side interaction. For a testable, shippable v1 this stage reuses the same *data* path — the shared `ParcelSelect` for stand selection and `subjectSides(ring)` to list the selected stand's boundaries as clickable rows — and opens the rich servitude editor from a side row. Wiring the servitude editor into the live MapLibre canvas click handler (`isServitudeStage` on `MapLibreAreaView`) is a fast-follow that does not change the data model or the certificate. Confirm this is acceptable during review; if in-map capture is required for v1, split it into its own task against `MapLibreAreaView.vue`.

- [ ] **Step 1: Register the workflow step**

In `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`, add the step to `workflowSteps` (line ~1536) between `area-computation` and `report-on-survey`:

```ts
  { id: 'area-computation', name: 'Area Computation' },
  { id: 'servitudes', name: 'Servitudes' },
  { id: 'report-on-survey', name: 'Report on Survey' },
```

- [ ] **Step 2: Render the stage view**

In the same file, next to the other step components (near line ~1086 where `<ReportOnSurveyView v-if="workflowState.currentStep === 'report-on-survey'" />` is), add:

```html
      <ServitudesView v-if="workflowState.currentStep === 'servitudes'" />
```

And add the import alongside the other view imports in the `<script setup>` block:

```ts
import ServitudesView from './ServitudesView.vue'
```

- [ ] **Step 3: Create `ServitudesView.vue`**

Create `app-frontend/src/views/modules/cadastral-standard/ServitudesView.vue`. It: loads parcels + persisted servitudes + existing annotations; on mount back-fills legacy servitude annotations; lets the surveyor pick a stand (via `ParcelSelect`), lists that stand's sides from `subjectSides(ring)`, opens the servitude editor for a side (type dropdown+custom, width, beneficiary, adjoiningStand, purpose, statuteRef), and on save resolves the beacon pair, upserts the servitude, persists `step_data['servitudes'].servitudes`, and rebuilds the `metadata.sideAnnotations` mirror via `syncServitudeMirror`. A "Generate certificate" button derives the portion from the plan type and calls `generateAndSaveDispensation`.

Follow the persistence pattern already in `SurveyPlanMapView.vue` (`persistSideAnnotations` / `loadSideAnnotations` — the `PATCH /survey-projects/:id/workflow` call writing `step_data`). Use these concrete pieces:

```ts
// portion from plan type (general-developed -> developed, else undeveloped)
const portion = planType === 'general-developed' ? 'developed' : 'undeveloped'

// on save of one servitude
const sides = subjectSides(ringForParcel(selectedParcel))
const pair = resolveBeaconPair(sides, selectedParcel?.metadata?.edges || [], editor.side)
const record: Servitude = {
  id: editor.id || newServitudeId(),
  subjectId: String(selectedParcel.id),
  side: editor.side,
  type: editor.type,
  typeLabelOther: editor.type === 'other' ? editor.typeLabelOther : undefined,
  widthM: editor.widthM ?? undefined,
  beneficiary: editor.beneficiary || undefined,
  adjoiningStand: editor.type === 'party-wall' ? (editor.adjoiningStand || undefined) : undefined,
  purpose: editor.purpose || undefined,
  statuteRef: editor.statuteRef || undefined,
  fromBeacon: pair?.fromBeacon,
  toBeacon: pair?.toBeacon,
}
servitudes.value = upsertServitude(servitudes.value, record)
await persistServitudes()               // writes step_data['servitudes'].servitudes
annotations.value = syncServitudeMirror(annotations.value, servitudes.value)
await persistSideAnnotationsMirror()     // writes metadata.sideAnnotations (existing shape)
```

Where `ringForParcel(parcel)` extracts the outer ring as `[number,number][]` from the parcel geometry (`parcel.geom?.coordinates?.[0]` for a Polygon, dropping the closing duplicate — `subjectSides` already tolerates it). Reuse the shared `ParcelSelect` (`@/components/inputs/ParcelSelect.vue`) for stand selection, matching its usage in the diagram views.

- [ ] **Step 4: Type-check for new reachable errors**

Run (from `app-frontend`): `npx vue-tsc --noEmit`
Expected: it bails at the pre-existing tsconfig `baseUrl` (TS5101) error and cannot fully gate (see Global Constraints). Confirm no NEW error is attributable to the changed files; if the tool cannot reach them, say so in the report.

- [ ] **Step 5: Run the full feature suite**

Run (from `app-frontend`): `npx vitest run servitudes servitudeMirror dispensationCertificate dispensationCertificateGenerator useDispensationCertificate resolveTargetFolder lodgementDocuments`
Expected: PASS (all Task 1-6 suites green; no regression in lodgement).

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/ServitudesView.vue app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue
git commit -m "feat(dispensation): Servitudes stage view + workflow wiring"
```

- [ ] **Step 7: Manual QA**

1. Open a `general-developed` project, advance to the new **Servitudes** step. Pick a stand, tag a boundary as a Party wall with the adjoining stand; save.
2. Confirm the general plan / diagram still render that servitude (the mirror path is intact) — no visual change vs before.
3. Click **Generate certificate**; confirm `output/certificates/DispensationDeveloped.pdf` appears, the servitude sentence reads `The boundary (<beacon> – <beacon>) is subject to a Party wall servitude between Stand X and Stand Y`, and the row appears on **both** stands.
4. Open a `general-undeveloped` project; generate; confirm `DispensationUndeveloped.pdf` lists stands with areas and a blank servitudes column.
5. Confirm the lodgement letter now ticks **Dispensation Certificate** from the generated file.
6. Open a legacy project that already had `role:'servitude'` annotations; confirm they appear as servitude records on first visit (back-fill), defaulted to Party wall for confirmation.

---

## Self-Review

**Spec coverage:**
- §A servitude model → Task 1. §A `resolveBeaconPair` → Task 1. §B stage/reuse → Task 7. §C persistence → Task 7 (Step 3). §D mirror + `servitudeId` + back-fill → Tasks 1-2, wired in Task 7. §E rows/sentences → Task 3; generator/content → Task 4; variant routing → Task 6. §F output folder + filenames → Tasks 5-6; lodgement reclassification → Task 5. §Testing → Tasks 1-6 unit suites + Task 7 manual QA. All spec sections map to a task.
- Deferred items (multi-boundary, off-boundary geometry, deed refs) are absent by design (Global Constraints / spec Out-of-scope).

**Placeholder scan:** No TBD/TODO; every code step carries complete code; the one view step (Task 7 Step 3) gives concrete persistence code + the exact reuse pieces rather than "implement the UI".

**Type consistency:** `Servitude`, `servitudeTypeLabel`, `resolveBeaconPair(sides, edges, side)`, `syncServitudeMirror`, `backfillServitudesFromAnnotations`, `CertificateRow`, `CertificateParcel`, `buildCertificateRows(parcels, servitudes, portion)`, `DispensationCertificateData`, `generateDispensationCertificatePDF`, `generateAndSaveDispensation`, `documentType: 'dispensation-certificate'` — names and signatures are used identically across Tasks 1-7. `SideAnnotation.servitudeId?` defined in Task 1, consumed in Task 2. Filenames `DispensationDeveloped.pdf` / `DispensationUndeveloped.pdf` consistent between Task 6 code and Task 5/7 tests.
