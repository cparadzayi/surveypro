// @vitest-environment happy-dom
//
// The Lite modules share their points: a point picked from the layer or computed in Polar is offered in Join,
// and Join gives the direction and distance between two points. Layer points are stored [Y, X] by the server,
// which Polar's old picker read the wrong way round.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../../../components/scaffold/ModuleScaffold.vue', () => ({
  default: { name: 'ModuleScaffold', template: '<div><slot /></div>' },
}))
const searchFeatures = vi.fn(async () => [
  { id: 1, layer_id: 1, project_id: 1, geometry: { type: 'Point', coordinates: [33332.88, 1860173] }, properties: { name: '419/S' } },
])
const listCoordinatePoints = vi.fn(async (_id: number) => [
  { id: 1, project_id: 13, name: '87C', y: -3551.377, x: 1965611.534, description: 'iron peg' },
  { id: 2, project_id: 13, name: '87D', y: -3540.0, x: 1965600.0 },
])
vi.mock('../../../../services/api', () => ({
  default: { get: vi.fn(async (url: string) => (url === '/survey-projects' ? { data: { ok: true, projects: [{ id: 13, name: 'Brackenhurst' }] } } : { data: {} })) },
}))
vi.mock('../../../../services/spatial', () => ({
  listCoordinatePoints: (id: number) => listCoordinatePoints(id),
  searchFeatures: (...a: any[]) => (searchFeatures as any)(...a),
  listProjects: vi.fn(async () => []),
  listLayers: vi.fn(async () => []),
  getLayer: vi.fn(async (id: number) => ({ id, project_id: 1, name: 'Sample Points' })),
  updateLayerSrid: vi.fn(),
}))
const computePolar = vi.fn(async (b: any) => ({ ok: true, point: { y: b.y + 3, x: b.x + 4 } }))
vi.mock('../../../../services/compute', () => ({ computePolar: (b: any) => computePolar(b) }))

import JoinView from '../join/JoinView.vue'
import PolarView from '../polar/PolarView.vue'
import { useLiteWorkingPointsStore } from '../../../../stores/liteWorkingPoints'

let app: App | null = null
let pinia: ReturnType<typeof createPinia>
beforeEach(() => { localStorage.clear(); pinia = createPinia(); setActivePinia(pinia) })
afterEach(() => { app?.unmount(); app = null; document.body.innerHTML = '' })

async function mount(comp: any) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(comp)
  app.use(pinia)
  app.mount(root)
  await nextTick()
  return root
}
const flush = async (ms = 0) => { await new Promise((r) => setTimeout(r, ms)); await nextTick() }
function type(el: Element, value: string) {
  ;(el as HTMLInputElement).value = value
  el.dispatchEvent(new Event('input'))
}
const finders = (root: Element) => Array.from(root.querySelectorAll('input[aria-label$="find point"]'))

describe('Join', () => {
  it('picks two working points and gives direction, distance and the reverse', async () => {
    const s = useLiteWorkingPointsStore()
    s.add({ name: 'A', y: 1000, x: 2000, source: 'typed' })
    s.add({ name: 'B', y: 1003, x: 2004, source: 'polar' })
    const root = await mount(JoinView)
    const [fa, fb] = finders(root)
    type(fa, 'A'); await flush()
    ;(root.querySelector('li') as HTMLElement).dispatchEvent(new MouseEvent('mousedown'))
    await nextTick()
    type(fb, 'B'); await flush()
    ;(root.querySelector('li') as HTMLElement).dispatchEvent(new MouseEvent('mousedown'))
    await nextTick()
    ;(root.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'))
    await nextTick()
    const text = root.textContent!
    expect(text).toContain('A → B')
    expect(text).toContain('36:52:12')
    expect(text).toContain('5.00')
    expect(text).toContain('216:52:12')
    expect(text).toContain('Joins this session')
  })

  it("lists the surveyor's survey projects and finds a beacon of the one chosen", async () => {
    const s = useLiteWorkingPointsStore()
    const root = await mount(JoinView)
    await flush()
    const select = root.querySelector('select') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.textContent)).toContain('Brackenhurst')
    select.value = '13'
    select.dispatchEvent(new Event('change'))
    await flush()
    expect(listCoordinatePoints).toHaveBeenCalledWith(13)
    expect(root.textContent).toContain('2 points')
    type(finders(root)[0], '87'); await flush()
    const items = Array.from(root.querySelectorAll('li')).map((li) => li.textContent)
    expect(items[0]).toContain('87C')
    expect(items[0]).toContain('Y -3551.38, X 1965611.53')
    expect(items[0]).toContain('project')
    ;(root.querySelector('li') as HTMLElement).dispatchEvent(new MouseEvent('mousedown'))
    await nextTick()
    expect(s.points.find((p) => p.name === '87C')).toMatchObject({ y: -3551.377, x: 1965611.534, source: 'survey' })
  })

  it('reads a layer point the server stored as [Y, X] with Y and X the right way round', async () => {
    const s = useLiteWorkingPointsStore()
    s.setSourceKind('layer')
    s.setLayer(1)
    const root = await mount(JoinView)
    type(finders(root)[0], '419'); await flush(300)
    const li = root.querySelector('li') as HTMLElement
    expect(li.textContent).toContain('Y 33332.88, X 1860173.00')
    li.dispatchEvent(new MouseEvent('mousedown'))
    await nextTick()
    const nums = Array.from(root.querySelectorAll('input[type="number"]')) as HTMLInputElement[]
    expect(nums[0].value).toBe('33332.88')
    expect(nums[1].value).toBe('1860173')
    expect(s.points.find((p) => p.name === '419/S')).toMatchObject({ y: 33332.88, x: 1860173, source: 'layer' })
  })
})

describe('Polar', () => {
  it('adds the computed point to the working points, named Q1, for the other modules', async () => {
    const s = useLiteWorkingPointsStore()
    s.add({ name: 'P', y: 100, x: 200, source: 'typed' })
    const root = await mount(PolarView)
    type(finders(root)[0], 'P'); await flush()
    ;(root.querySelector('li') as HTMLElement).dispatchEvent(new MouseEvent('mousedown'))
    await nextTick()
    ;(root.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'))
    await flush()
    expect(computePolar).toHaveBeenCalledWith(expect.objectContaining({ y: 100, x: 200 }))
    expect(s.points.find((p) => p.name === 'Q1')).toMatchObject({ y: 103, x: 204, source: 'polar' })
    expect(root.textContent).toContain('Q1 is in this session')
  })
})
