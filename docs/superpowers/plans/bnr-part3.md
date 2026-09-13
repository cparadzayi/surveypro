
### Task 3: Backend — normalise at every write door, plus `POST /coordinate-points/normalize-names`

**Files:**
- Create: `app-backend/src/utils/beaconNameDoors.js`
- Test: `app-backend/src/utils/__tests__/beaconNameDoors.test.js`
- Modify: `app-backend/src/models/coordinatePoint.js` — `create` (`:53-85`), `batchCreate` (`:87`), `update` (`:247-297`)
- Modify: `app-backend/src/routes/coordinatePoints.js` — batch catch (`:108-113`), rename (`:117-160`), new route after rename
- Modify: `app-backend/src/routes/csvImports.js` — analyze-merge (`:240`), execute-merge (`:448`)

**Interfaces:**
- Consumes: `normalizeBeaconName`, `findCaseFoldDuplicates`, `planNameNormalization` from `app-shared/beaconName.js` (Task 1).
- Produces:
  - `class BeaconNameCaseError extends Error` with `statusCode = 400` and `groups: string[][]`
  - `assertNoCaseFoldDuplicates(names): void` (throws `BeaconNameCaseError`)
  - `normalizeBatchPoints(points): points` (throws on a case-fold pair)
  - `normalizeMergeNames(body): { matched_points?, new_points? }` — only the keys that were arrays (throws on a case-fold pair)
  - `renameByName(db, projectId, oldName, newName): Promise<{ status: 200, row } | { status: 409, name } | { status: 404 }>`
  - `applyNameNormalization(db, projectId, renames): Promise<{ stale: boolean; renamed: number }>`
  - HTTP: `POST /coordinate-points/normalize-names` body `{ project_id: string, renames: Array<{ id, from, to }> }` → `200 { ok: true, data: { renamed } }` | `409 { ok: false, error }`. **Task 5's frontend service calls exactly this.**

**Why a separate util:** the model imports `config/db.js`, which connects and `process.exit(1)`s at import when there is no database. `beaconNameDoors.js` imports only `app-shared`, takes the connection as a parameter, and is tested with a fake.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/utils/__tests__/beaconNameDoors.test.js`:

```js
/**
 * Beacon name write doors (spec Part 3). Db-free: every function takes a connection.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js beaconNameDoors
 */
import { describe, test, expect } from '@jest/globals'
import {
  BeaconNameCaseError,
  assertNoCaseFoldDuplicates,
  normalizeBatchPoints,
  normalizeMergeNames,
  renameByName,
  applyNameNormalization,
} from '../beaconNameDoors.js'

/** A pg-shaped fake: records every query, answers from [regex, fn] responders. */
function fakeDb(responders = []) {
  const calls = []
  const state = { released: false }
  const query = async (sql, params) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
    for (const [pattern, respond] of responders) {
      if (pattern.test(sql)) return respond(params)
    }
    return { rows: [], rowCount: 0 }
  }
  return {
    calls,
    state,
    query,
    async connect() {
      return { query, release: () => { state.released = true } }
    },
  }
}

