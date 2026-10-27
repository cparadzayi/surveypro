// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import {
  clearUnsavedWork, confirmDiscardUnsaved, hasUnsavedWork, markSaved, markUnsaved, unsavedWork, useUnsavedWork,
} from '../useUnsavedWork'
import { answerConfirm, confirmQueue } from '../useNotifications'

beforeEach(() => { clearUnsavedWork(); confirmQueue.value = [] })

describe('what is unsaved', () => {
  it('starts empty, and tracks screens by id', () => {
    expect(hasUnsavedWork()).toBe(false)
    markUnsaved('project-setup', 'Project setup details')
    markUnsaved('record', 'Record composition')
    expect(hasUnsavedWork()).toBe(true)
    expect(unsavedWork()).toEqual(['Project setup details', 'Record composition'])
    markSaved('project-setup')
    expect(unsavedWork()).toEqual(['Record composition'])
    markSaved('record')
    expect(hasUnsavedWork()).toBe(false)
  })

  it('does not list the same screen twice', () => {
    markUnsaved('a', 'A'); markUnsaved('a', 'A')
    expect(unsavedWork()).toEqual(['A'])
  })
})

describe('confirmDiscardUnsaved', () => {
  it('lets the user go without asking when nothing is unsaved', async () => {
    await expect(confirmDiscardUnsaved()).resolves.toBe(true)
    expect(confirmQueue.value).toHaveLength(0)
  })

  it('asks, naming what would be lost, and is a danger question that starts on "stay"', async () => {
    markUnsaved('project-setup', 'Project setup details')
    const answer = confirmDiscardUnsaved()
    const q = confirmQueue.value[0]
    expect(q.title).toBe('Leave without saving?')
    expect(q.message).toContain('• Project setup details')
    expect(q).toMatchObject({ tone: 'danger', confirmLabel: 'Leave without saving', cancelLabel: 'Stay and keep editing' })
    answerConfirm(false)
    await expect(answer).resolves.toBe(false)
    expect(hasUnsavedWork()).toBe(true)          // staying keeps the warning
  })

  it('forgets the changes once the user chooses to leave', async () => {
    markUnsaved('project-setup', 'Project setup details')
    const answer = confirmDiscardUnsaved()
    answerConfirm(true)
    await expect(answer).resolves.toBe(true)
    expect(hasUnsavedWork()).toBe(false)
  })
})

describe('the browser prompt', () => {
  const fire = () => {
    const e = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    window.dispatchEvent(e)
    return e
  }
  it('appears only while something is unsaved', () => {
    expect(fire().defaultPrevented).toBe(false)
    markUnsaved('x', 'X')
    expect(fire().defaultPrevented).toBe(true)
    markSaved('x')
    expect(fire().defaultPrevented).toBe(false)
  })
})

describe('useUnsavedWork in a component', () => {
  it('marks on input, clears on save, and cleans up when the screen goes away', async () => {
    let api!: ReturnType<typeof useUnsavedWork>
    const Screen = defineComponent({ setup() { api = useUnsavedWork('screen', 'Screen details'); return () => h('div') } })
    const root = document.createElement('div')
    const app = createApp(Screen)
    app.mount(root)

    api.mark()
    expect(unsavedWork()).toEqual(['Screen details'])
    api.clear()
    expect(hasUnsavedWork()).toBe(false)

    api.mark()
    app.unmount()                               // leaving the screen must not leave a stale warning behind
    await nextTick()
    expect(hasUnsavedWork()).toBe(false)
  })
})
