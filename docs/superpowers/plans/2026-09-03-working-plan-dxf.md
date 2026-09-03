# Working Plan DXF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Working Plan" generate a real A4 working-plan DXF from the final coordinate list, instead of an SI 727 General Plan with a different heading.

**Architecture:** A zero-dependency DXF module is vendored verbatim into the backend and exposed by one stateless route. The frontend builds that module's `spec` from data it already holds — the final coordinate list plus each parcel's named ring in `metadata.cape_lo_points` — and posts it. Save, naming and overwrite-prompt plumbing already exists and is untouched.

**Tech Stack:** Node 22 ESM, Fastify 5, Jest (backend, `--experimental-vm-modules`), Vue 3 + TypeScript, Vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-09-03-working-plan-dxf-design.md`

## Global Constraints

- The vendored files `dxf-r12.js` and `working-plan.js` are copied **verbatim** and MUST NOT be edited — not reformatted, not linted, not "tidied". The golden test exists to enforce this.
- Backend Jest is ESM-only. Bare `npx jest` fails with "Cannot use import statement outside a module". Always run, from `app-backend`:
  `node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>`
- Frontend tests run from `app-frontend` with `npx vitest run <pattern>`.
- The module's coordinate convention is `X` = Cape Lo X (≈ 2144027.08), `Y` = Cape Lo Y (≈ −85673.91). Never swap them.
- Beacon symbol is derived from the beacon **description**, never from `status`. `status` records found-vs-placed, not beacon kind.
- The module's computed `areas` are a cross-check only. Never write them back to `land_parcels`.
- Content type for DXF responses is `application/dxf`, matching `geopdf-vector.js`.
- Do not change General Plan or Diagram generation.

---

### Task 1: Vendor the module and pin it with a golden test

The module is proven: it already runs unmodified in this repo's Node and reproduces its reference output byte-for-byte. The golden test's job is to keep that true forever.

**Files:**
- Create: `app-backend/src/services/workingPlan/dxf-r12.js` (copied verbatim)
- Create: `app-backend/src/services/workingPlan/working-plan.js` (copied verbatim)
- Create: `app-backend/src/services/workingPlan/__tests__/fixtures/brackenhurstSpec.js`
- Create: `app-backend/src/services/workingPlan/__tests__/fixtures/Working_Plan_reference.dxf`
- Create: `app-backend/src/services/workingPlan/__tests__/workingPlan.golden.test.js`
- Create: `.gitattributes` (repo root)

**Interfaces:**
- Consumes: nothing.
- Produces: `generateWorkingPlan(spec)` from `app-backend/src/services/workingPlan/working-plan.js`, returning `{ dxf: string, scale: number, gridInterval: { e: number, n: number }, gridTicks: number, areas: Record<string, number> }`. Throws `Error` with message `generateWorkingPlan: unknown beacon "<name>"`.

- [ ] **Step 1: Copy the vendored files into place**

The source zip is `C:\Users\mukan\Downloads\workin plan reverse engineered.zip`. Extract it to a temporary directory and copy the two modules plus the reference DXF:

```bash
cd /c/surveypro-may-2026/SurveyPro-nov-alpha
mkdir -p app-backend/src/services/workingPlan/__tests__/fixtures
unzip -o -j "/c/Users/mukan/Downloads/workin plan reverse engineered.zip" -d /tmp/wpsrc
cp /tmp/wpsrc/dxf-r12.js      app-backend/src/services/workingPlan/dxf-r12.js
cp /tmp/wpsrc/working-plan.js app-backend/src/services/workingPlan/working-plan.js
cp /tmp/wpsrc/Working_Plan_generated.dxf \
   app-backend/src/services/workingPlan/__tests__/fixtures/Working_Plan_reference.dxf
```

Verify the sizes before going on — the reference DXF must be exactly 32706 bytes:

```bash
wc -c app-backend/src/services/workingPlan/__tests__/fixtures/Working_Plan_reference.dxf
```

Expected: `32706`

- [ ] **Step 2: Stop git from corrupting the reference DXF**

The reference DXF is LF-only and this repo has no `.gitattributes`. On a Windows checkout git would rewrite it to CRLF, and the golden test would fail for a reason that has nothing to do with the code. Create `.gitattributes` at the repo root:

```
# DXF fixtures are compared byte-for-byte. Never touch their line endings.
*.dxf -text
```

- [ ] **Step 3: Write the fixture spec**

This is the worked example's spec, lifted verbatim. Create
`app-backend/src/services/workingPlan/__tests__/fixtures/brackenhurstSpec.js`:

```js
/**
 * The module's own worked example: the Brackenhurst 403-405 sheet rebuilt from
 * nothing but the final coordinate list. Held verbatim so the golden test can
 * prove the vendored module still renders it byte-for-byte.
 *
 * Note this is the SAME survey the module was reverse-engineered from, so it
 * pins the module's stability, not its generality.
 */
const B = (name, X, Y, symbol, label) => ({ name, X, Y, symbol, label })

