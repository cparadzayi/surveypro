/**
 * Unit tests for filesystem write-error classification.
 *
 * When saving a document (e.g. Comprehensive_Latest.pdf) over a file that is
 * open in another program, Windows throws EBUSY/EPERM/EACCES. We turn that into
 * a clear, actionable message + HTTP status instead of a generic 500.
 */

import { describe, test, expect } from '@jest/globals'
import { classifyFsWriteError } from '../fsWriteErrors.js'

describe('classifyFsWriteError', () => {
  test('EBUSY on an open file → 409 FILE_LOCKED with actionable message naming the file', () => {
    const err = Object.assign(new Error("EBUSY: resource busy or locked, open 'C:\\x\\Comprehensive_Latest.pdf'"), { code: 'EBUSY' })
    const r = classifyFsWriteError(err, 'Comprehensive_Latest.pdf')
    expect(r.status).toBe(409)
    expect(r.code).toBe('FILE_LOCKED')
    expect(r.message).toContain('Comprehensive_Latest.pdf')
    expect(r.message).toMatch(/open in another program/i)
    expect(r.message).toMatch(/close it/i)
  })

  test('EPERM is treated as a lock (Windows reports EPERM for open files too)', () => {
    const err = Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
    const r = classifyFsWriteError(err, 'report.pdf')
    expect(r.status).toBe(409)
    expect(r.code).toBe('FILE_LOCKED')
    expect(r.message).toContain('report.pdf')
  })

  test('EACCES is treated as a lock/permission problem', () => {
    const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    const r = classifyFsWriteError(err, 'doc.pdf')
    expect(r.status).toBe(409)
    expect(r.code).toBe('FILE_LOCKED')
  })

  test('a non-lock error (e.g. ENOSPC) → 500 with the original message preserved', () => {
    const err = Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })
    const r = classifyFsWriteError(err, 'doc.pdf')
    expect(r.status).toBe(500)
    expect(r.code).toBe('ENOSPC')
    expect(r.message).toContain('no space left on device')
  })

  test('an error with no code → 500 WRITE_FAILED, still returns a message', () => {
    const r = classifyFsWriteError(new Error('boom'), 'doc.pdf')
    expect(r.status).toBe(500)
    expect(r.code).toBe('WRITE_FAILED')
    expect(r.message).toBe('boom')
  })

  test('falls back to a generic file name when none is given', () => {
    const err = Object.assign(new Error('EBUSY'), { code: 'EBUSY' })
    const r = classifyFsWriteError(err)
    expect(r.status).toBe(409)
    expect(r.message).toMatch(/the file is open in another program/i)
  })
})
