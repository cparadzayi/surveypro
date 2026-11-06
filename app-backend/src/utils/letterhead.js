/**
 * Validation for a surveyor's letterhead: the text fields and the logo image.
 *
 * Pure functions, so the route stays thin and these are tested without a server or a database.
 */

/** The longest a stored logo may be, in bytes. The migration's CHECK repeats this as a backstop. */
export const MAX_LOGO_BYTES = 512 * 1024
/** Smallest and largest side of a logo, pixels. */
export const MIN_LOGO_SIDE = 16
export const MAX_LOGO_SIDE = 2000

/** Field -> longest accepted length. */
const TEXT_LIMITS = { firm: 120, subtitle: 160, phone: 40, email: 120, website: 120, address: 200 }
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

/**
 * Cleans the letterhead's text fields from a request body.
 *
 * A field that is absent is left out of the result (not changed); one that is present is trimmed, and an
 * empty one means "clear it". Returns { values } or { error } naming the first bad field.
 */
export function cleanLetterheadText(body) {
  const values = {}
  for (const [field, max] of Object.entries(TEXT_LIMITS)) {
    if (body?.[field] === undefined) continue
    if (body[field] !== null && typeof body[field] !== 'string') return { error: `${field} must be text` }
    const text = (body[field] ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
    if (text.length > max) return { error: `${field} is longer than ${max} characters` }
    if (field === 'email' && text && !EMAIL.test(text)) return { error: 'email is not a valid address' }
    values[field] = text
  }
  return { values }
}

/**
 * Reads a PNG's width and height from its IHDR chunk, or null when the bytes are not a PNG.
 * The signature is 8 bytes, then the IHDR chunk: length(4) 'IHDR'(4) width(4) height(4).
 */
export function pngSize(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b)) return null
  if (bytes.toString('latin1', 12, 16) !== 'IHDR') return null
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/**
 * Checks a logo sent as a `data:image/png;base64,...` URL and returns its bytes.
 *
 * The browser has already trimmed and shrunk it and always sends a PNG, but nothing here trusts that: the
 * type is checked from the bytes themselves, not from what the URL claims, and so is the size.
 * Returns { logo: { bytes, mime, width, height } } or { error }.
 */
export function parseLogoDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return { error: 'logo is missing' }
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!m) return { error: 'logo must be a PNG image' }
  const bytes = Buffer.from(m[1], 'base64')
  if (bytes.length > MAX_LOGO_BYTES) return { error: `logo is larger than ${MAX_LOGO_BYTES / 1024} KB` }
  const size = pngSize(bytes)
  if (!size) return { error: 'logo is not a valid PNG image' }
  if (size.width < MIN_LOGO_SIDE || size.height < MIN_LOGO_SIDE) return { error: `logo is smaller than ${MIN_LOGO_SIDE} pixels` }
  if (size.width > MAX_LOGO_SIDE || size.height > MAX_LOGO_SIDE) return { error: `logo is larger than ${MAX_LOGO_SIDE} pixels` }
  return { logo: { bytes, mime: 'image/png', width: size.width, height: size.height } }
}

/** A stored logo as the data URL the browser draws and jsPDF embeds. */
export function logoToDataUrl(bytes, mime) {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
}
