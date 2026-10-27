// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// The 401 handler navigates to /landing through the router; the router pulls in every view.
const replace = vi.fn()
vi.mock('../../router', () => ({ default: { replace } }))

import api from '../../services/api'
import { SESSION_EXPIRED_MESSAGE, useAuthStore } from '../auth'

beforeEach(() => {
  localStorage.clear()
  replace.mockClear()
  setActivePinia(createPinia())
})

/** Makes the next request fail the way a rejected token does. */
const respondWith = (status: number) => {
  api.defaults.adapter = async (config) => {
    const err: any = new Error(`Request failed with status code ${status}`)
    err.isAxiosError = true
    err.config = config
    err.response = { status, data: {}, headers: {}, config }
    throw err
  }
}

describe('why the user was signed out', () => {
  it('explains an involuntary logout, and clears the explanation on a deliberate one', () => {
    const auth = useAuthStore()
    auth.logout('expired')
    expect(auth.sessionNotice).toBe(SESSION_EXPIRED_MESSAGE)
    auth.logout()
    expect(auth.sessionNotice).toBe('')
  })

  it('can be dismissed', () => {
    const auth = useAuthStore()
    auth.logout('expired')
    auth.dismissSessionNotice()
    expect(auth.sessionNotice).toBe('')
  })

  it('says so when a stored session has timed out', async () => {
    localStorage.setItem('token', 'old-token')
    localStorage.setItem('lastActivity', String(Date.now() - 5 * 60 * 60 * 1000)) // 5h; the limit is 4h
    const auth = useAuthStore()
    expect(await auth.restoreSession()).toBe(false)
    expect(auth.sessionNotice).toBe(SESSION_EXPIRED_MESSAGE)
  })
})

describe('the 401 handler', () => {
  it('signs a signed-in user out WITH an explanation, and sends them to the sign-in page', async () => {
    const auth = useAuthStore()
    auth.token = 'a-token'
    respondWith(401)
    await expect(api.get('/anything')).rejects.toBeTruthy()
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/landing'))
    expect(auth.token).toBe('')
    expect(auth.sessionNotice).toBe(SESSION_EXPIRED_MESSAGE)
  })

  it('does not call a wrong password an expired session', async () => {
    const auth = useAuthStore()   // no token: this is the sign-in request itself
    respondWith(401)
    await expect(api.post('/auth/login', {})).rejects.toBeTruthy()
    expect(auth.sessionNotice).toBe('')
  })

  it('leaves other failures alone', async () => {
    const auth = useAuthStore()
    auth.token = 'a-token'
    respondWith(500)
    await expect(api.get('/anything')).rejects.toBeTruthy()
    expect(auth.token).toBe('a-token')
    expect(auth.sessionNotice).toBe('')
  })
})
