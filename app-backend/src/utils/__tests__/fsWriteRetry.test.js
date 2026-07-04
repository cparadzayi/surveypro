import { describe, test, expect, jest } from '@jest/globals'
import { writeFileWithRetry } from '../fsWriteRetry.js'

const err = (code) => Object.assign(new Error(code), { code })

describe('writeFileWithRetry', () => {
  test('writes once and returns when the first attempt succeeds', async () => {
    const write = jest.fn()
    await writeFileWithRetry(write, { attempts: 3, delayMs: 1 })
    expect(write).toHaveBeenCalledTimes(1)
  })

  test('retries transient Windows lock codes then succeeds', async () => {
    const write = jest.fn()
      .mockImplementationOnce(() => { throw err('EBUSY') })
      .mockImplementationOnce(() => { throw err('EPERM') })
      .mockImplementationOnce(() => { /* success */ })
    const onRetry = jest.fn()
    await writeFileWithRetry(write, { attempts: 5, delayMs: 1, onRetry })
    expect(write).toHaveBeenCalledTimes(3)
    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenNthCalledWith(1, 'EBUSY', 1)
  })

  test('rethrows a non-transient error immediately without retrying', async () => {
    const write = jest.fn(() => { throw err('EISDIR') })
    await expect(writeFileWithRetry(write, { attempts: 5, delayMs: 1 })).rejects.toThrow('EISDIR')
    expect(write).toHaveBeenCalledTimes(1)
  })

  test('gives up and rethrows after exhausting attempts on a persistent lock', async () => {
    const write = jest.fn(() => { throw err('EBUSY') })
    await expect(writeFileWithRetry(write, { attempts: 3, delayMs: 1 })).rejects.toThrow('EBUSY')
    expect(write).toHaveBeenCalledTimes(3)
  })
})
