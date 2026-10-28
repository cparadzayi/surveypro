// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const post = vi.fn()
vi.mock('../../services/api', () => ({ default: { post: (...a: any[]) => post(...a) } }))

const { default: ResetPasswordView } = await import('../ResetPasswordView.vue')

let app: App
let root: HTMLElement
let router: ReturnType<typeof createRouter>

async function open(url: string) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/reset-password', component: ResetPasswordView }, { path: '/landing', component: { template: '<div />' } }],
  })
  await router.push(url)
  await router.isReady()
  app = createApp({ template: '<RouterView />' })
  app.use(router)
  app.mount(root)
  await nextTick(); await nextTick()
}
const type = async (id: string, v: string) => { const i = root.querySelector<HTMLInputElement>('#' + id)!; i.value = v; i.dispatchEvent(new Event('input')); await nextTick() }
const submit = async () => { root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await new Promise((r) => setTimeout(r, 0)); await nextTick() }

beforeEach(() => { post.mockReset(); root = document.createElement('div'); document.body.appendChild(root) })
afterEach(() => { app?.unmount(); root.remove() })

describe('ResetPasswordView', () => {
  it('without a link it says where the link comes from instead of showing a form', async () => {
    await open('/reset-password')
    expect(root.querySelector('form')).toBeNull()
    expect(root.textContent).toContain('needs a reset link from your SurveyPro administrator')
  })

  it('takes the secret out of the address bar as soon as it has read it', async () => {
    await open('/reset-password?token=abc')
    await new Promise((r) => setTimeout(r, 20)) // the replace navigation settles
    expect(router.currentRoute.value.fullPath).toBe('/reset-password')
    expect(root.querySelector('form')).not.toBeNull()
  })

  it('checks the two passwords before it calls the server', async () => {
    await open('/reset-password?token=abc')
    await type('new-password', 'abc')
    await type('confirm-new-password', 'abc')
    await submit()
    expect(root.textContent).toContain('Use at least 6 characters.')
    await type('new-password', 'abcdef')
    await type('confirm-new-password', 'abcdeg')
    await submit()
    expect(root.textContent).toContain('do not match')
    expect(post).not.toHaveBeenCalled()
  })

  it('sends the token and password, then says it worked and offers sign-in', async () => {
    post.mockResolvedValue({ data: { ok: true } })
    await open('/reset-password?token=abc')
    await type('new-password', 'brand-new-1')
    await type('confirm-new-password', 'brand-new-1')
    await submit()
    expect(post).toHaveBeenCalledWith('/auth/password-reset', { token: 'abc', password: 'brand-new-1' })
    expect(root.textContent).toContain('Your password has been changed')
    expect(root.querySelector('form')).toBeNull()
  })

  it("shows the server's own sentence when the link is no good", async () => {
    post.mockRejectedValue({ response: { status: 400, data: { message: 'This reset link is invalid or has expired. Ask your administrator for a new one.' } } })
    await open('/reset-password?token=abc')
    await type('new-password', 'brand-new-1')
    await type('confirm-new-password', 'brand-new-1')
    await submit()
    expect(root.textContent).toContain('invalid or has expired')
    expect(root.querySelector('form')).not.toBeNull() // still there, so a typo can be fixed
  })
})
