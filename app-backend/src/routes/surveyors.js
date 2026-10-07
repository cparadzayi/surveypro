import SurveyorProfile from '../models/SurveyorProfile.js'
import { authenticateWithSchema, requireAdmin } from '../utils/schemaAuth.js'

/**
 * Surveyor profile routes.
 *
 * `surveyor_profiles` and `users` live in `public`, not in a per-surveyor
 * schema, and are populated. Every method on SurveyorProfile therefore reads
 * globally, so scoping has to be explicit here — routing through
 * authenticateWithSchema alone changes nothing.
 *
 * Reads:  admin sees the whole directory (SurveyorsView manages it); a caller
 *         without the admin role sees only their own profile plus anyone they
 *         supervise.
 * Writes: admin only. Before this, ANY authenticated caller could rewrite or
 *         DELETE any other surveyor's profile.
 */
export default async function surveyorRoutes(fastify, options) {
  const read = { preHandler: [fastify.authenticate, authenticateWithSchema] }
  const adminOnly = {
    preHandler: [fastify.authenticate, authenticateWithSchema, requireAdmin]
  }

  const isAdmin = (request) => request.surveyorProfile?.role === 'admin'
  const callerId = (request) => request.surveyorProfile?.id ?? null

  const noProfile = (reply) =>
    reply.code(403).send({
      ok: false,
      error: 'No surveyor profile',
      message: 'This operation requires a completed surveyor profile'
    })

  // Legacy response shape, kept so the frontend is unaffected.
  const format = (s) => ({
    id: s.id,
    name: s.name,
    license_number: s.license_number || s.registration_number || s.student_number,
    firm: s.firm,
    address: s.address,
    phone: s.phone,
    email: s.email,
    is_active: true,
    created_at: s.created_at,
    updated_at: s.updated_at,
    surveyor_type: s.surveyor_type,
    supervisor_name: s.supervisor_name
  })

  // Get surveyors visible to the caller
  fastify.get('/surveyors', read, async (request, reply) => {
    try {
      const me = callerId(request)
      if (!me) return noProfile(reply)

      // Admin needs the full directory to render the management view; everyone
      // else is limited to themselves and their own supervisees.
      const surveyors = isAdmin(request)
        ? await SurveyorProfile.findAll()
        : await SurveyorProfile.findVisibleTo(me)

      return { ok: true, surveyors: surveyors.map(format) }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Failed to fetch surveyors' })
    }
  })

  // Get surveyor by ID
  fastify.get('/surveyors/:id', read, async (request, reply) => {
    try {
      const me = callerId(request)
      if (!me) return noProfile(reply)

      const { id } = request.params
      const targetId = Number(id)

      if (!isAdmin(request) && targetId !== me) {
        // Non-admins may only read themselves, or a profile that names them as
        // supervisor_id. Checked with the same predicate as the list endpoint.
        const visible = await SurveyorProfile.findVisibleTo(me)
        if (!visible.some((s) => s.id === targetId)) {
          return reply.code(403).send({
            ok: false,
            error: 'Forbidden',
            message: 'You may only view your own surveyor profile'
          })
        }
      }

      const surveyor = await SurveyorProfile.findById(id)
      if (!surveyor) {
        return reply.code(404).send({ ok: false, error: 'Surveyor not found' })
      }

      return { ok: true, surveyor: format(surveyor) }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Failed to fetch surveyor' })
    }
  })

  // Create new surveyor — admin only, and still a stub.
  fastify.post('/surveyors', adminOnly, async (request, reply) => {
    try {
      const { licenseNumber } = request.body

      // Check if license number already exists (if provided)
      if (licenseNumber) {
        const existing = await SurveyorProfile.findByLicense(licenseNumber)
        if (existing) {
          return reply.code(409).send({
            ok: false,
            error: 'A surveyor with this license number already exists'
          })
        }
      }

      // This endpoint is a backwards-compatibility stub. New surveyors are
      // created by /auth/register + /surveyor-profiles.
      return reply.code(501).send({
        ok: false,
        error: 'Please use the registration flow to create new surveyors'
      })
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Failed to create surveyor' })
    }
  })

  // Update surveyor — admin only.
  fastify.put('/surveyors/:id', adminOnly, async (request, reply) => {
    try {
      const { id } = request.params
      const { name, licenseNumber, firm, address, phone } = request.body

      const surveyor = await SurveyorProfile.update(id, {
        name,
        licenseNumber,
        firm,
        address,
        phone
      })

      if (!surveyor) {
        return reply.code(404).send({ ok: false, error: 'Surveyor not found' })
      }

      return { ok: true, surveyor: format(surveyor) }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Failed to update surveyor' })
    }
  })

  // Delete surveyor — admin only.
  fastify.delete('/surveyors/:id', adminOnly, async (request, reply) => {
    try {
      const { id } = request.params

      const surveyor = await SurveyorProfile.findById(id)
      if (!surveyor) {
        return reply.code(404).send({ ok: false, error: 'Surveyor not found' })
      }

      await SurveyorProfile.delete(id)

      return { ok: true, message: 'Surveyor deleted successfully' }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Failed to delete surveyor' })
    }
  })
}