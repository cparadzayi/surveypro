import { describe, test, expect, vi, beforeEach } from 'vitest'
import { saveWithOverwritePrompt } from '../workflowProductStorage'

const resp = (body: any, status = 200) => ({ ok: status < 400, status, json: async () => body }) as any
const args = { workingDirectory: 'Proj', subdir: 'diagrams', fileName: 'diagram-302.pdf', blob: new Blob(['x']) }

beforeEach(() => { vi.restoreAllMocks() })

describe('saveWithOverwritePrompt', () => {
  test('saves directly when there is no conflict', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp({ ok: true, filePath: '/abs/diagram-302.pdf' }))
    vi.stubGlobal('fetch', fetchMock)
    const confirm = vi.fn()
    const r = await saveWithOverwritePrompt(args, confirm)
    expect(r.success).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('prompts on EXISTS then retries with overwrite=true when confirmed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(resp({ ok: false, code: 'EXISTS' }, 409))
      .mockResolvedValueOnce(resp({ ok: true, filePath: '/abs/diagram-302.pdf' }))
    vi.stubGlobal('fetch', fetchMock)
    const confirm = vi.fn().mockResolvedValue(true)
    const r = await saveWithOverwritePrompt(args, confirm)
    expect(confirm).toHaveBeenCalledWith('diagram-302.pdf')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((fetchMock.mock.calls[1][1].body as FormData).get('overwrite')).toBe('true')
    expect(r.success).toBe(true)
  })

  test('skips (no overwrite) when the user declines', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(resp({ ok: false, code: 'EXISTS' }, 409))
    vi.stubGlobal('fetch', fetchMock)
    const r = await saveWithOverwritePrompt(args, () => false)
    expect(r).toEqual({ success: false, skipped: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('returns an error on a non-EXISTS 409 (locked file) without prompting', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(resp({ ok: false, code: 'EBUSY', message: 'File is open' }, 409))
    vi.stubGlobal('fetch', fetchMock)
    const confirm = vi.fn()
    const r = await saveWithOverwritePrompt(args, confirm)
    expect(r.success).toBe(false)
    expect(r.skipped).toBeUndefined()
    expect(confirm).not.toHaveBeenCalled()
  })
})
