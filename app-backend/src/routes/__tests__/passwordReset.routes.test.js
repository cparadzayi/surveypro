import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import Fastify from 'fastify'
import { installErrorHandling } from '../../utils/httpErrors.js'

// Password reset by an administrator-issued link: who may issue one, and what the public endpoint says.
const query = jest.fn()
const client = { query: jest.fn(), release: jest.fn() }
const mockProfile = { findById: jest.fn(), findByUserId: jest.fn() }
const mockUser = { findByEmail: jest.fn(), verifyPassword: jest.fn(), create: jest.fn() }
let role = 'admin'

jest.unstable_mockModule('../../config/db.js', () => ({ default: { query, connect: async () => client }, createSurveyorSchema: jest.fn() }))
jest.unstable_mockModule('../../models/SurveyorProfile.js', () => ({ default: mockProfile }))
jest.unstable_mockModule('../../models/user.js', () => ({ default: mockUser }))
jest.unstable_mockModule('../../utils/schemaAuth.js', () => ({
  authenticateWithSchema: async (request) => { request.surveyorProfile = { id: 3, role } },
  requireSchema: async () => {},
  requireAdmin: async (request, reply) => {
    if (request.surveyorProfile?.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
  },
}))

const { default: surveyorRoutes } = await import('../surveyors.js')
const { default: authRoutes } = await import('../auth.js')
const { newToken, hashToken } = await import('../../utils/passwordReset.js')
const { loginThrottle } = await import('../../utils/loginThrottle.js')

function build(plugin) {
  const app = Fastify({ logger: false })
  installErrorHandling(app)
  app.decorate('authenticate', async (request) => { request.user = { sub: 1, email: 'admin@x.test' } })
  app.register(plugin)
  return app
}

beforeEach(() => {
  query.mockReset(); client.query.mockReset(); client.release.mockReset()
  mockProfile.findById.mockReset(); role = 'admin'
  query.mockResolvedValue({ rows: [] })
})

describe('POST /surveyors/:id/password-reset', () => {
  test('an admin gets a link, shown once, with no cache and the hash (not the token) stored', async () => {
    mockProfile.findById.mockResolvedValue({ id: 9, user_id: 42, name: 'Ndlovu' })
    const r = await build(surveyorRoutes).inject({ method: 'POST', url: '/surveyors/9/password-reset' })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(body.resetPath).toBe(`/reset-password?token=${body.token}`)
    expect(r.headers['cache-control']).toBe('no-store')
    const insert = query.mock.calls.find((c) => /INSERT INTO password_reset_tokens/.test(c[0]))
    expect(insert[1][0]).toBe(42)
    expect(insert[1][1]).toBe(hashToken(body.token))
    expect(insert[1]).not.toContain(body.token)
  })

  test('anyone who is not an admin is refused and no link is made', async () => {
    role = 'surveyor'
    mockProfile.findById.mockResolvedValue({ id: 9, user_id: 42 })
    const r = await build(surveyorRoutes).inject({ method: 'POST', url: '/surveyors/9/password-reset' })
    expect(r.statusCode).toBe(403)
    expect(query).not.toHaveBeenCalled()
  })

  test('an unknown surveyor is 404, a bad id is 400, a profile with no account is 409', async () => {
    const app = build(surveyorRoutes)
    mockProfile.findById.mockResolvedValue(undefined)
    expect((await app.inject({ method: 'POST', url: '/surveyors/9/password-reset' })).statusCode).toBe(404)
    expect((await app.inject({ method: 'POST', url: '/surveyors/abc/password-reset' })).statusCode).toBe(400)
    mockProfile.findById.mockResolvedValue({ id: 9, user_id: null })
    expect((await app.inject({ method: 'POST', url: '/surveyors/9/password-reset' })).statusCode).toBe(409)
  })
})

describe('POST /auth/password-reset (public)', () => {
  const post = (app, body) => app.inject({ method: 'POST', url: '/auth/password-reset', payload: body, remoteAddress: '10.0.0.' + Math.floor(Math.random() * 200) })
  const goodRow = () => client.query.mockImplementation(async (sql) => (/^\s*SELECT t\.id/.test(sql) ? { rows: [{ id: 1, user_id: 42, email: 'a@x.test' }] } : { rows: [] }))
  const badRow = () => client.query.mockImplementation(async () => ({ rows: [] }))

  test('a valid link sets the password and answers ok, and the account is no longer locked out', async () => {
    goodRow()
    for (let i = 0; i < loginThrottle.perAccount; i++) loginThrottle.recordFailure('a@x.test', '1.2.3.4')
    expect(loginThrottle.retryAfterSeconds('a@x.test', '9.9.9.9')).toBeGreaterThan(0)
    const r = await post(build(authRoutes), { token: newToken(), password: 'brand-new-1' })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ ok: true })
    expect(r.headers['cache-control']).toBe('no-store')
    expect(loginThrottle.retryAfterSeconds('a@x.test', '9.9.9.9')).toBe(0)
  })

  test('a bad, used or expired link is one plain 400 that does not say which', async () => {
    badRow()
    const r = await post(build(authRoutes), { token: newToken(), password: 'brand-new-1' })
    expect(r.statusCode).toBe(400)
    expect(r.json().message).toMatch(/invalid or has expired/)
  })

  test('a password that is too short is refused by validation before the link is looked at', async () => {
    const r = await post(build(authRoutes), { token: newToken(), password: '123' })
    expect(r.statusCode).toBe(400)
    expect(client.query).not.toHaveBeenCalled()
  })

  test('an address that keeps sending bad links is told to stop', async () => {
    badRow()
    const app = build(authRoutes)
    const send = () => app.inject({ method: 'POST', url: '/auth/password-reset', payload: { token: newToken(), password: 'brand-new-1' }, remoteAddress: '10.9.9.9' })
    const codes = []
    for (let i = 0; i < 12; i++) codes.push((await send()).statusCode)
    expect(codes.slice(0, 10).every((c) => c === 400)).toBe(true)
    expect(codes.slice(10)).toEqual([429, 429])
  })
})
