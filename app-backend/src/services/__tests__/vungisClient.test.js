/**
 * The register check's client: it signs a short-lived token VunGIS can verify with the public key alone, names the person and the council, and
 * turns each way the other side can fail into an answer a person can act on. The network is stubbed.
 */
import { describe, test, expect } from '@jest/globals'
import crypto from 'node:crypto'
import { checkLayout, contextParcels, signServiceToken, isConfigured, RegisterCheckError } from '../vungisClient.js'

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
const ENV = { VUNGIS_API_URL: 'https://vungis.example.test/', SURVEYPRO_SERVICE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n') }
const layout = { authority_code: 'VUNGU', project_id: 7, township: 'T', survey_class: 'B', parcels: [{ id: 1, stand: '1', designation: '1', area_m2: 900, lo_zone: 29, srid: 22289, geojson: '{}' }] }
const person = { email: 'Surveyor@Vungu.Test' }
const reply = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })

const claimsOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())

describe('the service token', () => {
  test('VunGIS can check it with the public key alone, and it says who, for which council, for what', () => {
    const token = signServiceToken({ email: person.email, authority: 'VUNGU', scope: 'check-layout' }, { privateKey, now: 1_800_000_000 })
    const [h, p, s] = token.split('.')
    expect(crypto.verify(null, Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, 'base64url'))).toBe(true)
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toMatchObject({ alg: 'EdDSA', typ: 'JWT' })
    expect(claimsOf(token)).toMatchObject({ iss: 'surveypro', aud: 'vungis', sub: 'surveyor@vungu.test', authority: 'VUNGU', scp: 'check-layout', iat: 1_800_000_000, exp: 1_800_000_300 })
  })
  test('every token has its own id', () => {
    const a = claimsOf(signServiceToken({ email: 'a@b.c', authority: 'X', scope: 's' }, { privateKey })).jti
    const b = claimsOf(signServiceToken({ email: 'a@b.c', authority: 'X', scope: 's' }, { privateKey })).jti
    expect(a).not.toBe(b)
  })
  test('without a key there is nothing to sign with', () => {
    expect(() => signServiceToken({ email: 'a@b.c', authority: 'X', scope: 's' }, { privateKey: null })).toThrow(/no service signing key/)
  })
})

describe('asking VunGIS', () => {
  test('it is not configured until it has both the key and the address', () => {
    expect(isConfigured({})).toBe(false)
    expect(isConfigured({ VUNGIS_API_URL: 'x' })).toBe(false)
    expect(isConfigured(ENV)).toBe(true)
  })

  test('it sends the layout with a bearer token, to the check endpoint, and returns the report', async () => {
    let seen
    const fetchImpl = async (url, init) => { seen = { url, init }; return reply(200, { success: true, ok: false, errors: [{ code: 'stand_no_exists', stand: '1' }], warnings: [], checked: 1 })() }
    const r = await checkLayout(layout, person, { fetchImpl, env: ENV })
    expect(seen.url).toBe('https://vungis.example.test/api/context/check-layout')
    expect(seen.init.method).toBe('POST')
    expect(JSON.parse(seen.init.body)).toEqual(layout)
    const token = seen.init.headers.authorization.replace('Bearer ', '')
    expect(claimsOf(token)).toMatchObject({ sub: 'surveyor@vungu.test', authority: 'VUNGU', scp: 'check-layout' })
    expect(r).toEqual({ ok: false, errors: [{ code: 'stand_no_exists', stand: '1' }], warnings: [], checked: 1 })
  })

  const fails = async (fetchImpl, env = ENV) => { try { await checkLayout(layout, person, { fetchImpl, env }) } catch (e) { return e } return null }

  test('not connected here: says so, without trying', async () => {
    let called = false
    const e = await fails(async () => { called = true }, {})
    expect(e).toBeInstanceOf(RegisterCheckError)
    expect([e.status, e.code]).toEqual([503, 'check_not_configured'])
    expect(called).toBe(false)
  })
  test('VunGIS unreachable: 502, and delivering does not depend on it', async () => {
    const e = await fails(async () => { throw new Error('ECONNREFUSED') })
    expect([e.status, e.code]).toEqual([502, 'register_unreachable'])
    expect(e.message).toMatch(/delivering does not depend/)
  })
  test('VunGIS not set up for SurveyPro: 503', async () => {
    expect((await fails(reply(503, { error: 'not_configured' }))).code).toBe('check_not_connected')
  })
  test('VunGIS does not know the council: 409 with its own words', async () => {
    const e = await fails(reply(404, { error: 'unknown_authority', message: 'VUNGU is not set up in VunGIS.' }))
    expect([e.status, e.code, e.message]).toEqual([409, 'authority_unknown_to_vungis', 'VUNGU is not set up in VunGIS.'])
  })
  test('VunGIS refuses the token (a key that does not match): 502, and the message says whom to tell', async () => {
    const e = await fails(reply(401, { error: 'invalid_token' }))
    expect([e.status, e.code]).toEqual([502, 'check_refused'])
    expect(e.message).toMatch(/administrator/)
  })
  test('anything else, or an unreadable answer: 502', async () => {
    expect((await fails(reply(500, { error: 'x' }))).code).toBe('register_error')
    expect((await fails(async () => ({ ok: true, status: 200, json: async () => { throw new Error('not json') } }))).code).toBe('register_error')
  })
})

