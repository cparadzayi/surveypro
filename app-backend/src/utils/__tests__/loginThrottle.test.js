import { describe, test, expect } from '@jest/globals'
import { LoginThrottle } from '../loginThrottle.js'

const make = (o = {}) => {
  const clock = { t: 1_000_000 }
  return { clock, throttle: new LoginThrottle({ perAccount: 3, perAddress: 5, windowMs: 60_000, now: () => clock.t, ...o }) }
}

describe('LoginThrottle', () => {
  test('allows attempts until the account limit, then asks the caller to wait', () => {
    const { throttle } = make()
    for (let i = 0; i < 3; i++) {
      expect(throttle.retryAfterSeconds('a@x.test', '1.1.1.1')).toBe(0)
      throttle.recordFailure('a@x.test', '1.1.1.1')
    }
    expect(throttle.retryAfterSeconds('a@x.test', '1.1.1.1')).toBe(60)
  })

  test('the account is protected from any address, and the e-mail is not case sensitive', () => {
    const { throttle } = make()
    for (const ip of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) throttle.recordFailure('A@x.test', ip)
    expect(throttle.retryAfterSeconds('a@X.test', '9.9.9.9')).toBeGreaterThan(0)
  })

  test('a different account from the same quiet address is unaffected', () => {
    const { throttle } = make()
    for (let i = 0; i < 3; i++) throttle.recordFailure('a@x.test', '1.1.1.1')
    expect(throttle.retryAfterSeconds('b@x.test', '1.1.1.1')).toBe(0)
  })

  test('one address guessing many accounts is stopped by the address limit', () => {
    const { throttle } = make()
    for (let i = 0; i < 5; i++) throttle.recordFailure(`u${i}@x.test`, '6.6.6.6')
    expect(throttle.retryAfterSeconds('fresh@x.test', '6.6.6.6')).toBeGreaterThan(0)
    expect(throttle.retryAfterSeconds('fresh@x.test', '7.7.7.7')).toBe(0)
  })

  test('the wait shrinks as time passes and attempts are allowed again after the window', () => {
    const { throttle, clock } = make()
    for (let i = 0; i < 3; i++) throttle.recordFailure('a@x.test', '1.1.1.1')
    clock.t += 45_000
    expect(throttle.retryAfterSeconds('a@x.test', '1.1.1.1')).toBe(15)
    clock.t += 15_001
    expect(throttle.retryAfterSeconds('a@x.test', '1.1.1.1')).toBe(0)
  })

  test('a correct sign-in clears the account count', () => {
    const { throttle } = make()
    throttle.recordFailure('a@x.test', '1.1.1.1')
    throttle.recordFailure('a@x.test', '1.1.1.1')
    throttle.recordSuccess('a@x.test')
    throttle.recordFailure('a@x.test', '1.1.1.1')
    expect(throttle.retryAfterSeconds('a@x.test', '1.1.1.1')).toBe(0)
  })
})
