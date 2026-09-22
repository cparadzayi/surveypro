/**
 * The figure statement names the SELECTED parcel. If the subject parcel already
 * carries a full designation (letters present, e.g. "STAND 405 BRACKENHURST
 * TOWNSHIP") use it as-is. Otherwise the parcel is a bare stand number ("405"):
 * build "STAND <n> <locality>" by reusing the locality suffix from the project
 * designation ("STANDS 403-405 BRACKENHURST TOWNSHIP" → "BRACKENHURST TOWNSHIP").
 */
export function resolveStatementDesignation(subjectName, subjectStand, projectDesignation) {
  const name = subjectName == null ? '' : String(subjectName).trim()
  // Already a full designation (contains letters) — use it.
  if (name && /[A-Za-z]/.test(name)) return name

  const stand = (name || (subjectStand == null ? '' : String(subjectStand))).trim()
  const proj = projectDesignation == null ? '' : String(projectDesignation).trim()
  if (!stand) return proj

  // Reuse the project designation's locality suffix (everything after the leading
  // "STAND(S) <numbers>"), swapping in this parcel's single stand.
  const m = proj.match(/^STANDS?\b[\s\d,.–—-]+(.*)$/i)
  if (m && m[1].trim()) return `STAND ${stand} ${m[1].trim()}`
  return `STAND ${stand}`
}

/**
 * The figure statement names the parcel as "{designation} OF {parent}" — but
 * the designation often already carries the same parent clause ("STAND 271
 * MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A"). That clause must be
 * dropped before the parent is appended, or the figure would name the parent
 * twice ("…SURFACE RIGHTS A OF SHABANI MINE SURFACE RIGHTS A"). Without a
 * parentProperty the designation is returned untouched.
 */
export function statementDesignation(resolvedDesignation, parentProperty) {
  const parent = parentProperty == null ? '' : String(parentProperty).trim()
  if (!parent) return resolvedDesignation
  const base = String(resolvedDesignation ?? '').replace(/\s+of\s+.+$/i, '').trim()
  return base ? `${base} OF ${parent.toUpperCase()}` : resolvedDesignation
}
