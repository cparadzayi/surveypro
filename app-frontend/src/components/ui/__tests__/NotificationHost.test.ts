// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import NotificationHost from '../NotificationHost.vue'
import {
  clearNotices, confirmDialog, confirmQueue, notifyError, notifySuccess, notifyWarning,
} from '../../../composables/useNotifications'

let app: App
let root: HTMLElement

beforeEach(() => {
  clearNotices()
  confirmQueue.value = []
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(NotificationHost)
  app.mount(root)
})
afterEach(() => {
  app.unmount()
  root.remove()
  document.body.innerHTML = ''
})

const toasts = () => Array.from(root.querySelectorAll<HTMLElement>('[data-kind]'))
const dialog = () => root.querySelector<HTMLElement>('[role="alertdialog"]')
const key = (el: Element, k: string, shiftKey = false) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }))

describe('toasts', () => {
  it('announces errors and warnings at once (role=alert) and the rest politely (role=status)', async () => {
    notifyError('Broke'); notifyWarning('Careful'); notifySuccess('Done')
    await nextTick()
    expect(toasts().map((t) => [t.dataset.kind, t.getAttribute('role')])).toEqual([
      ['error', 'alert'], ['warning', 'alert'], ['success', 'status'],
    ])
  })

  it('shows the title, message and each detail', async () => {
    notifySuccess('Saved to output/', { title: 'Plan generated', details: ['plan_1-600.pdf', 'plan_1-600.zip'] })
    await nextTick()
    const text = toasts()[0].textContent ?? ''
    expect(text).toContain('Plan generated')
    expect(text).toContain('Saved to output/')
    expect(text).toContain('plan_1-600.pdf')
    expect(text).toContain('plan_1-600.zip')
  })

  it('has a labelled dismiss button that removes the notice', async () => {
    notifyError('Broke')
    await nextTick()
    const btn = root.querySelector<HTMLButtonElement>('button[aria-label="Dismiss notification"]')!
    expect(btn).toBeTruthy()
    btn.click()
    await nextTick()
    expect(toasts()).toHaveLength(0)
  })

  it('runs an action and then dismisses the notice', async () => {
    const run = vi.fn()
    notifyWarning('Kept existing', { actions: [{ label: 'Show files', run }] })
    await nextTick()
    const btn = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Show files')!
    btn.click()
    await nextTick()
    expect(run).toHaveBeenCalledOnce()
    expect(toasts()).toHaveLength(0)
  })
})

describe('confirm dialog', () => {
  it('is a labelled modal alert dialog', async () => {
    void confirmDialog({ title: 'Overwrite existing plan?', message: 'It already exists.' })
    await nextTick()
    const d = dialog()!
    expect(d.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(d.getAttribute('aria-labelledby')!)?.textContent).toBe('Overwrite existing plan?')
    expect(document.getElementById(d.getAttribute('aria-describedby')!)?.textContent).toBe('It already exists.')
  })

  it('confirms and cancels with its buttons', async () => {
    const yes = confirmDialog({ title: 'T', message: 'M', confirmLabel: 'Overwrite' })
    await nextTick()
    Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Overwrite')!.click()
    await expect(yes).resolves.toBe(true)
    await nextTick()
    expect(dialog()).toBeNull()

    const no = confirmDialog({ title: 'T2', message: 'M2' })
    await nextTick()
    Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Cancel')!.click()
    await expect(no).resolves.toBe(false)
  })

  it('cancels on Escape and on a click outside the dialog', async () => {
    const a = confirmDialog({ title: 'A', message: 'a' })
    await nextTick()
    key(dialog()!, 'Escape')
    await expect(a).resolves.toBe(false)
    await nextTick()

    const b = confirmDialog({ title: 'B', message: 'b' })
    await nextTick()
    root.querySelector<HTMLElement>('[data-testid="confirm-overlay"]')!.click()
    await expect(b).resolves.toBe(false)
  })

  it('starts on Cancel for a destructive question and on the confirm button otherwise', async () => {
    void confirmDialog({ title: 'Delete?', message: 'm', tone: 'danger', confirmLabel: 'Delete' })
    await nextTick(); await nextTick()
    expect(document.activeElement?.textContent).toBe('Cancel')
    confirmQueue.value = []
    await nextTick()

    void confirmDialog({ title: 'Proceed?', message: 'm', confirmLabel: 'Go' })
    await nextTick(); await nextTick()
    expect(document.activeElement?.textContent).toBe('Go')
  })

  it('keeps Tab inside the dialog', async () => {
    void confirmDialog({ title: 'T', message: 'M', confirmLabel: 'Yes' })
    await nextTick(); await nextTick()
    const [cancel, confirm] = Array.from(dialog()!.querySelectorAll('button'))
    ;(confirm as HTMLElement).focus()
    key(dialog()!, 'Tab')            // from the last button, Tab wraps to the first
    expect(document.activeElement).toBe(cancel)
    key(dialog()!, 'Tab', true)      // Shift+Tab from the first wraps to the last
    expect(document.activeElement).toBe(confirm)
  })
})
