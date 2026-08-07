import { describe, test, expect } from '@jest/globals'
import { buildReferenceGrid } from '../referenceGrid.js'

describe('buildReferenceGrid', () => {
  test('maps 2a metadata values and blanks SG-office cells', () => {
    const g = buildReferenceGrid({
      deedOfTransferNo: '3326/72', parentDiagramNo: '8055/57',
      parentDiagramAnnexedTo: 'X', originalTitleDiagramNo: 'Y',
      srNo: '118/2023', fileNo: '8/2916', gpNo: 'GP1',
    })
    expect(g.deedOfTransferNo).toBe('3326/72')
    expect(g.srNo).toBe('118/2023')
    expect(g.gpNo).toBe('GP1')
    expect(g.annexedToNo).toBe('')
    expect(g.annexedToDate).toBe('')
    expect(g.compilation).toBe('')
  })

  test('missing/null metadata fields become empty strings', () => {
    const g = buildReferenceGrid({ srNo: '118/2023' })
    expect(g.srNo).toBe('118/2023')
    expect(g.fileNo).toBe('')
    expect(g.deedOfTransferNo).toBe('')
  })

  test('handles null/undefined metadata', () => {
    const g = buildReferenceGrid(null)
    expect(g.srNo).toBe('')
    expect(g.parentDiagramNo).toBe('')
  })

  test('carries original title deed fields independently of the parent diagram ones', () => {
    const g = buildReferenceGrid({
      parentDiagramAnnexedTo: 'Deed of Transfer', deedOfTransferNo: '1166/77',
      originalTitleAnnexedTo: 'Certificate of Registered Title', originalTitleDeedNo: '2201/64',
    })
    expect(g.parentDiagramAnnexedTo).toBe('Deed of Transfer')
    expect(g.deedOfTransferNo).toBe('1166/77')
    expect(g.originalTitleAnnexedTo).toBe('Certificate of Registered Title')
    expect(g.originalTitleDeedNo).toBe('2201/64')
  })

  test('carries compilation from metadata (no longer SG-office-only)', () => {
    const g = buildReferenceGrid({ compilation: 'J. Moyo' })
    expect(g.compilation).toBe('J. Moyo')
  })

  test('missing compilation becomes an empty string', () => {
    const g = buildReferenceGrid({})
    expect(g.compilation).toBe('')
  })
})
