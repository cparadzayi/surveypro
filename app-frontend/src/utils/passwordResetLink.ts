/** Helpers for the administrator-issued password reset link. */

/** The full link to hand to the surveyor: this site's address plus the path the server returned. */
export function resetLink(origin: string, resetPath: string): string {
  return origin.replace(/\/+$/, '') + (resetPath.startsWith('/') ? resetPath : '/' + resetPath)
}

/** "in 59 minutes", "in 1 minute", "now": how long a link has left. */
export function describeTimeLeft(expiresAtIso: string, now: Date = new Date()): string {
  const minutes = Math.round((Date.parse(expiresAtIso) - now.getTime()) / 60000)
  if (!Number.isFinite(minutes) || minutes <= 0) return 'now'
  if (minutes === 1) return 'in 1 minute'
  if (minutes < 120) return `in ${minutes} minutes`
  return `in ${Math.round(minutes / 60)} hours`
}

/** What is wrong with a new password pair, in words, or null when it is fine. */
export function passwordProblem(password: string, confirm: string, minLength = 6): string | null {
  if (password.length < minLength) return `Use at least ${minLength} characters.`
  if (password !== confirm) return 'The two passwords do not match.'
  return null
}
