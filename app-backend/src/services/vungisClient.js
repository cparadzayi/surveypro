/**
 * Asking VunGIS about the register, on behalf of a person signed in here.
 *
 * SurveyPro signs a short-lived (five-minute) token with its own Ed25519 private key; VunGIS holds only the public key, so it can check the token
 * is genuine but can never make one. The token names the person (their email), the council (SurveyPro has checked they are appointed to it) and
 * what it is for (`scp`). Everything is read-only: VunGIS answers a question and writes nothing.
 * VunGIS's side is src/lib/serviceToken.js and src/routes/context.js; the contract is docs/HARMONIZATION-SCOPE.md (piece A1) in that repository.
 *
 * Configuration (environment):
 *   SURVEYPRO_SERVICE_PRIVATE_KEY   the private key, PEM (PKCS#8). Newlines may be written as \n.
 *   SURVEYPRO_SERVICE_KEY_FILE      or the path of a file holding it (scripts/generate-service-keys.js writes one)
 *   SURVEYPRO_SERVICE_KEY_ID        names the key in the token header (kid); default "surveypro-1"
 *   VUNGIS_API_URL                  VunGIS's address, e.g. https://vungis.example.org (no /api)
 * Without the key and the address the register check says it is not connected, and everything else works as before.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'

const TTL_SECONDS = 300
const b64u = (buf) => Buffer.from(buf).toString('base64url')

export function loadPrivateKey(env = process.env) {
  let pem = env.SURVEYPRO_SERVICE_PRIVATE_KEY
  if (!pem && env.SURVEYPRO_SERVICE_KEY_FILE && fs.existsSync(env.SURVEYPRO_SERVICE_KEY_FILE)) pem = fs.readFileSync(env.SURVEYPRO_SERVICE_KEY_FILE, 'utf8')
  if (!pem) return null
  return crypto.createPrivateKey(pem.replace(/\\n/g, '\n'))
}

export const isConfigured = (env = process.env) => !!(env.VUNGIS_API_URL && loadPrivateKey(env))

/** A service token for one purpose, for one person at one council. */
export function signServiceToken({ email, authority, scope }, { privateKey = loadPrivateKey(), kid = process.env.SURVEYPRO_SERVICE_KEY_ID || 'surveypro-1', now = Math.floor(Date.now() / 1000) } = {}) {
  if (!privateKey) throw new Error('no service signing key is configured (SURVEYPRO_SERVICE_PRIVATE_KEY or SURVEYPRO_SERVICE_KEY_FILE)')
  const claims = { iss: 'surveypro', aud: 'vungis', iat: now, exp: now + TTL_SECONDS, jti: crypto.randomUUID(), sub: String(email).trim().toLowerCase(), authority, scp: scope }
  const input = `${b64u(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid }))}.${b64u(JSON.stringify(claims))}`
  return `${input}.${b64u(crypto.sign(null, Buffer.from(input), privateKey))}`
}

/** The error a caller turns into an answer: `status` is the HTTP status to give, `code` and `message` say what to do. */
export class RegisterCheckError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code }
}

/**
 * The layout check: the parcels of one project against VunGIS's register.
 *   layout   { authority_code, project_id, township, survey_class, parcels: [{ id, stand, designation, area_m2, lo_zone, srid, geojson }] }
 *   person   { email }
 * Returns VunGIS's report { ok, errors, warnings, checked }.
 */
export async function checkLayout(layout, person, { fetchImpl = fetch, env = process.env } = {}) {
  if (!isConfigured(env)) throw new RegisterCheckError(503, 'check_not_configured', 'SurveyPro is not connected to the council system, so the register cannot be checked yet.')
  const token = signServiceToken({ email: person.email, authority: layout.authority_code, scope: 'check-layout' }, { privateKey: loadPrivateKey(env) })
  let res
  try {
    res = await fetchImpl(`${env.VUNGIS_API_URL.replace(/\/+$/, '')}/api/context/check-layout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(layout),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new RegisterCheckError(502, 'register_unreachable', 'The council system could not be reached. Try again in a moment; delivering does not depend on this check.')
  }
  let body = null
  try { body = await res.json() } catch { /* an unreadable answer is handled below */ }
  if (res.ok && body && typeof body.ok === 'boolean') return { ok: body.ok, errors: body.errors || [], warnings: body.warnings || [], checked: body.checked ?? layout.parcels.length }
  if (res.status === 503) throw new RegisterCheckError(503, 'check_not_connected', 'The council system is not set up to accept register checks from SurveyPro yet.')
  if (res.status === 404) throw new RegisterCheckError(409, 'authority_unknown_to_vungis', (body && body.message) || 'The council system does not know this council.')
  if (res.status === 401 || res.status === 403) throw new RegisterCheckError(502, 'check_refused', 'The council system did not accept this request. SurveyPro\'s key may not match; tell your administrator.')
  throw new RegisterCheckError(502, 'register_error', 'The council system could not complete the check.')
}