export const brackenhurstSpec = {
  scale: 2000,

  beacons: [
    B('86B',  2143972.22, -85728.79, 'rm',  'NE'),
    B('87B',  2143988.69, -85741.50, 'rm',  'NE'),
    B('CHK',  2144004.38, -85764.70, 'rm',  'NW'),
    B('SD1',  2144017.17, -85765.13, 'peg', 'E'),
    B('SD4',  2144027.08, -85673.91, 'peg', 'NW'),
    B('BASE', 2144038.34, -85778.60, 'rm',  'W'),
    B('SD5',  2144063.20, -85710.12, 'peg', 'W'),
    B('86C',  2144068.05, -85633.14, 'rm',  'W'),
    B('87A',  2144070.87, -85809.70, 'rm',  'NE'),
    B('SD6',  2144076.45, -85723.41, 'peg', 'E'),
    B('87CR', 2144078.23, -85816.29, 'peg', 'E'),
    B('RM16', 2144100.66, -85623.81, 'rm',  'W'),
    B('SD3',  2144117.40, -85682.55, 'peg', 'E'),
    B('SD2',  2144120.24, -85774.40, 'peg', 'SE'),
    B('RM15', 2144120.41, -85643.50, 'rm',  'S'),
    B('87DR', 2144164.75, -85729.94, 'peg', 'SW'),
    B('88X2', 2144262.68, -85828.08, 'rm',  'N'),
  ],

  parcels: [
    { label: '405',   ring: ['SD4', '86B', '87B', 'SD1', 'SD5'] },
    { label: '404',   ring: ['86C', 'SD4', 'SD5', 'SD6', 'SD3'] },
    { label: '403',   ring: ['SD3', 'SD6', 'SD2', '87DR'] },
    { label: 'Rem./', ring: ['SD5', 'SD1', '87A', '87CR', 'SD2', 'SD6'] },
  ],

  existing: [
    { from: 'SD1',  to: '87CR', extendTo: 16 },
    { from: '87CR', to: 'SD2' },
    { from: '87B',  to: '86B',  extendTo: 12 },
    { from: '87DR', to: '86C',  extendTo: 16 },
    { from: '86C',  to: '87DR', extendTo: 16 },
  ],

  roads: [
    { name: 'Main Road',          from: 'SD1', to: '87CR', offset: 9.5, along: -3 },
    { name: 'Klein Road 25.19 m', from: '86C', to: '87DR', offset: 9.0, along: 5 },
  ],

  notes: [
    { text: '86', X: 2144004.2, Y: -85662.0 },
    { text: '88', X: 2144138.1, Y: -85796.2 },
  ],

  title: [
    'Survey of',
    'Stands 403-405 Brackenhurst Township',
    'of Stand 87 Brackenhurst Township',
    'Gwelo District',
  ],

  certificate: {
    line1: 'Surveyed in July 2026 by me,',
    line2: 'Land Surveyor',
  },

  approvalBox: true,

  inset: {
    scale: 200000,
    beacons: [
      { name: '170/T', X: 2136771, Y: -81571, symbol: 'trig' },
      { name: '176/T', X: 2149106, Y: -71084, symbol: 'trig' },
      { name: '49/T',  X: 2146860, Y: -88454, symbol: 'trig' },
      { name: '50/T',  X: 2151241, Y: -88962, symbol: 'trig' },
      { name: 'RM7',   X: 2141540, Y: -68649, symbol: 'rm' },
      { name: 'BASE',  X: 2144038, Y: -85777, symbol: 'rm' },
    ],
  },
}
```

- [ ] **Step 4: Write the golden test**

Create `app-backend/src/services/workingPlan/__tests__/workingPlan.golden.test.js`:

```js
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan } from '../working-plan.js'
import { brackenhurstSpec } from './fixtures/brackenhurstSpec.js'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * dxf-r12.js and working-plan.js are vendored VERBATIM and must stay that way.
 * This test is the enforcement: it compares the rendered sheet against the
 * shipped reference byte for byte, so any edit to the module -- including a
 * well-meant reformat -- fails here immediately and specifically.
 */
