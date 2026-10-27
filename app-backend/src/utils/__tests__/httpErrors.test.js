import { describe, test, expect, afterEach } from '@jest/globals'
import Fastify from 'fastify'
import { BODY_LIMIT_BYTES, describeError, installErrorHandling, stripInternals } from '../httpErrors.js'

describe('stripInternals', () => {
  test('removes stack, stderr and stdout at any depth, keeps the rest', () => {
    const out = stripInternals({ ok: false, error: 'x', stack: 's', errors: [{ stand: '1', stack: 's', stderr: 'e' }], deep: { stdout: 'o', keep: 1 } })
    expect(out).toEqual({ ok: false, error: 'x', errors: [{ stand: '1' }], deep: { keep: 1 } })
  })
  test('leaves buffers, strings and null alone', () => {
    const b = Buffer.from('pdf')
    expect(stripInternals(b)).toBe(b)
    expect(stripInternals('stack')).toBe('stack')
    expect(stripInternals(null)).toBeNull()
  })
})

describe('describeError', () => {
  test.each([
    [{ code: 'FST_ERR_CTP_BODY_TOO_LARGE', statusCode: 413 }, 413],
    [{ code: 'FST_ERR_CTP_INVALID_JSON_BODY', statusCode: 400 }, 400],
    [{ code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE', statusCode: 415 }, 415],
    [{ code: '22P02', message: 'invalid input syntax for type integer: "abc"' }, 400],
    [{ code: '22003' }, 400],
    [{ code: '23505' }, 409],
    [{ statusCode: 404, message: 'nope' }, 404],
    [{ message: 'boom' }, 500],
  ])('%j -> %i', (error, status) => {
    expect(describeError(error).status).toBe(status)
  })

  test('a 400 from the database does not repeat the database text', () => {
    expect(JSON.stringify(describeError({ code: '22P02', message: 'invalid input syntax for type integer: "abc"' }).body)).not.toMatch(/invalid input syntax|integer/)
  })

  test('the 413 message names the limit in MB', () => {
    expect(describeError({ code: 'FST_ERR_CTP_BODY_TOO_LARGE' }).body.message).toContain(`${BODY_LIMIT_BYTES / 1024 / 1024} MB`)
  })
})

describe('installErrorHandling on a live app', () => {
  let app
  afterEach(async () => { await app?.close() })

  function build() {
    app = Fastify({ logger: false, bodyLimit: 1024 })
    installErrorHandling(app)
    app.post('/echo', async (req) => ({ got: req.body }))
    app.get('/pg/:id', async () => { const e = new Error('invalid input syntax for type integer: "abc"'); e.code = '22P02'; throw e })
    app.get('/boom', async () => { throw new Error('secret database detail at C:\\app\\x.js') })
    app.get('/leaky', async (req, reply) => reply.code(500).send({ ok: false, error: 'Failed', stack: 'at Object.<anonymous> (C:\\app\\x.js:1:1)', stderr: 'ERROR 1' }))
    app.get('/fine', async () => ({ ok: true, stack: 'a field a successful response may legitimately carry' }))
    return app
  }

  test('a body over the limit is a 413 that says so, not a 500', async () => {
    const r = await build().inject({ method: 'POST', url: '/echo', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ x: 'y'.repeat(2000) }) })
    expect(r.statusCode).toBe(413)
    expect(r.json().error).toBe('Payload Too Large')
  })

  test('truncated JSON is a 400', async () => {
    const r = await build().inject({ method: 'POST', url: '/echo', headers: { 'content-type': 'application/json' }, payload: '{"name":' })
    expect(r.statusCode).toBe(400)
    expect(r.json().message).toMatch(/not valid JSON/)
  })

  test('a Postgres "wrong format" error is a 400 without the database text', async () => {
    const r = await build().inject({ method: 'GET', url: '/pg/abc' })
    expect(r.statusCode).toBe(400)
    expect(r.body).not.toMatch(/invalid input syntax/)
  })

  test('an unexpected error is a bare 500 in production and carries no path or stack', async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const r = await build().inject({ method: 'GET', url: '/boom' })
      expect(r.statusCode).toBe(500)
      expect(r.body).not.toMatch(/secret|C:\\|\.js/)
    } finally { process.env.NODE_ENV = prev }
  })

  test('a route that builds its own error body cannot leak stack or stderr', async () => {
    const r = await build().inject({ method: 'GET', url: '/leaky' })
    expect(r.statusCode).toBe(500)
    expect(r.json()).toEqual({ ok: false, error: 'Failed' })
  })

  test('successful responses are left alone', async () => {
    const r = await build().inject({ method: 'GET', url: '/fine' })
    expect(r.json().stack).toMatch(/legitimately/)
  })
})
