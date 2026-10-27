import { describe, expect, it } from 'vitest'
import { describeError } from '../errorMessage'

const http = (status: number, data?: unknown, message = `Request failed with status code ${status}`) =>
  ({ isAxiosError: true, message, response: { status, data } })

describe('describeError', () => {
  it('says plainly that the server cannot be reached, instead of "Network Error"', () => {
    const e = describeError({ isAxiosError: true, message: 'Network Error', code: 'ERR_NETWORK' })
    expect(e.message).toMatch(/can't reach the surveypro server/i)
    expect(e.technical).toBe('Network Error')
  })

  it('recognises a timeout', () => {
    expect(describeError({ isAxiosError: true, message: 'timeout of 30000ms exceeded', code: 'ECONNABORTED' }).message)
      .toMatch(/too long/i)
  })

  it('explains an expired session', () => {
    expect(describeError(http(401)).message).toMatch(/session has expired.*sign in/i)
  })

  it("prefers the server's own words when it sent any", () => {
    expect(describeError(http(409, { error: 'File already exists' })).message).toBe('File already exists')
    expect(describeError(http(400, { message: 'Designation is required' })).message).toBe('Designation is required')
    expect(describeError(http(422, 'Bad ring')).message).toBe('Bad ring')
  })

  it('gives a plain message for common statuses when the server said nothing', () => {
    expect(describeError(http(403)).message).toMatch(/permission/i)
    expect(describeError(http(404)).message).toMatch(/could not be found/i)
    expect(describeError(http(413)).message).toMatch(/too large/i)
    expect(describeError(http(429)).message).toMatch(/too many/i)
    expect(describeError(http(418)).message).toMatch(/not accepted/i)
  })

  it('does not blame the user for a server fault, and keeps the detail', () => {
    const plain = describeError(http(500))
    expect(plain.message).toMatch(/server hit a problem/i)
    expect(plain.technical).toBe('Request failed with status code 500')
    expect(describeError(http(502, { error: 'column "x" does not exist' })).message)
      .toMatch(/server hit a problem: column "x" does not exist/)
  })

  it('caps a very long server message', () => {
    expect(describeError(http(400, { error: 'x'.repeat(2000) })).message.length).toBeLessThanOrEqual(300)
  })

  it('handles ordinary errors, strings and nothing', () => {
    expect(describeError(new Error('Outside Figure data required')).message).toBe('Outside Figure data required')
    expect(describeError('  just text ').message).toBe('just text')
    expect(describeError(undefined, 'Could not save').message).toBe('Could not save')
    expect(describeError(null).message).toBe('Something went wrong.')
    expect(describeError({}, 'fallback').message).toBe('fallback')
  })
})
