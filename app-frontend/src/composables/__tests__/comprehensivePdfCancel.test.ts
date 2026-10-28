import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'

// Cancelling the Complete Survey Record: allowed until the first write, never after.
const generateAreaConsistencyPDF = vi.fn()
const saveDocument = vi.fn()
vi.mock('../useAreaConsistencyPDF', () => ({ useAreaConsistencyPDF: () => ({ generateAreaConsistencyPDF }) }))
vi.mock('@/services/documentStorage', () => ({ saveDocument: (...a: any[]) => saveDocument(...a) }))
vi.mock('@/services/spatial', () => ({ listCoordinatePoints: async () => [] }))

const { generateComprehensiveLatestPDF } = await import('../useComprehensivePDF')

async function pdfBytes() {
  const d = await PDFDocument.create(); d.addPage(); return d.save()
}

const base = async () => ({
  computedParcels: [{ designation: '1' }] as any,
  calcPart1Blob: new Blob(['x']),
  projectName: 'P',
  projectId: 1,
  lastDisplayedPageNumber: 3,
  workingDirectory: 'C:/p',
})

beforeEach(async () => {
  generateAreaConsistencyPDF.mockReset(); saveDocument.mockReset()
  const merged = await pdfBytes()
  generateAreaConsistencyPDF.mockResolvedValue({ merged, areasOnly: new Blob(['a']) })
  saveDocument.mockResolvedValue({ success: true, filePath: 'C:/p/Comprehensive_Latest.pdf' })
})

describe('generateComprehensiveLatestPDF cancel', () => {
  it('stops before doing any work when cancelled at the start, and writes nothing', async () => {
    const onSaveStart = vi.fn(), onNewParcels = vi.fn()
    const r = await generateComprehensiveLatestPDF({ ...(await base()), shouldCancel: () => true, onSaveStart, onNewParcels })
    expect(r).toEqual({ success: false, cancelled: true })
    expect(generateAreaConsistencyPDF).not.toHaveBeenCalled()
    expect(saveDocument).not.toHaveBeenCalled()
    expect(onSaveStart).not.toHaveBeenCalled()
    expect(onNewParcels).not.toHaveBeenCalled()
  })

  it('a cancel that arrives while the record is being built still stops it before the first write', async () => {
    let cancel = false
    generateAreaConsistencyPDF.mockImplementation(async () => { cancel = true; return { merged: await pdfBytes(), areasOnly: new Blob(['a']) } })
    const onSaveStart = vi.fn(), onNewParcels = vi.fn()
    const r = await generateComprehensiveLatestPDF({ ...(await base()), shouldCancel: () => cancel, onSaveStart, onNewParcels })
    expect(r.cancelled).toBe(true)
    expect(saveDocument).not.toHaveBeenCalled()
    expect(onSaveStart).not.toHaveBeenCalled()
    expect(onNewParcels).not.toHaveBeenCalled()
  })

  it('once saving has started a late cancel is ignored, so the file and the parcel marks stay together', async () => {
    let cancel = false
    const onNewParcels = vi.fn(async () => {})
    const onSaveStart = vi.fn(() => { cancel = true }) // the user clicks Cancel the instant saving begins
    const r = await generateComprehensiveLatestPDF({ ...(await base()), shouldCancel: () => cancel, onSaveStart, onNewParcels })
    expect(onSaveStart).toHaveBeenCalledOnce()
    expect(r.success).toBe(true)
    expect(r.cancelled).toBeUndefined()
    expect(saveDocument).toHaveBeenCalledOnce()
    expect(onNewParcels).toHaveBeenCalledOnce()
  })

  it('without a shouldCancel it behaves exactly as before', async () => {
    const onNewParcels = vi.fn(async () => {})
    const r = await generateComprehensiveLatestPDF({ ...(await base()), onNewParcels })
    expect(r.success).toBe(true)
    expect(r.filePath).toBe('C:/p/Comprehensive_Latest.pdf')
    expect(onNewParcels).toHaveBeenCalledOnce()
  })
})
