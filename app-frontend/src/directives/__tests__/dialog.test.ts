// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, withDirectives, type App } from 'vue'
import { vDialog } from '../dialog'

let app: App
let root: HTMLElement
const open = ref(false)
const onClose = vi.fn()

const Host = defineComponent({
  setup: () => () => h('div', [
    h('button', { id: 'opener' }, 'open'),
    open.value
      ? withDirectives(h('div', { id: 'dlg' }, [
        h('h2', { id: 'ttl' }, 'Add surveyor'),
        h('input', { id: 'first' }),
        h('button', { id: 'last' }, 'Save'),
      ]), [[vDialog, { labelledby: 'ttl', onClose }]])
      : null,
  ]),
})

beforeEach(() => {
  open.value = false; onClose.mockReset()
  root = document.createElement('div'); document.body.appendChild(root)
  app = createApp(Host); app.mount(root)
})
afterEach(() => { app.unmount(); root.remove(); document.body.innerHTML = '' })

const dlg = () => root.querySelector<HTMLElement>('#dlg')!
const key = (k: string, shiftKey = false) => dlg().dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }))
const opened = async () => { open.value = true; await nextTick(); await Promise.resolve() }

describe('v-dialog', () => {
  it('names the dialog and marks it modal', async () => {
    await opened()
    expect(dlg().getAttribute('role')).toBe('dialog')
    expect(dlg().getAttribute('aria-modal')).toBe('true')
    expect(dlg().getAttribute('aria-labelledby')).toBe('ttl')
  })

  it('moves focus to the first field on open', async () => {
    await opened()
    expect(document.activeElement?.id).toBe('first')
  })

  it('closes on Escape through onClose', async () => {
    await opened()
    key('Escape')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps Tab inside, wrapping both ways', async () => {
    await opened()
    root.querySelector<HTMLElement>('#last')!.focus()
    key('Tab')
    expect(document.activeElement?.id).toBe('first')
    key('Tab', true)
    expect(document.activeElement?.id).toBe('last')
  })

  it('returns focus to what had it before the dialog opened', async () => {
    const opener = root.querySelector<HTMLElement>('#opener')!
    opener.focus()
    await opened()
    open.value = false; await nextTick()
    // The focused field left the DOM, so focus fell to <body> and is handed back.
    expect(document.activeElement).toBe(opener)
  })

  it('does nothing on Escape when no onClose is given', async () => {
    const Plain = defineComponent({ setup: () => () => withDirectives(h('div', { id: 'p' }, [h('button', 'ok')]), [[vDialog, { label: 'Answer me' }]]) })
    const a2 = createApp(Plain); const r2 = document.createElement('div'); document.body.appendChild(r2); a2.mount(r2)
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    r2.querySelector('#p')!.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
    expect(r2.querySelector('#p')!.getAttribute('aria-label')).toBe('Answer me')
    a2.unmount()
  })
})
