/**
 * PATCH /api/survey-projects/:id/survey-class   { "survey_class": "B" | "C" | null }
 *
 * The surveyor declares which SI 727 survey class the project was done to (migration 101). It is a property of the survey: it sets the limits
 * of error the work is held to, and the council that receives the work needs to know it. It is never defaulted, because a wrong class silently
 * changes every verdict.
 *
 * Until the application is switched to the shared tables, a project lives in the surveyor's own schema, so the class is kept in its metadata
 * (survey.adopt_surveyor_schema() promotes it to the survey_class column). Only the surveyor who owns the project can reach it: it is looked up
 * in their schema.
 */
import { authenticateWithSchema, requireSchema } from '../utils/schemaAuth.js'

export default async function surveyClassRoutes(app) {
  app.patch('/survey-projects/:id/survey-class', {
    preHandler: [app.authenticate, authenticateWithSchema, requireSchema],
    schema: {
      body: {
        type: 'object', required: ['survey_class'], additionalProperties: false,
        properties: { survey_class: { anyOf: [{ type: 'string', enum: ['B', 'C'] }, { type: 'null' }] } },
      },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id)
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: 'bad_id' })
    const cls = request.body.survey_class
    // jsonb_set on a null metadata would give null, so start from an empty object
    const sql = cls
      ? `UPDATE survey_projects SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('survey_class', $2::text), updated_at = NOW() WHERE id = $1 RETURNING id, metadata ->> 'survey_class' AS survey_class`
      : `UPDATE survey_projects SET metadata = COALESCE(metadata, '{}'::jsonb) - 'survey_class', updated_at = NOW() WHERE id = $1 RETURNING id, NULL::text AS survey_class`
    const { rows } = await request.db.query(sql, cls ? [id, cls] : [id])
    if (!rows[0]) return reply.code(404).send({ error: 'not_found' })
    return { data: { id: rows[0].id, survey_class: rows[0].survey_class } }
  })
}
