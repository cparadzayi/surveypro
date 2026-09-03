import { generateWorkingPlan } from '../services/workingPlan/working-plan.js'

/**
 * Working Plan DXF.
 *
 * Stateless by design: the spec arrives in the request body, already assembled
 * by the frontend from the final coordinate list and each parcel's named ring.
 * This route runs no query, so it needs no schema-isolation handling -- the
 * same arrangement as POST /api/geopdf/dxf next door.
 */
export default async function workingPlanRoutes(fastify) {
  fastify.post('/dxf', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const spec = request.body

    if (!spec || !Array.isArray(spec.beacons) || !Array.isArray(spec.parcels)) {
      return reply.code(400).send({
        error: 'Invalid working plan spec',
        message: 'spec.beacons and spec.parcels must both be arrays',
      })
    }

    try {
      const out = generateWorkingPlan(spec)
      return reply
        .type('application/dxf')
        .header('Content-Disposition', `attachment; filename="working-plan-${Date.now()}.dxf"`)
        .header('X-Plan-Scale', String(out.scale))
        .header('X-Plan-Grid', JSON.stringify(out.gridInterval))
        .header('X-Plan-Areas', JSON.stringify(out.areas))
        .send(Buffer.from(out.dxf, 'utf8'))
    } catch (error) {
      // The generator raises exactly one caller-fixable error: a ring naming a
      // beacon that is not in the beacon list. Keep the beacon's name intact so
      // the surveyor knows which point to correct.
      if (/unknown beacon/.test(error.message)) {
        return reply.code(400).send({ error: 'Unknown beacon', message: error.message })
      }
      fastify.log.error('[WorkingPlan] DXF generation failed:', error)
      return reply.code(500).send({
        error: 'Working plan generation failed',
        message: error.message,
      })
    }
  })
}
