/**
 * Auto-incrementing parcel designations.
 *
 * When digitizing parcels the designation is usually sequential
 * (e.g. STAND 314, STAND 315, …). `nextDesignation` predicts the next one by
 * incrementing the last run of digits in the previous designation while
 * preserving the surrounding format (prefix, trailing suffix, zero-padding).
 */

/**
 * Return the next designation after `last`, or '' when nothing can be inferred.
 *
 *   nextDesignation('STAND 314') === 'STAND 315'
 *   nextDesignation('314')       === '315'
 *   nextDesignation('LOT 2283A') === 'LOT 2284A'
 *   nextDesignation('Erf 007')   === 'Erf 008'
 *   nextDesignation('Remainder') === ''   // no digits
 *   nextDesignation('')          === ''
 */
export function nextDesignation(last: string): string {
  if (!last) return ''

  // Capture the LAST run of digits: lazy prefix, digits, then only non-digits
  // to the end. `(\D*)$` forces `(\d+)` onto the final digit group.
  const match = String(last).match(/^(.*?)(\d+)(\D*)$/)
  if (!match) return ''

  const [, prefix, digits, suffix] = match
  const incremented = String(Number(digits) + 1)
  // Keep the original zero-padding width (but never truncate when it grows).
  const padded = incremented.padStart(digits.length, '0')

  return `${prefix}${padded}${suffix}`
}
