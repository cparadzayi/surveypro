import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import Fastify from 'fastify'
import { installErrorHandling } from '../../utils/httpErrors.js'

// Findings from the five-user simulation (27 Oct 2026), pinned at the route level:
//   1 sign-in throttle   2 double-click project creation   3 no stack in error bodies
//   5 bad ids / rows are a 400, not a Postgres 500
// Models and schema auth are mocked: these suites are about what the routes say.

const mockUser = { findByEmail: jest.fn(), verifyPassword: jest.fn(), create: jest.fn() }
const mockProfile = { findByUserId: jest.fn() }
const mockPoints = { findByProject: jest.fn(), batchCreate: jest.fn() }
const mockProject = { create: jest.fn(), findById: jest.fn() }
const mockParcel = { create: jest.fn(), update: jest.fn() }

jest.unstable_mockModule('../../models/user.js', () => ({ default: mockUser }))
jest.unstable_mockModule('../../models/SurveyorProfile.js', () => ({ default: mockProfile }))
jest.unstable_mockModule('../../config/db.js', () => ({ default: { query: jest.fn() }, createSurveyorSchema: jest.fn() }))
jest.unstable_mockModule('../../models/coordinatePoint.js', () => ({ default: mockPoints }))
jest.unstable_mockModule('../../models/landParcel.js', () => ({ default: mockParcel }))
jest.unstable_mockModule('../../models/SurveyProject.js', () => ({ default: mockProject }))
jest.unstable_mockModule('../../utils/projectDirectories.js', () => ({ createProjectDirectories: jest.fn(), deleteProjectDirectory: jest.fn() }))

const dbQuery = jest.fn()
jest.unstable_mockModule('../../utils/schemaAuth.js', () => ({
  authenticateWithSchema: async (request) => { request.db = { query: dbQuery } },
  requireSchema: async () => {},
}))

const { default: authRoutes } = await import('../auth.js')
const { default: coordinatePointRoutes } = await import('../coordinatePoints.js')
const { default: landParcelRoutes } = await import('../landParcels.js')
const { default: surveyProjectRoutes } = await import('../survey-projects.js')
const { loginThrottle } = await import('../../utils/loginThrottle.js')

function build(plugin, opts) {
  const app = Fastify({ logger: false })
  installErrorHandling(app)
  app.decorate('authenticate', async (request) => { request.user = { sub: 7, email: 'sim@x.test' } })
  app.register(plugin, opts)
  return app
}

describe('sign-in throttle (finding 1)', () => {
  beforeEach(() => { loginThrottle.failures.clear(); mockUser.findByEmail.mockReset(); mockUser.verifyPassword.mockReset() })
  const login = (app, email, password) => app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } })

  test('after repeated wrong passwords the account is refused with 429 and Retry-After, even for the right password', async () => {
    mockUser.findByEmail.mockResolvedValue({ id: 1, email: 'a@x.test', password_hash: 'h' })
    mockUser.verifyPassword.mockResolvedValue(false)
    const app = build(authRoutes)
    const codes = []
    for (let i = 0; i < loginThrottle.perAccount; i++) codes.push((await login(app, 'a@x.test', 'wrong')).statusCode)
    expect(new Set(codes)).toEqual(new Set([401]))

    mockUser.verifyPassword.mockResolvedValue(true)
    const blocked = await login(app, 'a@x.test', 'right')
    expect(blocked.statusCode).toBe(429)
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
    expect(blocked.json().message).toMatch(/minute/)
    expect(mockUser.verifyPassword).toHaveBeenCalledTimes(loginThrottle.perAccount) // the blocked try never reached the check
  })

  test('unknown accounts count too, so guessing e-mails is throttled the same way', async () => {
    mockUser.findByEmail.mockResolvedValue(null)
    const app = build(authRoutes)
    for (let i = 0; i < loginThrottle.perAccount; i++) await login(app, 'ghost@x.test', 'x')
    expect((await login(app, 'ghost@x.test', 'x')).statusCode).toBe(429)
  })

  test('another account is not affected', async () => {
    mockUser.findByEmail.mockResolvedValue({ id: 2, email: 'b@x.test', password_hash: 'h' })
    mockUser.verifyPassword.mockResolvedValue(false)
    const app = build(authRoutes)
    for (let i = 0; i < loginThrottle.perAccount; i++) await login(app, 'a@x.test', 'x')
    expect((await login(app, 'b@x.test', 'x')).statusCode).toBe(401)
  })
})

