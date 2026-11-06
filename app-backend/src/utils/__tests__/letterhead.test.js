import { describe, test, expect } from '@jest/globals'
import {
  cleanLetterheadText, parseLogoDataUrl, pngSize, logoToDataUrl, MAX_LOGO_BYTES,
} from '../letterhead.js'

/** The first bytes of a PNG of the given size: signature, then an IHDR chunk. Enough for the header checks. */
function png(width, height, padTo = 0) {
  const head = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0)
  head.writeUInt32BE(13, 8)
  head.write('IHDR', 12, 'latin1')
  head.writeUInt32BE(width, 16)
  head.writeUInt32BE(height, 20)
  return padTo > head.length ? Buffer.concat([head, Buffer.alloc(padTo - head.length)]) : head
}
const url = (bytes, mime = 'image/png') => `data:${mime};base64,${bytes.toString('base64')}`

describe('cleanLetterheadText', () => {
  test('trims what is given, leaves out what is absent, and treats an empty string as clearing', () => {
    const { values } = cleanLetterheadText({ firm: '  C Paradzayi Land Surveyors ', phone: '', subtitle: undefined })
    expect(values).toEqual({ firm: 'C Paradzayi Land Surveyors', phone: '' })
    expect('subtitle' in values).toBe(false)
  })

  test('replaces control characters, so a line break cannot be smuggled into a one-line field', () => {
    expect(cleanLetterheadText({ address: '6322 Hwari\r\nStreet' }).values.address).toBe('6322 Hwari  Street')
  })

  test('refuses text that is too long, not text, or a malformed e-mail, naming the field', () => {
    expect(cleanLetterheadText({ firm: 'x'.repeat(121) }).error).toMatch(/firm is longer than 120/)
    expect(cleanLetterheadText({ phone: 12345 }).error).toMatch(/phone must be text/)
    expect(cleanLetterheadText({ email: 'not-an-email' }).error).toMatch(/email is not a valid/)
    expect(cleanLetterheadText({ email: 'cparadzayi@gmail.com' }).values.email).toBe('cparadzayi@gmail.com')
  })

  test('an empty e-mail is allowed, as it clears the field', () => {
    expect(cleanLetterheadText({ email: '' }).values.email).toBe('')
  })

  test('ignores fields it does not know', () => {
    expect(cleanLetterheadText({ role: 'admin', firm: 'F' }).values).toEqual({ firm: 'F' })
  })
})

describe('parseLogoDataUrl', () => {
  test('accepts a PNG and reports its size', () => {
    const { logo, error } = parseLogoDataUrl(url(png(400, 300)))
    expect(error).toBeUndefined()
    expect(logo).toMatchObject({ mime: 'image/png', width: 400, height: 300 })
    expect(Buffer.isBuffer(logo.bytes)).toBe(true)
  })

  test('refuses anything that is not declared as a PNG data URL', () => {
    expect(parseLogoDataUrl(undefined).error).toMatch(/missing/)
    expect(parseLogoDataUrl(url(png(100, 100), 'image/jpeg')).error).toMatch(/PNG/)
    expect(parseLogoDataUrl('https://example.com/logo.png').error).toMatch(/PNG/)
    expect(parseLogoDataUrl('data:image/png;base64,@@@').error).toMatch(/PNG/)
  })

  test('judges by the bytes, not the label: a PNG label over other bytes is refused', () => {
    expect(parseLogoDataUrl(url(Buffer.from('<svg onload=alert(1)></svg>'))).error).toMatch(/valid PNG/)
    expect(parseLogoDataUrl(url(Buffer.alloc(40))).error).toMatch(/valid PNG/)
  })

  test('refuses a logo that is too large in bytes or in pixels, or too small', () => {
    expect(parseLogoDataUrl(url(png(100, 100, MAX_LOGO_BYTES + 1))).error).toMatch(/larger than 512 KB/)
    expect(parseLogoDataUrl(url(png(2001, 100))).error).toMatch(/larger than 2000 pixels/)
    expect(parseLogoDataUrl(url(png(8, 8))).error).toMatch(/smaller than 16 pixels/)
  })
})

describe('png helpers', () => {
  test('pngSize reads the IHDR and rejects other bytes', () => {
    expect(pngSize(png(123, 45))).toEqual({ width: 123, height: 45 })
    expect(pngSize(Buffer.from('GIF89a................'))).toBeNull()
  })

  test('logoToDataUrl round-trips with parseLogoDataUrl', () => {
    const bytes = png(64, 64)
    expect(parseLogoDataUrl(logoToDataUrl(bytes, 'image/png')).logo.bytes.equals(bytes)).toBe(true)
  })
})
