/**
 * Rehearse the cut-over on a COPY of the real database. The real database is only ever read (pg_dump); everything else happens in a
 * throw-away database that is dropped at the end, and the dump file is deleted.
 *
 *   SURVEYPRO_SOURCE_ENV=<env file with the real DATABASE_URL> REHEARSAL_ADMIN_URL=<a Postgres administrator's URL> \
 *   node scripts/cutover-rehearsal.js [--map surveyor_x=CODE:employed ...] [--skip surveyor_y ...]
 *
 * It does exactly what the real cut-over does, in the same order, as the same logins:
 *   1. dumps the source (as the administrator, read-only), restores it with its owners, creates the two group roles as an administrator
 *   2. applies the pending migrations (096 onward) as the application login, then the cut-over (dry run, then --apply with the same --map)
 *   3. checks: no tenancy violations; every schema's counts equal what moved; each person, speaking through the request role, sees exactly
 *      their own work and nobody else's; a second run copies nothing
 *   4. makes the NON-OWNER runtime login the way the real procedure does, proves what it can and cannot do (verify-runtime-login.js)
 *   5. boots a real SurveyPro server AS THAT LOGIN, in shared mode and then in schema mode (the way back), signs a token for each person and reads
 *      their projects and points back through the HTTP API, which is what they will do on the day
 * Then it drops the copy and any role it had to create. Exit code 0 only if every check passed. Prints no credentials.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url))
const backend = path.join(here, '..')
const COPY = 'surveypro_rehearsal'
const PORT = 3071
const die = (m) => { console.error(m); process.exit(2) }

const srcEnv = process.env.SURVEYPRO_SOURCE_ENV
if (!srcEnv || !fs.existsSync(srcEnv)) die('Set SURVEYPRO_SOURCE_ENV to the env file that holds the real SurveyPro DATABASE_URL (it is only read).')
const m = fs.readFileSync(srcEnv, 'utf8').match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m)
if (!m) die('No DATABASE_URL in SURVEYPRO_SOURCE_ENV.')
const srcUrl = new URL(m[1].replace(/^["']|["']$/g, ''))
if (!process.env.REHEARSAL_ADMIN_URL) die('Set REHEARSAL_ADMIN_URL to a Postgres administrator login on the same server (it creates and drops the copy).')
const adminUrl = new URL(process.env.REHEARSAL_ADMIN_URL)
if (adminUrl.hostname !== srcUrl.hostname || (adminUrl.port || '5432') !== (srcUrl.port || '5432')) die('The administrator login must be on the same server as the database being copied.')
const withDb = (u, d) => { const x = new URL(u); x.pathname = '/' + d; return x.toString() }
const maps = []
for (let i = 2; i < process.argv.length; i++) if (process.argv[i] === '--map' || process.argv[i] === '--skip') { maps.push(process.argv[i], process.argv[i + 1]); i++ }

function pgTool(name) {
  const exe = process.platform === 'win32' ? name + '.exe' : name
  if (process.env.PG_BIN) return path.join(process.env.PG_BIN, exe)
  if (spawnSync(name, ['--version'], { encoding: 'utf8' }).status === 0) return name
  const root = 'C:/Program Files/PostgreSQL'
  if (fs.existsSync(root)) for (const v of fs.readdirSync(root).sort((a, b) => Number(b) - Number(a))) { const p = path.join(root, v, 'bin', exe); if (fs.existsSync(p)) return p }
  die(`Cannot find ${name}; set PG_BIN.`)
}
const pgEnv = (u) => ({ ...process.env, PGPASSWORD: decodeURIComponent(u.password) })
const pgArgs = (u, db) => ['-h', u.hostname, '-p', u.port || '5432', '-U', decodeURIComponent(u.username), '-d', db]

let bad = 0
const ok = (c, msg) => { console.log((c ? '  ok   ' : '  FAIL ') + msg); if (!c) bad++ }
const dumpFile = path.join(os.tmpdir(), 'surveypro-rehearsal.dump')
const createdRoles = []
const admin = new pg.Pool({ connectionString: withDb(adminUrl, 'postgres'), max: 1 })
let child

async function cleanup() {
  try { child && child.kill() } catch {}
  try { fs.unlinkSync(dumpFile) } catch {}
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${COPY} WITH (FORCE)`)
    for (const r of createdRoles) await admin.query(`DROP ROLE IF EXISTS ${r}`).catch(() => {})
  } finally { await admin.end() }
}

async function main() {
  console.log('1. Copy the real database (read-only) into a throw-away one')
  const srcDb = srcUrl.pathname.slice(1)
  let r = spawnSync(pgTool('pg_dump'), [...pgArgs(adminUrl, srcDb), '-Fc', '-f', dumpFile], { env: pgEnv(adminUrl), encoding: 'utf8' })   // as the administrator: the application login cannot read the extensions' own tables
  if (r.status !== 0) die('pg_dump failed: ' + String(r.stderr).split('\n')[0])
  await admin.query(`DROP DATABASE IF EXISTS ${COPY} WITH (FORCE)`)
  await admin.query(`CREATE DATABASE ${COPY}`)
  const copyAdmin = new pg.Pool({ connectionString: withDb(adminUrl, COPY), max: 1 })
  await copyAdmin.query('CREATE EXTENSION IF NOT EXISTS postgis')
  r = spawnSync(pgTool('pg_restore'), [...pgArgs(adminUrl, COPY), '--no-privileges', '--exit-on-error', dumpFile], { env: pgEnv(adminUrl), encoding: 'utf8' })
  // extensions already created above produce harmless "already exists" noise; anything else is a real failure
  const real = String(r.stderr).split('\n').filter((l) => /error/i.test(l) && !/already exists|extension/i.test(l))
  if (real.length) { await copyAdmin.end(); die('restore failed: ' + real[0]) }
  fs.unlinkSync(dumpFile)
  console.log('  copied')

  const login = decodeURIComponent(srcUrl.username)
  for (const role of ['surveypro_request', 'survey_reader']) {
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rows.length) { await admin.query(`CREATE ROLE ${role} NOLOGIN`); createdRoles.push(role) }
  }
  await admin.query(`GRANT surveypro_request TO ${login}`)
  await admin.query(`GRANT CONNECT, CREATE ON DATABASE ${COPY} TO ${login}`)   // as on the real database: the application login may create schemas, nothing more
  console.log('  group roles created by the administrator, request role granted to the application login')

  console.log('\n2. Apply the pending migrations as the application login')
  const copyUrl = withDb(srcUrl, COPY)
  const app = new pg.Pool({ connectionString: copyUrl, max: 2 })
  const done = new Set((await app.query('SELECT migration_name FROM public.migrations_history')).rows.map((x) => x.migration_name))
  const files = fs.readdirSync(path.join(backend, 'migrations')).filter((f) => /^\d{3}_.*\.do\.sql$/.test(f) && Number(f.slice(0, 3)) >= 96 && !done.has(f)).sort()
  for (const f of files) {
    try { await app.query(fs.readFileSync(path.join(backend, 'migrations', f), 'utf8')); console.log('  applied ' + f) }
    catch (e) { ok(false, `${f} failed on the real data: ${e.message}`); return }
  }
  const viol = (await app.query('SELECT relation, rule FROM tenancy.violations')).rows
  ok(!viol.length, `the tenancy contract finds no departure${viol.length ? ': ' + viol.map((v) => v.rule + ' ' + v.relation).join(', ') : ''}`)

  console.log('\n3. The cut-over, as the real one will run')
  const cut = (...a) => spawnSync('node', [path.join(here, 'cutover-to-shared.js'), ...a], { cwd: backend, env: { ...process.env, DATABASE_URL: copyUrl }, encoding: 'utf8' })
  const dry = cut(...maps)
  console.log(dry.stdout.split('\n').map((l) => '  | ' + l).join('\n').trimEnd())
  const before = {}
  const profiles = (await app.query('SELECT user_id, schema_name FROM public.surveyor_profiles WHERE schema_name IS NOT NULL ORDER BY id')).rows
  for (const p of profiles) {
    const have = (await app.query('SELECT to_regclass($1) a, to_regclass($2) b, to_regclass($3) c', [`${p.schema_name}.survey_projects`, `${p.schema_name}.coordinate_points`, `${p.schema_name}.land_parcels`])).rows[0]
    if (!have.a || !have.b || !have.c) continue
    before[p.user_id] = (await app.query(`SELECT (SELECT count(*)::int FROM ${p.schema_name}.survey_projects) AS projects, (SELECT count(*)::int FROM ${p.schema_name}.coordinate_points) AS points, (SELECT count(*)::int FROM ${p.schema_name}.land_parcels) AS parcels`)).rows[0]
  }
  const run = cut('--apply', ...maps)
  console.log(run.stdout.split('\n').map((l) => '  | ' + l).join('\n').trimEnd())
  ok(run.status === 0, 'the cut-over ran and verified its own counts')
  const again = cut('--apply', '--again', ...maps)
  const total = async () => (await app.query('SELECT (SELECT count(*)::int FROM survey.survey_projects) p, (SELECT count(*)::int FROM survey.coordinate_points) c, (SELECT count(*)::int FROM survey.land_parcels) l')).rows[0]
  const t1 = await total(); cut('--apply', '--again', ...maps); const t2 = await total()
  ok(t1.p === t2.p && t1.c === t2.c && t1.l === t2.l, 'running it again copies nothing twice')

  console.log('\n4. Each person, through the request role, sees their own work and only that')
  for (const [uid, b] of Object.entries(before)) {
    const c = await app.connect()
    try {
      await c.query('BEGIN'); await c.query('SET LOCAL ROLE surveypro_request')
      await c.query("SELECT set_config('app.user_id', $1, true), set_config('app.platform', '', true)", [uid])
      const seen = (await c.query('SELECT (SELECT count(*)::int FROM survey.survey_projects) AS projects, (SELECT count(*)::int FROM survey.coordinate_points) AS points, (SELECT count(*)::int FROM survey.land_parcels) AS parcels')).rows[0]
      ok(seen.projects === b.projects && seen.points === b.points && seen.parcels === b.parcels, `user ${uid} sees ${seen.projects} project(s), ${seen.points} point(s), ${seen.parcels} parcel(s); their schema held ${b.projects}, ${b.points}, ${b.parcels}`)
    } finally { await c.query('ROLLBACK'); c.release() }
  }
  const c0 = await app.connect()
  try {
    await c0.query('BEGIN'); await c0.query('SET LOCAL ROLE surveypro_request'); await c0.query("SELECT set_config('app.user_id', '999999', true)")
    ok((await c0.query('SELECT count(*)::int AS n FROM survey.survey_projects')).rows[0].n === 0, 'a stranger sees nothing')
  } finally { await c0.query('ROLLBACK'); c0.release() }

  console.log('\n5. The non-owner runtime login, made as the real procedure makes it')
  // the administrator creates the login and lets it step down to the request role; the owner issues the grants (scripts/create-runtime-login.js)
  const RT = 'surveypro_rehearsal_runtime'
  const rtPass = crypto.randomBytes(18).toString('hex')
  await admin.query(`CREATE ROLE ${RT} LOGIN PASSWORD '${rtPass}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`); createdRoles.push(RT)
  await admin.query(`GRANT surveypro_request TO ${RT}`); await admin.query(`GRANT CONNECT ON DATABASE ${COPY} TO ${RT}`)
  await app.query('SELECT survey.grant_runtime($1)', [RT])
  const rtUrl = new URL(copyUrl); rtUrl.username = RT; rtUrl.password = rtPass
  const verify = spawnSync('node', [path.join(here, 'verify-runtime-login.js')], { cwd: backend, encoding: 'utf8',
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, APP_DATABASE_URL: rtUrl.toString(), DATABASE_URL: copyUrl } })
  console.log(verify.stdout.split('\n').map((l) => '  | ' + l).join('\n').trimEnd())
  ok(verify.status === 0, 'the runtime login can do what the server needs and nothing more')

  // the same real server, as that login, in the new mode (shared) and in the way back (schema)
  const secret = crypto.randomBytes(24).toString('hex')
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const token = (u) => { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ sub: u.id, email: u.email, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 }); return `${h}.${p}.${crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}` }
  const serve = async (store, port) => {
    console.log(`\n6. A real SurveyPro server on the copy, as the runtime login, in ${store} mode, read through its API`)
    child = spawn('node', ['src/server.js'], { cwd: backend, stdio: 'ignore', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, PORT: String(port), HOST: '127.0.0.1',
      DATABASE_URL: copyUrl, APP_DATABASE_URL: rtUrl.toString(), DB_NAME: COPY, JWT_SECRET: secret, SURVEY_STORE: store } })
    let up = false
    for (let k = 0; k < 70 && !up; k++) { await new Promise((r2) => setTimeout(r2, 1500)); try { up = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok } catch {} }
    ok(up, `the server starts on the ${store} store`)
    if (up) {
      for (const [uid, b] of Object.entries(before)) {
        const u = (await app.query('SELECT id, email FROM public.users WHERE id = $1', [uid])).rows[0]
        if (!u) continue
        const H = { headers: { Authorization: 'Bearer ' + token(u) } }
        const res = await fetch(`http://127.0.0.1:${port}/api/survey-projects`, H)
        const body = res.ok ? await res.json() : {}
        ok(res.ok && (body.projects || []).length === b.projects, `user ${uid}: the API lists ${(body.projects || []).length} project(s) (expected ${b.projects})`)
        if (b.points && body.projects?.length) {
          let pts = 0
          for (const pr of body.projects) pts += ((await (await fetch(`http://127.0.0.1:${port}/api/coordinate-points?project_id=${pr.id}`, H)).json()).data || []).length
          ok(pts === b.points, `user ${uid}: the API returns ${pts} point(s) across them (expected ${b.points})`)
        }
      }
    }
    try { child.kill() } catch {}
    child = null
    await new Promise((r2) => setTimeout(r2, 1500))
  }
  await serve('shared', PORT)
  await serve('schema', PORT + 1)
  await app.end(); await copyAdmin.end()
}

try { await main() } catch (e) { console.error('ERR', e.message); bad++ } finally { await cleanup() }
console.log(bad ? `\nREHEARSAL FAILED: ${bad} check(s). Nothing was changed in the real database.` : '\nREHEARSAL PASSED. Nothing was changed in the real database; the copy has been dropped.')
process.exit(bad ? 1 : 0)
