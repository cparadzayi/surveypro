import { diagramReferenceMetadata } from '../diagramReferenceMetadata'

describe('diagramReferenceMetadata', () => {
  it('carries all seven fields through', () => {
    const r = diagramReferenceMetadata({
      deedOfTransferNo: '3326/72',
      parentDiagramNo: '8055/57',
      parentDiagramAnnexedTo: 'annex-x',
      originalTitleDiagramNo: 'orig-y',
      srNo: '118/2023',
      fileNo: '8/2916',
      gpNo: 'GP-1',
    })
    expect(r).toEqual({
      deedOfTransferNo: '3326/72',
      parentDiagramNo: '8055/57',
      parentDiagramAnnexedTo: 'annex-x',
      originalTitleDiagramNo: 'orig-y',
      srNo: '118/2023',
      fileNo: '8/2916',
      gpNo: 'GP-1',
    })
  })

  it('normalises missing and null values to empty strings', () => {
    const r = diagramReferenceMetadata({ srNo: '118/2023', fileNo: null })
    expect(r.srNo).toBe('118/2023')
    expect(r.fileNo).toBe('')
    expect(r.deedOfTransferNo).toBe('')
  })

  it('handles null/undefined input', () => {
    expect(diagramReferenceMetadata(null)).toEqual({
      deedOfTransferNo: '', parentDiagramNo: '', parentDiagramAnnexedTo: '',
      originalTitleDiagramNo: '', srNo: '', fileNo: '', gpNo: '',
    })
  })

  it('exposes exactly the seven contract keys', () => {
    expect(Object.keys(diagramReferenceMetadata({})).sort()).toEqual([
      'deedOfTransferNo', 'fileNo', 'gpNo', 'originalTitleDiagramNo',
      'parentDiagramAnnexedTo', 'parentDiagramNo', 'srNo',
    ])
  })
})