describe('generateWorkingPlan — golden', () => {
  const reference = readFileSync(join(here, 'fixtures', 'Working_Plan_reference.dxf'), 'utf8')

  test('reproduces the reference sheet byte for byte', () => {
    const out = generateWorkingPlan(brackenhurstSpec)
    expect(out.dxf.length).toBe(reference.length)
    expect(out.dxf).toBe(reference)
  })

  test('reports the scale and grid the sheet was actually drawn at', () => {
    const out = generateWorkingPlan(brackenhurstSpec)
    expect(out.scale).toBe(2000)
    expect(out.gridInterval.e).toBeGreaterThan(0)
    expect(out.gridInterval.n).toBeGreaterThan(0)
  })

  test('computes an area for every parcel in the spec', () => {
    const out = generateWorkingPlan(brackenhurstSpec)
    expect(Object.keys(out.areas).sort()).toEqual(['403', '404', '405', 'Rem./'])
    for (const area of Object.values(out.areas)) {
      expect(area).toBeGreaterThan(0)
    }
  })

  test('names the offending beacon when a ring references one that does not exist', () => {
    // The surveyor can act on "unknown beacon SD9"; they cannot act on
    // "Cannot read properties of undefined".
    const spec = {
      ...brackenhurstSpec,
      parcels: [{ label: '405', ring: ['SD4', 'SD9', 'SD5'] }],
      existing: [],
      roads: [],
    }
    expect(() => generateWorkingPlan(spec)).toThrow('generateWorkingPlan: unknown beacon "SD9"')
  })

  test('picks a scale itself when asked to', () => {
    const out = generateWorkingPlan({ ...brackenhurstSpec, scale: 'auto' })
    expect(typeof out.scale).toBe('number')
    expect(out.scale).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 5: Run the golden test**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js workingPlan.golden
```

Expected: 5 passed. If "reproduces the reference sheet byte for byte" fails on length, the fixture DXF has been line-ending-mangled — re-copy it and confirm `.gitattributes` exists.

- [ ] **Step 6: Commit**

```bash
git add .gitattributes app-backend/src/services/workingPlan/
git commit -m "feat(working-plan): vendor the DXF module, pinned by a byte-identical golden test"
```

---

### Task 2: Backend route

One stateless endpoint. It takes the spec in the body and touches no database — the same shape as `POST /api/geopdf/dxf` beside it.

**Files:**
- Create: `app-backend/src/routes/workingPlan.js`
- Modify: `app-backend/src/server.js` (the prefix chain around lines 73-95)
- Create: `app-backend/src/routes/__tests__/workingPlan.dxf.test.js`

**Interfaces:**
- Consumes: `generateWorkingPlan(spec)` from `../services/workingPlan/working-plan.js` (Task 1), returning `{ dxf, scale, gridInterval: { e, n }, gridTicks, areas }`.
- Produces: `POST /api/working-plan/dxf`. Request body is the spec. Response is `application/dxf` with headers `X-Plan-Scale` (number as string), `X-Plan-Grid` (JSON of `{ e, n }`), `X-Plan-Areas` (JSON object of label → m²). Returns 400 with `{ error, message }` for a malformed spec or an unknown beacon.

- [ ] **Step 1: Write the failing route test**

Create `app-backend/src/routes/__tests__/workingPlan.dxf.test.js`:

```js
import { describe, test, expect, jest } from '@jest/globals'
import Fastify from 'fastify'

// The module itself is covered by its own golden test; this suite is about the
// route's contract -- status codes, headers, and how it reports a bad spec.
const mockGenerateWorkingPlan = jest.fn(() => ({
  dxf: '0\nSECTION\n0\nEOF\n',
  scale: 2000,
  gridInterval: { e: 50, n: 50 },
  gridTicks: 12,
  areas: { 405: 4321.5 },
}))

jest.unstable_mockModule('../../services/workingPlan/working-plan.js', () => ({
  generateWorkingPlan: mockGenerateWorkingPlan,
}))

const { default: workingPlanRoutes } = await import('../workingPlan.js')

function buildApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async () => {})
  app.register(workingPlanRoutes)
  return app
}

const validSpec = {
  scale: 'auto',
  beacons: [{ name: 'SD4', X: 2144027.08, Y: -85673.91, symbol: 'peg', label: 'auto' }],
  parcels: [{ label: '405', ring: ['SD4'] }],
  title: ['Survey of', 'Stand 405'],
}

describe('POST /working-plan/dxf', () => {
  test('returns the DXF body as application/dxf', async () => {
    mockGenerateWorkingPlan.mockClear()
    const res = await buildApp().inject({ method: 'POST', url: '/dxf', payload: validSpec })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/dxf')
    expect(res.rawPayload.toString()).toBe('0\nSECTION\n0\nEOF\n')
    expect(mockGenerateWorkingPlan).toHaveBeenCalledTimes(1)
  })

  test('reports the scale, grid and areas it drew at, on headers', async () => {
    // The caller needs these to label the plan and to cross-check areas; they
    // cannot be read back out of the DXF body without parsing it.
    const res = await buildApp().inject({ method: 'POST', url: '/dxf', payload: validSpec })
    expect(res.headers['x-plan-scale']).toBe('2000')
    expect(JSON.parse(res.headers['x-plan-grid'])).toEqual({ e: 50, n: 50 })
    expect(JSON.parse(res.headers['x-plan-areas'])).toEqual({ 405: 4321.5 })
  })

  test('rejects a spec with no beacons or parcels as 400, not 500', async () => {
    const res = await buildApp().inject({ method: 'POST', url: '/dxf', payload: { title: ['x'] } })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/beacons/)
  })

  test('turns an unknown beacon into a 400 that still names the beacon', async () => {
    // A ring naming a beacon that is not in the list is the surveyor's data
    // problem, and they can only fix it if the name survives to the UI.
    mockGenerateWorkingPlan.mockImplementationOnce(() => {
      throw new Error('generateWorkingPlan: unknown beacon "SD9"')
    })
    const res = await buildApp().inject({ method: 'POST', url: '/dxf', payload: validSpec })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('SD9')
  })

  test('any other generator failure is a 500', async () => {
    mockGenerateWorkingPlan.mockImplementationOnce(() => { throw new Error('boom') })
    const res = await buildApp().inject({ method: 'POST', url: '/dxf', payload: validSpec })
    expect(res.statusCode).toBe(500)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js workingPlan.dxf
```

Expected: FAIL — `Cannot find module '../workingPlan.js'`.

- [ ] **Step 3: Write the route**

Create `app-backend/src/routes/workingPlan.js`:

```js
import { generateWorkingPlan } from '../services/workingPlan/working-plan.js'

/**
 * Working Plan DXF.
 *
 * Stateless by design: the spec arrives in the request body, already assembled
 * by the frontend from the final coordinate list and each parcel's named ring.
 * This route runs no query, so it needs no schema-isolation handling -- the
 * same arrangement as POST /api/geopdf/dxf next door.
 */
export default async function workingPlanRoutes(fastify) {
  fastify.post('/dxf', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const spec = request.body

    if (!spec || !Array.isArray(spec.beacons) || !Array.isArray(spec.parcels)) {
      return reply.code(400).send({
        error: 'Invalid working plan spec',
        message: 'spec.beacons and spec.parcels must both be arrays',
      })
    }

    try {
      const out = generateWorkingPlan(spec)
      return reply
        .type('application/dxf')
        .header('Content-Disposition', `attachment; filename="working-plan-${Date.now()}.dxf"`)
        .header('X-Plan-Scale', String(out.scale))
        .header('X-Plan-Grid', JSON.stringify(out.gridInterval))
        .header('X-Plan-Areas', JSON.stringify(out.areas))
        .send(Buffer.from(out.dxf, 'utf8'))
    } catch (error) {
      // The generator raises exactly one caller-fixable error: a ring naming a
      // beacon that is not in the beacon list. Keep the beacon's name intact so
      // the surveyor knows which point to correct.
      if (/unknown beacon/.test(error.message)) {
        return reply.code(400).send({ error: 'Unknown beacon', message: error.message })
      }
      fastify.log.error('[WorkingPlan] DXF generation failed:', error)
      return reply.code(500).send({
        error: 'Working plan generation failed',
        message: error.message,
      })
    }
  })
}
```

- [ ] **Step 4: Register the route prefix**

In `app-backend/src/server.js`, the auto-loader gives every route file the `/api` prefix unless it is named in the chain of `else if` branches. Add a branch for this one, immediately before the `csvImports` branch:

```js
    } else if (routeName === 'workingPlan') {
      app.register(route.default, { prefix: '/api/working-plan' })
      app.log.info(`✅ Registered route: /api/working-plan (${file})`)
    } else if (routeName === 'csvImports') {
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js workingPlan
```

Expected: both suites green — 5 golden tests + 5 route tests.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/routes/workingPlan.js app-backend/src/routes/__tests__/workingPlan.dxf.test.js app-backend/src/server.js
git commit -m "feat(working-plan): stateless POST /api/working-plan/dxf"
```

---

### Task 3: Frontend adapter

Turns what `SurveyPlanMapView` already holds into the module's spec. Pure functions, no Vue — `planPayload.ts` beside it is the pattern to follow.

**Files:**
- Create: `app-frontend/src/views/modules/cadastral-standard/workingPlanSpec.ts`
- Create: `app-frontend/src/views/modules/cadastral-standard/__tests__/workingPlanSpec.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (it produces a plain object matching the spec Task 2's route accepts).
- Produces:
  - `beaconSymbol(description: string | null | undefined): 'peg' | 'rm' | 'trig'`
  - `ringNames(parcel: any): string[]`
  - `workingPlanTitle(projectInfo: any): string[]`
  - `buildWorkingPlanSpec(ctx: WorkingPlanSpecContext): { spec: WorkingPlanSpec; skippedParcels: string[] }`
  - types `WorkingPlanSpec`, `WorkingPlanSpecContext`

- [ ] **Step 1: Write the failing tests**

Create `app-frontend/src/views/modules/cadastral-standard/__tests__/workingPlanSpec.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  buildWorkingPlanSpec,
  beaconSymbol,
  ringNames,
  workingPlanTitle,
} from '../workingPlanSpec'

/** Beacons as exportBeaconsAsGeoJSON emits them: coordinates are [Y, X]. */
function beaconFC(
  points: Array<{ name: string; y: number; x: number; description?: string }>,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map(p => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.y, p.x] },
      properties: { name: p.name, description: p.description ?? '', y: p.y, x: p.x },
    })),
  }
}

