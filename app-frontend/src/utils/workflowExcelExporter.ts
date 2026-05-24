/**
 * Workflow Excel Exporter
 *
 * Generates a multi-sheet Excel workbook from workflow state containing:
 *   Sheet 1 – Field Book
 *   Sheet 2 – Calculations (duplicate analysis / adjusted coordinates)
 *   Sheet 3 – Coordinate List
 */

import * as XLSX from 'xlsx'
import type { CadastralWorkflowState } from '../types/cadastral'

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an Excel workbook blob from the current workflow state.
 * Returns a Blob (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet).
 */
export function buildWorkflowExcel(workflowState: CadastralWorkflowState): Blob {
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, buildFieldBookSheet(workflowState), 'Field Book')
  XLSX.utils.book_append_sheet(wb, buildCalculationsSheet(workflowState), 'Calculations')
  XLSX.utils.book_append_sheet(wb, buildCoordinateListSheet(workflowState), 'Coordinate List')

  const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([wbArray], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

/**
 * Trigger a browser download of the Excel workbook.
 */
export function downloadWorkflowExcel(
  workflowState: CadastralWorkflowState,
  projectName: string
): void {
  const blob = buildWorkflowExcel(workflowState)
  const ts = new Date().toISOString().split('T')[0]
  const safeName = projectName.replace(/[^a-zA-Z0-9_\-]/g, '_')
  const fileName = `${safeName}_WorkflowData_${ts}.xlsx`
  triggerDownload(blob, fileName)
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet builders
// ─────────────────────────────────────────────────────────────────────────────

function buildFieldBookSheet(ws: CadastralWorkflowState): XLSX.WorkSheet {
  const rows: any[][] = []

  // Title row
  rows.push(['ELECTRONIC FIELD BOOK'])
  rows.push([`Project: ${ws.projectInfo?.name || ''}`, '', `Surveyor: ${ws.surveyorInfo?.landSurveyor || ''}`])
  rows.push([`Survey Of: ${ws.surveyorInfo?.surveyOf || ''}`, '', `Date: ${ws.surveyorInfo?.surveyDate || ''}`])
  rows.push([`District: ${ws.projectInfo?.district || ''}`, '', `Instruments: ${ws.surveyorInfo?.instruments || ''}`])
  rows.push([])

  // Header
  rows.push(['Page', 'Point', 'Y (Westing)', 'X (Southing)', 'Status', 'Description', 'Date of Survey'])

  const fieldBookPoints = ws.documents?.fieldBook?.points

  if (fieldBookPoints && fieldBookPoints.length > 0) {
    for (const pt of fieldBookPoints) {
      rows.push([
        pt.pageNumber != null ? `E${pt.pageNumber}` : '',
        pt.id,
        pt.coordinates?.y ?? '',
        pt.coordinates?.x ?? '',
        pt.status ?? '',
        pt.description ?? '',
        pt.surveyDate instanceof Date
          ? pt.surveyDate.toISOString().split('T')[0]
          : (pt.surveyDate ?? '')
      ])
    }
  } else {
    // Fall back to importedPoints filtered to field-book-eligible points
    const fbPoints = (ws.importedPoints || []).filter(p => p.includeInFieldBook !== false)
    const pointsPerPage = 27
    let pageNum = 1
    let count = 0
    for (const pt of fbPoints) {
      if (count === pointsPerPage) { pageNum++; count = 0 }
      rows.push([
        `E${pageNum}`,
        pt.id,
        pt.fieldBook?.y ?? pt.original?.y ?? '',
        pt.fieldBook?.x ?? pt.original?.x ?? '',
        pt.status ?? '',
        pt.description ?? '',
        pt.surveyDate instanceof Date
          ? pt.surveyDate.toISOString().split('T')[0]
          : (pt.surveyDate ?? '')
      ])
      count++
    }
  }

  return applyBasicStyles(XLSX.utils.aoa_to_sheet(rows), rows)
}

function buildCalculationsSheet(ws: CadastralWorkflowState): XLSX.WorkSheet {
  const rows: any[][] = []

  rows.push(['CALCULATIONS PART 1 – DUPLICATE POINT ANALYSIS'])
  rows.push([`Project: ${ws.projectInfo?.name || ''}`, '', `Surveyor: ${ws.surveyorInfo?.landSurveyor || ''}`])
  rows.push([])

  const dupes = ws.duplicateAnalyses

  if (dupes && dupes.length > 0) {
    rows.push(['Point', 'Obs #', 'Y (Westing)', 'X (Southing)', 'Residual Y', 'Residual X', 'Status', 'Survey Date'])
    for (const d of dupes) {
      for (let i = 0; i < d.observations.length; i++) {
        const obs = d.observations[i]
        rows.push([
          d.pointId,
          i + 1,
          obs.y,
          obs.x,
          d.residualsY?.[i] != null ? d.residualsY[i].toFixed(4) : '',
          d.residualsX?.[i] != null ? d.residualsX[i].toFixed(4) : '',
          d.withinTolerance ? 'OK' : 'FAIL',
          obs.surveyDate ?? ''
        ])
      }
      // Mean row
      rows.push([
        d.pointId,
        'MEAN',
        d.meanY.toFixed(3),
        d.meanX.toFixed(3),
        '',
        '',
        d.withinTolerance ? 'Within tolerance' : 'EXCEEDS tolerance',
        ''
      ])
      rows.push([])
    }
  } else {
    // No duplicates — show adjusted coordinates if available
    rows.push(['Point', 'Y (Westing)', 'X (Southing)', 'Status', 'Description', 'Field Book Page', 'Calcs Page'])
    const adjCoords = ws.adjustedCoordinates
    if (adjCoords && adjCoords.length > 0) {
      for (const c of adjCoords) {
        rows.push([
          c.pointId,
          typeof c.y === 'number' ? c.y.toFixed(3) : c.y,
          typeof c.x === 'number' ? c.x.toFixed(3) : c.x,
          (c as any).status ?? '',
          (c as any).description ?? '',
          c.fieldBookPage ?? '',
          c.calculationsPage ?? ''
        ])
      }
    } else {
      rows.push(['No duplicate observations found — no calculations required.'])
    }
  }

  return applyBasicStyles(XLSX.utils.aoa_to_sheet(rows), rows)
}

function buildCoordinateListSheet(ws: CadastralWorkflowState): XLSX.WorkSheet {
  const rows: any[][] = []

  rows.push(['COORDINATE LIST'])
  rows.push([`Project: ${ws.projectInfo?.name || ''}`, '', `Surveyor: ${ws.surveyorInfo?.landSurveyor || ''}`])
  rows.push([`District: ${ws.projectInfo?.district || ''}`, '', `Date: ${ws.surveyorInfo?.surveyDate || ''}`])
  rows.push([])

  rows.push(['Group', 'Point', 'Y (Westing)', 'X (Southing)', 'Status', 'Description', 'Field Book Page', 'Calcs Page'])

  const clPoints = ws.documents?.coordinateList?.points

  if (clPoints && clPoints.length > 0) {
    for (const pt of clPoints) {
      rows.push([
        (pt as any).group ?? '',
        pt.id,
        pt.coordinates?.y ?? '',
        pt.coordinates?.x ?? '',
        pt.status ?? '',
        pt.description ?? '',
        (pt as any).fieldBookRef ?? '',
        (pt as any).calculationsRef ?? ''
      ])
    }
  } else {
    // Fall back to importedPoints sorted by group
    const groupOrder = ['F', 'P', null, undefined]
    const sorted = [...(ws.importedPoints || [])].sort((a, b) => {
      const ga = groupOrder.indexOf(a.status as any)
      const gb = groupOrder.indexOf(b.status as any)
      if (ga !== gb) return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb)
      return a.id.localeCompare(b.id)
    })
    const statusLabel: Record<string, string> = { F: 'Fixed', P: 'Peg' }
    for (const pt of sorted) {
      rows.push([
        statusLabel[pt.status as string] ?? 'Other',
        pt.id,
        pt.coordinateList?.y ?? pt.original?.y ?? '',
        pt.coordinateList?.x ?? pt.original?.x ?? '',
        pt.status ?? '',
        pt.description ?? '',
        '',
        ''
      ])
    }
  }

  return applyBasicStyles(XLSX.utils.aoa_to_sheet(rows), rows)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function applyBasicStyles(sheet: XLSX.WorkSheet, rows: any[][]): XLSX.WorkSheet {
  // Set column widths
  sheet['!cols'] = [
    { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
    { wch: 12 }, { wch: 40 }, { wch: 14 }, { wch: 12 }
  ]
  return sheet
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
