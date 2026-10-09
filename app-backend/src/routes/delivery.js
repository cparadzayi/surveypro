/**
 * Delivering a project to its authority, and the authority's review of it.
 *
 *   POST /api/survey-projects/:id/deliver     the surveyor hands the project to the council   { authority_code? }
 *   GET  /api/survey-projects/:id/delivery    where it stands: not_delivered | awaiting_review | accepted | rejected | returned, with the declared class,
 *                                             the council it is for and how many parcels are ready to deliver
 *   GET  /api/reviews/queue                   delivered projects awaiting a decision, for a reviewer / head surveyor  ?authority=CODE
 *   GET  /api/reviews/projects/:id            one delivered project for review: its facts, parcels and past decisions
 *   POST /api/reviews/projects/:id/decision   { decision: accepted | rejected | returned, note }
 *
 * :id on the survey-projects routes is the surveyor's own project id; on /reviews it is the shared project id (what the council sees). With
 * SURVEY_STORE=shared the two are the same thing: the project lives in the shared tables and delivery is a check and a timestamp.
 *
 * Delivery runs survey.deliver_project() (migration 102) as the application login, so WHO is delivering is taken from the signed-in
 * token and never from the request. The function does the checks (appointed today, class declared, something to deliver, not already
 * with the council, not already accepted); this route turns its refusals into messages. Reviews run as the signed-in person
 * (config/requestDb.js): the database decides who may review (their authority, never their own work) and that a delivery is decided
 * once (survey.project_review_guard).
 */
import pool from '../config/db.js'
import { withRequest, isRefusal } from '../config/requestDb.js'
import { surveyStore } from '../config/sharedDb.js'
import SurveyorProfile from '../models/SurveyorProfile.js'
import { authenticateWithSchema, requireSchema } from '../utils/schemaAuth.js'

const DECISIONS = ['accepted', 'rejected', 'returned']

// refusals the delivery function raises, as the person should hear them
const DELIVERY_REFUSALS = {
  authority_required: [422, 'Say which council this survey is for.'],
  unknown_authority: [422, 'SurveyPro does not know that council.'],
  not_appointed: [403, 'You are not appointed to that council today. Ask its head surveyor to appoint you.'],
  no_survey_class: [422, 'Declare the SI 727 survey class (B or C) on the project before delivering it.'],
  nothing_to_deliver: [422, 'There is no finalized parcel to deliver.'],
  awaiting_review: [409, 'This project is already with the council, awaiting its decision.'],
  already_accepted: [409, 'The council has accepted this project; it is final. A changed survey is a new project.'],
  authority_changed: [409, 'This project was delivered to a different council before.'],
}
const REVIEW_REFUSALS = {
  not_delivered: [409, 'That project has not been delivered for review.'],
  already_decided: [409, 'That delivery has already been decided.'],
  note_required: [422, 'Say why: a rejection or a return needs a note.'],
}
const codeOf = (err) => String(err.message || '').split(':')[0].trim()

