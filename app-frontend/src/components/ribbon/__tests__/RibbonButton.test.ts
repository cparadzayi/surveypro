// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, type App } from 'vue'
import RibbonButton from '../RibbonButton.vue'

let app: App | null = null
afterEach(() => { app?.unmount(); app = null; document.body.innerHTML = '' })

function mount(props: Record<string, unknown>): HTMLButtonElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(RibbonButton, { icon: 'X', label: 'Field Book', ...props })
  app.mount(root)
  return root.querySelector('button')!
}

describe('RibbonButton status', () => {
  it('says a tile\'s state aloud, after its label, when one is given', () => {
    const b = mount({ status: 'completed', badge: '✓' })
    expect(b.querySelector('.sr-only')?.textContent).toBe(', completed')
    expect(b.querySelector('.rb-badge')?.textContent).toBe('✓')
  })

  it('marks the current step with aria-current', () => {
    expect(mount({ current: true }).getAttribute('aria-current')).toBe('step')
  })

  it('adds nothing for an ordinary tile', () => {
    const b = mount({})
    expect(b.querySelector('.sr-only')).toBeNull()
    expect(b.hasAttribute('aria-current')).toBe(false)
  })

  it('still shows count badges as before', () => {
    expect(mount({ badge: 3 }).querySelector('.rb-badge')?.textContent).toBe('3')
  })
})
