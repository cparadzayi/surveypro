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
  return `${String(rename?.id)}\u0001${rename?.from}\u0001${rename?.to}`
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