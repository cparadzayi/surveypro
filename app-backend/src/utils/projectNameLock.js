/**
 * Serialises "create a project called X" per surveyor so a double click cannot make two.
 *
 * The check "does this name exist?" and the insert are separate statements; two requests that
 * arrive together both pass the check. Holding a key in memory for the duration closes that gap
 * within one server process, which is the deployment this app has. (A unique index on
 * lower(name) would be the cross-process answer, but existing databases may already hold
 * duplicates, so it is not added blindly.)
 */
export class NameLock {
  constructor() {
    this.held = new Set()
  }

  /**
   * Runs `fn` unless the same key is already running.
   * @returns {Promise<{busy: true} | {busy: false, value: any}>}
   */
  async run(key, fn) {
    if (this.held.has(key)) return { busy: true }
    this.held.add(key)
    try {
      return { busy: false, value: await fn() }
    } finally {
      this.held.delete(key)
    }
  }
}

export const projectNameLock = new NameLock()

/** The comparison key for a project name: case and surrounding space do not make a new name. */
export const nameKey = (name) => String(name ?? '').trim().toLowerCase()
