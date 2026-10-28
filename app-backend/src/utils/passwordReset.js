import { createHash, randomBytes } from 'crypto'
import bcrypt from 'bcrypt'

/**
 * Administrator-issued password reset links.
 *
 * The token is 32 random bytes; only its SHA-256 is stored. A link works once, expires after
 * `RESET_TTL_MS`, and issuing a new one for the same person retires the old ones. Consuming one also
 * retires every other open link for that person, so a leaked older link is dead the moment the
 * password changes.
 */

export const RESET_TTL_MS = 60 * 60 * 1000
export const MIN_PASSWORD_LENGTH = 6 // the same rule as registration

export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex')
export const newToken = () => randomBytes(32).toString('base64url')

/** A token that cannot possibly be one of ours is refused before it touches the database. */
export const looksLikeToken = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t)

/**
 * @param {{query: Function}} db
 * @returns {Promise<{token: string, expiresAt: Date}>}
 */
export async function createResetToken(db, { userId, createdBy = null, now = new Date() }) {
  const token = newToken()
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS)
  await db.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [userId])
  await db.query(
    'INSERT INTO password_reset_tokens (user_id, token_hash, created_by, expires_at) VALUES ($1, $2, $3, $4)',
    [userId, hashToken(token), createdBy, expiresAt]
  )
  return { token, expiresAt }
}

/**
 * Sets a new password if the token is open and in date. All or nothing, in one transaction.
 * @param {{connect: Function}} pool
 * @returns {Promise<{ok: true, email: string} | {ok: false, reason: 'invalid'|'weak'}>}
 */
export async function consumeResetToken(pool, { token, password }) {
  if (!looksLikeToken(token)) return { ok: false, reason: 'invalid' }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: 'weak' }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // FOR UPDATE: two people opening the same link at once cannot both win.
    const found = await client.query(
      `SELECT t.id, t.user_id, u.email
         FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > NOW()
        FOR UPDATE OF t`,
      [hashToken(token)]
    )
    const row = found.rows[0]
    if (!row) {
      await client.query('ROLLBACK')
      return { ok: false, reason: 'invalid' }
    }
    const hash = await bcrypt.hash(password, await bcrypt.genSalt(10))
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, row.user_id])
    await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [row.user_id])
    await client.query('COMMIT')
    return { ok: true, email: row.email }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
