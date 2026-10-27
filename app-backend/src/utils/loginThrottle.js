/**
 * Sign-in throttle. Counts failed attempts per account (any address) and per address (any
 * account) over a sliding window, and refuses further attempts until the oldest one ages out.
 *
 * In memory and per process: it restarts empty and does not span several servers. That is
 * enough to stop one client guessing passwords; a shared store is the next step if the API is
 * ever scaled out.
 */
export class LoginThrottle {
  /**
   * @param {object} [o]
   * @param {number} [o.perAccount]  failures per account per window
   * @param {number} [o.perAddress]  failures per address per window
   * @param {number} [o.windowMs]
   * @param {() => number} [o.now]
   */
  constructor({ perAccount = 8, perAddress = 40, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
    this.perAccount = perAccount
    this.perAddress = perAddress
    this.windowMs = windowMs
    this.now = now
    this.failures = new Map() // key -> timestamps (ms)
  }

  #keys(email, ip) {
    return [
      [`a:${String(email).trim().toLowerCase()}`, this.perAccount],
      [`i:${ip}`, this.perAddress],
    ]
  }

  #recent(key) {
    const cutoff = this.now() - this.windowMs
    const list = (this.failures.get(key) ?? []).filter((t) => t > cutoff)
    if (list.length) this.failures.set(key, list)
    else this.failures.delete(key)
    return list
  }

  /** Seconds the caller must wait, or 0 when an attempt is allowed. */
  retryAfterSeconds(email, ip) {
    let wait = 0
    for (const [key, limit] of this.#keys(email, ip)) {
      const list = this.#recent(key)
      if (list.length >= limit) wait = Math.max(wait, list[list.length - limit] + this.windowMs - this.now())
    }
    return wait > 0 ? Math.ceil(wait / 1000) : 0
  }

  recordFailure(email, ip) {
    for (const [key] of this.#keys(email, ip)) {
      this.#recent(key)
      const list = this.failures.get(key) ?? []
      list.push(this.now())
      this.failures.set(key, list)
    }
  }

  /** A correct sign-in clears the account's count (not the address's: one success is no proof). */
  recordSuccess(email) {
    this.failures.delete(`a:${String(email).trim().toLowerCase()}`)
  }
}

export const loginThrottle = new LoginThrottle()
