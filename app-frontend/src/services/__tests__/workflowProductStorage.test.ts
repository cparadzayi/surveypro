import { describe, test, expect, vi, beforeEach } from 'vitest'
import { saveWorkflowProduct, type WorkflowProduct } from '../workflowProductStorage'
import * as documentStorage from '../documentStorage'

vi.mock('../documentStorage', async () => {
  const actual = await vi.importActual<typeof import('../documentStorage')>('../documentStorage')
  return {
    ...actual,
    saveDocument: vi.fn(async (opts: any) => ({ success: true, filePath: `/abs/${opts.fileName}` })),
  }
})

const resp = (body: any = {}) => ({ ok: true, status: 200, json: async () => body }) as any

const workingDirectory = 'C:/Users/User/Documents/SurveyPro/Surveyors/Tester/test-project'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp({ filePath: '/abs/out.pdf' })))
})

describe('saveWorkflowProduct', () => {
  test('PDF products request overwrite=true so regenerated files replace stale ones', async () => {
    const product: WorkflowProduct = { type: 'pdf', category: 'calculations-part1', fileName: 'Calculations.pdf', data: new Blob(['x']) }
    const r = await saveWorkflowProduct(workingDirectory, product)
    expect(r.success).toBe(true)
    const saveDocument = documentStorage.saveDocument as unknown as ReturnType<typeof vi.fn>
    expect(saveDocument).toHaveBeenCalledTimes(1)
    expect(saveDocument.mock.calls[0][0].overwrite).toBe(true)
  })

  test('CSV products request overwrite=true', async () => {
    const product: WorkflowProduct = { type: 'csv', category: 'raw-data', fileName: 'import.csv', data: 'a,b,c' }
    const r = await saveWorkflowProduct(workingDirectory, product)
    expect(r.success).toBe(true)
    const fetchMock = vi.mocked(fetch)
    const body = fetchMock.mock.calls[0][1].body as FormData
    expect(body.get('overwrite')).toBe('true')
  })

  test('xlsx products request overwrite=true', async () => {
    const product: WorkflowProduct = { type: 'xlsx', category: 'general-plan', fileName: 'report.xlsx', data: new Blob(['x']) }
    const r = await saveWorkflowProduct(workingDirectory, product)
    expect(r.success).toBe(true)
    const fetchMock = vi.mocked(fetch)
    const body = fetchMock.mock.calls[0][1].body as FormData
    expect(body.get('overwrite')).toBe('true')
  })
})