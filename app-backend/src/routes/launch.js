/**
 * POST /api/auth/launch: how a surveyor arrives from VunGIS with a job.
 *
 * VunGIS (the council's system) hands over a signed token naming the surveyor, the council and the job. This route turns it into a
 * SurveyPro session and a project, or says plainly why it cannot:
 *
 *   1. the token must be genuine (Ed25519, VunGIS's public key), unexpired, and used for the first time;
 *   2. the surveyor must already have a SurveyPro account (matched by email) and a profile: this route never creates people;
 *   3. the council must be set up in SurveyPro (survey.authority) and the surveyor must be APPOINTED to it, as a surveyor or head
 *      surveyor, today: whether employed or contracted, the council's head surveyor makes that appointment;
 *   4. the job becomes a project (created the first time, found again after), linked to the job by its id.
 *
 * Until the application is switched to the shared tables (docs/AUTHORITY_TENANCY.md, "What is left"), the project is created where
 * the application looks for projects today, in the surveyor's own schema, with the authority, engagement and job link kept in its
 * metadata. survey.adopt_surveyor_schema() promotes those to real columns when the schema is moved.
 *
 * Open to the world by necessity (the token IS the credential), so it says as little as it can to someone without a good one.
 */
import pool, { getSurveyorPool } from '../config/db.js'
import { sharedDb, surveyStore } from '../config/sharedDb.js'
import User from '../models/user.js'
import SurveyorProfile from '../models/SurveyorProfile.js'
import { loadPublicKey, verifyLaunchToken } from '../utils/launchToken.js'

const TYPE_LABEL = {
  verification: 'Verification survey', setting_out: 'Setting out', pegging: 'Pegging', layout: 'Layout survey',
  encroachment: 'Encroachment survey', beacon_check: 'Beacon check', general: 'Survey',
}

export default async function launchRoutes(app) {
  const publicKey = loadPublicKey()

  app.post('/auth/launch', {
    schema: { body: { type: 'object', required: ['token'], properties: { token: { type: 'string', maxLength: 4000 } } } },
  }, async (request, reply) => {
    const fail = (code, error, message) => reply.code(code).send({ error, message })

    if (!publicKey) return fail(503, 'launch_not_configured', 'This SurveyPro is not connected to VunGIS yet (no public key configured).')

    let claims
    try {
      claims = verifyLaunchToken(request.body.token, { publicKey, issuer: process.env.VUNGIS_LAUNCH_ISSUER || 'vungis' })
    } catch (err) {
      request.log.warn({ reason: err.message }, 'launch token refused')
      return fail(401, 'invalid_launch_token', err.message === 'expired' ? 'This link has expired. Open the job again from VunGIS.' : 'This link is not valid. Open the job again from VunGIS.')
    }
    const { job, authority: tokenAuthority } = claims

    // single use: record it before doing anything else, so a replay finds it
    try {
      const used = await pool.query(
        `INSERT INTO survey.launch_token_use (jti, issuer, subject, authority_code, external_job_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (jti) DO NOTHING RETURNING jti`,
        [claims.jti, claims.iss, claims.sub, tokenAuthority.code, job.id])
      if (!used.rowCount) return fail(409, 'launch_token_used', 'This link has already been used. Open the job again from VunGIS.')
    } catch (err) {
      if (err.code === '42P01') return fail(503, 'tenancy_not_installed', 'SurveyPro has not been set up for councils yet (migrations 096-100).')
      throw err
    }

    const user = await User.findByEmail(claims.sub)
    if (!user) return fail(404, 'no_surveypro_account', `There is no SurveyPro account for ${claims.sub}. Register at SurveyPro with the same email address, then open the job again.`)
    const profile = await SurveyorProfile.findByUserId(user.id)
    if (!profile || (!profile.schema_name && surveyStore() !== 'shared')) return fail(409, 'no_surveyor_profile', 'Complete your surveyor profile in SurveyPro, then open the job again.')

    const authority = (await pool.query('SELECT id, code, name FROM survey.authority WHERE code = $1 AND active', [tokenAuthority.code])).rows[0]
    if (!authority) return fail(409, 'unknown_authority', `${tokenAuthority.name || tokenAuthority.code} is not set up in SurveyPro. Ask SurveyPro support to add it.`)

    const appointment = (await pool.query(
      `SELECT role, engagement FROM survey.authority_member
        WHERE user_id = $1 AND authority_id = $2 AND role IN ('surveyor', 'head_surveyor')
          AND valid_from <= CURRENT_DATE AND (valid_to IS NULL OR valid_to > CURRENT_DATE)
        ORDER BY (role = 'head_surveyor') DESC LIMIT 1`, [user.id, authority.id])).rows[0]
    if (!appointment) {
      return fail(403, 'not_appointed', `You are not appointed to ${authority.name}. Ask its head surveyor to appoint you in SurveyPro, then open the job again.`)
    }

    // the project for this job: found again if it was opened before, created otherwise
    // On the shared store the project is made AS the surveyor, so the database itself checks the appointment again and records them as its owner.
    const shared = surveyStore() === 'shared'
    const db = shared ? sharedDb({ userId: user.id, platform: false }) : getSurveyorPool(profile.schema_name)
    const found = (await db.query(shared
      ? `SELECT id, name FROM survey_projects WHERE authority_id = $2 AND metadata ->> 'external_job_id' = $1 ORDER BY id LIMIT 1`
      : `SELECT id, name FROM survey_projects WHERE metadata ->> 'external_job_id' = $1 ORDER BY id LIMIT 1`,
      shared ? [job.id, authority.id] : [job.id])).rows[0]
    let project = found
    let created = false
    if (!project) {
      const label = TYPE_LABEL[job.task_type] || 'Survey'
      const metadata = {
        external_job_id: job.id, authority_code: authority.code, engagement: appointment.engagement,
        vungis: { ...job }, launched_at: new Date().toISOString(), launched_by: user.email,
      }
      const values = [`${label}${job.stand_number ? ` - Stand ${job.stand_number}` : ''}`.slice(0, 255), authority.name, label,
        job.suburb_ward || null, job.stand_number || null, job.gauss_lo ? String(job.gauss_lo) : null, JSON.stringify(metadata)]
      const row = (await db.query(shared
        ? `INSERT INTO survey_projects (name, client_name, survey_type, township, designation, central_meridian, status, metadata, authority_id, engagement, external_job_id)
           VALUES ($1, $2, $3, $4, $5, $6, 'active', $7::jsonb, $8, $9, $10) RETURNING id, name`
        : `INSERT INTO survey_projects (name, client_name, survey_type, township, designation, central_meridian, status, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, 'active', $7::jsonb) RETURNING id, name`,
        shared ? [...values, authority.id, appointment.engagement, /^[0-9a-fA-F-]{36}$/.test(String(job.id)) ? job.id : null] : values)).rows[0]
      project = row
      created = true
    }

    const token = app.jwt.sign({ sub: user.id, email: user.email })
    request.log.info({ user: user.id, authority: authority.code, job: job.id, project: project.id, created }, 'survey job launched from VunGIS')
    return reply.send({
      token, user: { id: user.id, email: user.email },
      authority: { code: authority.code, name: authority.name }, engagement: appointment.engagement,
      project: { id: project.id, name: project.name, created },
      job,
    })
  })
}
