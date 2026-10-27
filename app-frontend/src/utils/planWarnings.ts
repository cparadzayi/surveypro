/**
 * The X-Plan-Warnings response header: a JSON array of plain sentences from the plan
 * renderer. Anything else (absent, not JSON, not an array) reads as "no warnings" rather
 * than an error: a malformed header must never fail a generation that otherwise worked.
 */
export function parseWarningsHeader(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : []
  } catch {
    return []
  }
}
