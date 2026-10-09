/**
 * The database handle a request gets when SURVEY_STORE=shared.
 *
 * It has the same two methods the per-surveyor handle (getSurveyorPool in db.js) has, query() and connect(), so the models and routes that
 * take `request.db` run unchanged. The difference is WHERE they run: not in the surveyor's own schema, but on the shared tables (survey.*),
 * as the signed-in person. Every statement is inside a transaction that
 *
 *   SET LOCAL ROLE surveypro_request       a role that owns nothing and bypasses no row-level security
 *   set_config('app.user_id' / 'app.platform', ..., true)       who is asking
 *   set_config('search_path', 'survey, public', true)           so the unqualified table names the code uses mean the shared ones
 *
 * all LOCAL to the transaction. Nothing outlives COMMIT or ROLLBACK, so a pooled connection cannot carry one person's identity or one
 * tenant's rows into the next request (the leak noted in CLAUDE.md, "Known gaps", cannot happen here, including for connect()).
 *
 * connect() hands out a client for multi-statement work. Callers there open their own transaction with BEGIN; that BEGIN is what steps
 * down to the request role. A statement issued outside any BEGIN is wrapped in a transaction of its own. release() rolls back anything
 * left open, so a caller that forgets cannot leak either.
 */
import pool from './db.js'

export const surveyStore = () => (process.env.SURVEY_STORE === 'shared' ? 'shared' : 'schema')

const asRequest = async (client, { userId, platform }) => {
  await client.query('SET LOCAL ROLE surveypro_request')
  await client.query(
    "SELECT set_config('app.user_id', $1, true), set_config('app.platform', $2, true), set_config('search_path', 'survey, public', true)",
    [String(userId), platform ? 'true' : ''])
}

const verb = (sql) => (typeof sql === 'string' ? sql.trim().replace(/;$/, '').toUpperCase() : '')

export function sharedDb({ userId, platform = false }) {
  if (!Number.isInteger(userId)) throw new Error('sharedDb needs the signed-in user id')
  const who = { userId, platform }
  return {
    shared: true,

    async query(sql, params) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        try {
          await asRequest(client, who)
          const result = await client.query(sql, params)
          await client.query('COMMIT')
          return result
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {})
          throw err
        }
      } finally {
        client.release()
      }
    },

    async connect() {
      const raw = await pool.connect()
      let open = false
      return {
        async query(sql, params) {
          const v = verb(sql)
          if (v === 'BEGIN' || v === 'START TRANSACTION') {
            const r = await raw.query('BEGIN')
            open = true
            try { await asRequest(raw, who) } catch (err) { open = false; await raw.query('ROLLBACK').catch(() => {}); throw err }
            return r
          }
          if (v === 'COMMIT' || v === 'ROLLBACK' || v === 'END') {
            open = false
            return raw.query(sql)
          }
          if (open) return raw.query(sql, params)
          // outside a transaction: one of its own
          await raw.query('BEGIN')
          try {
            await asRequest(raw, who)
            const result = await raw.query(sql, params)
            await raw.query('COMMIT')
            return result
          } catch (err) {
            await raw.query('ROLLBACK').catch(() => {})
            throw err
          }
        },
        release() {
          if (open) {
            open = false
            raw.query('ROLLBACK').catch(() => {}).finally(() => raw.release())
          } else {
            raw.release()
          }
        },
      }
    },
  }
}
