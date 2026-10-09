/**
 * Checking a launch token from VunGIS.
 *
 * VunGIS signs a short-lived token with Ed25519 (alg "EdDSA") and SurveyPro checks it with VunGIS's PUBLIC key, so SurveyPro can tell
 * a token is genuine but could never make one. Single use is enforced separately (survey.launch_token_use, migration 100).
 *
 * Configuration:
 *   VUNGIS_LAUNCH_PUBLIC_KEY   the public key, PEM (SPKI). Newlines may be written as \n.
 *   VUNGIS_LAUNCH_KEY_FILE     or the path of a file holding it
 *   VUNGIS_LAUNCH_ISSUER       who must have signed it; default "vungis"
 *
 * Nothing here touches the network or the database.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'

export const AUDIENCE = 'surveypro'
const DEFAULT_ISSUER = 'vungis'

const fromB64u = (s) => Buffer.from(s, 'base64url')

/** The public key from the environment, or null if none is configured. */
export function loadPublicKey(env = process.env) {
  let pem = env.VUNGIS_LAUNCH_PUBLIC_KEY
  if (!pem && env.VUNGIS_LAUNCH_KEY_FILE && fs.existsSync(env.VUNGIS_LAUNCH_KEY_FILE)) pem = fs.readFileSync(env.VUNGIS_LAUNCH_KEY_FILE, 'utf8')
  if (!pem) return null
  return crypto.createPublicKey(pem.replace(/\\n/g, '\n'))
}

/**
 * Verify a token. Returns the claims when it is good; otherwise throws an Error whose message says why (and which is safe to show:
 * it never contains the token).
 */
export function verifyLaunchToken(token, { publicKey, now = Math.floor(Date.now() / 1000), skew = 60, issuer = DEFAULT_ISSUER } = {}) {
  if (!publicKey) throw new Error('launch is not configured')
  const parts = String(token || '').split('.')
  if (parts.length !== 3) throw new Error('not a token')
  const [h, p, s] = parts
  let header, claims
  try { header = JSON.parse(fromB64u(h).toString()); claims = JSON.parse(fromB64u(p).toString()) } catch { throw new Error('not a token') }
  if (header.alg !== 'EdDSA') throw new Error('wrong algorithm')       // never "none", never a symmetric algorithm
  let good = false
  try { good = crypto.verify(null, Buffer.from(`${h}.${p}`), publicKey, fromB64u(s)) } catch { good = false }
  if (!good) throw new Error('bad signature')
  if (claims.iss !== issuer) throw new Error('wrong issuer')
  if (claims.aud !== AUDIENCE) throw new Error('wrong audience')
  if (typeof claims.exp !== 'number' || now > claims.exp + skew) throw new Error('expired')
  if (typeof claims.nbf === 'number' && now + skew < claims.nbf) throw new Error('not yet valid')
  if (typeof claims.jti !== 'string' || !claims.jti) throw new Error('no token id')
  if (typeof claims.sub !== 'string' || !claims.sub.includes('@')) throw new Error('no subject')
  if (!claims.authority || !claims.authority.code) throw new Error('no authority')
  if (!claims.job || !/^[0-9a-f-]{36}$/i.test(String(claims.job.id || ''))) throw new Error('no job')
  return claims
}
