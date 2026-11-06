import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import Fastify from 'fastify'

// The signed-in surveyor's own letterhead: who it acts on, what it stores and what it refuses.
const mockProfile = { findById: jest.fn(), update: jest.fn() }
const mockLetterhead = { findByProfileId: jest.fn(), saveText: jest.fn(), saveLogo: jest.fn(), removeLogo: jest.fn() }
let callerProfile = { id: 3, role: 'surveyor' }

jest.unstable_mockModule('../../config/db.js', () => ({ default: { query: jest.fn() } }))
jest.unstable_mockModule('../../models/SurveyorProfile.js', () => ({ default: mockProfile }))
jest.unstable_mockModule('../../models/SurveyorLetterhead.js', () => ({ default: mockLetterhead }))
jest.unstable_mockModule('../../utils/schemaAuth.js', () => ({
  authenticateWithSchema: async (request) => { request.surveyorProfile = callerProfile },
}))

const { default: letterheadRoutes } = await import('../letterhead.js')

function build() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async (request) => { request.user = { sub: 1, email: 'a@x.test' } })
  app.register(letterheadRoutes)
  return app
}

const png = (w, h) => {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20)
  return b
}

beforeEach(() => {
  for (const m of [...Object.values(mockProfile), ...Object.values(mockLetterhead)]) m.mockReset()
  callerProfile = { id: 3, role: 'surveyor' }
  mockProfile.findById.mockResolvedValue({ id: 3, firm: 'C Paradzayi Land Surveyors', address: '6322 Hwari', phone: '+263' })
  mockLetterhead.findByProfileId.mockResolvedValue(null)
})

describe('GET /surveyors/me/letterhead', () => {
  test('returns the profile fields and empty extras when nothing is stored, and is not cached', async () => {
    const r = await build().inject({ method: 'GET', url: '/surveyors/me/letterhead' })
    expect(r.statusCode).toBe(200)
    expect(r.headers['cache-control']).toBe('no-store')
    expect(r.json().letterhead).toEqual({
      firm: 'C Paradzayi Land Surveyors', address: '6322 Hwari', phone: '+263',
      subtitle: '', email: '', website: '', logo: null,
    })
    // always the caller's own profile, never one named in the request
    expect(mockProfile.findById).toHaveBeenCalledWith(3)
    expect(mockLetterhead.findByProfileId).toHaveBeenCalledWith(3)
  })

  test('returns a stored logo as a data URL with its size', async () => {
    const bytes = png(400, 300)
    mockLetterhead.findByProfileId.mockResolvedValue({ subtitle: 'Surveyors', logo: bytes, logo_mime: 'image/png', logo_width: 400, logo_height: 300 })
    const { letterhead } = (await build().inject({ method: 'GET', url: '/surveyors/me/letterhead' })).json()
    expect(letterhead.subtitle).toBe('Surveyors')
    expect(letterhead.logo).toEqual({ dataUrl: `data:image/png;base64,${bytes.toString('base64')}`, width: 400, height: 300 })
  })

  test('a caller with no surveyor profile is refused', async () => {
    callerProfile = null
    expect((await build().inject({ method: 'GET', url: '/surveyors/me/letterhead' })).statusCode).toBe(403)
    expect(mockProfile.findById).not.toHaveBeenCalled()
  })
})

describe('PUT /surveyors/me/letterhead', () => {
  test('writes firm, address and phone to the profile and the rest to the letterhead, for the caller only', async () => {
    const r = await build().inject({
      method: 'PUT', url: '/surveyors/me/letterhead',
      payload: { firm: ' New Firm ', phone: '+263 1', subtitle: 'Cadastral', email: 'a@b.co', website: 'b.co', id: 99, profileId: 99 },
    })
    expect(r.statusCode).toBe(200)
    expect(mockProfile.update).toHaveBeenCalledWith(3, { firm: 'New Firm', address: undefined, phone: '+263 1' })
    expect(mockLetterhead.saveText).toHaveBeenCalledWith(3, { subtitle: 'Cadastral', email: 'a@b.co', website: 'b.co' })
  })

  test('touches only the table a field belongs to', async () => {
    await build().inject({ method: 'PUT', url: '/surveyors/me/letterhead', payload: { website: 'b.co' } })
    expect(mockProfile.update).not.toHaveBeenCalled()
    expect(mockLetterhead.saveText).toHaveBeenCalledTimes(1)
  })

  test('a bad field is 400 and nothing is written', async () => {
    const r = await build().inject({ method: 'PUT', url: '/surveyors/me/letterhead', payload: { email: 'nope', firm: 'F' } })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/email/)
    expect(mockProfile.update).not.toHaveBeenCalled()
    expect(mockLetterhead.saveText).not.toHaveBeenCalled()
  })

  test('a caller with no surveyor profile is refused', async () => {
    callerProfile = null
    const r = await build().inject({ method: 'PUT', url: '/surveyors/me/letterhead', payload: { firm: 'F' } })
    expect(r.statusCode).toBe(403)
    expect(mockProfile.update).not.toHaveBeenCalled()
  })
})

describe('the logo', () => {
  test('PUT stores a PNG against the caller and returns the letterhead', async () => {
    const bytes = png(200, 100)
    const r = await build().inject({
      method: 'PUT', url: '/surveyors/me/letterhead/logo',
      payload: { dataUrl: `data:image/png;base64,${bytes.toString('base64')}` },
    })
    expect(r.statusCode).toBe(200)
    expect(mockLetterhead.saveLogo).toHaveBeenCalledTimes(1)
    const [id, logo] = mockLetterhead.saveLogo.mock.calls[0]
    expect(id).toBe(3)
    expect(logo).toMatchObject({ mime: 'image/png', width: 200, height: 100 })
  })

  test('PUT refuses a file that is not a PNG, whatever it says it is', async () => {
    const r = await build().inject({
      method: 'PUT', url: '/surveyors/me/letterhead/logo',
      payload: { dataUrl: `data:image/png;base64,${Buffer.from('<svg/>').toString('base64')}` },
    })
    expect(r.statusCode).toBe(400)
    expect(mockLetterhead.saveLogo).not.toHaveBeenCalled()
  })

  test('DELETE removes the caller’s logo', async () => {
    const r = await build().inject({ method: 'DELETE', url: '/surveyors/me/letterhead/logo' })
    expect(r.statusCode).toBe(200)
    expect(mockLetterhead.removeLogo).toHaveBeenCalledWith(3)
  })
})
