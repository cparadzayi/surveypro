// A launch token from VunGIS must be accepted when genuine and refused in every other case. The signer below is written independently of
// the verifier, in the same way VunGIS signs (app-backend/src/lib/launchToken.js in the VunGIS repository): EdDSA, base64url, header.payload.signature.
import crypto from 'node:crypto'
import { verifyLaunchToken, loadPublicKey } from '../launchToken.js'

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
const stranger = crypto.generateKeyPairSync('ed25519')
const NOW = 1_800_000_000
const b64u = (x) => Buffer.from(x).toString('base64url')

function sign(over = {}, { key = privateKey, alg = 'EdDSA', now = NOW } = {}) {
  const claims = {
    iss: 'vungis', aud: 'surveypro', iat: now, nbf: now, exp: now + 600, jti: crypto.randomUUID(),
    sub: 'surveyor@vungu.test', name: 'S Moyo',
    authority: { code: 'VUNGU', name: 'Vungu Rural District Council' },
    job: { id: '11111111-1111-1111-1111-111111111111', task_type: 'verification', stand_number: '4521', gauss_lo: 29 },
    ...over,
  }
  const input = `${b64u(JSON.stringify({ alg, typ: 'JWT', kid: 'vungis-1' }))}.${b64u(JSON.stringify(claims))}`
  return `${input}.${b64u(crypto.sign(null, Buffer.from(input), key))}`
}

describe('verifyLaunchToken', () => {
  test('accepts a genuine token and returns its claims', () => {
    const c = verifyLaunchToken(sign(), { publicKey, now: NOW + 3 })
    expect(c.sub).toBe('surveyor@vungu.test')
    expect(c.authority.code).toBe('VUNGU')
    expect(c.job.gauss_lo).toBe(29)
  })

  test('refuses a token signed by anyone else', () => {
    expect(() => verifyLaunchToken(sign({}, { key: stranger.privateKey }), { publicKey, now: NOW })).toThrow('bad signature')
  })

  test('refuses a token whose payload was changed', () => {
    const [h, p, s] = sign().split('.')
    const c = JSON.parse(Buffer.from(p, 'base64url').toString()); c.sub = 'someone@else.test'
    expect(() => verifyLaunchToken(`${h}.${b64u(JSON.stringify(c))}.${s}`, { publicKey, now: NOW })).toThrow('bad signature')
  })

  test('refuses "none" and symmetric algorithms', () => {
    const [, p] = sign().split('.')
    for (const alg of ['none', 'HS256']) {
      const h = b64u(JSON.stringify({ alg, typ: 'JWT' }))
      expect(() => verifyLaunchToken(`${h}.${p}.AAAA`, { publicKey, now: NOW })).toThrow('wrong algorithm')
    }
  })

  test('refuses an expired token, allowing a minute of clock skew', () => {
    expect(() => verifyLaunchToken(sign(), { publicKey, now: NOW + 660 })).not.toThrow()
    expect(() => verifyLaunchToken(sign(), { publicKey, now: NOW + 661 })).toThrow('expired')
  })

  test('refuses a token from the future', () => {
    expect(() => verifyLaunchToken(sign(), { publicKey, now: NOW - 61 })).toThrow('not yet valid')
  })

  test('refuses the wrong issuer or audience', () => {
    expect(() => verifyLaunchToken(sign({ iss: 'someone' }), { publicKey, now: NOW })).toThrow('wrong issuer')
    expect(() => verifyLaunchToken(sign({ aud: 'other-app' }), { publicKey, now: NOW })).toThrow('wrong audience')
  })

  test('refuses a token without what a launch needs', () => {
    expect(() => verifyLaunchToken(sign({ jti: undefined }), { publicKey, now: NOW })).toThrow('no token id')
    expect(() => verifyLaunchToken(sign({ sub: 'not-an-email' }), { publicKey, now: NOW })).toThrow('no subject')
    expect(() => verifyLaunchToken(sign({ authority: {} }), { publicKey, now: NOW })).toThrow('no authority')
    expect(() => verifyLaunchToken(sign({ job: { id: 'x' } }), { publicKey, now: NOW })).toThrow('no job')
  })

  test('garbage is not a token, and no key means launch is not configured', () => {
    for (const bad of ['', 'a.b', 'a.b.c.d', null, undefined]) expect(() => verifyLaunchToken(bad, { publicKey })).toThrow('not a token')
    expect(() => verifyLaunchToken(sign(), { publicKey: null })).toThrow('launch is not configured')
  })

  test('the public key can come from the environment', () => {
    const pem = publicKey.export({ type: 'spki', format: 'pem' })
    const k = loadPublicKey({ VUNGIS_LAUNCH_PUBLIC_KEY: pem.replace(/\n/g, '\\n') })
    expect(() => verifyLaunchToken(sign(), { publicKey: k, now: NOW })).not.toThrow()
    expect(loadPublicKey({})).toBeNull()
  })
})