const coordinateList = beaconFC([
  { name: 'SD4', y: -85673.91, x: 2144027.08, description: '12mm iron peg in concrete' },
  { name: 'SD5', y: -85710.12, x: 2144063.20, description: '12mm iron peg in concrete' },
  { name: 'SD6', y: -85723.41, x: 2144076.45, description: '12mm iron peg in concrete' },
  { name: 'SD3', y: -85682.55, x: 2144117.40, description: '12mm iron peg in concrete' },
  { name: 'RM16', y: -85623.81, x: 2144100.66, description: 'Reference mark' },
  { name: '49/T', y: -88454.0, x: 2146860.0, description: 'Trig beacon' },
])

const parcel = (stand: string, ids: string[]) => ({
  stand,
  metadata: { cape_lo_points: ids.map(id => ({ id, y: 0, x: 0, status: 'P', description: '' })) },
})

const ctx = (overrides: Record<string, any> = {}) => ({
  beacons: coordinateList,
  parcels: [parcel('404', ['SD4', 'SD5', 'SD6', 'SD3'])],
  projectInfo: { designation: 'Stands 403-405 Brackenhurst Township' },
  config: { surveyorName: 'A. Surveyor', surveyDate: '2026-07-15' },
  ...overrides,
})

describe('ringNames', () => {
  it('reads the ring straight off cape_lo_points, in order', () => {
    expect(ringNames(parcel('404', ['SD4', 'SD5', 'SD6']))).toEqual(['SD4', 'SD5', 'SD6'])
  })

  it('drops a duplicated closing vertex', () => {
    // geom carries a closing duplicate; cape_lo_points normally does not. If one
    // slips in, the module would draw the first leg twice.
    expect(ringNames(parcel('404', ['SD4', 'SD5', 'SD6', 'SD4']))).toEqual(['SD4', 'SD5', 'SD6'])
  })

  it('returns nothing for a parcel with no cape_lo_points', () => {
    // QGIS-imported parcels have none. Better an empty ring the caller can
    // report than a ring guessed by proximity.
    expect(ringNames({ stand: '404', metadata: {} })).toEqual([])
    expect(ringNames({ stand: '404' })).toEqual([])
  })

  it('returns nothing for a ring too short to be a polygon', () => {
    expect(ringNames(parcel('404', ['SD4', 'SD5']))).toEqual([])
  })

  it('returns nothing when any vertex has no name', () => {
    const p = { stand: '404', metadata: { cape_lo_points: [{ id: 'SD4' }, { id: '' }, { id: 'SD6' }] } }
    expect(ringNames(p)).toEqual([])
  })
})

