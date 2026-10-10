/**
 * What the register already holds around the surveyor's work.
 *
 *   POST /api/survey-projects/:id/context    { authority_code?, buffer_m? }
 *
 * Works out where the project is (the extent of its points and parcels in their survey belt, or, for a project opened from a council's job and not
 * yet surveyed, the job's location) and asks VunGIS for the register's parcels there: farms, stands the Surveyor-General has approved, stands the
 * council has surveyed. Public facts only, in the Cape / Lo belt the surveyor works in (westing X, southing Y), each with how far to trust it.
 * Read-only on both sides; advisory; nothing here depends on it.
 *
 * SurveyPro vouches for the person: the project must be theirs and they must be appointed to the council it is for (a surveyor or head surveyor).
 * services/vungisClient.js signs the request. docs/HARMONIZATION-SCOPE.md (VunGIS repository), piece A2.
 */
import pool from '../config/db.js'
import { isRefusal } from '../config/requestDb.js'
import { surveyStore } from '../config/sharedDb.js'
import SurveyorProfile from '../models/SurveyorProfile.js'
import { authenticateWithSchema, requireSchema } from '../utils/schemaAuth.js'
import { contextParcels, RegisterCheckError } from '../services/vungisClient.js'

const LO_SRIDS = [22285, 22287, 22289, 22291, 22293]
const JOB_RADIUS_M = 400

export default async function registerContextRoutes(app) {
  app.post('/survey-projects/:id/context', {
    preHandler: [app.authenticate, authenticateWithSchema, requireSchema],
    schema: { body: { type: 'object', additionalProperties: false, properties: { authority_code: { type: ['string', 'null'], maxLength: 32 }, buffer_m: { type: 'number', minimum: 0, maximum: 1000 } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id)
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: 'bad_id' })
    try {
      const shared = surveyStore() === 'shared'
      const project = (await request.db.query(shared
        ? 'SELECT sp.central_meridian, sp.metadata, a.code AS authority_code FROM survey_projects sp LEFT JOIN survey.authority a ON a.id = sp.authority_id WHERE sp.id = $1'
        : "SELECT central_meridian, metadata, metadata ->> 'authority_code' AS authority_code FROM survey_projects WHERE id = $1", [id])).rows[0]
      if (!project) return reply.code(404).send({ error: 'not_found' })

      const userId = Number(request.user.sub)
      const code = project.authority_code || request.body?.authority_code
      if (!code) return reply.code(422).send({ error: 'authority_required', message: 'Say which council this survey is for.' })
      const appointed = (await pool.query('SELECT 1 FROM survey.active_appointment($1, $2, $3::text[])', [userId, code, ['surveyor', 'head_surveyor']])).rowCount > 0
      if (!appointed) return reply.code(403).send({ error: 'not_appointed', message: 'You are not appointed to that council today.' })

      // where the work is: the belt most of its geometry is in, and the box around it
      const ext = (await request.db.query(
        `SELECT srid, ST_XMin(e) AS w1, ST_YMin(e) AS s1, ST_XMax(e) AS w2, ST_YMax(e) AS s2
           FROM (SELECT srid, ST_Extent(geom) AS e, count(*) AS n
                   FROM (SELECT ST_SRID(geom) AS srid, geom FROM coordinate_points WHERE project_id = $1 AND geom IS NOT NULL
                         UNION ALL SELECT ST_SRID(geom), geom FROM land_parcels WHERE project_id = $1 AND geom IS NOT NULL) g
                  WHERE srid = ANY($2::int[]) GROUP BY srid) z
          ORDER BY n DESC LIMIT 1`, [id, LO_SRIDS])).rows[0]

      let query
      if (ext) {
        query = { authority_code: code, lo_zone: ext.srid - 22260, area: { bbox: [ext.w1, ext.s1, ext.w2, ext.s2].map(Number) } }
      } else {
        // nothing surveyed yet: a project opened from a council's job knows where the job is
        const loc = project.metadata?.vungis?.location || project.metadata?.vungis?.job?.location
        const zone = Number(project.central_meridian) || Number(project.metadata?.vungis?.gauss_lo)
        if (!loc || !Number.isFinite(Number(loc.lon)) || !Number.isFinite(Number(loc.lat)) || ![25, 27, 29, 31, 33].includes(zone)) {
          return reply.code(422).send({ error: 'no_location', message: 'There is nothing to place yet. Import the survey points first, or open the job from the council.' })
        }
        query = { authority_code: code, lo_zone: zone, area: { center: { lon: Number(loc.lon), lat: Number(loc.lat) }, radius_m: JOB_RADIUS_M } }
      }
      if (request.body?.buffer_m != null) query.buffer_m = request.body.buffer_m

      const answer = await contextParcels(query, { email: request.user.email })
      return { data: answer }
    } catch (err) {
      if (err instanceof RegisterCheckError) return reply.code(err.status).send({ error: err.code, message: err.message })
      if (isRefusal(err)) return reply.code(403).send({ error: 'not_allowed', message: 'You may not do that.' })
      throw err
    }
  })
}
