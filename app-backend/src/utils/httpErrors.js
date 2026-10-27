/**
 * One place that decides what a client is told when a request fails.
 *
 * Before this, anything that was not a schema-validation error came back as a bare 500 — an
 * oversized body, truncated JSON, a non-numeric id that Postgres rejected — so a caller could not
 * tell "you sent something wrong" from "the server broke". Several routes also put `error.stack`,
 * `stderr` and `stdout` in the body. Both are handled here.
 */

/** Largest JSON body accepted. Plans and 20,000-point imports fit; the old 1 MB default did not. */
export const BODY_LIMIT_BYTES = 25 * 1024 * 1024

/** Keys that may help a developer and must never reach a client. */
const INTERNAL_KEYS = new Set(['stack', 'stderr', 'stdout'])

/**
 * A copy of `payload` without internal diagnostics, at any depth up to `maxDepth`.
 * Anything that is not a plain object/array (Buffer, stream, string) is returned as it came.
 */
export function stripInternals(payload, maxDepth = 6) {
  if (maxDepth < 0 || payload === null || typeof payload !== 'object') return payload
  if (Buffer.isBuffer(payload) || typeof payload.pipe === 'function') return payload
  if (Array.isArray(payload)) return payload.map((v) => stripInternals(v, maxDepth - 1))
  const out = {}
  for (const [k, v] of Object.entries(payload)) {
    if (INTERNAL_KEYS.has(k)) continue
    out[k] = stripInternals(v, maxDepth - 1)
  }
  return out
}

const MB = 1024 * 1024

/** @returns {{status:number, body:object}} what to send for `error`. */
export function describeError(error) {
  if (error?.validation) {
    return { status: 400, body: { error: 'Validation Failed', messages: error.validation } }
  }
  if (error?.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || error?.statusCode === 413) {
    return {
      status: 413,
      body: {
        error: 'Payload Too Large',
        message: `The request is larger than the ${Math.round(BODY_LIMIT_BYTES / MB)} MB limit. Split it into smaller batches.`,
      },
    }
  }
  if (error?.code === 'FST_ERR_CTP_INVALID_JSON_BODY' || error?.code === 'FST_ERR_CTP_EMPTY_JSON_BODY') {
    return { status: 400, body: { error: 'Bad Request', message: 'The request body is not valid JSON.' } }
  }
  if (error?.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' || error?.statusCode === 415) {
    return { status: 415, body: { error: 'Unsupported Media Type', message: 'Send the body as application/json.' } }
  }
  // Postgres: the caller's value was the wrong shape or size, not a server fault.
  if (error?.code === '22P02' || error?.code === '22003' || error?.code === '22007' || error?.code === '22023') {
    return { status: 400, body: { error: 'Bad Request', message: 'A value in the request has the wrong format.' } }
  }
  if (error?.code === '23505') {
    return { status: 409, body: { error: 'Conflict', message: 'Resource already exists' } }
  }
  const status = Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500
  if (status !== 500) return { status, body: { error: error.name || 'Bad Request', message: error.message } }
  return {
    status: 500,
    body: {
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? 'An error occurred' : error?.message,
    },
  }
}

/** Installs the error handler and the response scrubber on `app`. */
export function installErrorHandling(app) {
  app.setErrorHandler((error, request, reply) => {
    const { status, body } = describeError(error)
    if (status >= 500) app.log.error(error)
    else app.log.warn({ code: error?.code, status }, error?.message)
    return reply.code(status).send(body)
  })
  // Defence in depth: a route that builds its own 4xx/5xx body cannot leak diagnostics either.
  app.addHook('preSerialization', async (request, reply, payload) =>
    reply.statusCode >= 400 ? stripInternals(payload) : payload)
}
