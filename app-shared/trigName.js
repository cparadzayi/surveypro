/**
 * The trig monument DISPLAY rule — the ONLY place it exists.
 *
 * The national registry (public.zim_control_points) records monument names in
 * capitals: THORNHILL, CHRISTMAS GIFT. A surveyor reads them as words, so every
 * surface that shows one renders it in title case — Thornhill, Christmas Gift.
 *
 * Applied at DISPLAY sites, which is the deliberate opposite of the beacon name
 * rule in ./beaconName.js. That rule normalises at the write door because a
 * beacon name is the surveyor's own and carries identity. A monument name is
 * reference data we do not own and must never rewrite: the registry keeps its
 * capitals, and only the rendering changes. Do not merge the two rules.
 *
 * A token is left byte for byte when it is not a word:
 *   - it carries a digit (TSM5025, and the 2 of CHIVHU 2), or
 *   - it has no vowel, so it reads as a code: CPLX, TSM, GMB, BLDG, the STH
 *     of M.W.GATOOMA STH, and the compass SW of KHAMI RIVER SW, or
 *   - it is already mixed case, so somebody meant it that way (McDonald) —
 *     which is also what makes this function idempotent.
 *
 * The exception is a vowel-less token that stands for a word. The registry spells
 * those both ways - MT x5 against Mt x6, ST x2 against St x3 - so the mixed-case
 * rows show what it means and the shouting rows are made to follow them. The map
 * is a closed list of what the data actually holds, not a rule about length: a
 * two-letter rule would also turn the bearing SW into Sw.
 */

/** Connecting words stay down unless they open the name: 'Mount of Olives'. */
const MINOR = new Set(['of', 'the', 'and', 'on', 'at', 'to', 'in', 'for', 'a'])

/** Vowel-less tokens that are words, not codes. Keyed on the upper-case form. */
const ABBREVIATION = new Map([['MT', 'Mt'], ['ST', 'St']])

/** Runs of letters and digits are words; everything between them is a separator
 *  and is preserved, so spacing, hyphens and apostrophes survive untouched. */
const TOKEN = /[A-Za-z0-9]+/g

const hasDigit = (t) => /\d/.test(t)
const hasVowel = (t) => /[AEIOUaeiou]/.test(t)
const isMixedCase = (t) => t !== t.toUpperCase() && t !== t.toLowerCase()

/** Total, idempotent, never throws; non-strings are returned unchanged. */
export function displayTrigName(name) {
  if (typeof name !== 'string') return name
  let index = 0
  return name.replace(TOKEN, (token) => {
    const i = index++
    if (hasDigit(token)) return token
    const abbreviation = ABBREVIATION.get(token.toUpperCase())
    if (abbreviation) return abbreviation
    if (!hasVowel(token) || isMixedCase(token)) return token
    const lower = token.toLowerCase()
    if (i > 0 && MINOR.has(lower)) return lower
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  })
}
