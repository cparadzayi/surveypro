// @vitest-environment happy-dom
/**
 * The control on the map: off by default, says how far to trust each kind of outline, warns about the indicative ones in words, says when a copy is
 * offline, and says why when the register cannot show this project. The register layer itself is tested with the composable.
 */
import { describe, it, expect, vi } from 'vitest'
import { createApp, nextTick, ref, computed } from 'vue'
import RegisterContextControl from '../RegisterContextControl.vue'

function ctx(over: any = {}) {
  const loaded = ref<any>(over.loaded ?? null)
  const state = {
    enabled: ref(over.enabled ?? false), loading: ref(over.loading ?? false), error: ref(over.error ?? ''), loaded,
    counts: computed(() => over.counts ?? { approved: 0, council_survey: 0, indicative: 0 }),
    asOf: computed(() => loaded.value?.context?.as_of ?? null),
    attached: ref(true), attach: vi.fn(), refresh: vi.fn(), toggle: vi.fn(),
  }
  return state as any
}
// the component, mounted into the page with Vue itself (this project does not carry @vue/test-utils)
function mount(component: any, { props }: { props: any }) {
  const el = document.createElement('div'); document.body.appendChild(el)
  createApp(component, props).mount(el)
  const buttons = () => Array.from(el.querySelectorAll('button')) as HTMLButtonElement[]
  return { text: () => (el.textContent || '').replace(/\s+/g, ' ').trim(), get: (_sel: string) => ({ trigger: (_e: string) => buttons()[0].click() }), buttons }
}
const loaded = (extra: any = {}) => ({ context: { as_of: '2026-10-10T08:00:00Z', truncated: false, features: [], ...extra }, fromCache: false, offline: false })

describe('the register control on the map', () => {
  it('is off until the surveyor turns it on, and shows nothing else', () => {
    const c = ctx()
    const w = mount(RegisterContextControl, { props: { ctx: c } })
    expect(w.text()).toContain('Register around this survey')
    expect(w.text()).toContain('Off')
    expect(w.text()).not.toContain('Approved stands')
    w.get('button').trigger('click')
    expect(c.toggle).toHaveBeenCalled()
  })

  it('on, it lists the three kinds with their counts, and warns in words about the dotted ones', () => {
    const w = mount(RegisterContextControl, { props: { ctx: ctx({ enabled: true, loaded: loaded(), counts: { approved: 4, council_survey: 2, indicative: 3 } }) } })
    const t = w.text()
    expect(t).toContain('Approved stands')
    expect(t).toContain("Council's survey, awaiting approval")
    expect(t).toContain('Indicative (digitised)')
    expect(t).toMatch(/can be tens of metres out\. Never set out from them/)
    expect(t).toContain('From the register, taken')
    expect(t).toContain("compare coordinates, not the picture")
  })

  it('with nothing indicative nearby it does not cry wolf', () => {
    const w = mount(RegisterContextControl, { props: { ctx: ctx({ enabled: true, loaded: loaded(), counts: { approved: 1, council_survey: 0, indicative: 0 } }) } })
    expect(w.text()).not.toContain('Never set out')
  })

  it('says when what it shows is a copy kept on the device, and when that copy could not be refreshed', () => {
    const copy = mount(RegisterContextControl, { props: { ctx: ctx({ enabled: true, loaded: { ...loaded(), fromCache: true } }) } })
    expect(copy.text()).toContain('Copy kept on this device')
    const offline = mount(RegisterContextControl, { props: { ctx: ctx({ enabled: true, loaded: { ...loaded(), fromCache: true, offline: true } }) } })
    expect(offline.text()).toContain('Offline copy')
  })

  it('says when there is more than can be shown', () => {
    const w = mount(RegisterContextControl, { props: { ctx: ctx({ enabled: true, loaded: loaded({ truncated: true }) }) } })
    expect(w.text()).toContain('zoom in on the part you need')
  })

  it('says why, in the register\'s words, when it cannot show this project', () => {
    const w = mount(RegisterContextControl, { props: { ctx: ctx({ enabled: true, error: 'There is nothing to place yet. Import the survey points first, or open the job from the council.' }) } })
    expect(w.text()).toContain('There is nothing to place yet')
    expect(w.text()).not.toContain('Approved stands')
  })

  it('a refresh asks for a fresh copy', async () => {
    const c = ctx({ enabled: true, loaded: loaded() })
    const w = mount(RegisterContextControl, { props: { ctx: c } })
    w.buttons().find((b) => b.textContent!.trim() === 'Refresh')!.click(); await nextTick()
    expect(c.refresh).toHaveBeenCalledWith(true)
  })
})
