/**
 * Work done AS a person, with the database deciding what they may see and change.
 *
 *   await withRequest({ userId, platform }, async (client) => client.query('SELECT ...'))
 *
 * Opens a transaction, steps down to the role surveypro_request (which owns nothing and bypasses no row-level security) and sets who
 * is asking for the length of that transaction only (SET LOCAL / set_config(..., true)). Everything resets itself on COMMIT or
 * ROLLBACK, so a pooled connection can never carry one person's identity, or one tenant's search_path, into the next request: the
 * leak recorded in CLAUDE.md ("Known gaps") cannot happen here.
 *
 * Use it for anything that reads or writes survey.* on a person's behalf. Server-side checks that are not on anyone's behalf (the
 * launch route confirming an appointment, bookkeeping) use the plain pool.
 */
import pool from './db.js'

export async function withRequest({ userId, platform = false }, fn) {
  if (!Number.isInteger(userId)) throw new Error('withRequest needs the signed-in user id')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL ROLE surveypro_request')
    await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.platform', $2, true)", [String(userId), platform ? 'true' : ''])
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Is this the database refusing on tenancy grounds (a policy or a missing privilege)? */
export const isRefusal = (err) => err && (err.code === '42501' || /row-level security|permission denied/.test(err.message || ''))
