// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref, type App } from 'vue'

// The dashboard's project cards: workflow progress, search and sort. Stores and the API are stubbed;
// this is about what the cards say.
const projects = ref<any[]>([])
vi.mock('../../composables/useSurveyors', () => ({
  useSurveyors: () => ({ surveyProjects: projects, loading: ref(false), fetchSurveyProjects: async () => {} }),
}))
vi.mock('../../stores/auth', () => ({
  useAuthStore: () => ({ token: 'x', isSurveyor: true, currentSurveyor: { name: 'T' }, profile: { created_at: '2026-01-01' } }),
}))
vi.mock('../../stores/modules', () => ({ useModulesStore: () => ({ accessibleModules: [{ slug: 'cadastral-standard' }] }) }))
vi.mock('../../stores/projectSelection', () => ({ useProjectSelectionStore: () => ({ selectProject: vi.fn() }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), RouterLink: { template: '<a><slot /></a>' } }))
vi.mock('../../services/api', () => ({ default: { post: vi.fn(async () => ({})) } }))
vi.mock('../../components/ModuleCard.vue', () => ({ default: { template: '<div />' } }))

const { default: DashboardView } = await import('../DashboardView.vue')

let app: App
let root: HTMLElement
beforeEach(() => { root = document.createElement('div'); document.body.appendChild(root) })
afterEach(() => { app?.unmount(); root.remove(); projects.value = [] })

async function mountWith(list: any[]) {
  projects.value = list
  app = createApp(DashboardView)
  app.component('router-link', { template: '<a><slot /></a>' })
  app.mount(root)
  await nextTick(); await nextTick()
}
const cards = () => Array.from(root.querySelectorAll<HTMLElement>('[aria-label^="Open project"]'))

describe('dashboard project cards', () => {
  it('say how far each project has got and what comes next, with a labelled progress bar', async () => {
    await mountWith([
      { id: 1, name: 'maglas1686', created_at: '2026-01-01T00:00:00Z', workflow_state: { completed_steps: ['project_setup', 'import_csv', 'field-book'] } },
      { id: 2, name: 'Fresh', created_at: '2026-02-01T00:00:00Z' },
    ])
    const text = (name: string) => cards().find((c) => c.getAttribute('aria-label') === `Open project ${name}`)!
    expect(text('maglas1686').textContent).toContain('3 of 14 steps done')
    expect(text('maglas1686').textContent).toContain('Next: Site Calibration')
    const bar = text('maglas1686').querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('3')
    expect(bar.getAttribute('aria-valuemax')).toBe('14')
    expect(bar.getAttribute('aria-label')).toBe('Workflow progress for maglas1686')
    expect(text('Fresh').textContent).toContain('0 of 14 steps done')
  })

  it('shows no search box for a short list, and filters and sorts a longer one', async () => {
    await mountWith([{ id: 1, name: 'B', created_at: '2026-01-01T00:00:00Z' }, { id: 2, name: 'A', created_at: '2026-01-02T00:00:00Z' }])
    expect(root.querySelector('#project-search')).toBeNull()
    app.unmount()

    await mountWith(['Stand 10', 'Stand 9', 'Alpha', 'Maglas'].map((name, i) => ({ id: i + 1, name, created_at: `2026-0${i + 1}-01T00:00:00Z` })))
    const search = root.querySelector<HTMLInputElement>('#project-search')!
    expect(search).toBeTruthy()
    const sort = root.querySelector<HTMLSelectElement>('#project-sort')!
    sort.value = 'name'; sort.dispatchEvent(new Event('change')); await nextTick()
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual(['Open project Alpha', 'Open project Maglas', 'Open project Stand 9', 'Open project Stand 10'])
    search.value = 'stand'; search.dispatchEvent(new Event('input')); await nextTick()
    expect(cards()).toHaveLength(2)
    search.value = 'zzz'; search.dispatchEvent(new Event('input')); await nextTick()
    expect(cards()).toHaveLength(0)
    expect(root.textContent).toContain('No project matches')
  })
})
