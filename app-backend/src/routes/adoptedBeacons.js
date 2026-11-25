import { authenticateWithSchema, requireSchema } from '../utils/schemaAuth.js'
import { isRowId } from '../utils/requestChecks.js'
import { normalizeBeaconName } from '../../../app-shared/beaconName.js'

/**
 * Adopted beacons: coordinates carried forward from a previous approved survey
 * and cited by that survey's record number (e.g. 112/2021).
 *
 * These beacons are never visited in the field, so they are NOT part of
 * coordinate_points -- a CSV re-import (csvImports analyze/execute-merge)
 * deletes and re-inserts that table wholesale, and a merge would swallow or
 * orphan carried-forward rows. They live in their own per-schema table,
 * exactly as project_control_points keeps the national trig selection
 * independent of the imported observations.
 *
 * The batch import is REPLACE-ALL per project: the surveyor's uploaded file
 * is the complete adopted set for the record, so an edited re-upload must be
 * able to drop rows. Half-updates would leave a beacon on the Co-ordinate
 * List that nobody intended to adopt.
 */
export default async function adoptedBeaconRoutes(app) {
  // List adopted beacons for a project, in display order
  app.get('/adopted-beacons', {
    preHandler: [app.authenticate, authenticateWithSchema, requireSchema],
    schema: {
      querystring: {
        type: 'object',
        required: ['project_id'],
        properties: {
          project_id: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { project_id } = request.query
    const db = request.db
    const result = await db.query(
      `SELECT id, project_id, sr_number, point_name, y, x, status, description,
              survey_date, point_order, created_at
         FROM project_adopted_beacons
        WHERE project_id = $1
        ORDER BY point_order, id`,
      [project_id]
    )
    return { ok: true, data: result.rows }
  })

  // Reclassify one live observation as an adopted beacon.
  //
  // Parcel Digitization & Areas used to have no way to do this: the point had to
  // be taken back to Import CSV and removed by a whole-file replace. This route
  // is the single-point equivalent of that correction. It reads the coordinates,
  // status and description from the live point (so the surveyor only supplies
  // the source record citation), and a data-modifying CTE makes the delete and
  // insert one atomic statement: a duplicate adopted name rolls the delete
  // back instead of orphaning the observation.
  app.post('/adopted-beacons/adopt', {
    preHandler: [app.authenticate, authenticateWithSchema, requireSchema]
  }, async (request, reply) => {
    const body = request.body || {}
    const { project_id, sr_number, survey_date } = body

    if (!isRowId(project_id)) {
      return reply.code(400).send({ ok: false, error: 'A valid project_id is required' })
    }

    const pointName = normalizeBeaconName(String(body.point_name ?? '').trim())
    if (!pointName) {
      return reply.code(400).send({ ok: false, error: 'point_name is required' })
    }
    if (pointName.length > 50) {
      return reply.code(400).send({ ok: false, error: 'point_name must be 50 characters or fewer' })
    }

    const recordNumber = String(sr_number ?? '').trim()
    if (!recordNumber) {
      return reply.code(400).send({ ok: false, error: 'sr_number is required' })
    }
    if (recordNumber.length > 20) {
      return reply.code(400).send({ ok: false, error: 'sr_number must be 20 characters or fewer' })
    }

    // Adopted survey dates are citations ("February-21"), not field
    // observations, so they stay verbatim like the CSV import stores them.
    const sourceDate = survey_date == null ? null : String(survey_date).trim()
    if (sourceDate && sourceDate.length > 30) {
      return reply.code(400).send({ ok: false, error: 'survey_date must be 30 characters or fewer' })
    }

    try {
      const result = await request.db.query(
        `WITH removed AS (
           DELETE FROM coordinate_points
            WHERE project_id = $1 AND name = $2 AND geom IS NOT NULL
            RETURNING name, ST_X(geom) AS y, ST_Y(geom) AS x, status, description
         ), next_order AS (
           SELECT COALESCE(MAX(point_order), 0) + 1 AS point_order
             FROM project_adopted_beacons
            WHERE project_id = $1
         )
         INSERT INTO project_adopted_beacons
           (project_id, sr_number, point_name, y, x, status, description, survey_date, point_order)
         SELECT $1, $3, name, y, x, status, description, $4, point_order
           FROM removed CROSS JOIN next_order
         RETURNING id, project_id, sr_number, point_name, y, x, status, description,
                   survey_date, point_order`,
        [project_id, pointName, recordNumber, sourceDate || null]
      )

      if (result.rowCount === 0) {
        const existing = await request.db.query(
          'SELECT id FROM coordinate_points WHERE project_id = $1 AND name = $2',
          [project_id, pointName]
        )
        if (existing.rowCount > 0) {
          return reply.code(409).send({
            ok: false,
            error: 'This point has no stored coordinates. Repair its geometry before adopting it.',
          })
        }
        return reply.code(404).send({ ok: false, error: 'Coordinate point not found' })
      }

      return { ok: true, data: result.rows[0], adopted: result.rows[0] }
    } catch (error) {
      if (error?.code === '23505') {
        return reply.code(409).send({
          ok: false,
          error: 'A beacon with this name is already adopted for this survey. Edit that adopted beacon instead.',
        })
      }
      console.error('[Adopted Beacons] Single-point adoption failed:', error.message)
      return reply.code(500).send({ ok: false, error: error.message })
    }
  })

  // Replace the project's adopted beacons with the uploaded set
  app.post('/adopted-beacons/batch', {
    preHandler: [app.authenticate, authenticateWithSchema, requireSchema]
  }, async (request, reply) => {
    const { project_id, points } = request.body || {}

    if (!project_id || !Array.isArray(points)) {
      return reply.code(400).send({ ok: false, error: 'project_id and points array are required' })
    }

    for (const [index, point] of points.entries()) {
      if (!point.sr_number || String(point.sr_number).trim() === '') {
        return reply.code(400).send({ ok: false, error: `Point ${index + 1}: sr_number is required` })
      }
      if (!point.point_name || String(point.point_name).trim() === '') {
        return reply.code(400).send({ ok: false, error: `Point ${index + 1}: point_name is required` })
      }
      if (typeof point.y !== 'number' || typeof point.x !== 'number' ||
          !Number.isFinite(point.y) || !Number.isFinite(point.x)) {
        return reply.code(400).send({ ok: false, error: `Point ${index + 1}: y and x must be numeric` })
      }
    }

    const db = request.db
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        'DELETE FROM project_adopted_beacons WHERE project_id = $1',
        [project_id]
      )

      const inserted = []
      for (const [index, point] of points.entries()) {
        const result = await client.query(
          `INSERT INTO project_adopted_beacons
             (project_id, sr_number, point_name, y, x, status, description, survey_date, point_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, project_id, sr_number, point_name, y, x, status, description,
                     survey_date, point_order`,
          [
            project_id,
            String(point.sr_number).trim(),
            String(point.point_name).trim(),
            point.y,
            point.x,
            point.status ?? null,
            point.description ?? null,
            point.survey_date ?? null,
            index + 1
          ]
        )
        inserted.push(result.rows[0])
      }
      await client.query('COMMIT')
      return { ok: true, data: inserted, count: inserted.length }
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('[Adopted Beacons] Batch import failed:', error.message)
      return reply.code(500).send({ ok: false, error: error.message })
    } finally {
      client.release()
    }
  })

  // Clear a project's adopted beacons
  app.delete('/adopted-beacons', {
    preHandler: [app.authenticate, authenticateWithSchema, requireSchema],
    schema: {
      querystring: {
        type: 'object',
        required: ['project_id'],
        properties: {
          project_id: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { project_id } = request.query
    const db = request.db
    const result = await db.query(
      'DELETE FROM project_adopted_beacons WHERE project_id = $1 RETURNING id',
      [project_id]
    )
    return { ok: true, deleted: result.rowCount }
  })
}
