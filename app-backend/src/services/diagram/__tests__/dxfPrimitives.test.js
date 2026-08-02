import { describe, test, expect } from '@jest/globals'
import { createDxfWriter, textWidth } from '../dxfPrimitives.js'

const LAYERS = [{ name: 'A', color: 7 }, { name: 'B', color: 1 }]

describe('textWidth', () => {
  test('length * height * 0.55', () => {
    expect(textWidth('ABC', 10)).toBeCloseTo(16.5, 6)
    expect(textWidth('', 10)).toBe(0)
  })
})

describe('createDxfWriter', () => {
  test('finish() produces a well-formed DXF with declared layers', () => {
    const w = createDxfWriter(LAYERS)
    const buf = w.finish({ x: -10, y: -10 }, { x: 10, y: 10 })
    expect(Buffer.isBuffer(buf)).toBe(true)
    const text = buf.toString('utf8')
    expect(text.startsWith('  0\nSECTION\n')).toBe(true)
    expect(text).toContain('HEADER')
    expect(text).toContain('ENTITIES')
    expect(text.trim().endsWith('0\nEOF')).toBe(true)
    expect(text).toContain('2\nA\n')
    expect(text).toContain('2\nB\n')
  })

  test('addLine emits a LINE entity between the ENTITIES markers', () => {
    const w = createDxfWriter(LAYERS)
    w.addLine('A', 1, 2, 3, 4)
    const text = w.finish({ x: 0, y: 0 }, { x: 5, y: 5 }).toString('utf8')
    expect(text).toContain('LINE')
    expect(text).toContain('1.0000')
    expect(text).toContain('3.0000')
  })

  test('addPolylineOutline draws N segments for a closed ring, N-1 for open', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    const wClosed = createDxfWriter(LAYERS)
    wClosed.addPolylineOutline('A', pts, true)
    const closedText = wClosed.finish({ x: 0, y: 0 }, { x: 10, y: 10 }).toString('utf8')
    expect((closedText.match(/\bLINE\b/g) || []).length).toBe(3)

    const wOpen = createDxfWriter(LAYERS)
    wOpen.addPolylineOutline('A', pts, false)
    const openText = wOpen.finish({ x: 0, y: 0 }, { x: 10, y: 10 }).toString('utf8')
    expect((openText.match(/\bLINE\b/g) || []).length).toBe(2)
  })

  test('addCircle emits a CIRCLE entity', () => {
    const w = createDxfWriter(LAYERS)
    w.addCircle('A', 5, 5, 2.5)
    const text = w.finish({ x: 0, y: 0 }, { x: 10, y: 10 }).toString('utf8')
    expect(text).toContain('CIRCLE')
    expect(text).toContain('2.5000')
  })

  test('addText/addTextC/addTextR emit TEXT with the right justification codes', () => {
    const w = createDxfWriter(LAYERS)
    w.addText('A', 0, 0, 'left', 5)
    w.addTextC('A', 10, 0, 'center', 5)
    w.addTextR('A', 20, 0, 'right', 5)
    const text = w.finish({ x: -5, y: -5 }, { x: 25, y: 5 }).toString('utf8')
    expect((text.match(/\bTEXT\b/g) || []).length).toBe(3)
    expect(text).toContain('72\n1\n')  // centre code present
    expect(text).toContain('72\n2\n')  // right code present
  })

  test('addText rotation emits group code 50', () => {
    const w = createDxfWriter(LAYERS)
    w.addText('A', 0, 0, 'tilted', 5, 45)
    const text = w.finish({ x: -5, y: -5 }, { x: 5, y: 5 }).toString('utf8')
    expect(text).toContain('50\n45.0000\n')
  })

  test('addSolidRect emits a SOLID entity with 4 corners', () => {
    const w = createDxfWriter(LAYERS)
    w.addSolidRect('A', 0, 0, 4, 2)
    const text = w.finish({ x: 0, y: 0 }, { x: 4, y: 2 }).toString('utf8')
    expect(text).toContain('SOLID')
  })

  test('degree symbol is encoded as the DXF control code %%d', () => {
    const w = createDxfWriter(LAYERS)
    w.addText('A', 0, 0, '45°', 5)
    const text = w.finish({ x: 0, y: 0 }, { x: 5, y: 5 }).toString('utf8')
    expect(text).toContain('45%%d')
    expect(text).not.toContain('°')
  })
})
