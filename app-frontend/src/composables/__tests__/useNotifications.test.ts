import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  answerConfirm, clearNotices, confirmDialog, confirmQueue, dismissNotice, MAX_NOTICES,
  notices, notify, notifyError, notifyInfo, notifySuccess, notifyWarning,
} from '../useNotifications'

beforeEach(() => { vi.useFakeTimers(); clearNotices(); confirmQueue.value = [] })
afterEach(() => { vi.useRealTimers() })

describe('notify', () => {
  it('shows a notice and returns its id', () => {
    const id = notifyInfo('Saved')
    expect(notices.value).toHaveLength(1)
    expect(notices.value[0]).toMatchObject({ id, kind: 'info', message: 'Saved' })
  })

  it('takes down a success after a few seconds, but never an error', () => {
    notifySuccess('Done')
    const err = notifyError('Broke')
    vi.advanceTimersByTime(60_000)
    expect(notices.value.map((n) => n.kind)).toEqual(['error'])
    expect(notices.value[0].id).toBe(err)
    expect(notices.value[0].sticky).toBe(true)
  })

  it('keeps a warning longer than a success', () => {
    notifySuccess('ok')
    notifyWarning('careful')
    vi.advanceTimersByTime(7000)
    expect(notices.value.map((n) => n.kind)).toEqual(['warning'])
    vi.advanceTimersByTime(8000)
    expect(notices.value).toHaveLength(0)
  })

  it('lets a caller keep a notice up (sticky) or time an error out', () => {
    notify({ kind: 'success', message: 'stay', sticky: true })
    notify({ kind: 'error', message: 'go', timeoutMs: 1000 })
    vi.advanceTimersByTime(1500)
    expect(notices.value.map((n) => n.message)).toEqual(['stay'])
  })

  it('does not stack an identical notice', () => {
    const a = notifyError('Network down')
    const b = notifyError('Network down')
    expect(b).toBe(a)
    expect(notices.value).toHaveLength(1)
  })

  it('carries details and actions through', () => {
    const run = vi.fn()
    notifyWarning('Some files kept', { title: 'Saved', details: ['a.pdf', 'b.dxf'], actions: [{ label: 'Open', run }] })
    expect(notices.value[0]).toMatchObject({ title: 'Saved', details: ['a.pdf', 'b.dxf'] })
    notices.value[0].actions[0].run()
    expect(run).toHaveBeenCalled()
  })

  it('dismisses one notice and cancels its timer', () => {
    const a = notifySuccess('a')
    notifySuccess('b')
    dismissNotice(a)
    expect(notices.value.map((n) => n.message)).toEqual(['b'])
    vi.advanceTimersByTime(10_000)
    expect(notices.value).toHaveLength(0)
  })

  it('makes room by dropping the oldest transient notice, never a sticky one', () => {
    notifyError('keep me')
    for (let i = 0; i < MAX_NOTICES + 3; i++) notifyInfo(`info ${i}`)
    expect(notices.value.length).toBeLessThanOrEqual(MAX_NOTICES)
    expect(notices.value.some((n) => n.message === 'keep me')).toBe(true)
    expect(notices.value.at(-1)?.message).toBe(`info ${MAX_NOTICES + 2}`)
  })
})

describe('confirmDialog', () => {
  it('resolves true on confirm and false on cancel', async () => {
    const yes = confirmDialog({ title: 'Overwrite?', message: 'It exists.' })
    answerConfirm(true)
    await expect(yes).resolves.toBe(true)
    const no = confirmDialog({ title: 'Delete?', message: 'Sure?' })
    answerConfirm(false)
    await expect(no).resolves.toBe(false)
  })

  it('asks one question at a time, in order', async () => {
    const first = confirmDialog({ title: 'One', message: '1' })
    const second = confirmDialog({ title: 'Two', message: '2' })
    expect(confirmQueue.value.map((c) => c.title)).toEqual(['One', 'Two'])
    answerConfirm(true)
    expect(confirmQueue.value.map((c) => c.title)).toEqual(['Two'])
    answerConfirm(false)
    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(false)
  })

  it('has sensible defaults and ignores an answer when nothing is asked', () => {
    void confirmDialog({ title: 'T', message: 'M' })
    expect(confirmQueue.value[0]).toMatchObject({ confirmLabel: 'OK', cancelLabel: 'Cancel', tone: 'default' })
    answerConfirm(true)
    expect(() => answerConfirm(true)).not.toThrow()
  })
})