describe('coordinate-points input (findings 3 and 5)', () => {
  beforeEach(() => { mockPoints.findByProject.mockReset(); mockPoints.batchCreate.mockReset() })
  const post = (app, body) => app.inject({ method: 'POST', url: '/coordinate-points/batch', payload: body })

  test('a non-numeric project_id is a 400 and never reaches the database', async () => {
    const app = build(coordinatePointRoutes)
    const r = await app.inject({ method: 'GET', url: '/coordinate-points?project_id=1;select%20pg_sleep(5)--' })
    expect(r.statusCode).toBe(400)
    expect(mockPoints.findByProject).not.toHaveBeenCalled()
  })

  test('rows with text coordinates or a blank name are a 400 that names the rows', async () => {
    const app = build(coordinatePointRoutes)
    const r = await post(app, { project_id: '1', points: [{ name: 'B1', y: 'abc', x: null }, { name: '', y: 1, x: 2 }, { name: 'B3', y: 54000, x: 3900000 }] })
    expect(r.statusCode).toBe(400)
    expect(r.json().problems).toEqual(['Row 1 (B1): Y is not a number', 'Row 1 (B1): X is not a number', 'Row 2: the beacon name is blank'])
    expect(mockPoints.batchCreate).not.toHaveBeenCalled()
  })

  test('a clean batch still goes through', async () => {
    mockPoints.batchCreate.mockResolvedValue({ created: [{ id: 1, name: 'A1' }], conflicts: [] })
    const app = build(coordinatePointRoutes)
    const r = await post(app, { project_id: '1', points: [{ name: 'A1', y: 54000, x: -3900000 }] })
    expect(r.statusCode).toBe(200)
    expect(r.json().count).toBe(1)
  })

  test('a failure inside the import is a 500 with no stack and no database text', async () => {
    mockPoints.batchCreate.mockRejectedValue(Object.assign(new Error('relation "coordinate_points" does not exist'), { stack: 'at secret (C:\\app\\models\\x.js:9:9)' }))
    const app = build(coordinatePointRoutes)
    const r = await post(app, { project_id: '1', points: [{ name: 'A1', y: 1, x: 2 }] })
    expect(r.statusCode).toBe(500)
    expect(r.body).not.toMatch(/stack|secret|C:\\|coordinate_points/)
  })
})

