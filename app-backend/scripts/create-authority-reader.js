#!/usr/bin/env node
/**
 * Give a local authority a database login that reads ITS survey data and nothing else (QGIS, a spreadsheet, VunGIS).
 *
 *   node scripts/create-authority-reader.js --list
 *   node scripts/create-authority-reader.js --authority VUNGU                     dry run: says what it would do
 *   node scripts/create-authority-reader.js --authority VUNGU --apply             create the login
 *   node scripts/create-authority-reader.js --authority VUNGU --apply --rotate    give an existing login a new password
 *   node scripts/create-authority-reader.js --authority VUNGU --drop              remove the login
 *
 * Run it with DATABASE_URL set to an ADMINISTRATOR (a role that may CREATE ROLE), not the application login. The login is called
 * sp_reader_<code>, belongs to the group survey_reader (which may select from survey_share.* and nothing else), and is tied to the
 * authority in tenancy.role_authority. The database answers who it is from that mapping, so it cannot widen its own view by setting
 * app.user_id or app.platform. The password is generated here, written to .reader-<code>.env (git-ignored) and never printed.
 *
 * In QGIS: a PostgreSQL connection to this database with that login; the layers are survey_share.points, parcels, beacons, projects.
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null)

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL (an administrator) is required'); process.exit(2) }
const pool = new pg.Pool({ connectionString: url, max: 1 })
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'"
const roleFor = (code) => 'sp_reader_' + String(code).toLowerCase().replace(/[^a-z0-9]/g, '_')

async function main() {
  const q = async (sql, a) => (await pool.query(sql, a)).rows
  if (flag('--list')) {
    const rows = await q(`SELECT ra.role_name, a.code, a.name FROM tenancy.role_authority ra JOIN survey.authority a ON a.id = ra.authority_id ORDER BY a.code`)
    if (!rows.length) console.log('no authority has a reader login yet')
    for (const r of rows) console.log(`${r.role_name.padEnd(28)} ${r.code.padEnd(10)} ${r.name}`)
    return
  }
  const code = opt('--authority')
  if (!code) { console.error('Usage: --list | --authority CODE [--apply [--rotate]] | --authority CODE --drop'); process.exit(2) }
  const auth = (await q('SELECT id, code, name FROM survey.authority WHERE code = $1', [code]))[0]
  if (!auth) { console.error(`no authority with code ${code} in survey.authority`); process.exit(1) }
  if (!(await q("SELECT 1 FROM pg_roles WHERE rolname = 'survey_reader'")).length) { console.error('the group survey_reader is missing: run migration 099 and create it (docs/AUTHORITY_TENANCY.md)'); process.exit(1) }
  const role = roleFor(auth.code)
  const exists = (await q('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).length > 0
  const out = path.join(here, '..', `.reader-${auth.code.toLowerCase()}.env`)

  if (flag('--drop')) {
    await pool.query('DELETE FROM tenancy.role_authority WHERE role_name = $1', [role])
    if (exists) { await pool.query(`REVOKE survey_reader FROM ${role}`); await pool.query(`DROP ROLE ${role}`) }
    if (fs.existsSync(out)) fs.unlinkSync(out)
    console.log(`removed ${role}`)
    return
  }
  console.log(`${auth.code} (${auth.name}): login ${role} ${exists ? 'exists' : 'does not exist'}`)
  if (!flag('--apply')) { console.log(`dry run. With --apply this would ${exists ? (flag('--rotate') ? 'give it a new password' : 'leave it alone (--rotate for a new password)') : 'create it'}.`); return }
  if (exists && !flag('--rotate')) { console.log('nothing to do'); return }
  const password = crypto.randomBytes(24).toString('base64url')
  if (!exists) {
    await pool.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${lit(password)} IN ROLE survey_reader`)
    await pool.query('INSERT INTO tenancy.role_authority (role_name, authority_id) VALUES ($1, $2) ON CONFLICT (role_name) DO UPDATE SET authority_id = EXCLUDED.authority_id', [role, auth.id])
  } else {
    await pool.query(`ALTER ROLE ${role} PASSWORD ${lit(password)}`)
  }
  const u = new URL(url)
  fs.writeFileSync(out, `# written by scripts/create-authority-reader.js; secret, never commit\nPGHOST=${u.hostname}\nPGPORT=${u.port || 5432}\nPGDATABASE=${u.pathname.slice(1)}\nPGUSER=${role}\nPGPASSWORD=${password}\n`, { mode: 0o600 })
  console.log(`${exists ? 'rotated' : 'created'} ${role}; connection details written to ${path.basename(out)} (password not printed).`)
}

main().catch((e) => { console.error(e.message); process.exitCode = 1 }).finally(() => pool.end())
