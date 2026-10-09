/**
 * What stands between this SurveyPro database and the shared store: a READ-ONLY report. It changes nothing.
 *
 *   node scripts/cutover-preflight.js            (uses DATABASE_URL from app-backend/.env or the environment)
 *
 * Reports
 *   - which migrations (096 onward) have not been applied yet, and whether the two group roles an administrator must create exist
 *   - every per-surveyor schema: whose it is, what it holds, which council its launched projects name, and anything that would not move
 *   - strays: surveyor_* schemas with no surveyor profile (these are NOT moved: somebody has to say what they are)
 *   - the survey classes declared and the parcels ready to deliver, so nobody is surprised by what delivery will ask
 *
 * Exit code 0 when nothing blocks the cut-over, 1 when something does. Prints no credentials.
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(here, '..', 'migrations')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
let blockers = 0
const block = (m) => { blockers++; console.log('  BLOCKER  ' + m) }
const note = (m) => console.log('  note     ' + m)
const q = async (sql, p) => (await pool.query(sql, p)).rows

try {
  const u = new URL(process.env.DATABASE_URL)
  console.log(`Database ${u.pathname.slice(1)} on ${u.hostname}, as ${decodeURIComponent(u.username)}\n`)

  console.log('1. Migrations')
  const wanted = fs.readdirSync(migrationsDir).filter((f) => /^\d{3}_.*\.do\.sql$/.test(f) && Number(f.slice(0, 3)) >= 96).sort()
  const applied = new Set((await q('SELECT migration_name FROM public.migrations_history')).map((r) => r.migration_name))
  const pending = wanted.filter((f) => !applied.has(f))
  console.log(`  ${wanted.length - pending.length} of ${wanted.length} migrations from 096 onward are applied`)
  if (pending.length) { for (const f of pending) note(`pending: ${f}`) ; note('they are applied by npm run migrate, after the roles below exist') }

  console.log('\n2. Roles an administrator creates once (the application login cannot)')
  const roles = new Set((await q("SELECT rolname FROM pg_roles WHERE rolname IN ('surveypro_request', 'survey_reader')")).map((r) => r.rolname))
  for (const r of ['surveypro_request', 'survey_reader']) {
    if (!roles.has(r)) block(`role ${r} does not exist: as an administrator, CREATE ROLE ${r} NOLOGIN${r === 'surveypro_request' ? '; GRANT surveypro_request TO <the application login>' : ''};`)
  }
  if (roles.has('surveypro_request')) {
    const can = (await q("SELECT pg_has_role(current_user, 'surveypro_request', 'member') AS ok"))[0].ok
    if (!can) block('the application login is not a member of surveypro_request: GRANT surveypro_request TO <the application login>;')
  }
  if (roles.size === 2) console.log('  both roles exist')

  console.log('\n3. Per-surveyor schemas')
  const haveAuthority = (await q("SELECT to_regclass('survey.authority') AS r"))[0].r !== null
  const councils = haveAuthority ? new Set((await q('SELECT code FROM survey.authority')).map((r) => r.code)) : new Set()
  const profiles = await q('SELECT sp.id, sp.user_id, sp.name, sp.schema_name FROM public.surveyor_profiles sp ORDER BY sp.id')
  let totalProjects = 0
  for (const p of profiles) {
    if (!p.schema_name) { note(`${p.name}: surveyor profile with no schema; nothing to move`); continue }
    if (!/^surveyor_[a-z0-9_]+$/.test(p.schema_name)) { block(`${p.name}: schema name "${p.schema_name}" is not a per-surveyor schema`); continue }
    const exists = (await q('SELECT 1 FROM pg_namespace WHERE nspname = $1', [p.schema_name])).length > 0
    if (!exists) { block(`${p.name}: profile names schema ${p.schema_name} but it does not exist`); continue }
    const s = p.schema_name
    const missing = []
    for (const t of ['survey_projects', 'coordinate_points', 'land_parcels']) if (!(await q('SELECT to_regclass($1) AS r', [`${s}.${t}`]))[0].r) missing.push(t)
    if (missing.length) { block(`${s} (${p.name}): the schema is incomplete, missing ${missing.join(', ')}; it cannot be moved. Fix or retire it, or end the surveyor profile's link to it`); continue }
    const c = (await q(`SELECT (SELECT count(*) FROM ${s}.survey_projects) AS projects, (SELECT count(*) FROM ${s}.coordinate_points) AS points,
                               (SELECT count(*) FROM ${s}.land_parcels) AS parcels,
                               (SELECT count(*) FROM ${s}.land_parcels WHERE status IN ('finalized', 'approved') AND COALESCE(parcel_status, 'active') = 'active') AS finalized`))[0]
    totalProjects += Number(c.projects)
    console.log(`  ${s} (user ${p.user_id}): ${c.projects} project(s), ${c.points} point(s), ${c.parcels} parcel(s), ${c.finalized} finalized`)
    const hasMeta = (await q("SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'survey_projects' AND column_name = 'metadata'", [s])).length > 0
    if (hasMeta && Number(c.projects)) {
      const launched = await q(`SELECT metadata ->> 'authority_code' AS code, metadata ->> 'engagement' AS engagement, count(*)::int AS n,
                                       count(*) FILTER (WHERE NULLIF(metadata ->> 'survey_class', '') IS NOT NULL)::int AS with_class
                                  FROM ${s}.survey_projects WHERE metadata ? 'authority_code' GROUP BY 1, 2`)
      for (const l of launched) {
        console.log(`    ${l.n} project(s) opened from ${l.code}'s jobs (${l.engagement || 'engagement not recorded'}), ${l.with_class} with a class declared`)
        if (haveAuthority && !councils.has(l.code)) block(`${s}: projects name council ${l.code}, which is not in survey.authority yet`)
        if (!l.engagement) note(`${s}: ${l.code} projects record no engagement; the move will use the schema's --map engagement or leave the project private`)
      }
    }
    const dangling = (await q(`SELECT count(*)::int AS n FROM ${s}.coordinate_points cp WHERE NOT EXISTS (SELECT 1 FROM ${s}.survey_projects sp WHERE sp.id = cp.project_id)`))[0].n
    if (dangling) block(`${s}: ${dangling} point(s) belong to a project that is not in the schema; they would be skipped`)
  }
  console.log(`  ${totalProjects} project(s) in all`)

  console.log('\n4. Schemas with no surveyor profile (not moved)')
  const known = new Set(profiles.map((p) => p.schema_name))
  const all = (await q("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'surveyor\\_%' ORDER BY 1")).map((r) => r.nspname)
  const strays = all.filter((s) => !known.has(s))
  if (!strays.length) console.log('  none')
  for (const s of strays) {
    const t = (await q('SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1', [s]))[0].n
    const has = (await q("SELECT to_regclass($1 || '.survey_projects') AS r", [s]))[0].r !== null
    note(`${s}: ${t} table(s)${has ? '' : ', no survey_projects (looks like a leftover test schema)'}; decide whether to keep or drop it`)
  }

  console.log('\n5. Anything already in the shared tables')
  if (!(await q("SELECT to_regclass('survey.survey_projects') AS r"))[0].r) console.log('  the shared tables do not exist yet (migration 097)')
  else console.log(`  ${(await q('SELECT count(*)::int AS n FROM survey.survey_projects'))[0].n} project(s) already there`)

  console.log(blockers ? `\n${blockers} blocker(s). Fix them, then run this again.` : '\nNothing blocks the cut-over.')
  process.exitCode = blockers ? 1 : 0
} finally {
  await pool.end()
}
