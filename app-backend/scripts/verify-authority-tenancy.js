#!/usr/bin/env node
/**
 * Does authority tenancy hold? Sets up two authorities and every kind of person SurveyPro now has to tell apart, then checks who
 * can see and change what, as the database sees it (SET ROLE surveypro_request plus the settings the application sets per request).
 *
 *   DATABASE_URL=postgres://... node scripts/verify-authority-tenancy.js
 *
 * Everything happens inside one transaction that is rolled back, so it leaves nothing behind. Needs migrations 096-097 and the
 * surveypro_request role. Exit code 0 only if every check passes.
 */
import 'dotenv/config'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL is required'); process.exit(2) }

const pool = new pg.Pool({ connectionString: url, max: 1 })
let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fail++ }

async function main() {
  const c = await pool.connect()
  const q = async (sql, args) => (await c.query(sql, args)).rows
  const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join()
  try {
    await c.query('BEGIN')
    if (!(await q("SELECT 1 FROM pg_roles WHERE rolname = 'surveypro_request'")).length) throw new Error('role surveypro_request is missing (see docs/AUTHORITY_TENANCY.md)')

    // ---- the cast ----------------------------------------------------------------------------------------------------------
    const mkUser = async (name) => (await q(
      "INSERT INTO public.users (email, password_hash, user_type) VALUES ($1, 'x', 'registered_surveyor') RETURNING id", [`${name}@verify.test`]))[0].id
    const a1 = (await q("INSERT INTO survey.authority (code, name, kind) VALUES ('VER1', 'Verify Council One', 'rural') RETURNING id"))[0].id
    const a2 = (await q("INSERT INTO survey.authority (code, name, kind) VALUES ('VER2', 'Verify Council Two', 'urban') RETURNING id"))[0].id
    const u = {}
    for (const n of ['s1', 's2', 'h1', 'r1', 'c1', 's3', 'p1', 'x1', 'plat']) u[n] = await mkUser(n)
    const appoint = (user, auth, role, eng, from = null, to = null) => c.query(
      `INSERT INTO survey.authority_member (user_id, authority_id, role, engagement, valid_from, valid_to)
       VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6)`, [user, auth, role, eng, from, to])
    await appoint(u.s1, a1, 'surveyor', 'employed')
    await appoint(u.s2, a1, 'surveyor', 'employed')
    await appoint(u.h1, a1, 'head_surveyor', 'employed')
    await appoint(u.r1, a1, 'reviewer', null)
    await appoint(u.c1, a1, 'surveyor', 'contracted')
    await appoint(u.c1, a2, 'surveyor', 'contracted')
    await appoint(u.s3, a2, 'surveyor', 'employed')
    await appoint(u.x1, a1, 'surveyor', 'contracted', '2020-01-01', '2020-12-31')   // appointment ended long ago

    const mkProject = async (name, surveyor, auth, eng) => (await q(
      `INSERT INTO survey.survey_projects (name, surveyor_user_id, authority_id, engagement) VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, surveyor, auth, eng]))[0].id
    const P = {
      P1: await mkProject('P1 s1 at A1', u.s1, a1, 'employed'),
      P2: await mkProject('P2 s2 at A1', u.s2, a1, 'employed'),
      P3: await mkProject('P3 c1 at A1', u.c1, a1, 'contracted'),
      P4: await mkProject('P4 c1 at A2', u.c1, a2, 'contracted'),
      P5: await mkProject('P5 s3 at A2', u.s3, a2, 'employed'),
      P6: await mkProject('P6 p1 private', u.p1, null, null),
      P7: await mkProject('P7 x1 at A1 (appointment ended)', u.x1, a1, 'contracted'),
    }
    for (const [k, id] of Object.entries(P)) {
      await c.query("INSERT INTO survey.coordinate_points (project_id, name, geom) VALUES ($1, $2, public.ST_SetSRID(public.ST_MakePoint(1, 2), 22291))", [id, `pt-${k}`])
    }
    const idOf = Object.fromEntries(Object.entries(P).map(([k, v]) => [v, k]))

    // ---- speaking as somebody -----------------------------------------------------------------------------------------------
    const as = async (user, platform = false) => {
      await c.query('RESET ROLE')
      await c.query("SELECT set_config('app.user_id', $1, true), set_config('app.platform', $2, true)", [user == null ? '' : String(user), platform ? 'true' : ''])
      await c.query('SET LOCAL ROLE surveypro_request')
    }
    const seesProjects = async () => (await q('SELECT id FROM survey.survey_projects')).map(r => idOf[r.id]).filter(Boolean)
    const seesPoints = async () => (await q('SELECT project_id FROM survey.coordinate_points')).map(r => idOf[r.project_id]).filter(Boolean)
    const attempt = async (sql, args) => {            // true if the database allowed it
      await c.query('SAVEPOINT t')
      try { const r = await c.query(sql, args); await c.query('RELEASE SAVEPOINT t'); return r.rowCount }
      catch (e) { await c.query('ROLLBACK TO SAVEPOINT t'); return /row-level security|permission denied|cannot (update|insert|delete) /.test(e.message) ? 'refused' : 'error: ' + e.message }
    }

    console.log('who sees which project')
    const expectSees = {
      s1: ['P1'], s2: ['P2'], h1: ['P1', 'P2', 'P3', 'P7'], r1: ['P1', 'P2', 'P3', 'P7'], c1: ['P3', 'P4'],
      s3: ['P5'], p1: ['P6'], x1: ['P7'],
    }
    const names = {
      s1: 'an employed surveyor sees their own project only', s2: 'another surveyor of the same authority sees only theirs',
      h1: "a head surveyor sees every project of their authority", r1: "a reviewer sees every project of their authority",
      c1: 'a surveyor contracted to two authorities sees both of their own, nobody else\'s', s3: "a surveyor of the other authority sees nothing of the first",
      p1: 'a private-practice surveyor sees their own', x1: 'a surveyor whose appointment ended still sees their own work',
    }
    for (const [who, want] of Object.entries(expectSees)) {
      await as(u[who])
      const got = await seesProjects()
      ok(sameSet(got, want), `${names[who]} (${got.sort().join(',') || 'none'})`)
      ok(sameSet(await seesPoints(), want), `   and their points follow (${who})`)
    }
    await as(u.plat, true)
    ok(sameSet(await seesProjects(), Object.keys(P)), 'the platform operator sees all seven')
    await as(null)
    ok((await seesProjects()).length === 0, 'a request with nobody signed in sees nothing')

    console.log('who may change what')
    await as(u.s1)
    ok(await attempt("INSERT INTO survey.coordinate_points (project_id, name) VALUES ($1, 'new')", [P.P1]) === 1, 'a surveyor adds a point to their own project')
    ok(await attempt("INSERT INTO survey.coordinate_points (project_id, name) VALUES ($1, 'sneak')", [P.P2]) === 'refused', "…but not to a colleague's")
    ok(await attempt("UPDATE survey.survey_projects SET name = 'taken' WHERE id = $1", [P.P2]) === 0, "…cannot rename a colleague's project (it is invisible to them)")
    ok(await attempt('DELETE FROM survey.survey_projects WHERE id = $1', [P.P2]) === 0, "…cannot delete it either")
    ok(await attempt("UPDATE survey.survey_projects SET authority_id = $2 WHERE id = $1", [P.P1, a2]) === 'refused', 'cannot move their project to an authority they are not appointed to')
    ok(await attempt("INSERT INTO survey.survey_projects (name, surveyor_user_id, authority_id, engagement) VALUES ('mine at A2', $1, $2, 'employed')", [u.s1, a2]) === 'refused', 'cannot open a project for an authority they are not appointed to')
    ok(await attempt("INSERT INTO survey.survey_projects (name, surveyor_user_id, authority_id, engagement) VALUES ('for s2', $1, $2, 'employed')", [u.s2, a1]) === 'refused', "cannot open a project in a colleague's name")
    ok(await attempt("INSERT INTO survey.survey_projects (name, surveyor_user_id, authority_id, engagement) VALUES ('mine at A1', $1, $2, 'employed')", [u.s1, a1]) === 1, 'can open a project for their own authority')

    await as(u.h1)
    ok(await attempt("UPDATE survey.survey_projects SET status = 'on hold' WHERE id = $1", [P.P2]) === 1, "a head surveyor manages any of their authority's projects")
    ok(await attempt("UPDATE survey.survey_projects SET status = 'x' WHERE id = $1", [P.P5]) === 0, "…but not another authority's")
    ok(await attempt("INSERT INTO survey.coordinate_points (project_id, name) VALUES ($1, 'by head')", [P.P1]) === 1, "…and edits a surveyor's points")

    await as(u.r1)
    ok(await attempt("INSERT INTO survey.coordinate_points (project_id, name) VALUES ($1, 'by reviewer')", [P.P1]) === 'refused', 'a reviewer cannot add points')
    ok(await attempt("UPDATE survey.survey_projects SET status = 'x' WHERE id = $1", [P.P1]) === 0, '…cannot change a project')
    ok(await attempt('DELETE FROM survey.coordinate_points WHERE project_id = $1', [P.P1]) === 0, '…cannot delete points')

    await as(u.c1)
    ok(await attempt("INSERT INTO survey.survey_projects (name, surveyor_user_id, authority_id, engagement) VALUES ('c1 at A1', $1, $2, 'contracted')", [u.c1, a1]) === 1, 'a contracted surveyor opens a project for the first authority')
    ok(await attempt("INSERT INTO survey.survey_projects (name, surveyor_user_id, authority_id, engagement) VALUES ('c1 at A2', $1, $2, 'contracted')", [u.c1, a2]) === 1, '…and for the second')
    ok(await attempt("UPDATE survey.survey_projects SET name = 'edit' WHERE id = $1", [P.P1]) === 0, "…but cannot touch the first authority's other surveyors' work")

    await as(u.x1)
    ok(await attempt("INSERT INTO survey.coordinate_points (project_id, name) VALUES ($1, 'late')", [P.P7]) === 'refused', 'a surveyor whose appointment ended can read, not write, their old project')
    ok(await attempt("INSERT INTO survey.survey_projects (name, surveyor_user_id, authority_id, engagement) VALUES ('late', $1, $2, 'contracted')", [u.x1, a1]) === 'refused', '…and cannot open a new one for that authority')

    await as(u.p1)
    ok(await attempt("INSERT INTO survey.survey_projects (name, surveyor_user_id, authority_id) VALUES ('private ok', $1, NULL)", [u.p1]) === 1, 'a private-practice surveyor opens a private project')
    ok(await attempt("INSERT INTO survey.survey_projects (name, surveyor_user_id, authority_id, engagement) VALUES ('private at A1', $1, $2, 'employed')", [u.p1, a1]) === 'refused', '…but not one for an authority they are not appointed to')

    console.log('appointments')
    await as(u.s1)
    ok((await q('SELECT count(*)::int n FROM survey.authority_member'))[0].n === 1, 'a surveyor sees only their own appointment')
    ok(await attempt("INSERT INTO survey.authority_member (user_id, authority_id, role, engagement) VALUES ($1, $2, 'surveyor', 'employed')", [u.s3, a1]) === 'refused', 'a surveyor cannot appoint anyone')
    await as(u.h1)
    ok((await q('SELECT count(*)::int n FROM survey.authority_member'))[0].n === 6, "a head surveyor sees their authority's appointments (6, including the one that ended)")
    ok(await attempt("INSERT INTO survey.authority_member (user_id, authority_id, role, engagement) VALUES ($1, $2, 'surveyor', 'contracted')", [u.s3, a1]) === 1, 'a head surveyor appoints a surveyor to their authority')
    ok(await attempt("INSERT INTO survey.authority_member (user_id, authority_id, role, engagement) VALUES ($1, $2, 'head_surveyor', 'employed')", [u.s3, a1]) === 'refused', '…but not another head surveyor')
    ok(await attempt("INSERT INTO survey.authority_member (user_id, authority_id, role, engagement) VALUES ($1, $2, 'surveyor', 'employed')", [u.s2, a2]) === 'refused', "…and not into another authority")

    console.log('what an authority reads, and how it accepts work')
    // a UTM point beside the Lo points, so the axes are seen to travel with their system
    await c.query('RESET ROLE')
    await c.query("INSERT INTO survey.coordinate_points (project_id, name, geom) VALUES ($1, 'utm-pt', public.ST_SetSRID(public.ST_MakePoint(300000, 7800000), 32735))", [P.P2])
    await c.query("INSERT INTO survey.survey_projects (name, surveyor_user_id, authority_id, engagement) VALUES ('P8 h1 own work at A1', $1, $2, 'employed')", [u.h1, a1])
    const P8 = (await q("SELECT id FROM survey.survey_projects WHERE name LIKE 'P8%'"))[0].id
    await c.query('CREATE ROLE sp_reader_ver1 NOLOGIN IN ROLE survey_reader')
    await c.query('INSERT INTO tenancy.role_authority (role_name, authority_id) VALUES ($1, $2)', ['sp_reader_ver1', a1])
    const asReader = async (settings = {}) => {
      await c.query('RESET ROLE')
      await c.query("SELECT set_config('app.user_id', $1, true), set_config('app.platform', $2, true)", [settings.user == null ? '' : String(settings.user), settings.platform ? 'true' : ''])
      await c.query('SET LOCAL ROLE sp_reader_ver1')
    }
    const EXPECT_A1 = ['P1 s1 at A1', 'P2 s2 at A1', 'P3 c1 at A1', 'P7 x1 at A1 (appointment ended)', 'P8 h1 own work at A1']
    // what the reader sees: nothing from another authority or a private practice, and everything of its own authority
    const readerView = async () => {
      const rows = await q('SELECT name, authority_code FROM survey_share.projects')
      return { foreign: rows.filter(r => r.authority_code !== 'VER1').length, missing: EXPECT_A1.filter(n => !rows.some(r => r.name === n)).length, total: rows.length }
    }
    await asReader()
    { const v = await readerView(); ok(v.foreign === 0 && v.missing === 0 && v.total >= 5, `an authority's login reads all of its own authority's projects (${v.total}), and no other authority's, and no private practice`) }
    ok(await attempt('SELECT 1 FROM survey.survey_projects LIMIT 1') === 'refused', '…but not the tables behind the views')
    ok(await attempt('SELECT 1 FROM survey.coordinate_points LIMIT 1') === 'refused', '…points included')
    ok(await attempt('SELECT 1 FROM public.users LIMIT 1') === 'refused', '…nor accounts')
    ok(await attempt("UPDATE survey_share.projects SET name = 'x'") === 'refused', '…and cannot write through a view')
    const lo = (await q("SELECT lo_zone, axis_order, y_westing, x_southing, easting FROM survey_share.points WHERE name = 'pt-P1'"))[0]
    ok(lo && lo.lo_zone === 31 && lo.axis_order === 'westing_southing' && Number(lo.y_westing) === 1 && Number(lo.x_southing) === 2 && lo.easting === null, 'a Cape/Lo31 point is carried as westing and southing with its zone')
    const utm = (await q("SELECT lo_zone, axis_order, y_westing, easting, northing FROM survey_share.points WHERE name = 'utm-pt'"))[0]
    ok(utm && utm.lo_zone === null && utm.axis_order === 'easting_northing' && utm.y_westing === null && Number(utm.easting) === 300000, 'a UTM point is carried as easting and northing, never mislabelled as westing')
    ok(sameSet((await q('SELECT DISTINCT project_id FROM survey_share.points')).map(r => idOf[r.project_id] || 'P8'), ['P1', 'P2', 'P3', 'P7']), "points and parcels follow the authority's projects too")
    // trying to become somebody else
    await asReader({ user: u.c1 })
    { const v = await readerView(); ok(v.foreign === 0 && v.missing === 0, 'setting app.user_id to a surveyor of the other authority gains nothing') }
    await asReader({ platform: true })
    { const v = await readerView(); ok(v.foreign === 0 && v.missing === 0, 'claiming to be the platform operator gains nothing') }
    await asReader({ user: u.h1 })
    ok(await attempt("INSERT INTO survey.project_review (project_id, decision, reviewer_user_id) VALUES ($1, 'accepted', $2)", [P.P1, u.h1]) === 'refused', 'a reader login cannot record a review, whoever it claims to be')

    await as(u.s1)
    { const names = (await q('SELECT name FROM survey_share.projects')).map(r => r.name); ok(names.includes('P1 s1 at A1') && names.every(n => ['P1 s1 at A1', 'mine at A1'].includes(n)), `a surveyor reading the shared views sees only their own work (${names.join('; ')})`) }
    await as(u.r1)
    ok(await attempt("INSERT INTO survey.project_review (project_id, decision, note) VALUES ($1, 'accepted', 'checked')", [P.P1]) === 1, "a reviewer accepts an authority's delivered project")
    ok(await attempt("INSERT INTO survey.project_review (project_id, decision) VALUES ($1, 'accepted')", [P.P5]) === 'refused', "…but not another authority's")
    ok(await attempt("INSERT INTO survey.project_review (project_id, decision, reviewer_user_id) VALUES ($1, 'accepted', $2)", [P.P1, u.h1]) === 'refused', "…and not in somebody else's name")
    ok(await attempt("UPDATE survey.project_review SET decision = 'rejected'") === 'refused', 'a decision cannot be changed afterwards')
    ok(await attempt('DELETE FROM survey.project_review') === 'refused', '…or deleted')
    await as(u.s1)
    ok(await attempt("INSERT INTO survey.project_review (project_id, decision) VALUES ($1, 'accepted')", [P.P1]) === 'refused', 'a surveyor cannot accept their own work')
    await as(u.h1)
    ok(await attempt("INSERT INTO survey.project_review (project_id, decision) VALUES ($1, 'accepted')", [P8]) === 'refused', 'a head surveyor cannot accept their own work either')
    ok(await attempt("INSERT INTO survey.project_review (project_id, decision) VALUES ($1, 'returned')", [P.P2]) === 1, "…but reviews a colleague's")
    await asReader()
    const rv = (await q("SELECT review_decision FROM survey_share.projects WHERE id = $1", [P.P1]))[0]
    ok(rv && rv.review_decision === 'accepted', "the authority's login sees the decision on the project")

    console.log('the request role cannot reach what it should not')
    await as(u.s1)
    ok(await attempt('SELECT password_hash FROM public.users LIMIT 1') === 'refused', 'it cannot read password hashes')
    ok(await attempt('SELECT email FROM public.users LIMIT 1') !== 'refused', '…only the columns it needs to name a person (id, email)')
    ok(await attempt('UPDATE survey.authority SET name = name') === 'refused', 'it cannot change the authority register')
    await c.query('RESET ROLE')
    const vio = await q('SELECT relation, rule FROM tenancy.violations')
    ok(vio.length === 0, vio.length ? `contract violations: ${vio.map(v => v.rule + ' ' + v.relation).join('; ')}` : 'the contract finds no departure')
  } catch (e) {
    console.log('  FAIL unexpected: ' + e.message); fail++
  } finally {
    await c.query('ROLLBACK').catch(() => {})
    c.release()
    await pool.end()
  }
  console.log(fail ? `\n${fail} check(s) FAILED` : '\nALL CHECKS PASSED')
  process.exit(fail ? 1 : 0)
}

main()
