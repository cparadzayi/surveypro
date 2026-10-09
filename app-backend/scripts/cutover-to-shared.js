/**
 * Cut SurveyPro over to the shared tables: move every surveyor's private schema into survey.* (survey.adopt_surveyor_schema), once, before
 * SURVEY_STORE=shared is switched on.
 *
 *   node scripts/cutover-to-shared.js                       dry run: what would move, for whom, and for which authority
 *   node scripts/cutover-to-shared.js --apply               move it (--again also re-copies schemas already moved, for anything new since)
 *   node scripts/cutover-to-shared.js --apply --map surveyor_kuda=VUNGU:employed --map surveyor_x=GWERU:contracted
 *   node scripts/cutover-to-shared.js --apply --skip surveyor_finalize_test     (a schema you have looked at and decided not to move)
 *
 * Nobody's work is guessed onto a council. A schema moves as PRIVATE PRACTICE (no authority) unless --map names the authority and the
 * engagement for it; a project that was opened from a council's job (POST /api/auth/launch) carries its authority and engagement in its own
 * metadata and keeps them either way. The private schemas are copied, never changed or dropped: switching back is setting
 * SURVEY_STORE=schema. Re-running copies only what is new (every row remembers where it came from).
 *
 * IDs change. A project's id in the shared tables is not its id in the private schema (survey.survey_projects.legacy_schema / legacy_id say
 * which is which). Anything outside SurveyPro that holds a SurveyPro project id (bookmarks, an open browser tab) must reopen the project.
 *
 * Uses DATABASE_URL (the owner login). Prints no credentials.
 */
import 'dotenv/config'
import pg from 'pg'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const again = args.includes('--again')     // also schemas already moved once: copies only what is new since
const maps = {}
const skips = new Set()      // schemas the operator has looked at and decided not to move (--skip surveyor_x)
for (let i = 0; i < args.length; i++) if (args[i] === '--skip' && /^surveyor_[a-z0-9_]+$/.test(args[i + 1] || '')) skips.add(args[i + 1])
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--map') continue
  const [schema, rest = ''] = String(args[i + 1] || '').split('=')
  const [code, engagement] = rest.split(':')
  if (!/^surveyor_[a-z0-9_]+$/.test(schema) || !code || !['employed', 'contracted'].includes(engagement)) {
    console.error('--map takes surveyor_schema=AUTHORITY:employed|contracted'); process.exit(2)
  }
  maps[schema] = { code, engagement }
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
try {
  const { rows: todo } = await pool.query(`SELECT schema_name, user_id FROM survey.unadopted_schemas ${again ? '' : 'WHERE NOT adopted'} ORDER BY schema_name`)
  if (!todo.length) { console.log('Nothing to move: every per-surveyor schema is already in the shared tables.'); process.exit(0) }
  console.log(`${todo.length} per-surveyor schema(s) to move${apply ? '' : ' (dry run: nothing changes; add --apply)'}:\n`)
  let problems = 0
  for (const t of todo) {
    const schema = t.schema_name
    if (skips.has(schema)) { console.log(`  ${schema}: skipped (--skip)`); continue }
    const absent = []
    for (const tbl of ['survey_projects', 'coordinate_points', 'land_parcels']) if (!(await pool.query('SELECT to_regclass($1) AS r', [`${schema}.${tbl}`])).rows[0].r) absent.push(tbl)
    if (absent.length) { console.log(`  ${schema}: INCOMPLETE (missing ${absent.join(', ')}); not moved. Repair or retire it, or pass --skip ${schema} once you have decided`); problems++; continue }
    const owner = t.user_id ? { user_id: t.user_id } : null
    const m = maps[schema]
    const authority = m ? (await pool.query('SELECT id FROM survey.authority WHERE code = $1', [m.code])).rows[0] : null
    const counts = (await pool.query(`SELECT (SELECT count(*) FROM ${schema}.survey_projects) AS projects, (SELECT count(*) FROM ${schema}.coordinate_points) AS points, (SELECT count(*) FROM ${schema}.land_parcels) AS parcels`)).rows[0]
    const where = m ? (authority ? `${m.code} (${m.engagement})` : `UNKNOWN AUTHORITY ${m.code}`) : 'private practice (launched projects keep their own authority)'
    console.log(`  ${schema}: ${counts.projects} project(s), ${counts.points} point(s), ${counts.parcels} parcel(s) -> ${owner ? `user ${owner.user_id}` : 'NO SURVEYOR PROFILE'}, ${where}`)
    if (!owner || (m && !authority)) { problems++; continue }
    if (!apply) continue
    const res = await pool.query('SELECT * FROM survey.adopt_surveyor_schema($1, $2, $3, $4)', [schema, owner.user_id, authority ? authority.id : null, m ? m.engagement : null])
    console.log('    moved: ' + res.rows.map((r) => `${r.relation} ${r.copied}`).join(', '))
    const check = (await pool.query(
      `SELECT (SELECT count(*) FROM survey.survey_projects WHERE legacy_schema = $1) AS projects,
              (SELECT count(*) FROM survey.coordinate_points WHERE legacy_schema = $1) AS points,
              (SELECT count(*) FROM survey.land_parcels WHERE legacy_schema = $1) AS parcels`, [schema])).rows[0]
    const same = ['projects', 'points', 'parcels'].every((k) => Number(check[k]) === Number(counts[k]))
    console.log(`    ${same ? 'verified: counts match' : 'COUNTS DIFFER ' + JSON.stringify(check)}`)
    if (!same) problems++
  }
  if (problems) { console.log(`\n${problems} problem(s): fix them and run again.`); process.exitCode = 1 }
  else console.log(apply ? '\nDone. Set SURVEY_STORE=shared and restart SurveyPro.' : '\nReady.')
} finally {
  await pool.end()
}
