import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import Fastify from 'fastify'

// POST /surveyors: an administrator adds a surveyor and is given a one-time set-password link.
const query = jest.fn()
const createSurveyorSchema = jest.fn()
const mockProfile = { findById: jest.fn(), findByUserId: jest.fn(), findByLicense: jest.fn(), create: jest.fn(), updateSchemaName: jest.fn(), delete: jest.fn() }
const mockUser = { findByEmail: jest.fn(), create: jest.fn() }
let role = 'admin'

jest.unstable_mockModule('../../config/db.js', () => ({ default: { query }, createSurveyorSchema }))
jest.unstable_mockModule('../../models/SurveyorProfile.js', () => ({ default: mockProfile }))
jest.unstable_mockModule('../../models/user.js', () => ({ default: mockUser }))
jest.unstable_mockModule('../../utils/schemaAuth.js', () => ({
  authenticateWithSchema: async (request) => { request.surveyorProfile = { id: 3, role } },
  requireAdmin: async (request, reply) => {
    if (request.surveyorProfile?.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
  },
}))

const { default: surveyorRoutes } = await import('../surveyors.js')
const { hashToken } = await import('../../utils/passwordReset.js')

function build() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async (request) => { request.user = { sub: 1, email: 'admin@x.test' } })
  app.register(surveyorRoutes)
  return app
}
const post = (payload) => build().inject({ method: 'POST', url: '/surveyors', payload })
const body = { name: 'T. Ndlovu', email: 'tndlovu@example.com', licenseNumber: 'LS-1', firm: 'Ndlovu Surveys', phone: '+263 1' }

beforeEach(() => {
  query.mockReset(); createSurveyorSchema.mockReset()
  for (const m of [...Object.values(mockProfile), ...Object.values(mockUser)]) m.mockReset()
  role = 'admin'
  query.mockResolvedValue({ rows: [] })
  mockUser.findByEmail.mockResolvedValue(undefined)
  mockUser.create.mockResolvedValue({ id: 42, email: body.email })
  mockProfile.findByLicense.mockResolvedValue(undefined)
  mockProfile.create.mockResolvedValue({ id: 7, name: body.name, surveyor_type: 'registered', license_number: 'LS-1', firm: 'Ndlovu Surveys', phone: '+263 1' })
  mockProfile.updateSchemaName.mockResolvedValue({ id: 7, name: body.name, surveyor_type: 'registered', license_number: 'LS-1', firm: 'Ndlovu Surveys', phone: '+263 1', schema_name: 'surveyor_tndlovu' })
  createSurveyorSchema.mockResolvedValue('surveyor_tndlovu')
})

describe('POST /surveyors', () => {
  test('an admin adds a surveyor and is handed a link that is shown once, uncached, with only its hash stored', async () => {
    const r = await post(body)
    expect(r.statusCode).toBe(201)
    expect(r.headers['cache-control']).toBe('no-store')
    const out = r.json()
    expect(out.ok).toBe(true)
    expect(out.surveyor).toMatchObject({ id: 7, name: 'T. Ndlovu', email: body.email, license_number: 'LS-1', firm: 'Ndlovu Surveys' })
    expect(out.setPassword.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(out.setPassword.resetPath).toBe(`/reset-password?token=${out.setPassword.token}`)
    const insert = query.mock.calls.find((c) => /INSERT INTO password_reset_tokens/.test(c[0]))
    expect(insert[1][0]).toBe(42)
    expect(insert[1][1]).toBe(hashToken(out.setPassword.token))
    expect(insert[1]).not.toContain(out.setPassword.token)
    // the issuing admin is recorded
    expect(insert[1][2]).toBe(1)
  })

  test('the account is made with a password nobody was given', async () => {
    await post(body)
    const made = mockUser.create.mock.calls[0][0]
    expect(made.password).toBeTruthy()
    expect(made.password).not.toBe(body.name)
    expect(JSON.stringify(mockProfile.create.mock.calls[0][0])).not.toContain(made.password)
  })

  test('anyone who is not an admin is refused, and nothing is created', async () => {
    role = 'surveyor'
    const r = await post(body)
    expect(r.statusCode).toBe(403)
    expect(mockUser.create).not.toHaveBeenCalled()
  })

  test('a missing or bad field is 400 with the field named, and nothing is created', async () => {
    for (const [payload, field] of [[{ email: body.email }, /name/], [{ name: 'X' }, /email/], [{ ...body, email: 'bad' }, /email/], [{ ...body, surveyorType: 'root' }, /surveyorType/]]) {
      const r = await post(payload)
      expect(r.statusCode).toBe(400)
      expect(r.json().error).toMatch(field)
    }
    expect(mockUser.create).not.toHaveBeenCalled()
  })

  test('an address that already has an account is 409', async () => {
    mockUser.findByEmail.mockResolvedValue({ id: 9 })
    const r = await post(body)
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/already has an account/)
    expect(mockUser.create).not.toHaveBeenCalled()
  })

  test('a licence number already held is 409', async () => {
    mockProfile.findByLicense.mockResolvedValue({ id: 2 })
    const r = await post(body)
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/license number/)
  })

  test('losing a race at the unique index is 409, not a crash', async () => {
    mockUser.create.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }))
    const r = await post(body)
    expect(r.statusCode).toBe(409)
  })

  test('a failure part-way leaves nothing behind and is a 500 without the database message', async () => {
    createSurveyorSchema.mockRejectedValue(new Error('permission denied for database'))
    const r = await post(body)
    expect(r.statusCode).toBe(500)
    expect(r.json().error).toBe('Failed to create surveyor')
    expect(r.body).not.toMatch(/permission denied/)
    expect(mockProfile.delete).toHaveBeenCalledWith(7)
    expect(query).toHaveBeenCalledWith('DELETE FROM users WHERE id = $1', [42])
  })
})
