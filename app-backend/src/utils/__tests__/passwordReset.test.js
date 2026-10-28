import { describe, test, expect, jest } from '@jest/globals'
import bcrypt from 'bcrypt'
import { consumeResetToken, createResetToken, hashToken, looksLikeToken, newToken, RESET_TTL_MS } from '../passwordReset.js'

/** A pool whose one client answers from a script and records everything it was asked. */
function fakePool(selectRows) {
  const log = []
  const client = {
    query: jest.fn(async (sql, params) => {
      log.push({ sql: String(sql).trim().split(/\s+/).slice(0, 3).join(' '), params })
      if (/^SELECT t\.id/.test(String(sql).trim())) return { rows: selectRows }
      return { rows: [] }
    }),
    release: jest.fn(),
  }
  return { pool: { connect: async () => client }, client, log }
}

describe('tokens', () => {
  test('are 43 url-safe characters, different every time, and recognised as ours', () => {
    const a = newToken(), b = newToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
    expect(looksLikeToken(a)).toBe(true)
  })
  test('anything else is refused before it can reach the database', () => {
    for (const bad of ['', 'abc', 'x'.repeat(44), 'x'.repeat(42) + '!', null, undefined, 42, {}, "' OR 1=1 --"]) expect(looksLikeToken(bad)).toBe(false)
  })
  test('only the SHA-256 hash is ever stored', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('createResetToken', () => {
  test('retires older open links for that person, stores the hash and an hour of life, and returns the token once', async () => {
    const db = { query: jest.fn(async () => ({ rows: [] })) }
    const now = new Date('2026-10-28T10:00:00Z')
    const { token, expiresAt } = await createResetToken(db, { userId: 7, createdBy: 1, now })
    expect(expiresAt.getTime() - now.getTime()).toBe(RESET_TTL_MS)
    expect(db.query.mock.calls[0][0]).toMatch(/UPDATE password_reset_tokens SET used_at/)
    expect(db.query.mock.calls[0][1]).toEqual([7])
    const [sql, params] = db.query.mock.calls[1]
    expect(sql).toMatch(/INSERT INTO password_reset_tokens/)
    expect(params[0]).toBe(7)
    expect(params[1]).toBe(hashToken(token))
    expect(params).not.toContain(token) // the clear token is never written
    expect(params[2]).toBe(1)
  })
})

describe('consumeResetToken', () => {
  const token = newToken()

  test('a token that is not shaped like ours never opens a connection', async () => {
    const connect = jest.fn()
    expect(await consumeResetToken({ connect }, { token: 'nope', password: 'secret1' })).toEqual({ ok: false, reason: 'invalid' })
    expect(connect).not.toHaveBeenCalled()
  })

  test('a short password is refused before the link is touched, so a typo does not burn it', async () => {
    const { pool, client } = fakePool([])
    expect(await consumeResetToken(pool, { token, password: '123' })).toEqual({ ok: false, reason: 'weak' })
    expect(client.query).not.toHaveBeenCalled()
  })

  test('an unknown, used or expired link rolls back and changes nothing', async () => {
    const { pool, log } = fakePool([])
    expect(await consumeResetToken(pool, { token, password: 'secret1' })).toEqual({ ok: false, reason: 'invalid' })
    expect(log.map((l) => l.sql)).toEqual(['BEGIN', 'SELECT t.id, t.user_id,', 'ROLLBACK'])
  })

  test('a good link sets a real bcrypt hash, retires every open link for the person, and commits', async () => {
    const { pool, client, log } = fakePool([{ id: 5, user_id: 7, email: 'a@x.test' }])
    const r = await consumeResetToken(pool, { token, password: 'new-secret' })
    expect(r).toEqual({ ok: true, email: 'a@x.test' })
    expect(log.map((l) => l.sql)).toEqual(['BEGIN', 'SELECT t.id, t.user_id,', 'UPDATE users SET', 'UPDATE password_reset_tokens SET', 'COMMIT'])
    const setPassword = log.find((l) => l.sql === 'UPDATE users SET')
    expect(setPassword.params[1]).toBe(7)
    expect(await bcrypt.compare('new-secret', setPassword.params[0])).toBe(true)
    expect(setPassword.params[0]).not.toContain('new-secret')
    // the lookup is by the hash of the token, with FOR UPDATE so two people cannot both win
    const select = client.query.mock.calls.find((c) => /SELECT t\.id/.test(c[0]))
    expect(select[1]).toEqual([hashToken(token)])
    expect(select[0]).toMatch(/FOR UPDATE/)
    expect(select[0]).toMatch(/used_at IS NULL/)
    expect(select[0]).toMatch(/expires_at > NOW\(\)/)
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  test('a failure part-way rolls back, releases the connection and is not swallowed', async () => {
    const { pool, client } = fakePool([{ id: 5, user_id: 7, email: 'a@x.test' }])
    client.query.mockImplementation(async (sql) => {
      if (/^SELECT t\.id/.test(String(sql).trim())) return { rows: [{ id: 5, user_id: 7, email: 'a@x.test' }] }
      if (/UPDATE users/.test(sql)) throw new Error('disk full')
      return { rows: [] }
    })
    await expect(consumeResetToken(pool, { token, password: 'new-secret' })).rejects.toThrow('disk full')
    expect(client.query.mock.calls.map((c) => String(c[0]).trim().split(/\s+/)[0])).toContain('ROLLBACK')
    expect(client.release).toHaveBeenCalledTimes(1)
  })
})
