import { describe, test, expect } from '@jest/globals'
import { resolveStatementDesignation } from '../designation.js'

describe('resolveStatementDesignation', () => {
  test('uses the subject designation when it is already a full name', () => {
    expect(resolveStatementDesignation('STAND 405 BRACKENHURST TOWNSHIP', '405', 'STANDS 403-405 BRACKENHURST TOWNSHIP'))
      .toBe('STAND 405 BRACKENHURST TOWNSHIP')
  })

  test('builds "STAND <n> <locality>" from the project designation for a bare stand', () => {
    expect(resolveStatementDesignation('405', '405', 'STANDS 403-405 BRACKENHURST TOWNSHIP'))
      .toBe('STAND 405 BRACKENHURST TOWNSHIP')
    expect(resolveStatementDesignation(null, '405', 'STANDS 403-405 BRACKENHURST TOWNSHIP'))
      .toBe('STAND 405 BRACKENHURST TOWNSHIP')
  })

  test('handles a singular project designation', () => {
    expect(resolveStatementDesignation('405', '405', 'STAND 405 BRACKENHURST TOWNSHIP'))
      .toBe('STAND 405 BRACKENHURST TOWNSHIP')
  })

  test('falls back to "STAND <n>" when the project designation has no stand prefix', () => {
    expect(resolveStatementDesignation('405', '405', 'Some Farm 12')).toBe('STAND 405')
  })

  test('falls back to the project designation when there is no stand', () => {
    expect(resolveStatementDesignation(null, null, 'STANDS 403-405 BRACKENHURST TOWNSHIP'))
      .toBe('STANDS 403-405 BRACKENHURST TOWNSHIP')
  })
})
