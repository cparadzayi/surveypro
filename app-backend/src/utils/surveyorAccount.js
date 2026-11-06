import { randomBytes } from 'crypto'

/**
 * Creating a surveyor's sign-in account, profile and database schema on an administrator's behalf.
 *
 * `/auth/register` does the same three things for a person signing themselves up, but it takes a password
 * and tolerates a half-made account (a user with no profile). An administrator adding someone else needs
 * the opposite: no password to invent or hand over, and no half-made account left behind if a step fails.
 * So the account is made with a password nobody knows, and the administrator is given a one-time link to
 * set a real one (see passwordReset.js).
 */

/** surveyor_type -> users.user_type, as /auth/register writes it. */
export const USER_TYPE_FOR = {
  registered: 'registered_surveyor',
  in_training: 'surveyor_in_training',
  technician: 'technician',
  student: 'student',
}
export const SURVEYOR_TYPES = Object.keys(USER_TYPE_FOR)

const TEXT_LIMITS = {
  name: 120, licenseNumber: 60, registrationNumber: 60, studentNumber: 60,
  firm: 120, address: 200, phone: 40, institution: 120,
}
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

/**
 * Cleans the body of an administrator's "add surveyor" request.
 * Returns { values } (every optional field present, empty ones as null) or { error } naming the first problem.
 */
export function cleanNewSurveyor(body) {
  const b = body ?? {}
  const text = (field, required = false) => {
    const raw = b[field]
    if (raw === undefined || raw === null || raw === '') return required ? { error: `${field} is required` } : { value: null }
    if (typeof raw !== 'string') return { error: `${field} must be text` }
    const value = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
    if (!value) return required ? { error: `${field} is required` } : { value: null }
    if (value.length > TEXT_LIMITS[field]) return { error: `${field} is longer than ${TEXT_LIMITS[field]} characters` }
    return { value }
  }

  const values = {}
  for (const field of Object.keys(TEXT_LIMITS)) {
    const r = text(field, field === 'name')
    if (r.error) return { error: r.error }
    values[field] = r.value
  }

  if (typeof b.email !== 'string' || !b.email.trim()) return { error: 'email is required' }
  values.email = b.email.trim()
  if (values.email.length > 254 || !EMAIL.test(values.email)) return { error: 'email is not a valid address' }

  values.surveyorType = b.surveyorType ?? 'registered'
  if (!SURVEYOR_TYPES.includes(values.surveyorType)) return { error: 'surveyorType is not a known type' }
  return { values }
}

/** A password nobody knows: the account cannot be signed into until the surveyor sets one with the link. */
export const unusablePassword = () => randomBytes(32).toString('base64url')

/**
 * Makes the account, profile and schema, then a set-password link.
 *
 * @param {object} deps  { User, SurveyorProfile, createSurveyorSchema, db, createResetToken, log }
 * @param {object} values  from cleanNewSurveyor
 * @param {{createdBy?: number|null}} opts
 * @returns {Promise<
 *   {status: 'email_taken'} | {status: 'license_taken'} |
 *   {status: 'created', user: object, profile: object, reset: {token: string, expiresAt: Date} | null}>}
 *
 * If the profile or the schema cannot be made, what was made is removed again and the error is thrown, so
 * a failure leaves no half-made account that would then block the address with "already registered".
 * A schema that was begun is not dropped (it may hold nothing yet, but a drop is not undone): it is logged.
 * If only the link cannot be made the account stands, and `reset` is null: issue a link from the
 * surveyor's card.
 */
export async function createSurveyorAccount(deps, values, { createdBy = null } = {}) {
  const { User, SurveyorProfile, createSurveyorSchema, db, createResetToken, log = console } = deps

  if (await User.findByEmail(values.email)) return { status: 'email_taken' }
  const license = values.licenseNumber
  if (license && (await SurveyorProfile.findByLicense(license))) return { status: 'license_taken' }

  const user = await User.create({
    email: values.email, password: unusablePassword(), userType: USER_TYPE_FOR[values.surveyorType],
  })

  let profile = null
  try {
    profile = await SurveyorProfile.create({
      userId: user.id,
      name: values.name,
      surveyorType: values.surveyorType,
      licenseNumber: values.licenseNumber,
      registrationNumber: values.registrationNumber,
      studentNumber: values.studentNumber,
      firm: values.firm,
      address: values.address,
      phone: values.phone,
      institution: values.institution,
      supervisorId: null,
    })
    const schemaName = await createSurveyorSchema(values.email)
    profile = (await SurveyorProfile.updateSchemaName(profile.id, schemaName)) ?? { ...profile, schema_name: schemaName }
  } catch (error) {
    log.error?.(`[surveyor-account] could not finish ${values.email}: ${error.message}; removing what was made`)
    // Each removal is tried whatever the other did, and neither may replace the error that started this.
    const attempt = async (what, fn) => { try { await fn() } catch (e) { log.error?.(`[surveyor-account] ${what} cleanup failed: ${e.message}`) } }
    if (profile) await attempt('profile', () => SurveyorProfile.delete(profile.id))
    await attempt('user', () => db.query('DELETE FROM users WHERE id = $1', [user.id]))
    throw error
  }

  let reset = null
  try {
    reset = await createResetToken(db, { userId: user.id, createdBy })
  } catch (error) {
    log.error?.(`[surveyor-account] ${values.email} was created but the link was not: ${error.message}`)
  }
  return { status: 'created', user, profile, reset }
}
