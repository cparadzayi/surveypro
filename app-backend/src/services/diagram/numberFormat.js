/**
 * Format a number the SI 727 / Zimbabwe way: comma decimal separator and a
 * space between thousands groups of the integer part. With `sign`, prefix an
 * explicit "+"/"-" followed by a space (e.g. "- 82 360,81", "+ 0,00").
 * Non-numeric input is treated as 0.
 */
export function formatSI(value, decimals = 2, { sign = false } = {}) {
  const num = Number(value) || 0
  const neg = num < 0
  const fixed = Math.abs(num).toFixed(decimals)          // "82360.81" | "0"
  const [intPart, dec] = fixed.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')  // "82 360"
  const body = dec != null ? `${grouped},${dec}` : grouped        // "82 360,81"
  return sign ? `${neg ? '-' : '+'} ${body}` : body
}
