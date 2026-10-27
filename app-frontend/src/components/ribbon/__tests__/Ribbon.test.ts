// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import Ribbon from '../Ribbon.vue'
import { btn, group, type RibbonTab } from '../types'

const tabs: RibbonTab[] = ['a', 'b', 'c'].map((id) => ({
  id, label: `Tab ${id}`, groups: [group(`G ${id}`, [btn({ id: `${id}1`, icon: 'x', label: `Cmd ${id}` })])],
}))

let app: App
let root: HTMLElement
beforeEach(() => {
  root = document.createElement('div')
  document.body.appendChild(root)
})
afterEach(() => { app.unmount(); root.remove() })

const mount = (props: Record<string, unknown> = {}) => { app = createApp(Ribbon, { tabs, ...props }); app.mount(root) }
const tabEls = () => Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'))
const press = (k: string) => tabEls().find((t) => t.tabIndex === 0)!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))

describe('Ribbon', () => {
  it('shows the context label before the tabs', async () => {
    mount({ contextLabel: 'Maglas 1686' })
    expect(root.querySelector('[data-testid="ribbon-context"]')?.textContent).toBe('Maglas 1686')
  })
  it('omits the context label when none is given', () => {
    mount()
    expect(root.querySelector('[data-testid="ribbon-context"]')).toBeNull()
  })
  it('has one tab stop, and the panel is labelled by the selected tab', () => {
    mount()
    expect(tabEls().map((t) => t.tabIndex)).toEqual([0, -1, -1])
    const panel = root.querySelector('[role="tabpanel"]')!
    expect(panel.getAttribute('aria-labelledby')).toBe('rbn-tab-a')
    expect(tabEls()[0].getAttribute('aria-controls')).toBe(panel.id)
  })
  it('moves with the arrow keys, wrapping, and with Home and End', async () => {
    mount()
    press('ArrowRight'); await nextTick()
    expect(tabEls().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    press('End'); await nextTick()
    expect(tabEls()[2].getAttribute('aria-selected')).toBe('true')
    press('ArrowRight'); await nextTick()
    expect(tabEls()[0].getAttribute('aria-selected')).toBe('true')
    press('ArrowLeft'); await nextTick()
    expect(tabEls()[2].getAttribute('aria-selected')).toBe('true')
    press('Home'); await nextTick()
    expect(tabEls()[0].getAttribute('aria-selected')).toBe('true')
  })
})
