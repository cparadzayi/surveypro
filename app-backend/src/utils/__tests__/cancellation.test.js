import { describe, test, expect } from '@jest/globals'
import { GENERATION_CANCELLED, cancelledError, isCancelled, throwIfCancelled, yieldOrCancel } from '../cancellation.js'

describe('cancellation helpers', () => {
  test('a cancelled error is recognised by name and nothing else is', () => {
    expect(cancelledError().name).toBe(GENERATION_CANCELLED)
    expect(isCancelled(cancelledError())).toBe(true)
    expect(isCancelled(new Error('boom'))).toBe(false)
    expect(isCancelled(undefined)).toBe(false)
  })

  test('no signal never stops anything and costs nothing', async () => {
    expect(() => throwIfCancelled(undefined)).not.toThrow()
    await expect(yieldOrCancel(undefined)).resolves.toBeUndefined()
  })

  test('an aborted signal throws; a live one does not', async () => {
    const ac = new AbortController()
    await expect(yieldOrCancel(ac.signal)).resolves.toBeUndefined()
    ac.abort()
    expect(() => throwIfCancelled(ac.signal)).toThrow(/cancelled/)
    await expect(yieldOrCancel(ac.signal)).rejects.toMatchObject({ name: GENERATION_CANCELLED })
  })

  test('yieldOrCancel gives the event loop a turn (a timer scheduled before it runs first)', async () => {
    const order = []
    setImmediate(() => order.push('immediate'))
    await yieldOrCancel(new AbortController().signal)
    order.push('after')
    expect(order).toEqual(['immediate', 'after'])
  })
})
