/**
 * Names of properties and districts are written the way a surveyor writes them on a plan:
 * "STAND 1345 OF SEBANGA POORT" -> "Stand 1345 of Sebanga Poort", "SELUKWE" -> "Selukwe".
 *
 * Joining words stay lower case (except at the start); a word with a digit ("1A", "405B"), a lone letter
 * ("Subdivision A") or a dotted abbreviation ("R.M.") keeps its capitals; hyphenated words capitalise
 * each part.
 */
const SMALL = new Set(['of', 'the', 'and', 'in', 'at', 'on', 'to', 'for', 'a'])

const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()

export function placeCase(text) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  let first = true
  return s.replace(/\S+/g, (word) => {
    const isFirst = first
    first = false
    if (/\d/.test(word) || /\./.test(word)) return word
    const letters = word.replace(/[^A-Za-z]/g, '')
    if (letters.length <= 1) return word.toUpperCase() === word || !SMALL.has(word.toLowerCase()) ? word.toUpperCase() : word
    if (!isFirst && SMALL.has(word.toLowerCase())) return word.toLowerCase()
    return word.split('-').map(cap).join('-')
  })
}
