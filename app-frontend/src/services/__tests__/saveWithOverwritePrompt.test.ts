import { describe, test, expect, vi, beforeEach } from 'vitest'
import api from '../api'
import { saveWithOverwritePrompt } from '../workflowProductStorage'

// The 409-exists overwrite handshake used to go through global fetch(). It now
// goes through the shared axios client so the bearer token is attached (raw
// fetch sent no Authorization header and only worked while /documents/* was
// unauthenticated), so the mock targets the client rather than global fetch.
vi.mock('../api', () => ({
  default: { post: vi.fn() },
  API_BASE: '/api',
}))

const post = vi.mocked(api.post)

/** Model an axios rejection: the status and body live under `response`. */
const httpError = (status: number, data: any) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data },
  })

const args = { workingDirectory: 'Proj', subdir: 'diagrams', fileName: 'diagram-302.pdf', blob: new Blob(['x']) }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('saveWithOverwritePrompt', () => {
  test('saves directly when there is no conflict', async () => {
    post.mockResolvedValueOnce({ status: 200, data: { ok: true, filePath: '/abs/diagram-302.pdf' } } as any)
    const confirm = vi.fn()
    const r = await saveWithOverwritePrompt(args, confirm)
    expect(r.success).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
    expect(post).toHaveBeenCalledTimes(1)
  })

  test('prompts on EXISTS then retries with overwrite=true when confirmed', async () => {
    post
      .mockRejectedValueOnce(httpError(409, { ok: false, code: 'EXISTS' }))
      .mockResolvedValueOnce({ status: 200, data: { ok: true, filePath: '/abs/diagram-302.pdf' } } as any)
    const confirm = vi.fn().mockResolvedValue(true)
    const r = await saveWithOverwritePrompt(args, confirm)
    expect(confirm).toHaveBeenCalledWith('diagram-302.pdf')
    expect(post).toHaveBeenCalledTimes(2)
    expect((post.mock.calls[1][1] as FormData).get('overwrite')).toBe('true')
    expect(r.success).toBe(true)
  })

  test('skips (no overwrite) when the user declines', async () => {
    post.mockRejectedValueOnce(httpError(409, { ok: false, code: 'EXISTS' }))
    const r = await saveWithOverwritePrompt(args, () => false)
    expect(r).toEqual({ success: false, skipped: true })
    expect(post).toHaveBeenCalledTimes(1)
  })

  test('returns an error on a non-EXISTS 409 (locked file) without prompting', async () => {
    post.mockRejectedValueOnce(httpError(409, { ok: false, code: 'EBUSY', message: 'File is open' }))
    const confirm = vi.fn()
    const r = await saveWithOverwritePrompt(args, confirm)
    expect(r.success).toBe(false)
    expect(r.skipped).toBeUndefined()
    expect(confirm).not.toHaveBeenCalled()
    expect(r.error).toBe('File is open')
  })

  test('sends the bearer token path, i.e. via the shared client', async () => {
    // Guards against someone reverting this call back to bare fetch(), which
    // would silently stop authenticating against a now-guarded route.
    post.mockResolvedValueOnce({ status: 200, data: { ok: true, filePath: '/abs/diagram-302.pdf' } } as any)
    await saveWithOverwritePrompt(args, () => false)
    expect(post).toHaveBeenCalledWith('/documents/save', expect.any(FormData))
  })
})
