import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/documentStorage', () => ({
  saveDocument: vi.fn(),
}))
vi.mock('@/utils/dispensationCertificateGenerator', () => ({
  generateDispensationCertificatePDF: vi.fn(async () => ({ blob: new Blob(['x']), pageCount: 1 })),
}))

import { saveDocument } from '@/services/documentStorage'
import { generateDispensationCertificatePDF } from '@/utils/dispensationCertificateGenerator'
import { generateAndSaveDispensation } from '../useDispensationCertificate'
import type { Servitude } from '../../views/modules/cadastral-standard/servitudes'

const header = { township: 'MAGLAS', dispensationClause: 'Reg 78', surveyorName: 'F.C.', date: '2026-07-14' }
const parcels = [{ id: 10, stand: '1620', area_m2: 174 }]
const sv: Servitude = { id: 's', subjectId: '10', side: 'AB', type: 'party-wall', fromBeacon: '1620a', toBeacon: '1620b' }

beforeEach(() => { vi.clearAllMocks() })

describe('generateAndSaveDispensation', () => {
  it('developed: builds data with rows/totals, saves DispensationDeveloped.pdf to certificates, overwrite', async () => {
    ;(saveDocument as any).mockResolvedValue({ success: true, filePath: '/p/DispensationDeveloped.pdf' })
    const out = await generateAndSaveDispensation({ workingDirectory: 'C:/proj', portion: 'developed', parcels, servitudes: [sv], header })
    const genArg = (generateDispensationCertificatePDF as any).mock.calls[0][0]
    expect(genArg.portion).toBe('developed')
    expect(genArg.standCount).toBe(1)
    expect(genArg.totalArea).toBe(174)
    expect(genArg.rows[0].boundary).toContain('1620a – 1620b')
    expect(genArg.surveyTitle).toBe('SURVEY OF STANDS 1620 MAGLAS')
    expect(saveDocument).toHaveBeenCalledWith(expect.objectContaining({
      workingDirectory: 'C:/proj', documentType: 'dispensation-certificate',
      fileName: 'DispensationDeveloped.pdf', overwrite: true,
    }))
    expect(out.saved).toBeTruthy()
    expect(out.failed).toBeUndefined()
  })
  it('undeveloped: uses DispensationUndeveloped.pdf', async () => {
    ;(saveDocument as any).mockResolvedValue({ success: true, filePath: '/p/DispensationUndeveloped.pdf' })
    await generateAndSaveDispensation({ workingDirectory: 'C:/proj', portion: 'undeveloped', parcels, servitudes: [], header })
    expect(saveDocument).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'DispensationUndeveloped.pdf' }))
  })
  it('records a failure without throwing when saveDocument reports failure', async () => {
    ;(saveDocument as any).mockResolvedValue({ success: false, error: 'locked' })
    const out = await generateAndSaveDispensation({ workingDirectory: 'C:/proj', portion: 'developed', parcels, servitudes: [sv], header })
    expect(out.saved).toBeUndefined()
    expect(out.failed).toBe('locked')
  })
  it('records a failure without throwing when the generator throws', async () => {
    ;(generateDispensationCertificatePDF as any).mockRejectedValueOnce(new Error('boom'))
    const out = await generateAndSaveDispensation({ workingDirectory: 'C:/proj', portion: 'developed', parcels, servitudes: [sv], header })
    expect(out.failed).toBe('boom')
  })
})
