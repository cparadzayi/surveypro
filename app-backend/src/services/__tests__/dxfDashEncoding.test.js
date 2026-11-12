/**
 * A General Plan's party-wall table joins two beacons with an en dash ("1970A – 1984A"). The DXF is written as
 * UTF-8 bytes, so the en dash was E2 80 93, and a Windows-1252 viewer showed "1970A â€“ 1984A". Every writer
 * that produces a DXF (Release 12 and Release 2000, through opsToDxf and through the entity converter) now writes
 * a plain hyphen, so the table reads "1970A - 1984A" in every viewer.
 */
import { describe, test, expect } from '@jest/globals'
import { opsToDxf } from '../diagram/opsToDxf.js'

const ground = { center: { x: 0, y: 0 }, figCenterPx: 0, figCenterPy: 0, perPt: 1, sheet: null }
const textOp = (text) => ({ type: 'text', layer: 'TITLE_BLOCK', text, x: 10, y: 10, size: 8, width: 60, rotation: 0, font: 'Helvetica', color: '#000000' })
const layers = [{ name: 'TITLE_BLOCK', color: 7 }]

const bytesHave = (buf, ...bytes) => Buffer.from(buf).includes(Buffer.from(bytes))

describe.each([['r12'], ['r2000']])('DXF %s text', (version) => {
  const { dxfBuffer } = opsToDxf([textOp('1970A – 1984A'), textOp('1692B—1693A')], ground, { version, layers })
  const text = dxfBuffer.toString('utf8')

  test('writes the dash between two beacons as a plain hyphen', () => {
    expect(text).toContain('1970A - 1984A')
    expect(text).toContain('1692B-1693A')
  })

  test('leaves no UTF-8 dash bytes to be read as "â€“"', () => {
    expect(bytesHave(dxfBuffer, 0xe2, 0x80, 0x93)).toBe(false)
    expect(bytesHave(dxfBuffer, 0xe2, 0x80, 0x94)).toBe(false)
  })
})

describe('DXF Release 2000: other non-ASCII text', () => {
  // A Release 2000 file is read in Windows-1252, not UTF-8, so a raw "m²" arrives as "mÂ²". AutoCAD's own \U+XXXX
  // escape carries the character in pure ASCII.
  const { dxfBuffer } = opsToDxf([textOp('Area 4046 m²'), textOp('Café Road')], ground, { version: 'r2000', layers })

  test('writes it as a \\U+XXXX escape, so the file is pure ASCII', () => {
    const t = dxfBuffer.toString('utf8')
    expect(t).toContain('Area 4046 m\\U+00B2')
    expect(t).toContain('Caf\\U+00E9 Road')
    expect([...dxfBuffer].every((b) => b < 0x80)).toBe(true)
  })
})