describe('beaconSymbol', () => {
  it('reads the description, since status says found-or-placed, not what kind', () => {
    expect(beaconSymbol('12mm iron peg in concrete')).toBe('peg')
    expect(beaconSymbol('Reference mark')).toBe('rm')
    expect(beaconSymbol('RM 16')).toBe('rm')
    expect(beaconSymbol('Trig beacon')).toBe('trig')
    expect(beaconSymbol('trigonometrical station')).toBe('trig')
  })

  it('falls back to peg for anything it does not recognise', () => {
    // Drawing a peg for an unknown description is a smaller lie than promoting
    // it to a trig station on a guess.
    expect(beaconSymbol('')).toBe('peg')
    expect(beaconSymbol(null)).toBe('peg')
    expect(beaconSymbol(undefined)).toBe('peg')
    expect(beaconSymbol('something nobody wrote a rule for')).toBe('peg')
  })
})

describe('workingPlanTitle', () => {
  it('builds up to four heading lines', () => {
    const t = workingPlanTitle({
      designation: 'Stands 403-405 Brackenhurst Township',
      parentProperty: 'Stand 87 Brackenhurst Township',
      district: 'Gwelo',
    })
    expect(t).toEqual([
      'Survey of',
      'Stands 403-405 Brackenhurst Township',
      'of Stand 87 Brackenhurst Township',
      'Gwelo District',
    ])
  })

  it('omits the lines it has no data for', () => {
    expect(workingPlanTitle({ designation: 'Stand 405' })).toEqual(['Survey of', 'Stand 405'])
  })

  it('never exceeds the four lines the module accepts', () => {
    const t = workingPlanTitle({
      designation: 'A', parentProperty: 'B', district: 'C', township: 'D', surveyOf: 'E',
    })
    expect(t.length).toBeLessThanOrEqual(4)
  })
})

