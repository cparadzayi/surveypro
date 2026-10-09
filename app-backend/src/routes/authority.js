/**
 * Appointments: which surveyors work for which authority, and on what terms.
 *
 *   GET  /api/authorities/mine                       my appointments
 *   GET  /api/authorities/:code/members              the people appointed to an authority (a head surveyor or reviewer sees all of
 *                                                    them; anyone else sees only their own row)
 *   POST /api/authorities/:code/members              appoint somebody (a head surveyor of that authority, or the platform operator)
 *   POST /api/authorities/:code/members/:id/end      end an appointment today
 *
 * Every query runs as the signed-in person (config/requestDb.js), so the database enforces the rules (migration 097): a head
 * surveyor can appoint surveyors and reviewers to THEIR authority and no other, only the platform operator can make a head
 * surveyor, and nobody can appoint themselves. This route adds no authorisation of its own to forget; it translates the database's
 * refusals into 403s.
 *
 * Both employed and contracted surveyors are appointed the same way: `engagement` says which. A contracted surveyor may hold
 * appointments with several authorities. The person must already have a SurveyPro account (they register themselves; this route
 * never creates people), and appointments are by email address.
 */
import { withRequest, isRefusal } from '../config/requestDb.js'
import SurveyorProfile from '../models/SurveyorProfile.js'

const ROLES = ['surveyor', 'head_surveyor', 'reviewer']
const ENGAGEMENTS = ['employed', 'contracted']
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export default async function authorityRoutes(app) {
  const who = async (request) => {
    const userId = Number(request.user.sub)
    const profile = await SurveyorProfile.findByUserId(userId)
    return { userId, platform: profile?.role === 'admin' }
  }
  const refuse = (reply, err) => {
    if (isRefusal(err)) return reply.code(403).send({ error: 'not_allowed', message: 'You may not do that for this authority.' })
    if (err.code === '42P01') return reply.code(503).send({ error: 'tenancy_not_installed', message: 'SurveyPro has not been set up for councils yet (migrations 096-100).' })
    throw err
  }

  app.get('/authorities/mine', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const rows = await withRequest(await who(request), async (c) => (await c.query(
        `SELECT a.code, a.name, m.id, m.role, m.engagement, m.valid_from, m.valid_to,
                (m.valid_from <= CURRENT_DATE AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE)) AS active
           FROM survey.authority_member m JOIN survey.authority a ON a.id = m.authority_id
          WHERE m.user_id = app.user_id() ORDER BY a.code, m.valid_from DESC`)).rows)
      return { data: rows }
    } catch (err) { return refuse(reply, err) }
  })

  app.get('/authorities/:code/members', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const rows = await withRequest(await who(request), async (c) => (await c.query(
        `SELECT m.id, u.email, m.role, m.engagement, m.valid_from, m.valid_to, m.note,
                (m.valid_from <= CURRENT_DATE AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE)) AS active
           FROM survey.authority_member m
           JOIN survey.authority a ON a.id = m.authority_id
           JOIN public.users u ON u.id = m.user_id
          WHERE a.code = $1 ORDER BY active DESC, u.email`, [request.params.code])).rows)
      return { data: rows }
    } catch (err) { return refuse(reply, err) }
  })

  app.post('/authorities/:code/members', {
    preHandler: [app.authenticate],
    schema: {
      body: {
        type: 'object', required: ['email', 'role'],
        properties: {
          email: { type: 'string', format: 'email' }, role: { type: 'string', enum: ROLES }, engagement: { type: 'string', enum: ENGAGEMENTS },
          valid_from: { type: 'string' }, valid_to: { type: 'string' }, note: { type: 'string', maxLength: 500 },
        },
      },
    },
  }, async (request, reply) => {
    const b = request.body
    if (b.role !== 'reviewer' && !b.engagement) return reply.code(400).send({ error: 'engagement_required', message: 'Say whether the surveyor is employed or contracted.' })
    if ((b.valid_from && !isDate(b.valid_from)) || (b.valid_to && !isDate(b.valid_to))) return reply.code(400).send({ error: 'bad_date' })
    try {
      const result = await withRequest(await who(request), async (c) => {
        const authority = (await c.query('SELECT id, code, name FROM survey.authority WHERE code = $1 AND active', [request.params.code])).rows[0]
        if (!authority) return { status: 404, body: { error: 'unknown_authority' } }
        const person = (await c.query('SELECT id FROM public.users WHERE lower(email) = lower($1)', [b.email])).rows[0]
        if (!person) return { status: 404, body: { error: 'no_surveypro_account', message: `${b.email} has no SurveyPro account yet. They register at SurveyPro first; then appoint them.` } }
        const row = (await c.query(
          `INSERT INTO survey.authority_member (user_id, authority_id, role, engagement, valid_from, valid_to, appointed_by, note)
           VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6::date, app.user_id(), $7)
           RETURNING id, role, engagement, valid_from, valid_to`,
          [person.id, authority.id, b.role, b.role === 'reviewer' ? null : b.engagement, b.valid_from || null, b.valid_to || null, b.note || null])).rows[0]
        return { status: 201, body: { data: { ...row, email: b.email, authority: authority.code } } }
      })
      return reply.code(result.status).send(result.body)
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'already_appointed', message: 'That person already holds that role at this authority.' })
      return refuse(reply, err)
    }
  })

  app.post('/authorities/:code/members/:id/end', { preHandler: [app.authenticate] }, async (request, reply) => {
    const id = Number(request.params.id)
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'bad_id' })
    try {
      const row = await withRequest(await who(request), async (c) => (await c.query(
        `UPDATE survey.authority_member m SET valid_to = GREATEST(CURRENT_DATE, m.valid_from)
           FROM survey.authority a
          WHERE m.id = $1 AND a.id = m.authority_id AND a.code = $2 AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE)
          RETURNING m.id, m.role, m.valid_to`, [id, request.params.code])).rows[0])
      if (!row) return reply.code(404).send({ error: 'not_found', message: 'No such open appointment that you may end.' })
      return { data: row }
    } catch (err) { return refuse(reply, err) }
  })
}
