import User from '../models/user.js'
import SurveyorProfile from '../models/SurveyorProfile.js'
import { getSurveyorPool } from '../config/db.js'
import { sharedDb, surveyStore } from '../config/sharedDb.js'

// The handle a request uses for survey data: the shared tables, as the signed-in person (SURVEY_STORE=shared), or the surveyor's own schema.
const dbFor = (profile, userId) => surveyStore() === 'shared'
  ? sharedDb({ userId, platform: profile.role === 'admin' })
  : getSurveyorPool(profile.schema_name)

/**
 * Authentication decorator that adds schema context to requests
 * This should be used AFTER app.authenticate for routes that need schema isolation
 */
export async function authenticateWithSchema(request, reply) {
  try {
    // First verify JWT token (should be done by app.authenticate before this)
    if (!request.user || !request.user.email) {
      console.error('[Schema Auth] ❌ No user in request')
      return reply.code(401).send({ error: 'Unauthorized - no user in request' })
    }

    // Get user from database
    const user = await User.findByEmail(request.user.email)
    if (!user) {
      console.error(`[Schema Auth] ❌ User not found: ${request.user.email}`)
      return reply.code(401).send({ error: 'User not found' })
    }

    // Get surveyor profile
    const profile = await SurveyorProfile.findByUserId(user.id)
    if (!profile) {
      console.log('[Schema Auth] ⚠️ No surveyor profile - using public schema')
      request.surveyorSchema = null
      request.surveyorProfile = null
      request.db = null
      return
    }

    // Check if surveyor has a schema (the shared store does not need one)
    if (!profile.schema_name && surveyStore() !== 'shared') {
      console.warn(`[Schema Auth] ⚠️ ${profile.name} has no schema - using public`)
      request.surveyorSchema = 'public'
      request.surveyorProfile = profile
      request.db = null
      return
    }

    // Attach schema context to request
    request.surveyorSchema = profile.schema_name
    request.surveyorProfile = profile
    request.db = dbFor(profile, user.id)

    // Also attach for convenience
    request.user.profileId = profile.id
    request.user.schemaName = profile.schema_name

  } catch (error) {
    console.error('[Schema Auth] ❌ EXCEPTION:', error.message)
    request.log.error('Schema authentication error:', error)
    return reply.code(500).send({ error: 'Authentication error', details: error.message, stack: error.stack })
  }
}

/**
 * Optional decorator - doesn't fail if no schema, just adds context if available
 */
export async function attachSchemaIfAvailable(request, reply) {
  try {
    if (!request.user || !request.user.email) {
      return // No user, skip
    }

    const user = await User.findByEmail(request.user.email)
    if (!user) return

    const profile = await SurveyorProfile.findByUserId(user.id)
    if (!profile || (!profile.schema_name && surveyStore() !== 'shared')) return

    // Attach schema context
    request.surveyorSchema = profile.schema_name
    request.surveyorProfile = profile
    request.db = dbFor(profile, user.id)
    request.user.profileId = profile.id
    request.user.schemaName = profile.schema_name

  } catch (error) {
    request.log.error('Optional schema attachment error:', error)
    // Don't fail the request
  }
}

/**
 * Helper to check if request has schema context
 *
 * MUST stay `async`. Fastify 5 (lib/hooks.js) advances a hook chain only when
 * the hook returns a thenable:
 *
 *     const result = iterator(functions[i++], request, reply, next)
 *     if (result && typeof result.then === 'function') { result.then(...) }
 *
 * A synchronous hook that falls off the end returns undefined, so next() is
 * never called and the request hangs until the client gives up. There is no
 * error and no server-side timeout -- it just never responds.
 *
 * The failure mode is deceptive: this hook's DENY path calls reply.send(),
 * which finishes the response without needing next(), so every deny-path test
 * passed while every allow-path request hung. Do not make this sync, and do not
 * "simplify" it by adding an explicit `return` instead -- that still returns
 * undefined.
 */
export async function requireSchema(request, reply) {
  if (!request.db || (!request.surveyorSchema && surveyStore() !== 'shared')) {
    return reply.code(400).send({ 
      error: 'Schema context required',
      message: 'This operation requires a surveyor profile with schema'
    })
  }
}

/**
 * Fail closed unless the caller holds the 'admin' role.
 *
 * Must run AFTER authenticateWithSchema, which resolves
 * `request.surveyorProfile` to the caller's full surveyor_profiles row (a
 * `SELECT p.*`, so it carries `role` from migration 094).
 *
 * A caller with no surveyor profile has `surveyorProfile === null` and is
 * rejected here, rather than falling through to a handler that would then use
 * the unscoped global pool.
 *
 * MUST stay `async` -- see requireSchema above. A sync hook that returns
 * undefined never advances the chain in Fastify 5 and the request hangs; the
 * deny paths here only appear to work because reply.send() finishes the
 * response without needing next().
 */
export async function requireAdmin(request, reply) {
  const role = request.surveyorProfile?.role

  if (!role) {
    return reply.code(403).send({
      error: 'No surveyor profile',
      message: 'This operation requires a completed surveyor profile'
    })
  }

  if (role !== 'admin') {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'This operation requires the admin role'
    })
  }
}