describe('assertNoCaseFoldDuplicates', () => {
  test('throws a 400 naming the pair', () => {
    let caught
    try {
      assertNoCaseFoldDuplicates(['99a', '12', '99A'])
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(BeaconNameCaseError)
    expect(caught.statusCode).toBe(400)
    expect(caught.message).toMatch(/"99a" \/ "99A"/)
  })

  test('allows exact duplicates and clean lists', () => {
    expect(() => assertNoCaseFoldDuplicates(['15b', '15b', 'SD4'])).not.toThrow()
  })
})

describe('normalizeBatchPoints', () => {
  test('normalises every name and keeps every other field', () => {
    expect(normalizeBatchPoints([{ name: '2474a', y: 1, x: 2, description: 'peg' }, { name: '1464An', y: 3, x: 4 }]))
      .toEqual([{ name: '2474A', y: 1, x: 2, description: 'peg' }, { name: '1464An', y: 3, x: 4 }])
  })

  test('rejects a case-fold pair instead of averaging or dropping one (decision 15)', () => {
    expect(() => normalizeBatchPoints([{ name: '99a', y: 1, x: 1 }, { name: '99A', y: 1, x: 1 }])).toThrow(BeaconNameCaseError)
  })
})

describe('normalizeMergeNames', () => {
  test('normalises matched newId and new point ids', () => {
    expect(normalizeMergeNames({
      project_id: 1,
      matched_points: [{ oldDbId: 7, newId: '2474a', coordinate: { y: 1, x: 2 } }],
      new_points: [{ id: '15b', y: 3, x: 4 }, { id: '15b', y: 3.01, x: 4 }],
    })).toEqual({
      matched_points: [{ oldDbId: 7, newId: '2474A', coordinate: { y: 1, x: 2 } }],
      new_points: [{ id: '15B', y: 3, x: 4 }, { id: '15B', y: 3.01, x: 4 }],
    })
  })

  test('rejects a case-fold pair across matched and new points', () => {
    expect(() => normalizeMergeNames({
      matched_points: [{ newId: '99a' }],
      new_points: [{ id: '99A' }],
    })).toThrow(/"99a" \/ "99A"/)
  })

  test('returns only the keys that were arrays, so route validation is unchanged', () => {
    expect(normalizeMergeNames({ project_id: 1 })).toEqual({})
    expect(normalizeMergeNames(undefined)).toEqual({})
  })
})

describe('renameByName', () => {
  test('normalises the new name BEFORE the conflict check and the UPDATE', async () => {
    const db = fakeDb([[/UPDATE coordinate_points/, params => ({ rows: [{ id: 5, name: params[0] }], rowCount: 1 })]])
    const out = await renameByName(db, '3', '1620', '2474b')
    expect(out).toEqual({ status: 200, row: { id: 5, name: '2474B' } })
    expect(db.calls[0].sql).toMatch(/^SELECT id FROM coordinate_points/)
    expect(db.calls[0].params).toEqual(['3', '2474B', '1620'])
    expect(db.calls[1].params).toEqual(['2474B', '3', '1620'])
  })

  test('409 when the normalised name is taken by another point', async () => {
    const db = fakeDb([[/^SELECT id FROM coordinate_points/, () => ({ rows: [{ id: 9 }], rowCount: 1 })]])
    expect(await renameByName(db, '3', '1620', '2474a')).toEqual({ status: 409, name: '2474A' })
    expect(db.calls).toHaveLength(1)
  })

  test('404 when the old name does not exist', async () => {
    const db = fakeDb([[/UPDATE coordinate_points/, () => ({ rows: [], rowCount: 0 })]])
    expect(await renameByName(db, '3', 'NOPE', '2474A')).toEqual({ status: 404 })
  })
})

describe('applyNameNormalization', () => {
  const rows = [{ id: 1, name: '2474a' }, { id: 2, name: '2475b' }, { id: 3, name: '2475B' }, { id: 4, name: 'SD4' }]
  const selectRows = [/SELECT id, name FROM coordinate_points/, () => ({ rows, rowCount: rows.length })]

  test('applies the plan in ONE transaction and never touches a collision', async () => {
    const db = fakeDb([selectRows])
    const out = await applyNameNormalization(db, '3', [{ id: 1, from: '2474a', to: '2474A' }])
    expect(out).toEqual({ stale: false, renamed: 1 })
    const sqls = db.calls.map(c => c.sql)
    expect(sqls[0]).toBe('BEGIN')
    expect(sqls[1]).toMatch(/FOR UPDATE/)
    const updates = db.calls.filter(c => /^UPDATE/.test(c.sql))
    expect(updates.map(c => c.params)).toEqual([['2474A', 1, '3']])
    expect(sqls[sqls.length - 1]).toBe('COMMIT')
    expect(db.state.released).toBe(true)
  })

  test('409-shaped result and ROLLBACK when the client plan no longer matches the rows', async () => {
    const db = fakeDb([selectRows])
    const out = await applyNameNormalization(db, '3', [{ id: 1, from: '2474a', to: '2474A' }, { id: 2, from: '2475b', to: '2475B' }])
    expect(out).toEqual({ stale: true, renamed: 0 })
    expect(db.calls.some(c => /^UPDATE/.test(c.sql))).toBe(false)
    expect(db.calls[db.calls.length - 1].sql).toBe('ROLLBACK')
    expect(db.state.released).toBe(true)
  })

  test('accepts the same plan in a different order and with string ids', async () => {
    const two = [{ id: 1, name: '2474a' }, { id: 2, name: '15b' }]
    const db = fakeDb([[/SELECT id, name FROM coordinate_points/, () => ({ rows: two, rowCount: 2 })]])
    const out = await applyNameNormalization(db, '3', [{ id: '2', from: '15b', to: '15B' }, { id: '1', from: '2474a', to: '2474A' }])
    expect(out).toEqual({ stale: false, renamed: 2 })
  })

  test('rolls back, releases and rethrows when an UPDATE fails', async () => {
    const db = fakeDb([selectRows, [/^UPDATE/, () => { throw new Error('unique violation') }]])
    await expect(applyNameNormalization(db, '3', [{ id: 1, from: '2474a', to: '2474A' }])).rejects.toThrow('unique violation')
    expect(db.calls[db.calls.length - 1].sql).toBe('ROLLBACK')
    expect(db.state.released).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js beaconNameDoors`
Expected: FAIL — `Cannot find module '../beaconNameDoors.js'`.

- [ ] **Step 3: Write the util**

Create `app-backend/src/utils/beaconNameDoors.js`:

```js
/**
 * Beacon name write doors — normalisation, case-fold rejection, rename, and the
 * backfill's one-transaction beacon rename. Defensive and idempotent: the frontend
 * normalises at entry too (spec decision 14).
 *
 * Deliberately db-free: every function takes the connection as a parameter, so it
 * can be tested without importing config/db.js (which connects at import time).
 * See docs/superpowers/specs/2026-09-12-beacon-name-reconciliation-design.md Part 3.
 */
import {
  normalizeBeaconName,
  findCaseFoldDuplicates,
  planNameNormalization,
} from '../../../app-shared/beaconName.js'

export class BeaconNameCaseError extends Error {
  constructor(groups) {
    const pairs = groups.map(group => group.map(name => `"${name}"`).join(' / ')).join('; ')
    super(`Beacon names that differ only by letter case cannot both be stored: ${pairs}. Rename one of each and try again.`)
    this.name = 'BeaconNameCaseError'
    this.statusCode = 400
    this.groups = groups
  }
}

/** Decision 15: two raw names that normalise to one are an error, never a merge. */
export function assertNoCaseFoldDuplicates(names) {
  const groups = findCaseFoldDuplicates(names)
  if (groups.length > 0) throw new BeaconNameCaseError(groups)
}

/** POST /coordinate-points/batch payload: reject case-fold pairs, then normalise every name. */
export function normalizeBatchPoints(points) {
  const list = Array.isArray(points) ? points : []
  assertNoCaseFoldDuplicates(list.map(point => point?.name))
  return list.map(point => ({ ...point, name: normalizeBeaconName(point?.name) }))
}

/**
 * CSV analyze-merge / execute-merge payload. Returns ONLY the keys that were arrays,
 * so Object.assign onto the request body leaves the routes' own validation unchanged.
 */
export function normalizeMergeNames(body) {
  const matched = Array.isArray(body?.matched_points) ? body.matched_points : null
  const fresh = Array.isArray(body?.new_points) ? body.new_points : null
  assertNoCaseFoldDuplicates([
    ...(matched ?? []).map(match => match?.newId),
    ...(fresh ?? []).map(point => point?.id),
  ])
  const out = {}
  if (matched) out.matched_points = matched.map(match => ({ ...match, newId: normalizeBeaconName(match?.newId) }))
  if (fresh) out.new_points = fresh.map(point => ({ ...point, id: normalizeBeaconName(point?.id) }))
  return out
}

/** PATCH /coordinate-points/rename. The normalised name is what is checked AND stored. */
export async function renameByName(db, projectId, oldName, newName) {
  const storedName = normalizeBeaconName(newName)
  const conflict = await db.query(
    `SELECT id FROM coordinate_points WHERE project_id = $1 AND name = $2 AND name <> $3`,
    [projectId, storedName, oldName]
  )
  if (conflict.rows.length > 0) return { status: 409, name: storedName }

  const result = await db.query(
    `UPDATE coordinate_points
     SET name = $1, updated_at = CURRENT_TIMESTAMP
     WHERE project_id = $2 AND name = $3
     RETURNING *`,
    [storedName, projectId, oldName]
  )
  if (result.rowCount === 0) return { status: 404 }
  return { status: 200, row: result.rows[0] }
}

function renameKey(rename) {
  return `${String(rename?.id)} ${rename?.from} ${rename?.to}`
}

function sameRenames(serverPlan, clientPlan) {
  if (!Array.isArray(clientPlan) || clientPlan.length !== serverPlan.length) return false
  const expected = new Set(serverPlan.map(renameKey))
  return clientPlan.every(rename => expected.has(renameKey(rename)))
}

/**
 * Phase A1 of the repair. Re-plans from the server's own rows (locked), requires the
 * client's plan to equal it, then applies every rename in ONE transaction. A collision
 * is never in the plan, so it is never touched. { stale: true } → the route's 409.
 */
export async function applyNameNormalization(db, projectId, renames) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const current = await client.query(
      'SELECT id, name FROM coordinate_points WHERE project_id = $1 ORDER BY id FOR UPDATE',
      [projectId]
    )
    const plan = planNameNormalization(current.rows)
    if (!sameRenames(plan.renames, renames)) {
      await client.query('ROLLBACK')
      return { stale: true, renamed: 0 }
    }
    for (const rename of plan.renames) {
      await client.query(
        'UPDATE coordinate_points SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND project_id = $3',
        [rename.to, rename.id, projectId]
      )
    }
    await client.query('COMMIT')
    return { stale: false, renamed: plan.renames.length }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js beaconNameDoors`
Expected: PASS.

- [ ] **Step 5: Wire the model**

In `app-backend/src/models/coordinatePoint.js`, after the existing imports (`:1-2`):

```js
import { normalizeBeaconName } from '../../../app-shared/beaconName.js'
import { normalizeBatchPoints } from '../utils/beaconNameDoors.js'
```

`create` — first line of the body (before the SRID lookup at `:55`):

```js
    // Spec decision 14: every door stores the normalised name (idempotent).
    name = normalizeBeaconName(name)
```

(`name` is a destructured parameter, so reassigning it is legal; the INSERT params at `:75` and the log at `:79` then use the normalised value unchanged.)

`batchCreate` — first line of the body (before the SRID query at `:89`), so a case-fold pair is rejected before any SQL and the dedupe map at `:107` and the `ON CONFLICT` key at `:200` both see normalised names:

```js
    // Decision 15: a case-fold pair (99a + 99A) is a 400, never averaged or dropped.
    points = normalizeBatchPoints(points)
```

`update` — first line of the body (before `let finalSrid = srid;` at `:249`):

```js
    // Undefined stays undefined, so COALESCE($1, name) still means "keep the name".
    name = normalizeBeaconName(name)
```

- [ ] **Step 6: Wire the routes**

In `app-backend/src/routes/coordinatePoints.js`, add after the imports (`:1-2`):

```js
import { renameByName, applyNameNormalization } from '../utils/beaconNameDoors.js'
```

Batch catch (`:108-113`) — replace the final `return reply.code(500)...` line with:

```js
      // A case-fold pair is the caller's 400 (BeaconNameCaseError.statusCode); anything else stays a 500.
      if (error.statusCode) {
        return reply.code(error.statusCode).send({ ok: false, error: error.message })
      }
      return reply.code(500).send({ ok: false, error: error.message, stack: error.stack })
```

Rename handler body (`:131-159`) — replace from `const { project_id, old_name, new_name } = request.body` through `return { ok: true, data: result.rows[0] }` with:

```js
    const { project_id, old_name, new_name } = request.body
    const db = request.db || (await import('../config/db.js')).default

    // new_name is normalised inside renameByName BEFORE the conflict check (decision 14).
    const outcome = await renameByName(db, project_id, old_name, new_name)
    if (outcome.status === 409) {
      return reply.code(409).send({ ok: false, error: `Point name "${outcome.name}" already exists in this project` })
    }
    if (outcome.status === 404) {
      // Debug: check what project_ids exist for this name
      const debugCheck = await db.query(
        `SELECT id, project_id, name FROM coordinate_points WHERE name = $1 LIMIT 5`,
        [old_name]
      )
      console.error(`[Rename] ❌ Point "${old_name}" not found in project ${project_id}. Found in projects:`, debugCheck.rows.map(r => r.project_id))
      return reply.code(404).send({ ok: false, error: `Point "${old_name}" not found in project ${project_id}` })
    }
    return { ok: true, data: outcome.row }
```

Immediately after the rename route's closing `})`, add:

```js
  // Backfill phase A1 (🔧 Repair Beacon Names): capitalise lowercase beacon suffixes in
  // ONE transaction. The server re-plans from its own rows and refuses a stale plan.
  app.post('/coordinate-points/normalize-names', {
    preHandler: [app.authenticate, authenticateWithSchema],
    schema: {
      body: {
        type: 'object',
        required: ['project_id', 'renames'],
        properties: {
          project_id: { type: 'string' },
          renames: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'from', 'to'],
              properties: {
                id: { type: ['integer', 'string'] },
                from: { type: 'string' },
                to: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { project_id, renames } = request.body
    const db = request.db || (await import('../config/db.js')).default
    const result = await applyNameNormalization(db, project_id, renames)
    if (result.stale) {
      return reply.code(409).send({
        ok: false,
        error: 'Beacon names changed since the repair was planned — nothing was renamed. Run 🔧 Repair Beacon Names again.'
      })
    }
    return { ok: true, data: { renamed: result.renamed } }
  })
```

In `app-backend/src/routes/csvImports.js`, add after the imports (`:6-8`):

```js
import { normalizeMergeNames, BeaconNameCaseError } from '../utils/beaconNameDoors.js';
```

As the **first statements** of both the analyze-merge handler (`:240`, before its `console.log`) and the execute-merge handler (`:448`, before its `console.log`):

```js
    // Beacon names are normalised at this door (spec decision 14): analyze-merge mints
    // newId from new_points[].id (:311), execute-merge stores newId (:528-535) and
    // newPt.id (:596-602). A case-fold pair in the file is a 400 (decision 15).
    try {
      if (request.body) Object.assign(request.body, normalizeMergeNames(request.body));
    } catch (error) {
      if (error instanceof BeaconNameCaseError) {
        return reply.code(400).send({ error: error.message });
      }
      throw error;
    }
```

Normalising `request.body` before the handlers destructure it means every later use (`:291`, `:373`, `:422`, `:523`, `:548`, `:659-660`) sees normalised names with no further edits.

- [ ] **Step 7: Verify**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js beaconNameDoors beaconName-shared`
Expected: PASS.

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js`
Expected: baseline + new tests, no new failures.

Syntax-check the three edited files, which no test imports:

```bash
cd app-backend && node --check src/models/coordinatePoint.js && node --check src/routes/coordinatePoints.js && node --check src/routes/csvImports.js
```

Expected: no output.

**Manual API check (backend running, logged in; use the browser devtools console on `http://localhost:5173` so the auth header is attached by the app's axios instance, or curl with a token):**

1. `PATCH /coordinate-points/rename` `{ project_id, old_name: <an existing point>, new_name: '<prefix>b' }` → 200, `data.name` is `<prefix>B`. Rename it back.
2. `POST /coordinate-points/normalize-names` `{ project_id, renames: [{ id: 999999, from: 'x1a', to: 'x1A' }] }` → **409** "plan changed" and no row renamed.
3. `POST /coordinate-points/batch` with `points: [{ name: '99a', y: 1, x: 1 }, { name: '99A', y: 1, x: 1 }]` on a throwaway project → **400** naming `"99a" / "99A"`.

- [ ] **Step 8: Commit**

```bash
git add app-backend/src/utils/beaconNameDoors.js app-backend/src/utils/__tests__/beaconNameDoors.test.js app-backend/src/models/coordinatePoint.js app-backend/src/routes/coordinatePoints.js app-backend/src/routes/csvImports.js
git commit -m "feat(beacon-names): normalise beacon names at every backend write door"
```

---
