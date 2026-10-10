/**
 * Create (or rotate the password of) the NON-OWNER login the server runs as, and write its connection string to a file.
 *
 *   node scripts/create-runtime-login.js                  dry run: says what it would do
 *   node scripts/create-runtime-login.js --apply          create the login `surveypro_runtime`, give it its rights, write APP_DATABASE_URL to .env.runtime
 *   node scripts/create-runtime-login.js --apply --rotate give an existing login a new password
 *
 * Two connections, because two different powers are needed:
 *   ADMIN_DATABASE_URL   a Postgres administrator (may CREATE ROLE): creates the login and lets it step down to surveypro_request
 *   DATABASE_URL         the OWNER of the tables (surveypro_app): issues the grants, so default privileges follow the objects the owner creates
 * The password is generated here, written only to .env.runtime (git-ignored, mode 600 where the OS supports it), and never printed. Start the
 * server with `node --env-file=.env.runtime src/server.js` (or put APP_DATABASE_URL in the host's environment): the server connects as the runtime
 * login and DATABASE_URL stays for migrations and operator scripts. What the login may and may not do is migration 104;
 * scripts/verify-runtime-login.js proves it. docs/RUNTIME_LOGIN.md.
 *
 * The login is created NOINHERIT: it may step down to surveypro_request (where row-level security applies) but does NOT inherit that role's
 * rights, so it has no privilege of its own on the tenant tables.
 */
import 'dotenv/config'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url))
const LOGIN = process.env.RUNTIME_ROLE || 'surveypro_runtime'
const OUT = path.join(here, '..', '.env.runtime')
if (!/^[a-z_][a-z0-9_]*$/.test(LOGIN)) { console.error('RUNTIME_ROLE must be a plain lower-case identifier'); process.exit(2) }
const args = new Set(process.argv.slice(2))
const apply = args.has('--apply'); const rotate = args.has('--rotate')

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL (the owner of the tables) is required'); process.exit(2) }
if (apply && !process.env.ADMIN_DATABASE_URL) { console.error('ADMIN_DATABASE_URL (a Postgres administrator, who may CREATE ROLE) is required with --apply'); process.exit(2) }

const urlFor = (user, password) => { const u = new URL(process.env.DATABASE_URL); u.username = user; u.password = password; return u.toString() }
const owner = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
const admin = apply ? new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL, max: 1 }) : null
try {
  const db = (await owner.query('SELECT current_database() AS db, current_user AS u')).rows[0]
  const exists = (await owner.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [LOGIN])).rowCount > 0
  const hasGrant = (await owner.query("SELECT to_regprocedure('survey.grant_runtime(name)') AS f")).rows[0].f
  console.log(`database ${db.db}, owner login ${db.u}; runtime login ${LOGIN} ${exists ? 'exists' : 'does not exist'}`)
  if (!hasGrant) { console.error('Migration 104 has not been applied (survey.grant_runtime does not exist). Run npm run migrate first.'); process.exit(1) }
  if (!apply) {
    console.log(`\nDry run. With --apply it would${exists ? '' : ` create ${LOGIN} (NOSUPERUSER NOBYPASSRLS NOINHERIT, no ownership)`}${rotate ? ' and set a new password' : ''}, let it step down to surveypro_request,`)
    console.log('grant it its rights (survey.grant_runtime) and write APP_DATABASE_URL to .env.runtime.')
    process.exit(0)
  }
  let password = null
  if (!exists || rotate) {
    password = crypto.randomBytes(24).toString('base64url')
    const lit = (await admin.query('SELECT quote_literal($1) AS l', [password])).rows[0].l
    if (!exists) await admin.query(`CREATE ROLE ${LOGIN} LOGIN PASSWORD ${lit} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`)
    else await admin.query(`ALTER ROLE ${LOGIN} PASSWORD ${lit}`)
  }
  const me = (await admin.query('SELECT rolsuper, rolbypassrls, rolinherit FROM pg_roles WHERE rolname = $1', [LOGIN])).rows[0]
  if (me.rolsuper || me.rolbypassrls) throw new Error(`${LOGIN} is a superuser or bypasses row-level security; refusing to use it as the runtime login`)
  if (me.rolinherit) await admin.query(`ALTER ROLE ${LOGIN} NOINHERIT`)         // an existing login made by hand: it must not inherit the request role's rights
  await admin.query(`GRANT surveypro_request TO ${LOGIN}`)
  await admin.query(`GRANT CONNECT ON DATABASE ${db.db} TO ${LOGIN}`)
  await owner.query('SELECT survey.grant_runtime($1)', [LOGIN])
  console.log(`${LOGIN} is ready: it may step down to surveypro_request and has no rights of its own on the tenant tables.`)
  if (password) {
    fs.writeFileSync(OUT, `APP_DATABASE_URL=${urlFor(LOGIN, password)}\n`, { mode: 0o600 })
    console.log(`Wrote ${OUT} (git-ignored; the password is not shown). Start the server with  node --env-file=.env.runtime src/server.js`)
  } else {
    console.log('The login already existed and its password was left alone (use --rotate to change it); .env.runtime was not touched.')
  }
} finally {
  await owner.end(); if (admin) await admin.end()
}