describe('survey projects (findings 2 and 5)', () => {
  beforeEach(() => {
    mockProject.create.mockReset(); mockProject.findById.mockReset(); mockProfile.findByUserId.mockReset(); dbQuery.mockReset()
    mockProfile.findByUserId.mockResolvedValue({ id: 3 })
  })
  const create = (app, name) => app.inject({ method: 'POST', url: '/survey-projects', payload: { name } })

  test('a project id that is not a number is a 400', async () => {
    const app = build(surveyProjectRoutes, { prefix: '/survey-projects' })
    for (const bad of ['abc', '1;drop', '99999999999']) {
      expect((await app.inject({ method: 'GET', url: `/survey-projects/${bad}` })).statusCode).toBe(400)
    }
    expect(mockProject.findById).not.toHaveBeenCalled()
  })

  test('four simultaneous identical creates make exactly one project', async () => {
    dbQuery.mockImplementation(async () => ({ rows: [] }))
    let made = 0
    mockProject.create.mockImplementation(async () => { made += 1; await new Promise((r) => setTimeout(r, 30)); return { id: made, name: 'dup' } })
    const app = build(surveyProjectRoutes, { prefix: '/survey-projects' })
    const rs = await Promise.all([1, 2, 3, 4].map(() => create(app, 'dup')))
    const codes = rs.map((r) => r.statusCode).sort()
    expect(mockProject.create).toHaveBeenCalledTimes(1)
    expect(codes.filter((c) => c === 409)).toHaveLength(3)
    expect(codes.filter((c) => c < 300)).toHaveLength(1)
    expect(rs.find((r) => r.statusCode === 409).json().error).toMatch(/already exists/)
  })

  test('a name that already exists, in any case, is refused', async () => {
    dbQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] })
    const app = build(surveyProjectRoutes, { prefix: '/survey-projects' })
    const r = await create(app, '  Maglas 1686 ')
    expect(r.statusCode).toBe(409)
    expect(dbQuery.mock.calls[0][1]).toEqual(['maglas 1686'])
    expect(mockProject.create).not.toHaveBeenCalled()
  })

  test('the database index catching a duplicate the in-process check missed is also a 409, with no database text', async () => {
    dbQuery.mockResolvedValue({ rows: [] })
    mockProject.create.mockRejectedValue(Object.assign(new Error('duplicate key value violates unique constraint "uq_survey_projects_active_name"'), { code: '23505' }))
    const r = await create(build(surveyProjectRoutes, { prefix: '/survey-projects' }), 'Maglas')
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/already exists/)
    expect(r.body).not.toMatch(/uq_survey|violates/)
  })

  test('a failed create is a plain 500 that does not repeat the database error', async () => {
    dbQuery.mockResolvedValue({ rows: [] })
    mockProject.create.mockRejectedValue(new Error('relation "survey_projects" does not exist'))
    const r = await create(build(surveyProjectRoutes, { prefix: '/survey-projects' }), 'X')
    expect(r.statusCode).toBe(500)
    expect(r.body).not.toMatch(/relation|does not exist/)
  })

  test('a fresh name is created', async () => {
    dbQuery.mockResolvedValue({ rows: [] })
    mockProject.create.mockResolvedValue({ id: 9, name: 'fresh' })
    const app = build(surveyProjectRoutes, { prefix: '/survey-projects' })
    const r = await create(app, 'fresh')
    expect(r.statusCode).toBeLessThan(300)
    expect(mockProject.create).toHaveBeenCalledTimes(1)
  })
})

describe('parcel boundaries (finding 6)', () => {
  beforeEach(() => { mockParcel.create.mockReset(); mockParcel.update.mockReset() })
  const ring = [[54000, 2146000], [54180, 2146000], [54180, 2146111], [54000, 2146111], [54000, 2146000]]
  const good = { type: 'Polygon', coordinates: [ring] }
  const bad = { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] }

  test('a degenerate polygon is a 400 that says why, and is never stored', async () => {
    const r = await build(landParcelRoutes).inject({ method: 'POST', url: '/land-parcels', payload: { project_id: '1', stand: '1', geom: bad } })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/outer ring needs at least 3 distinct corners/)
    expect(mockParcel.create).not.toHaveBeenCalled()
  })

  test('a proper polygon is stored', async () => {
    mockParcel.create.mockResolvedValue({ id: 1, stand: '1' })
    const r = await build(landParcelRoutes).inject({ method: 'POST', url: '/land-parcels', payload: { project_id: '1', stand: '1', geom: good } })
    expect(r.statusCode).toBe(200)
    expect(mockParcel.create).toHaveBeenCalledTimes(1)
  })

  test('in a batch only the bad parcel is refused', async () => {
    mockParcel.create.mockResolvedValue({ id: 2, stand: 'ok' })
    const r = await build(landParcelRoutes).inject({ method: 'POST', url: '/land-parcels/batch', payload: { project_id: '1', parcels: [{ stand: 'bad', geom: bad }, { stand: 'ok', geom: good }] } })
    expect(mockParcel.create).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(r.json())).toMatch(/bad/)
  })

  test('an edit that swaps in a bad boundary is refused; an edit without one is not checked', async () => {
    mockParcel.update.mockResolvedValue({ id: 1 })
    const app = build(landParcelRoutes)
    expect((await app.inject({ method: 'PUT', url: '/land-parcels/1', payload: { geom: bad } })).statusCode).toBe(400)
    expect(mockParcel.update).not.toHaveBeenCalled()
    expect((await app.inject({ method: 'PUT', url: '/land-parcels/1', payload: { owner: 'A. Moyo' } })).statusCode).toBe(200)
  })
})
