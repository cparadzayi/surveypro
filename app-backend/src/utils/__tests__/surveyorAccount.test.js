import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { cleanNewSurveyor, createSurveyorAccount, unusablePassword, USER_TYPE_FOR } from '../surveyorAccount.js'

const ok = { name: 'T. Ndlovu', email: 'tndlovu@example.com' }

describe('cleanNewSurveyor', () => {
  test('needs a name and an e-mail, and defaults the type to registered', () => {
    const { values } = cleanNewSurveyor(ok)
    expect(values).toMatchObject({ name: 'T. Ndlovu', email: 'tndlovu@example.com', surveyorType: 'registered', firm: null, phone: null })
    expect(cleanNewSurveyor({ email: ok.email }).error).toMatch(/name is required/)
    expect(cleanNewSurveyor({ name: ok.name }).error).toMatch(/email is required/)
    expect(cleanNewSurveyor(undefined).error).toMatch(/name is required/)
  })

  test('trims text, turns empty optional fields into null, and strips control characters', () => {
    const { values } = cleanNewSurveyor({ ...ok, name: '  T. Ndlovu ', firm: '', phone: '  ', address: '1 Main\r\nRoad' })
    expect(values.name).toBe('T. Ndlovu')
    expect(values.firm).toBeNull()
    expect(values.phone).toBeNull()
    expect(values.address).toBe('1 Main  Road')
  })

  test('refuses a bad e-mail, an unknown type, text that is too long or not text', () => {
    expect(cleanNewSurveyor({ ...ok, email: 'nope' }).error).toMatch(/not a valid address/)
    expect(cleanNewSurveyor({ ...ok, surveyorType: 'admin' }).error).toMatch(/not a known type/)
    expect(cleanNewSurveyor({ ...ok, name: 'x'.repeat(121) }).error).toMatch(/name is longer than 120/)
    expect(cleanNewSurveyor({ ...ok, phone: 12345 }).error).toMatch(/phone must be text/)
  })

  test('cannot be made an admin through the body: the role is not a field at all', () => {
    const { values } = cleanNewSurveyor({ ...ok, role: 'admin' })
    expect('role' in values).toBe(false)
  })

  test('every surveyor type maps to a user type', () => {
    for (const t of ['registered', 'in_training', 'technician', 'student']) expect(USER_TYPE_FOR[t]).toBeTruthy()
  })
})

describe('unusablePassword', () => {
  test('is long, random and different each time', () => {
    const a = unusablePassword(), b = unusablePassword()
    expect(a.length).toBeGreaterThanOrEqual(40)
    expect(a).not.toBe(b)
  })
})

describe('createSurveyorAccount', () => {
  let deps
  beforeEach(() => {
    deps = {
      User: { findByEmail: jest.fn().mockResolvedValue(undefined), create: jest.fn().mockResolvedValue({ id: 42, email: ok.email }) },
      SurveyorProfile: {
        findByLicense: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue({ id: 7, name: ok.name }),
        updateSchemaName: jest.fn().mockResolvedValue({ id: 7, name: ok.name, schema_name: 'surveyor_tndlovu' }),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      createSurveyorSchema: jest.fn().mockResolvedValue('surveyor_tndlovu'),
      db: { query: jest.fn().mockResolvedValue({ rows: [] }) },
      createResetToken: jest.fn().mockResolvedValue({ token: 'tok', expiresAt: new Date('2026-01-01T01:00:00Z') }),
      log: { error: jest.fn() },
    }
  })
  const values = (extra = {}) => cleanNewSurveyor({ ...ok, licenseNumber: 'LS-1', ...extra }).values

  test('makes the account with a password nobody knows, then the profile, the schema and a link', async () => {
    const r = await createSurveyorAccount(deps, values({ surveyorType: 'student' }), { createdBy: 3 })
    expect(r.status).toBe('created')
    const made = deps.User.create.mock.calls[0][0]
    expect(made).toMatchObject({ email: ok.email, userType: 'student' })
    expect(made.password.length).toBeGreaterThanOrEqual(40)
    expect(deps.SurveyorProfile.create.mock.calls[0][0]).toMatchObject({ userId: 42, name: 'T. Ndlovu', licenseNumber: 'LS-1', supervisorId: null })
    expect(deps.createSurveyorSchema).toHaveBeenCalledWith(ok.email)
    expect(deps.SurveyorProfile.updateSchemaName).toHaveBeenCalledWith(7, 'surveyor_tndlovu')
    expect(deps.createResetToken).toHaveBeenCalledWith(deps.db, { userId: 42, createdBy: 3 })
    expect(r.reset.token).toBe('tok')
    expect(r.profile.schema_name).toBe('surveyor_tndlovu')
  })

  test('an address that already has an account, or a licence already held, creates nothing', async () => {
    deps.User.findByEmail.mockResolvedValue({ id: 1 })
    expect((await createSurveyorAccount(deps, values())).status).toBe('email_taken')
    deps.User.findByEmail.mockResolvedValue(undefined)
    deps.SurveyorProfile.findByLicense.mockResolvedValue({ id: 2 })
    expect((await createSurveyorAccount(deps, values())).status).toBe('license_taken')
    expect(deps.User.create).not.toHaveBeenCalled()
  })

  test('a licence is only checked when one was given', async () => {
    await createSurveyorAccount(deps, cleanNewSurveyor(ok).values)
    expect(deps.SurveyorProfile.findByLicense).not.toHaveBeenCalled()
  })

  test('if the schema cannot be made, the profile and the user are removed and the error is thrown', async () => {
    deps.createSurveyorSchema.mockRejectedValue(new Error('schema failed'))
    await expect(createSurveyorAccount(deps, values())).rejects.toThrow('schema failed')
    expect(deps.SurveyorProfile.delete).toHaveBeenCalledWith(7)
    expect(deps.db.query).toHaveBeenCalledWith('DELETE FROM users WHERE id = $1', [42])
    expect(deps.createResetToken).not.toHaveBeenCalled()
  })

  test('if the profile cannot be made, only the user is removed', async () => {
    deps.SurveyorProfile.create.mockRejectedValue(new Error('profile failed'))
    await expect(createSurveyorAccount(deps, values())).rejects.toThrow('profile failed')
    expect(deps.SurveyorProfile.delete).not.toHaveBeenCalled()
    expect(deps.db.query).toHaveBeenCalledWith('DELETE FROM users WHERE id = $1', [42])
  })

  test('a failed clean-up does not hide the error that caused it', async () => {
    deps.createSurveyorSchema.mockRejectedValue(new Error('schema failed'))
    deps.SurveyorProfile.delete.mockRejectedValue(new Error('cleanup failed'))
    await expect(createSurveyorAccount(deps, values())).rejects.toThrow('schema failed')
  })

  test('if only the link fails the account stands, with no link', async () => {
    deps.createResetToken.mockRejectedValue(new Error('no token'))
    const r = await createSurveyorAccount(deps, values())
    expect(r.status).toBe('created')
    expect(r.reset).toBeNull()
    expect(deps.SurveyorProfile.delete).not.toHaveBeenCalled()
  })
})
