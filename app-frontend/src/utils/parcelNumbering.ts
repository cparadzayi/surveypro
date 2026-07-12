/**
 * Auto-incrementing parcel designations.
 *
 * When digitizing parcels the designation is usually sequential
 * (e.g. STAND 314, STAND 315, …). `nextDesignation` predicts the next one by
 * incrementing the last run of digits in the previous designation while
 * preserving the surrounding format (prefix, trailing suffix, zero-padding).
 */

/** Normalise a designation for existence comparison (case/whitespace agnostic). */
function normalise(s: string): string {
  return s.trim().toUpperCase()
}

/**
 * Return the next designation after `last`, or '' when nothing can be inferred.
 *
 * When `existing` is supplied, the candidate is stepped forward (keeping the
 * same format) until it lands on a number that is NOT already present — so a
 * duplicate is never proposed. Comparison is case- and whitespace-insensitive.
 *
 *   nextDesignation('STAND 314')                              === 'STAND 315'
 *   nextDesignation('314')                                    === '315'
 *   nextDesignation('LOT 2283A')                              === 'LOT 2284A'
 *   nextDesignation('Erf 007')                                === 'Erf 008'
 *   nextDesignation('Remainder')                              === ''   // no digits
 *   nextDesignation('')                                       === ''
 *   nextDesignation('STAND 314', ['STAND 315', 'STAND 316'])  === 'STAND 317'
 */
export function nextDesignation(last: string, existing?: Iterable<string>): string {
  if (!last) return ''

  // Capture the LAST run of digits: lazy prefix, digits, then only non-digits
  // to the end. `(\D*)$` forces `(\d+)` onto the final digit group.
  const match = String(last).match(/^(.*?)(\d+)(\D*)$/)
  if (!match) return ''

  const [, prefix, digits, suffix] = match
  const width = digits.length

  // Set of already-used designations to skip past (normalised for comparison).
  const taken = new Set<string>()
  if (existing) {
    for (const d of existing) {
      if (d) taken.add(normalise(String(d)))
    }
  }

  // Step forward from `digits + 1` until the candidate is free. The loop is
  // bounded so a pathological `existing` set can never hang the UI; if every
  // candidate in range is taken we fall back to the plain +1.
  let n = Number(digits) + 1
  const base = n
  for (let guard = 0; guard < 100000; guard++, n++) {
    const candidate = `${prefix}${String(n).padStart(width, '0')}${suffix}`
    if (!taken.has(normalise(candidate))) return candidate
  }

  return `${prefix}${String(base).padStart(width, '0')}${suffix}`
}

/** Trailing-integer value of a designation, or null when it has no digits. */
function trailingNumber(designation: string): number | null {
  const m = String(designation).match(/^(.*?)(\d+)(\D*)$/)
  return m ? Number(m[2]) : null
}

/**
 * Suggest the next designation for a NEW parcel, given every designation
 * currently on the plan.
 *
 * Rather than trusting list order (which is unreliable — e.g. the Outside
 * Figure parcel is loaded last), it picks the parcel with the HIGHEST trailing
 * number and increments that, skipping any number already taken. The Outside
 * Figure is excluded so its "…SH2" suffix can never seed the guess.
 *
 * Returns '' when there is no numbered parcel to extrapolate from.
 *
 *   suggestNextDesignation(['314', '315', '325', 'OUTSIDE FIGURE X'])  === '326'
 *   suggestNextDesignation(['STAND 271', 'STAND 349'])                 === 'STAND 350'
 *   suggestNextDesignation([])                                         === ''
 */
export function suggestNextDesignation(existing: Iterable<string>): string {
  let best: string | null = null
  let bestVal = -Infinity
  for (const d of existing) {
    if (!d || /outside\s*figure/i.test(d)) continue
    const val = trailingNumber(d)
    if (val === null) continue
    if (val > bestVal) {
      bestVal = val
      best = d
    }
  }
  return best === null ? '' : nextDesignation(best, existing)
}
