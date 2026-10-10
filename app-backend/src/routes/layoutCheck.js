/**
 * Checking a layout against the register, before it is delivered or accepted.
 *
 *   POST /api/survey-projects/:id/check-layout   the surveyor, for their own project    { authority_code? }
 *   POST /api/reviews/projects/:id/check-layout  the council's reviewer, for a delivered project
 *
 * Builds the layout (the project's finalized, active parcels in their survey coordinates) and asks VunGIS whether the register would take it: the
 * rules its importer applies when the work is accepted (a stand number already taken, an overlap with an existing stand or plot, a repeated number,
 * a bad geometry, a system the register does not know). Advisory: it stops nobody delivering, and VunGIS's importer stays the gate. It writes nothing
 * here and nothing there.
 *
 * SurveyPro vouches for the person: the check is for a council the person is appointed to (a surveyor or head surveyor for their own project; a
 * reviewer or head surveyor for a delivered one). Anything else is refused before VunGIS is asked. services/vungisClient.js signs the request.
 */
import pool from '../config/db.js'
import { withRequest, isRefusal } from '../config/requestDb.js'
import { surveyStore } from '../config/sharedDb.js'
import SurveyorProfile from '../models/SurveyorProfile.js'
import { authenticateWithSchema, requireSchema } from '../utils/schemaAuth.js'
import { checkLayout, RegisterCheckError } from '../services/vungisClient.js'

const LO_SRIDS = '(22285, 22287, 22289, 22291, 22293)'
// the parcel columns VunGIS's check reads, as the share view and the surveyor's own table both have them
const PARCEL_COLUMNS = (geom = 'geom') => `id, stand, designation, area_m2,
  CASE WHEN ST_SRID(${geom}) IN ${LO_SRIDS} THEN ST_SRID(${geom}) - 22260 END AS lo_zone, ST_SRID(${geom}) AS srid, ST_AsGeoJSON(${geom}, 9) AS geojson`
const READY = "status IN ('finalized', 'approved') AND COALESCE(parcel_status, 'active') = 'active'"

export default async function layoutCheckRoutes(app) {
  const who = async (request) => {
    const userId = Number(request.user.sub)
    const profile = request.surveyorProfile || await SurveyorProfile.findByUserId(userId)
    return { userId, email: request.user.email, platform: profile?.role === 'admin' }
  }
  const fail = (reply, err) => {
    if (err instanceof RegisterCheckError) return reply.code(err.status).send({ error: err.code, message: err.message })
    if (isRefusal(err)) return reply.code(403).send({ error: 'not_allowed', message: 'You may not do that.' })
    throw err
  }
  const appointed = async (userId, code, roles) => (await pool.query(
    `SELECT 1 FROM survey.authority_member m JOIN survey.authority a ON a.id = m.authority_id
      WHERE m.user_id = $1 AND a.code = $2 AND m.role = ANY($3::text[]) AND m.valid_from <= CURRENT_DATE AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE)`,
    [userId, code, roles])).rowCount > 0
  // numeric columns arrive from the driver as strings; VunGIS's schema takes a number
  const asNumbers = (rows) => rows.map((p) => ({ ...p, area_m2: p.area_m2 == null ? null : Number(p.area_m2) }))
  const done = (r) => ({ data: { ok: r.ok, errors: r.errors, warnings: r.warnings, checked: r.checked } })

  app.post('/survey-projects/:id/check-layout', {
    preHandler: [app.authenticate, authenticateWithSchema, requireSchema],
    schema: { body: { type: 'object', additionalProperties: false, properties: { authority_code: { type: ['string', 'null'], maxLength: 32 } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id)
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: 'bad_id' })
    try {
      const shared = surveyStore() === 'shared'
      const project = (await request.db.query(shared
        ? 'SELECT sp.name, sp.township, sp.survey_class, a.code AS authority_code FROM survey_projects sp LEFT JOIN survey.authority a ON a.id = sp.authority_id WHERE sp.id = $1'
        : "SELECT name, township, metadata ->> 'survey_class' AS survey_class, metadata ->> 'authority_code' AS authority_code FROM survey_projects WHERE id = $1", [id])).rows[0]
      if (!project) return reply.code(404).send({ error: 'not_found' })
      const person = await who(request)
      const code = project.authority_code || request.body?.authority_code
      if (!code) return reply.code(422).send({ error: 'authority_required', message: 'Say which council this survey is for.' })
      if (!(await appointed(person.userId, code, ['surveyor', 'head_surveyor']))) {
        return reply.code(403).send({ error: 'not_appointed', message: 'You are not appointed to that council today.' })
      }
      const parcels = asNumbers((await request.db.query(`SELECT ${PARCEL_COLUMNS()} FROM land_parcels WHERE project_id = $1 AND ${READY} ORDER BY id`, [id])).rows)
      // the id VunGIS knows the project by is the shared one (the importer's source key); before delivery there is none, and nothing is imported yet
      const sharedId = shared ? id : (await pool.query('SELECT id FROM survey.survey_projects WHERE legacy_schema = $1 AND legacy_id = $2', [request.surveyorSchema, id])).rows[0]?.id
      const report = await checkLayout({ authority_code: code, project_id: sharedId || id, township: project.township || null, survey_class: project.survey_class || null, parcels },
        { email: person.email })
      return done(report)
    } catch (err) { return fail(reply, err) }
  })

  app.post('/reviews/projects/:id/check-layout', { preHandler: [app.authenticate] }, async (request, reply) => {
    const id = Number(request.params.id)
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: 'bad_id' })
    try {
      const person = await who(request)
      const found = await withRequest(person, async (c) => {
        const p = (await c.query('SELECT id, township, survey_class, authority_code FROM survey_share.projects WHERE id = $1', [id])).rows[0]
        if (!p) return null
        const ok = (await c.query('SELECT $1::int IN (SELECT survey.reviewable_project_ids(app.user_id(), app.is_platform())) AS ok', [id])).rows[0].ok
        const parcels = ok ? asNumbers((await c.query(`SELECT ${PARCEL_COLUMNS()} FROM survey_share.parcels WHERE project_id = $1 AND ${READY} ORDER BY id`, [id])).rows) : []
        return { p, ok, parcels }
      })
      if (!found) return reply.code(404).send({ error: 'not_found' })
      if (!found.ok || !(await appointed(person.userId, found.p.authority_code, ['reviewer', 'head_surveyor']))) {
        return reply.code(403).send({ error: 'not_allowed', message: 'Only the council\'s reviewers may check a delivered project.' })
      }
      const report = await checkLayout({ authority_code: found.p.authority_code, project_id: id, township: found.p.township || null, survey_class: found.p.survey_class || null, parcels: found.parcels },
        { email: person.email })
      return done(report)
    } catch (err) { return fail(reply, err) }
  })
}
