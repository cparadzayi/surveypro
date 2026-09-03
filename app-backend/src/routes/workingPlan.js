import { generateWorkingPlan } from '../services/workingPlan/working-plan.js'

const VALID_SYMBOLS = new Set(['peg', 'rm', 'trig'])

/**
 * The route is the trust boundary: the design deliberately lets the caller
 * post a whole spec, so it is this validation -- not the frontend adapter --
 * that must establish what the generator assumes. Left unchecked: an empty
 * beacons/parcels array still renders a 200 full of NaN tokens, a ring under
 * 3 names crashes with an unreadable "Cannot read properties of undefined",
 * a missing title crashes the same way, and an unrecognised symbol draws a
 * block reference to `undefined` rather than failing.
 *
 * Returns a message string describing the problem, or null if the spec is
 * fit to hand to the generator.
 */
function validateWorkingPlanSpec(spec) {
  if (!spec || typeof spec !== 'object') return 'spec must be an object'

  if (!Array.isArray(spec.beacons) || spec.beacons.length === 0) {
    return 'spec.beacons must be a non-empty array'
  }
  if (!Array.isArray(spec.parcels) || spec.parcels.length === 0) {
    return 'spec.parcels must be a non-empty array'
  }
  if (!Array.isArray(spec.title)) {
    return 'spec.title must be an array'
  }

  for (const p of spec.parcels) {
    const ring = p?.ring
    const ringOk = Array.isArray(ring) && ring.length >= 3 &&
      ring.every((n) => typeof n === 'string' && n.trim() !== '')
    if (!ringOk) {
      const label = p?.label ? `"${p.label}"` : '(unlabelled)'
      return `parcel ${label}: ring must be an array of at least 3 named beacons`
    }
  }

  for (const b of spec.beacons) {
    if (b && b.symbol !== undefined && !VALID_SYMBOLS.has(b.symbol)) {
      const name = b?.name ? `"${b.name}"` : '(unnamed)'
      return `beacon ${name}: symbol "${b.symbol}" is invalid -- must be peg, rm or trig`
    }
  }

  return null
}

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

    const problem = validateWorkingPlanSpec(spec)
    if (problem) {
      return reply.code(400).send({ error: 'Invalid working plan spec', message: problem })
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
      // error may not be a real Error (a thrown string/object leaves .message
      // undefined), which would silently miss the regex below and send a 500
      // body with message: undefined -- coerce first so that can't happen.
      const message = String(error?.message ?? error)
      // The generator raises exactly one caller-fixable error: a ring naming a
      // beacon that is not in the beacon list. Keep the beacon's name intact so
      // the surveyor knows which point to correct.
      if (/unknown beacon/.test(message)) {
        return reply.code(400).send({ error: 'Unknown beacon', message })
      }
      fastify.log.error('[WorkingPlan] DXF generation failed:', error)
      return reply.code(500).send({
        error: 'Working plan generation failed',
        message,
      })
    }
  })
}