describe('buildWorkingPlanSpec', () => {
  it('maps the ring to beacon names in order', () => {
    const { spec } = buildWorkingPlanSpec(ctx())
    expect(spec.parcels).toEqual([{ label: '404', ring: ['SD4', 'SD5', 'SD6', 'SD3'] }])
  })

  it('reads X and Y off the GeoJSON the right way round', () => {
    // The feature's coordinates are [Y, X]; the module wants X and Y named.
    // Swapping them puts the plan on the other side of the planet.
    const { spec } = buildWorkingPlanSpec(ctx())
    const sd4 = spec.beacons.find(b => b.name === 'SD4')!
    expect(sd4.X).toBeCloseTo(2144027.08, 2)
    expect(sd4.Y).toBeCloseTo(-85673.91, 2)
  })

  it('emits a shared beacon once, referenced from both rings', () => {
    const { spec } = buildWorkingPlanSpec(ctx({
      parcels: [parcel('404', ['SD4', 'SD5', 'SD6']), parcel('403', ['SD5', 'SD6', 'SD3'])],
    }))
    expect(spec.beacons.filter(b => b.name === 'SD5')).toHaveLength(1)
    expect(spec.parcels[0].ring).toContain('SD5')
    expect(spec.parcels[1].ring).toContain('SD5')
  })

  it('leaves out coordinate-list points that no ring names', () => {
    // Control and reference points belong in the coordinate list, but putting
    // them on the sheet would stretch the extent and shrink the figure.
    const { spec } = buildWorkingPlanSpec(ctx())
    expect(spec.beacons.map(b => b.name)).not.toContain('49/T')
    expect(spec.beacons.map(b => b.name)).not.toContain('RM16')
  })

  it('carries the symbol through from each beacon description', () => {
    const { spec } = buildWorkingPlanSpec(ctx({
      parcels: [parcel('404', ['SD4', 'SD5', 'RM16'])],
    }))
    expect(spec.beacons.find(b => b.name === 'SD4')!.symbol).toBe('peg')
    expect(spec.beacons.find(b => b.name === 'RM16')!.symbol).toBe('rm')
  })

  it('skips a parcel with no named ring and says which one', () => {
    const { spec, skippedParcels } = buildWorkingPlanSpec(ctx({
      parcels: [parcel('404', ['SD4', 'SD5', 'SD6']), { stand: '999', metadata: {} }],
    }))
    expect(spec.parcels.map(p => p.label)).toEqual(['404'])
    expect(skippedParcels).toEqual(['999'])
  })

  it('skips a parcel whose ring names a point the coordinate list does not have', () => {
    // Reaching the backend with this would earn a 400. Catching it here lets
    // the rest of the plan still draw, and names the parcel at fault.
    const { spec, skippedParcels } = buildWorkingPlanSpec(ctx({
      parcels: [parcel('404', ['SD4', 'SD5', 'SD6']), parcel('403', ['SD3', 'SD6', 'GONE'])],
    }))
    expect(spec.parcels.map(p => p.label)).toEqual(['404'])
    expect(skippedParcels).toEqual(['403'])
  })

  it('asks the module to choose the scale', () => {
    expect(buildWorkingPlanSpec(ctx()).spec.scale).toBe('auto')
  })

  it('builds the certificate from the surveyor and survey date', () => {
    const { spec } = buildWorkingPlanSpec(ctx())
    expect(spec.certificate.line1).toBe('Surveyed in July 2026 by me,')
    expect(spec.certificate.line2).toBe('A. Surveyor, Land Surveyor')
  })

  it('still produces a usable certificate with no surveyor or date', () => {
    const { spec } = buildWorkingPlanSpec(ctx({ config: {} }))
    expect(spec.certificate.line1).toBe('Surveyed by me,')
    expect(spec.certificate.line2).toBe('Land Surveyor')
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd app-frontend && npx vitest run workingPlanSpec
```

Expected: FAIL — cannot resolve `../workingPlanSpec`.

- [ ] **Step 3: Write the adapter**

Create `app-frontend/src/views/modules/cadastral-standard/workingPlanSpec.ts`:

```ts
/**
 * Builds the Working Plan module's `spec` from what SurveyPlanMapView already
 * holds: the final coordinate list (as the beacons FeatureCollection, which has
 * already had the swapped-coordinate correction applied) and each parcel's
 * NAMED ring from metadata.cape_lo_points.
 *
 * Sourcing rings from cape_lo_points is what lets this avoid proximity matching
 * (planPayload.ts's beaconsForParcel, VERTEX_TOL = 0.05 m). Snapping ring
 * vertices to the nearest beacon fails by drawing a plausible WRONG plan; a
 * named ring either resolves or it doesn't.
 */

export interface WorkingPlanBeacon {
  name: string
  X: number
  Y: number
  symbol: 'peg' | 'rm' | 'trig'
  label: 'auto'
}

export interface WorkingPlanParcel {
  label: string
  ring: string[]
}

export interface WorkingPlanSpec {
  scale: 'auto'
  beacons: WorkingPlanBeacon[]
  parcels: WorkingPlanParcel[]
  title: string[]
  certificate: { line1: string; line2: string }
  approvalBox: boolean
}

export interface WorkingPlanSpecContext {
  /** From exportBeaconsAsGeoJSON() — point coordinates are [Y, X] in Cape Lo. */
  beacons: GeoJSON.FeatureCollection
  /** parcels.value, each carrying metadata.cape_lo_points. */
  parcels: any[]
  projectInfo: any
  config: any
}

/** A ring shorter than this is not a polygon. */
const MIN_RING = 3

/**
 * Beacon kind, read from the description.
 *
 * Deliberately NOT from `status`: that records whether the beacon was found (F)
 * or placed (P), which says nothing about whether it is a peg, a reference mark
 * or a trig station. An unrecognised description draws a peg rather than
 * promoting the beacon on a guess.
 */
export function beaconSymbol(description: string | null | undefined): 'peg' | 'rm' | 'trig' {
  const d = (description ?? '').toLowerCase()
  if (/\btrig\b|\btrigonometrical\b/.test(d)) return 'trig'
  if (/\breference mark\b|\brm\b|\brm\d/.test(d)) return 'rm'
  return 'peg'
}

/**
 * The parcel's boundary as beacon names, in ring order. Empty when the parcel
 * cannot supply one — a QGIS import with no cape_lo_points, an unnamed vertex,
 * or a ring too short to close.
 */
export function ringNames(parcel: any): string[] {
  const pts = parcel?.metadata?.cape_lo_points
  if (!Array.isArray(pts) || pts.length < MIN_RING) return []

  const names = pts.map((p: any) => String(p?.id ?? '').trim())
  if (names.some((n: string) => n === '')) return []

  // geom repeats the first vertex to close the ring; cape_lo_points normally
  // does not. If one has crept in, drop it so the first leg isn't drawn twice.
  if (names.length > MIN_RING && names[0] === names[names.length - 1]) names.pop()

  return names.length >= MIN_RING ? names : []
}

/** Up to the four heading lines the module accepts. */
export function workingPlanTitle(projectInfo: any): string[] {
  const lines = ['Survey of']
  const designation = String(projectInfo?.designation ?? '').trim()
  const parent = String(projectInfo?.parentProperty ?? '').trim()
  const district = String(projectInfo?.district ?? '').trim()
  if (designation) lines.push(designation)
  if (parent) lines.push(`of ${parent}`)
  if (district) lines.push(`${district} District`)
  return lines.slice(0, 4)
}

function certificateFrom(config: any): { line1: string; line2: string } {
  const name = String(config?.surveyorName ?? '').trim()
  const raw = config?.surveyDate
  const when = raw ? new Date(raw) : null
  const month = when && !Number.isNaN(when.getTime())
    ? when.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
    : ''
  return {
    line1: month ? `Surveyed in ${month} by me,` : 'Surveyed by me,',
    line2: name ? `${name}, Land Surveyor` : 'Land Surveyor',
  }
}

export function buildWorkingPlanSpec(
  ctx: WorkingPlanSpecContext,
): { spec: WorkingPlanSpec; skippedParcels: string[] } {
  const byName = new Map<string, { X: number; Y: number; description: string }>()
  for (const f of ctx.beacons?.features ?? []) {
    if (f.geometry?.type !== 'Point') continue
    const props = (f.properties ?? {}) as Record<string, unknown>
    const name = String(props.name ?? '').trim()
    if (!name || byName.has(name)) continue
    const [Y, X] = (f.geometry as GeoJSON.Point).coordinates as [number, number]
    if (!Number.isFinite(X) || !Number.isFinite(Y)) continue
    byName.set(name, { X, Y, description: String(props.description ?? '') })
  }

  const parcels: WorkingPlanParcel[] = []
  const skippedParcels: string[] = []
  const used: string[] = []
  const seen = new Set<string>()

  for (const p of ctx.parcels ?? []) {
    const label = String(p?.stand ?? p?.designation ?? p?.id ?? '').trim() || '(unnamed)'
    const ring = ringNames(p)
    if (ring.length === 0 || ring.some(n => !byName.has(n))) {
      skippedParcels.push(label)
      continue
    }
    for (const n of ring) {
      if (!seen.has(n)) { seen.add(n); used.push(n) }
    }
    parcels.push({ label, ring })
  }

  const beacons: WorkingPlanBeacon[] = used.map(name => {
    const b = byName.get(name)!
    return { name, X: b.X, Y: b.Y, symbol: beaconSymbol(b.description), label: 'auto' as const }
  })

  return {
    spec: {
      scale: 'auto',
      beacons,
      parcels,
      title: workingPlanTitle(ctx.projectInfo),
      certificate: certificateFrom(ctx.config),
      approvalBox: true,
    },
    skippedParcels,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd app-frontend && npx vitest run workingPlanSpec
```

Expected: all pass. If the certificate test fails on the month, check that `toLocaleString('en-GB', ...)` yields `July 2026` in this Node build; if it yields a different format, adjust the assertion to match the real output rather than changing the locale.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/workingPlanSpec.ts app-frontend/src/views/modules/cadastral-standard/__tests__/workingPlanSpec.test.ts
git commit -m "feat(working-plan): build the DXF spec from the coordinate list and named rings"
```

---

### Task 4: Frontend service and wiring

The last piece: call the endpoint, and branch the one line in `SurveyPlanMapView` that currently sends every plan type through the SI 727 DXF generator.

**Files:**
- Create: `app-frontend/src/services/workingPlan.ts`
- Create: `app-frontend/src/services/__tests__/workingPlan.test.ts`
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue` (the `if (exportFormats.dxf)` block, around lines 4204-4217, plus the imports near line 627 and the save summary near line 4253)

**Interfaces:**
- Consumes: `buildWorkingPlanSpec(ctx)` and type `WorkingPlanSpec` from `workingPlanSpec.ts` (Task 3); `POST /api/working-plan/dxf` (Task 2).
- Produces: `generateWorkingPlanDXF(spec: WorkingPlanSpec): Promise<{ blob: Blob; scale: number | null; gridInterval: { e: number; n: number } | null; areas: Record<string, number> | null }>`

- [ ] **Step 1: Write the failing service test**

Create `app-frontend/src/services/__tests__/workingPlan.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const post = vi.fn()
vi.mock('../api', () => ({ default: { post: (...args: any[]) => post(...args) } }))

const { generateWorkingPlanDXF } = await import('../workingPlan')

const spec: any = { scale: 'auto', beacons: [], parcels: [], title: [] }

describe('generateWorkingPlanDXF', () => {
  beforeEach(() => post.mockReset())

  it('posts the spec and returns the DXF blob', async () => {
    const blob = new Blob(['0\nSECTION\n'], { type: 'application/dxf' })
    post.mockResolvedValue({ data: blob, headers: {} })

    const result = await generateWorkingPlanDXF(spec)

    expect(post).toHaveBeenCalledWith('/working-plan/dxf', spec, expect.objectContaining({ responseType: 'blob' }))
    expect(result.blob).toBe(blob)
  })

  it('reads back the scale, grid and areas the sheet was drawn at', async () => {
    post.mockResolvedValue({
      data: new Blob(['x']),
      headers: {
        'x-plan-scale': '2000',
        'x-plan-grid': '{"e":50,"n":50}',
        'x-plan-areas': '{"405":4321.5}',
      },
    })

    const result = await generateWorkingPlanDXF(spec)

    expect(result.scale).toBe(2000)
    expect(result.gridInterval).toEqual({ e: 50, n: 50 })
    expect(result.areas).toEqual({ 405: 4321.5 })
  })

  it('survives missing or malformed headers rather than failing the whole plan', async () => {
    // The DXF is the deliverable; the headers are a convenience. A proxy that
    // strips them must not cost the surveyor their plan.
    post.mockResolvedValue({ data: new Blob(['x']), headers: { 'x-plan-areas': 'not json' } })

    const result = await generateWorkingPlanDXF(spec)

    expect(result.scale).toBeNull()
    expect(result.gridInterval).toBeNull()
    expect(result.areas).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd app-frontend && npx vitest run services/__tests__/workingPlan
```

Expected: FAIL — cannot resolve `../workingPlan`.

- [ ] **Step 3: Write the service**

Create `app-frontend/src/services/workingPlan.ts`:

```ts
import api from './api'
import type { WorkingPlanSpec } from '@/views/modules/cadastral-standard/workingPlanSpec'

export interface WorkingPlanDXFResult {
  blob: Blob
  /** Scale denominator the module chose, e.g. 2000 for 1:2000. */
  scale: number | null
  gridInterval: { e: number; n: number } | null
  /** Areas from the PLOTTED coordinates — a cross-check, never the SI 727 area. */
  areas: Record<string, number> | null
}

function parseJsonHeader<T>(raw: unknown): T | null {
  if (typeof raw !== 'string' || raw === '') return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * Render the A4 working plan. The spec goes up whole; the sheet comes back as a
 * DXF, with the scale, grid and computed areas on headers because they cannot be
 * read back out of the body without parsing it.
 */
export async function generateWorkingPlanDXF(spec: WorkingPlanSpec): Promise<WorkingPlanDXFResult> {
  const response = await api.post('/working-plan/dxf', spec, {
    responseType: 'blob',
    timeout: 120000,
  })

  const headers = (response.headers ?? {}) as Record<string, string>
  const scaleRaw = Number(headers['x-plan-scale'])

  return {
    blob: response.data as Blob,
    scale: Number.isFinite(scaleRaw) && headers['x-plan-scale'] ? scaleRaw : null,
    gridInterval: parseJsonHeader<{ e: number; n: number }>(headers['x-plan-grid']),
    areas: parseJsonHeader<Record<string, number>>(headers['x-plan-areas']),
  }
}
```

- [ ] **Step 4: Run the service tests to verify they pass**

```bash
cd app-frontend && npx vitest run services/__tests__/workingPlan
```

Expected: 3 passed.

- [ ] **Step 5: Add the imports to SurveyPlanMapView**

In `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`, beside the existing service imports (near line 627, where `saveDocument` is imported), add:

```ts
import { generateWorkingPlanDXF } from '@/services/workingPlan'
import { buildWorkingPlanSpec } from './workingPlanSpec'
```

- [ ] **Step 6: Branch the DXF step**

Still in `SurveyPlanMapView.vue`, find the DXF block inside `generatePlanDocuments` (around line 4204). It currently reads:

```ts
    if (exportFormats.dxf) {
      const dxfPayload = { ...payload, scale: usedScale || payload.scale, sheetSize: payload.sheetSize || 'SI727_500x400' }
      const { blob, warningCount, warningsSummary } = await generateDXF(dxfPayload)
      docs.dxf = blob
```

Replace the opening of that block so the working plan takes its own path, leaving every other plan type exactly as it was. Declare `workingPlanSkipped` just above the block so the save summary can report it:

```ts
    let workingPlanSkipped: string[] = []
    if (exportFormats.dxf && config.value.planType === 'working-plan') {
      // The Working Plan is an A4 sheet from its own renderer, not an SI 727
      // plan. Built here from the final coordinate list and each parcel's named
      // ring, so no proximity matching is involved.
      const { spec, skippedParcels } = buildWorkingPlanSpec({
        beacons: ctx.beacons,
        parcels: parcels.value,
        projectInfo: props.projectInfo,
        config: config.value,
      })
      if (spec.parcels.length === 0) {
        throw new Error(
          'No parcel has named boundary points. Run Compute Area & Consistency so each parcel stores its beacon names, then generate the Working Plan again.'
        )
      }
      workingPlanSkipped = skippedParcels
      const { blob, scale } = await generateWorkingPlanDXF(spec)
      docs.dxf = blob
      if (scale) console.log(`[PlanDocs] Working plan drawn at 1:${scale}`)
      if (skippedParcels.length) {
        console.warn('[PlanDocs] Working plan omitted parcels with no named ring:', skippedParcels.join(', '))
      }
    } else if (exportFormats.dxf) {
      const dxfPayload = { ...payload, scale: usedScale || payload.scale, sheetSize: payload.sheetSize || 'SI727_500x400' }
      const { blob, warningCount, warningsSummary } = await generateDXF(dxfPayload)
      docs.dxf = blob
```

Leave the rest of the original block — the `warningCount` logging — unchanged inside the `else if`.

- [ ] **Step 7: Report omitted parcels in the save summary**

Further down the same function (around line 4253), the summary message is built. Append the omitted parcels so a surveyor is told on screen, not only in the console:

```ts
    const summaryMsg = `Saved to output/${subdir}/:\n${saved.join('\n') || '(none)'}` +
      (skipped.length ? `\n\nKept existing (not overwritten):\n${skipped.join('\n')}` : '') +
      (workingPlanSkipped.length
        ? `\n\nNot drawn (no named boundary points):\n${workingPlanSkipped.join('\n')}`
        : '')
```

- [ ] **Step 8: Verify the frontend still type-checks and its tests pass**

```bash
cd app-frontend && npm run build && npx vitest run
```

Expected: build succeeds, full Vitest suite green.

- [ ] **Step 9: Verify the backend suite is still green**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js
```

Expected: no new failures. Note any pre-existing failures explicitly rather than assuming they are yours — check them against `git stash` + a clean run if uncertain.

- [ ] **Step 10: Commit**

```bash
git add app-frontend/src/services/workingPlan.ts app-frontend/src/services/__tests__/workingPlan.test.ts app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue
git commit -m "feat(working-plan): route the Working Plan DXF to its own A4 renderer"
```

---

## Manual verification

Automated tests cannot tell you the sheet looks right. After Task 4, with both servers running:

1. Open project `brackenhurst_september-2026`, Survey Plan Generation → Working Plan.
2. Generate with DXF ticked.
3. Confirm the file lands in `output/working-plans/working-plan-<designation>.dxf`.
4. Open it in a DXF viewer and check: A4 landscape, parcel rings closed and labelled, beacon symbols present, coordinate grid ticks, title block reading "Survey of / Stands 403-405 …", approval box.
5. Compare the `X-Plan-Areas` values against the SI 727 areas the project already holds. They should agree closely. **They are a cross-check only — do not write them back.**

## Notes for the implementer

- **Do not edit the vendored files.** If something about the sheet looks wrong, that is a finding to report, not a file to patch. The golden test will fail the moment you touch them, which is the point.
- The `existing`, `roads`, `notes` and `inset` spec fields are out of scope. The module supports them and the golden fixture exercises them, but there is no data model for dashed parent boundaries, road offsets or locality insets yet. Omit them; do not invent values.
- The Working Plan **PDF** still comes from the old pipeline, so PDF and DXF will not match in layout. That is known and accepted for now — do not attempt to reconcile them.
