/**
 * The beacon name rule — the ONLY place it exists.
 *
 * A name with a numeric prefix and an alphabetic suffix has its suffix uppercased
 * when, and only when, the suffix is ALL lowercase: 2474a → 2474A, 15b → 15B.
 * Everything else passes through byte for byte: a mixed-case suffix (1464An is a
 * deliberate naming form, confirmed with the surveyor 2026-09-12), an uppercase
 * suffix, a letter-only name (SD4, TSM5025), a trailing digit (2474A1).
 *
 * Applied at every WRITE door (backend, defensively) and every ENTRY point
 * (frontend, so the typed string equals the stored string) — never at display
 * sites. See docs/superpowers/specs/2026-09-12-beacon-name-reconciliation-design.md
 * decisions 11, 12 and 14.
 */

const NUMERIC_SUFFIX = /^(\d+)([A-Za-z]+)$/

/** '2474a' → { prefix: '2474', suffix: 'a' }; 'SD4' → null. Verbatim, no casing. */
export function splitBeaconName(name) {
  if (typeof name !== 'string') return null
  const match = NUMERIC_SUFFIX.exec(name)
  return match ? { prefix: match[1], suffix: match[2] } : null
}

/** Decision 12. Total, idempotent, never throws; non-strings are returned unchanged. */
export function normalizeBeaconName(name) {
  const parts = splitBeaconName(name)
  if (!parts || parts.suffix !== parts.suffix.toLowerCase()) return name
  return parts.prefix + parts.suffix.toUpperCase()
}

/**
 * The split every label-derivation site needs: prefix to find the stand, suffix to
 * print. Splitting the NORMALISED name means 2474a prints A while 1464An prints An.
 */
export function labelParts(name) {
  return splitBeaconName(normalizeBeaconName(name))
}

/**
 * Groups of two or more DISTINCT raw names that normalise to one stored name,
 * e.g. [['99a', '99A']]. Exact repeats are not reported (decision 15: they keep
 * today's averaging behaviour). Non-strings are ignored.
 */
export function findCaseFoldDuplicates(names) {
  const groups = new Map()
  for (const raw of Array.isArray(names) ? names : []) {
    if (typeof raw !== 'string') continue
    const key = normalizeBeaconName(raw)
    const group = groups.get(key) ?? []
    if (!group.includes(raw)) group.push(raw)
    groups.set(key, group)
  }
  return Array.from(groups.values()).filter(group => group.length > 1)
}

/**
 * The backfill's beacon half, for one project's coordinate_points rows.
 *
 * A rename whose target name already exists is a COLLISION: it is reported and
 * never applied (decision 15). `after` is the row list with the renames applied —
 * what parcel reconciliation must match against, so parcels are named with the
 * names that will exist once phase A1 has run.
 */
export function planNameNormalization(rows) {
  const list = Array.isArray(rows) ? rows : []
  const existing = new Set(list.map(row => row?.name).filter(name => typeof name === 'string'))
  const renames = []
  const collisions = []
  const renamed = new Map()

  for (const row of list) {
    const from = row?.name
    if (typeof from !== 'string') continue
    const to = normalizeBeaconName(from)
    if (to === from) continue
    if (existing.has(to)) {
      collisions.push({ from, existing: to })
      continue
    }
    renames.push({ id: row.id, from, to })
    renamed.set(row, to)
  }

  const after = list.map(row => (renamed.has(row) ? { ...row, name: renamed.get(row) } : row))
  return { renames, collisions, after }
}