describe('what is already on the ground', () => {
  const query = { authority_code: 'VUNGU', lo_zone: 29, area: { bbox: [-84000, 2151300, -83900, 2151400] } }
  const features = [{ type: 'Feature', properties: { parcel_id: 'P-1', quality: 'approved' }, geometry: { type: 'Polygon', coordinates: [] } }]

  test('it asks with a token for THAT purpose, and hands back the features without the envelope', async () => {
    let seen
    const fetchImpl = async (url, init) => { seen = { url, init }; return reply(200, { success: true, authority: 'VUNGU', lo_zone: 29, srid: 922029, truncated: false, count: 1, as_of: 'x', features })() }
    const r = await contextParcels(query, person, { fetchImpl, env: ENV })
    expect(seen.url).toBe('https://vungis.example.test/api/context/parcels')
    expect(JSON.parse(seen.init.body)).toEqual(query)
    expect(claimsOf(seen.init.headers.authorization.replace('Bearer ', ''))).toMatchObject({ sub: 'surveyor@vungu.test', authority: 'VUNGU', scp: 'context-parcels' })
    expect(r).toEqual({ authority: 'VUNGU', lo_zone: 29, srid: 922029, truncated: false, count: 1, as_of: 'x', features })
    expect(r.success).toBeUndefined()
  })

  const fails = async (fetchImpl, env = ENV) => { try { await contextParcels(query, person, { fetchImpl, env }) } catch (e) { return e } return null }

  test('a question VunGIS declines (too big, no such belt) says why, in its own words', async () => {
    const e = await fails(reply(422, { error: 'area_too_large', message: 'the area (with its buffer) may be at most 6000 m on a side' }))
    expect([e.status, e.code]).toEqual([422, 'area_too_large'])
    expect(e.message).toMatch(/6000 m/)
    const z = await fails(reply(409, { error: 'zone_unknown', message: 'the register has no Lo25 belt' }))
    expect([z.status, z.code]).toEqual([422, 'zone_unknown'])
  })
  test('not connected, unreachable, refused: as for the layout check', async () => {
    expect((await fails(async () => {}, {})).code).toBe('check_not_configured')
    expect((await fails(async () => { throw new Error('ECONNREFUSED') })).code).toBe('register_unreachable')
    expect((await fails(reply(401, {}))).code).toBe('check_refused')
    expect((await fails(reply(503, {}))).code).toBe('check_not_connected')
    expect((await fails(reply(200, { success: true }))).code).toBe('register_error')              // an answer without features is not an answer
  })
})
