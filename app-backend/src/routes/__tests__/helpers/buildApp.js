/**
 * Builds a Fastify instance wired up the way src/server.js wires it, for tests
 * that register a route plugin directly.
 *
 * `authenticate` must exist as a decorator BEFORE the plugin registers its
 * routes: every plugin in src/routes now references `fastify.authenticate` in a
 * `preHandler`, and Fastify throws "preHandler hook should be a function" at
 * registration time if it is missing. That throw is deliberate -- if these
 * routes were ever mounted without auth wired up we want a loud boot failure,
 * not a silently open endpoint.
 */

/** A decorator that lets every request through, for tests that are not about auth. */
export function allowAll() {
  return async () => {}
}

/** A decorator that always rejects, standing in for a missing/invalid token. */
export function rejectAll() {
  return async (request, reply) => {
    reply.code(401).send({ error: 'Unauthorized' })
  }
}

/**
 * @param {object} opts
 * @param {(req:any, reply:any)=>Promise<void>} [opts.authenticate]
 */
export function buildApp(Fastify, opts = {}) {
  const app = Fastify()
  app.decorate('authenticate', opts.authenticate ?? allowAll())
  return app
}
