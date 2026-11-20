/**
 * A replaced product is moved into `superseded` beside it, never deleted, and only under output/.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js supersedeFile
 */
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { supersedeOutputFile, SupersedeError } from '../supersedeFile.js'

let wd
beforeEach(() => {
  wd = fs.mkdtempSync(path.join(os.tmpdir(), 'supersede-'))
  fs.mkdirSync(path.join(wd, 'output', 'diagrams'), { recursive: true })
  fs.writeFileSync(path.join(wd, 'output', 'diagrams', 'diagram-STAND_404_1-500.pdf'), 'old')
})
afterEach(() => fs.rmSync(wd, { recursive: true, force: true }))

describe('supersedeOutputFile', () => {
  test('moves the file into superseded beside it', () => {
    const dest = supersedeOutputFile(wd, 'output/diagrams', 'diagram-STAND_404_1-500.pdf')
    expect(dest).toBe(path.join(wd, 'output', 'diagrams', 'superseded', 'diagram-STAND_404_1-500.pdf'))
    expect(fs.readFileSync(dest, 'utf8')).toBe('old')
    expect(fs.existsSync(path.join(wd, 'output', 'diagrams', 'diagram-STAND_404_1-500.pdf'))).toBe(false)
  })

  test('keeps an earlier superseded copy, adding the time to the new one', () => {
    supersedeOutputFile(wd, 'output/diagrams', 'diagram-STAND_404_1-500.pdf')
    fs.writeFileSync(path.join(wd, 'output', 'diagrams', 'diagram-STAND_404_1-500.pdf'), 'newer')
    const dest = supersedeOutputFile(wd, 'output/diagrams', 'diagram-STAND_404_1-500.pdf', new Date('2026-11-20T12:00:00Z'))
    expect(path.basename(dest)).toBe('diagram-STAND_404_1-500_2026-11-20T12-00-00-000Z.pdf')
    expect(fs.readdirSync(path.join(wd, 'output', 'diagrams', 'superseded'))).toHaveLength(2)
  })

  test('refuses anything outside output/, a path in the name, or a missing file', () => {
    fs.mkdirSync(path.join(wd, 'input'))
    fs.writeFileSync(path.join(wd, 'input', 'a.csv'), 'x')
    expect(() => supersedeOutputFile(wd, 'input', 'a.csv')).toThrow(SupersedeError)
    expect(() => supersedeOutputFile(wd, 'output/../input', 'a.csv')).toThrow(SupersedeError)
    expect(() => supersedeOutputFile(wd, 'output/diagrams', '../x.pdf')).toThrow(SupersedeError)
    expect(() => supersedeOutputFile(wd, 'output/diagrams', 'nope.pdf')).toThrow(/not found/)
  })
})