export default async function deliveryRoutes(app) {
  const who = async (request) => {
    const userId = Number(request.user.sub)
    const profile = request.surveyorProfile || await SurveyorProfile.findByUserId(userId)
    return { userId, platform: profile?.role === 'admin' }
  }
  const schemaAuth = authenticateWithSchema
  const refuse = (reply, err, table = {}) => {
    const hit = table[codeOf(err)]
    if (hit) return reply.code(hit[0]).send({ error: codeOf(err), message: hit[1] })
    if (isRefusal(err)) return reply.code(403).send({ error: 'not_allowed', message: 'You may not do that.' })
    if (err.code === '42P01' || err.code === '42883') return reply.code(503).send({ error: 'tenancy_not_installed', message: 'SurveyPro has not been set up for councils yet (migrations 096-102).' })
    throw err
  }
  const stateOf = (p) => !p || !p.delivered_at ? 'not_delivered'
    : (!p.reviewed_at || new Date(p.reviewed_at) < new Date(p.delivered_at)) ? 'awaiting_review' : p.review_decision

  app.post('/survey-projects/:id/deliver', {
    preHandler: [app.authenticate, authenticateWithSchema, requireSchema],
    schema: { body: { type: 'object', additionalProperties: false, properties: { authority_code: { type: ['string', 'null'], maxLength: 32 } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id)
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: 'bad_id' })
    try {
      const { rows } = surveyStore() === 'shared'
        ? await pool.query('SELECT * FROM survey.deliver_shared_project($1, $2, $3)', [id, Number(request.user.sub), request.body?.authority_code || null])
        : await pool.query('SELECT * FROM survey.deliver_project($1, $2, $3, $4)',
            [request.surveyorSchema, id, Number(request.user.sub), request.body?.authority_code || null])
      const r = rows[0]
      return { data: { shared_project_id: r.project_id, delivered_at: r.delivered_at, points: r.points, parcels: r.parcels, state: 'awaiting_review' } }
    } catch (err) {
      if (err.code === 'P0002') return reply.code(404).send({ error: 'not_found' })
      return refuse(reply, err, DELIVERY_REFUSALS)
    }
  })

  app.get('/survey-projects/:id/delivery', { preHandler: [app.authenticate, authenticateWithSchema, requireSchema] }, async (request, reply) => {
    const id = Number(request.params.id)
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: 'bad_id' })
    try {
      const p = await withRequest(await who(request), async (c) => (await c.query(
        `SELECT sp.id, a.code AS authority_code, sp.survey_class, sp.delivered_at, r.decision AS review_decision, r.decided_at AS reviewed_at, r.note AS review_note
           FROM survey.survey_projects sp
           LEFT JOIN survey.authority a ON a.id = sp.authority_id
           LEFT JOIN LATERAL (SELECT x.decision, x.decided_at, x.note FROM survey.project_review x WHERE x.project_id = sp.id ORDER BY x.decided_at DESC, x.id DESC LIMIT 1) r ON true
          WHERE ${surveyStore() === 'shared' ? 'sp.id = $1' : 'sp.legacy_schema = $1 AND sp.legacy_id = $2'}`,
        surveyStore() === 'shared' ? [id] : [request.surveyorSchema, id])).rows[0])
      // what the surveyor's own project says, in whichever store it lives: the declared class, the council it is for, and how many parcels are ready
      const shared = surveyStore() === 'shared'
      const work = (await request.db.query(shared
        ? 'SELECT sp.survey_class, a.code AS authority_code FROM survey_projects sp LEFT JOIN survey.authority a ON a.id = sp.authority_id WHERE sp.id = $1'
        : "SELECT metadata ->> 'survey_class' AS survey_class, metadata ->> 'authority_code' AS authority_code FROM survey_projects WHERE id = $1", [id])).rows[0]
      if (!work) return reply.code(404).send({ error: 'not_found' })
      const ready = (await request.db.query(
        "SELECT count(*)::int AS n FROM land_parcels WHERE project_id = $1 AND status IN ('finalized', 'approved') AND COALESCE(parcel_status, 'active') = 'active'", [id])).rows[0].n
      return { data: { state: stateOf(p), survey_class: work.survey_class || null, authority_code: (p && p.authority_code) || work.authority_code || null, parcels_ready: ready,
        ...(p ? { shared_project_id: p.id, delivered_at: p.delivered_at,
        decision: stateOf(p) === 'awaiting_review' ? null : p.review_decision, decided_at: p.reviewed_at, note: p.review_note } : {}) } }
    } catch (err) { return refuse(reply, err) }
  })

  app.get('/reviews/queue', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const rows = await withRequest(await who(request), async (c) => (await c.query(
        `SELECT p.id, p.authority_code, p.name, p.township, p.survey_type, p.survey_class, p.engagement, p.delivered_at, p.surveyor_name, p.surveyor_licence,
                (SELECT count(*)::int FROM survey_share.parcels lp WHERE lp.project_id = p.id AND lp.status IN ('finalized', 'approved') AND lp.parcel_status = 'active') AS parcels
           FROM survey_share.projects p
          WHERE p.delivered_at IS NOT NULL AND (p.reviewed_at IS NULL OR p.reviewed_at < p.delivered_at)
            AND p.id IN (SELECT survey.reviewable_project_ids(app.user_id(), app.is_platform()))
            AND ($1::text IS NULL OR p.authority_code = $1)
          ORDER BY p.delivered_at`, [request.query.authority || null])).rows)
      return { data: rows }
    } catch (err) { return refuse(reply, err) }
  })

  app.get('/reviews/projects/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const id = Number(request.params.id)
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: 'bad_id' })
    try {
      const out = await withRequest(await who(request), async (c) => {
        const p = (await c.query('SELECT * FROM survey_share.projects WHERE id = $1', [id])).rows[0]
        if (!p) return null
        const reviewable = (await c.query('SELECT $1::int IN (SELECT survey.reviewable_project_ids(app.user_id(), app.is_platform())) AS ok', [id])).rows[0].ok
        const parcels = (await c.query(
          `SELECT id, stand, designation, area_m2, status, parcel_status, closure_error_m, closure_ratio, srid, lo_zone FROM survey_share.parcels WHERE project_id = $1 ORDER BY stand, id`, [id])).rows
        const points = (await c.query('SELECT count(*)::int AS n FROM survey_share.points WHERE project_id = $1', [id])).rows[0].n
        const beacons = (await c.query('SELECT count(*)::int AS n FROM survey_share.beacons WHERE project_id = $1', [id])).rows[0].n
        const reviews = (await c.query('SELECT decision, note, decided_at, reviewer_email FROM survey_share.reviews WHERE project_id = $1 ORDER BY decided_at DESC, id DESC', [id])).rows
        return { project: p, state: stateOf(p), can_decide: reviewable && stateOf(p) === 'awaiting_review', parcels, points, beacons, reviews }
      })
      if (!out) return reply.code(404).send({ error: 'not_found' })
      return { data: out }
    } catch (err) { return refuse(reply, err) }
  })

  app.post('/reviews/projects/:id/decision', {
    preHandler: [app.authenticate],
    schema: { body: { type: 'object', required: ['decision'], additionalProperties: false,
      properties: { decision: { type: 'string', enum: DECISIONS }, note: { type: ['string', 'null'], maxLength: 4000 } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id)
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: 'bad_id' })
    try {
      const row = await withRequest(await who(request), async (c) => (await c.query(
        'INSERT INTO survey.project_review (project_id, decision, note) VALUES ($1, $2, $3) RETURNING id, project_id, decision, note, decided_at',
        [id, request.body.decision, request.body.note || null])).rows[0])
      return reply.code(201).send({ data: row })
    } catch (err) {
      if (err.code === '23503') return reply.code(404).send({ error: 'not_found' })
      if (err.code === '23514') return refuse(reply, err, REVIEW_REFUSALS)
      return refuse(reply, err)
    }
  })
}
