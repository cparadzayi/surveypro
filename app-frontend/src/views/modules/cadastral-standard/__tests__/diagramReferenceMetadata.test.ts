import { diagramReferenceMetadata } from '../diagramReferenceMetadata'

describe('diagramReferenceMetadata', () => {
  it('carries all nine fields through', () => {
    const r = diagramReferenceMetadata({
      deedOfTransferNo: '3326/72',
      parentDiagramNo: '8055/57',
      parentDiagramAnnexedTo: 'annex-x',
      originalTitleDiagramNo: 'orig-y',
      originalTitleAnnexedTo: 'annex-z',
      originalTitleDeedNo: '2201/64',
      srNo: '118/2023',
      fileNo: '8/2916',
      gpNo: 'GP-1',
    })
    expect(r).toEqual({
      deedOfTransferNo: '3326/72',
      parentDiagramNo: '8055/57',
      parentDiagramAnnexedTo: 'annex-x',
      originalTitleDiagramNo: 'orig-y',
      originalTitleAnnexedTo: 'annex-z',
      originalTitleDeedNo: '2201/64',
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
    expect(r.originalTitleAnnexedTo).toBe('')
    expect(r.originalTitleDeedNo).toBe('')
  })

  it('handles null/undefined input', () => {
    const empty = {
      deedOfTransferNo: '', parentDiagramNo: '', parentDiagramAnnexedTo: '',
      originalTitleDiagramNo: '', originalTitleAnnexedTo: '', originalTitleDeedNo: '',
      srNo: '', fileNo: '', gpNo: '',
    }
    expect(diagramReferenceMetadata(null)).toEqual(empty)
    expect(diagramReferenceMetadata(undefined)).toEqual(empty)
  })

  it('exposes exactly the nine contract keys', () => {
    expect(Object.keys(diagramReferenceMetadata({})).sort()).toEqual([
      'deedOfTransferNo', 'fileNo', 'gpNo', 'originalTitleAnnexedTo',
      'originalTitleDeedNo', 'originalTitleDiagramNo', 'parentDiagramAnnexedTo',
      'parentDiagramNo', 'srNo',
    ])
  })
})
