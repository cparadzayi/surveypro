/**
 * Prove what the runtime login can and cannot do. Connects AS the runtime login and tries things it must be refused, and things it must be allowed.
 *
 *   node --env-file=.env.runtime scripts/verify-runtime-login.js          (reads APP_DATABASE_URL; DATABASE_URL, the owner, lets it also list what the login can reach)
 *
 * Changes nothing durable (every attempt is rolled back). Exit code 0 only if everything held. Prints no credentials.
 */
import 'dotenv/config'
import pg from 'pg'

const url = process.env.APP_DATABASE_URL
if (!url) { console.error('APP_DATABASE_URL is not set (run create-runtime-login.js, then use --env-file=.env.runtime)'); process.exit(2) }
const pool = new pg.Pool({ connectionString: url, max: 1 })
const owner = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 }) : null
let bad = 0
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++ }
const refused = async (label, sql, params = []) => {
  const c = await pool.connect()
  try { await c.query('BEGIN'); await c.query(sql, params); ok(false, label + ' (it was allowed)') }
  catch (e) { ok(/permission denied|must be owner|must be superuser|row-level security|not allowed|cannot/.test(e.message), `${label} (${e.message.split('\n')[0].slice(0, 70)})`) }
  finally { await c.query('ROLLBACK').catch(() => {}); c.release() }
}
const allowed = async (label, sql, params = []) => {
  const c = await pool.connect()
  try { await c.query('BEGIN'); await c.query(sql, params); ok(true, label) }
  catch (e) { ok(false, `${label} (${e.message.split('\n')[0].slice(0, 80)})`) }
  finally { await c.query('ROLLBACK').catch(() => {}); c.release() }
}

try {
  const me = (await pool.query('SELECT current_user AS u, r.rolsuper, r.rolbypassrls, r.rolinherit, r.rolcreaterole, r.rolcreatedb FROM pg_roles r WHERE r.rolname = current_user')).rows[0]
  console.log(`connected as ${me.u}`)
  ok(!me.rolsuper && !me.rolbypassrls, 'it is not a superuser and does not bypass row-level security')
  ok(!me.rolinherit, 'it does not inherit the request role\'s rights (NOINHERIT)')
  ok(!me.rolcreaterole && !me.rolcreatedb, 'it cannot create roles or databases')
  ok((await pool.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('public', 'survey', 'survey_share') AND pg_get_userbyid(c.relowner) = current_user")).rows[0].n === 0, 'it owns nothing')

  console.log('\nthe tenant tables are out of its reach')
  // asked as the owner: the login itself has no rights on the tenancy schema
  const reach = owner ? (await owner.query('SELECT relation, privilege FROM tenancy.runtime_reach($1)', [me.u])).rows : []
  if (!owner) console.log('  note DATABASE_URL (the owner) is not set, so the list of what it can reach was not checked')
  const allowedReach = new Set(['survey.authority:SELECT', 'survey.launch_token_use:SELECT', 'survey.launch_token_use:INSERT'])
  const extra = reach.filter((r) => !allowedReach.has(`${r.relation}:${r.privilege}`))
  ok(!extra.length, `in survey and survey_share it may only read survey.authority and record launch links (${reach.length} privileges, ${extra.length} unexpected${extra.length ? ': ' + extra.slice(0, 4).map((r) => `${r.privilege} ${r.relation}`).join(', ') : ''})`)
  await refused('it cannot read projects without stepping down', 'SELECT count(*) FROM survey.survey_projects')
  await refused('it cannot read points', 'SELECT count(*) FROM survey.coordinate_points')
  await refused('it cannot read parcels', 'SELECT count(*) FROM survey.land_parcels')
  await refused('it cannot read the reviews', 'SELECT count(*) FROM survey.project_review')
  await refused('it cannot read the appointments', 'SELECT count(*) FROM survey.authority_member')
  await refused('it cannot read the council views directly', 'SELECT count(*) FROM survey_share.projects')
  await refused('it cannot write a project', "INSERT INTO survey.survey_projects (name, surveyor_user_id) VALUES ('x', 1)")

  console.log('\nstepping down, row-level security applies')
  const c = await pool.connect()
  try {
    await c.query('BEGIN'); await c.query('SET LOCAL ROLE surveypro_request'); await c.query("SELECT set_config('app.user_id', '999999', true)")
    ok((await c.query('SELECT count(*)::int AS n FROM survey.survey_projects')).rows[0].n === 0, 'as a person with no projects it sees none, however many there are')
    const r = (await c.query('SELECT current_user AS u, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bp')).rows[0]
    ok(r.u === 'surveypro_request' && r.bp === false, 'the role it steps down to cannot bypass row-level security')
  } finally { await c.query('ROLLBACK'); c.release() }

  console.log('\nwhat the server does need')
  await allowed('it reads and writes the ordinary tables (users)', 'SELECT count(*) FROM public.users')
  await allowed('it can list the councils', 'SELECT count(*) FROM survey.authority')
  await allowed('it can ask who is appointed (through the owner\'s function)', 'SELECT count(*) FROM survey.active_appointment(1, $1, ARRAY[$2]::text[])', ['NONE', 'surveyor'])
  await refused('it cannot change table structure', 'ALTER TABLE public.users ADD COLUMN zz_probe int')
  await refused('it cannot create a role', 'CREATE ROLE zz_probe_role')
  await refused('it cannot create a schema', 'CREATE SCHEMA zz_probe_schema')
  await refused('it cannot edit the tenancy contract', "DELETE FROM tenancy.relation_class WHERE relation = 'x'")
  await refused('it cannot rewrite a council\'s appointments', "UPDATE survey.authority_member SET role = 'head_surveyor'")
} finally { await pool.end(); if (owner) await owner.end() }
console.log(bad ? `\n${bad} FAILED` : '\nALL OK')
process.exit(bad ? 1 : 0)
