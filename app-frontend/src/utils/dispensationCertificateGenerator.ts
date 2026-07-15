import jsPDF from 'jspdf'
import type { CertificateRow } from './dispensationCertificate'

export interface DispensationCertificateData {
  portion: 'developed' | 'undeveloped'
  heading?: string
  township: string
  parentProperty?: string
  district?: string
  province?: string
  generalPlanNumber?: string
  sgNumber?: string
  loZone?: string
  /** Editable certificate number (blank underline when empty). */
  certificateNumber?: string
  /** Pre-built "SURVEY OF STANDS <ranges> <township>" title line. */
  surveyTitle?: string
  rows: CertificateRow[]
  standCount: number
  totalArea: number
  dispensationClause: string
  surveyorName: string
  licenseNumber?: string
  place?: string
  date: string
}

const M = { top: 20, right: 18, bottom: 22, left: 18 }

export async function generateDispensationCertificatePDF(
  data: DispensationCertificateData,
): Promise<{ blob: Blob; pageCount: number }> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const contentW = pageW - M.left - M.right
  let y = M.top

  const line = (txt: string, opts: { size?: number; style?: 'normal' | 'bold'; align?: 'left' | 'center'; gap?: number } = {}) => {
    doc.setFont('helvetica', opts.style ?? 'normal')
    doc.setFontSize(opts.size ?? 10)
    const x = opts.align === 'center' ? pageW / 2 : M.left
    doc.text(txt, x, y, { align: opts.align ?? 'left' })
    y += opts.gap ?? 6
  }

  // Wrapped left-aligned paragraph (advances y by the number of wrapped lines).
  const para = (txt: string, opts: { size?: number; style?: 'normal' | 'bold'; lh?: number; gap?: number } = {}) => {
    doc.setFont('helvetica', opts.style ?? 'normal')
    doc.setFontSize(opts.size ?? 10)
    const wrapped = doc.splitTextToSize(txt, contentW)
    doc.text(wrapped, M.left, y)
    y += wrapped.length * (opts.lh ?? 5) + (opts.gap ?? 3)
  }

  // Header — formal certificate block (Page i of N is stamped per-page in the post-pass below).
  const year = data.date && /^\d{4}/.test(data.date) ? data.date.slice(0, 4) : String(new Date().getFullYear())
  const certNo = data.certificateNumber && data.certificateNumber.trim() ? data.certificateNumber.trim() : '______________'
  line('CERTIFICATE', { size: 13, style: 'bold', align: 'center', gap: 9 })
  line(`NO. ${certNo}          OF ${year}`, { size: 10, gap: 6 })
  para('(Issued in terms of Section 49 of the Land Survey Act Chapter 20:12)', { size: 9, gap: 5 })
  para(data.surveyTitle || `SURVEY OF ${(data.township || '').toUpperCase()}`, { size: 11, style: 'bold', lh: 6, gap: 5 })
  line(`DISTRICT: ${(data.district || '').toUpperCase()}`, { size: 10, style: 'bold', gap: 8 })
  const showServ = data.portion === 'developed'
  // Core certification statement. The GP number is blank (hand-filled on lodgement) unless provided.
  const gpNo = data.generalPlanNumber && data.generalPlanNumber.trim() ? data.generalPlanNumber.trim() : '______________'
  para(
    `This is to certify that diagrams have been dispensed with in respect of stands represented on General Plan ${gpNo} which are listed in the following schedule.`,
    { size: 10, gap: 4 },
  )

  // Table columns (widths shared by header + data rows).
  const remaining = showServ ? contentW - 24 - 28 : contentW - 40 - 46
  const cols = showServ
    ? [{ w: 24 }, { w: 28 }, { w: remaining / 2 }, { w: remaining / 2 }]
    : [{ w: 40 }, { w: 46 }, { w: remaining }]

  // Developed: a grouped header where "DETAILS OF SERVITUDES" spans the boundary +
  // servitude columns, over the legend, over the numbered (1)/(2) sub-columns.
  const drawHeaderRow = () => {
    const top = y - 4
    if (showServ) {
      const [wStand, wArea, wB, wS] = cols.map((c) => c.w)
      const xStand = M.left, xArea = xStand + wStand, xGroup = xArea + wArea, xServ = xGroup + wB
      const wGroup = wB + wS
      const b1 = 6, b2 = 6, b3 = 6, HH = b1 + b2 + b3
      doc.rect(xStand, top, wStand, HH)
      doc.rect(xArea, top, wArea, HH)
      doc.rect(xGroup, top, wGroup, HH)
      doc.line(xGroup, top + b1, xGroup + wGroup, top + b1)
      doc.line(xGroup, top + b1 + b2, xGroup + wGroup, top + b1 + b2)
      doc.line(xServ, top + b1 + b2, xServ, top + HH)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
      doc.text('STAND No.', xStand + 1.5, top + HH / 2 + 1, { maxWidth: wStand - 3 })
      doc.text(['AREA', 'SQUARE METRES'], xArea + 1.5, top + HH / 2 - 2, { maxWidth: wArea - 3 })
      doc.text('DETAILS OF SERVITUDES', xGroup + wGroup / 2, top + b1 - 1.5, { align: 'center', maxWidth: wGroup - 3 })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
      doc.text('The boundary (1) is subject to a (2) servitude', xGroup + wGroup / 2, top + b1 + b2 - 1.8, { align: 'center', maxWidth: wGroup - 3 })
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
      doc.text('1', xGroup + wB / 2, top + HH - 1.8, { align: 'center' })
      doc.text('2', xServ + wS / 2, top + HH - 1.8, { align: 'center' })
      y += HH
    } else {
      const HH = 10
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
      let x = M.left
      doc.rect(x, top, cols[0].w, HH); doc.text('STAND No.', x + 1.5, top + HH / 2 + 1, { maxWidth: cols[0].w - 3 }); x += cols[0].w
      doc.rect(x, top, cols[1].w, HH); doc.text(['AREA', 'SQUARE METRES'], x + 1.5, top + HH / 2 - 2, { maxWidth: cols[1].w - 3 }); x += cols[1].w
      doc.rect(x, top, cols[2].w, HH); doc.text('DETAILS OF SERVITUDES', x + 1.5, top + HH / 2 + 1, { maxWidth: cols[2].w - 3 })
      y += HH
    }
  }
  drawHeaderRow()

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  for (const r of data.rows) {
    const boundaryCol = showServ ? cols[2] : null
    const servCol = showServ ? cols[3] : cols[2]
    const boundaryLines = showServ && r.boundary ? doc.splitTextToSize(r.boundary, boundaryCol!.w - 3) : ['']
    const servLines = r.servitudeType ? doc.splitTextToSize(r.servitudeType, servCol.w - 3) : ['']
    const rowH = Math.max(6, Math.max(boundaryLines.length, servLines.length) * 4 + 2)
    if (y + rowH > pageH - M.bottom) { doc.addPage(); y = M.top; drawHeaderRow(); doc.setFont('helvetica', 'normal'); doc.setFontSize(9) }
    let x = M.left
    const cells = showServ
      ? [r.stand, r.areaM2 ? String(Math.round(r.areaM2)) : '', boundaryLines, servLines]
      : [r.stand, r.areaM2 ? String(Math.round(r.areaM2)) : '', servLines]
    for (let i = 0; i < cols.length; i++) {
      doc.rect(x, y - 4, cols[i].w, rowH)
      const val = cells[i]
      doc.text(Array.isArray(val) ? val : [val], x + 1.5, y, { maxWidth: cols[i].w - 3 })
      x += cols[i].w
    }
    y += rowH
  }

  // Totals
  y += 2
  line(`Total stands: ${data.standCount}    Total area: ${Math.round(data.totalArea)} m²`, { style: 'bold' })
  y += 2

  // Footer blocks
  const footer = (txt: string, style: 'normal' | 'bold' = 'normal') => {
    const wrapped = doc.splitTextToSize(txt, contentW)
    if (y + wrapped.length * 5 > pageH - M.bottom) { doc.addPage(); y = M.top }
    doc.setFont('helvetica', style); doc.setFontSize(9)
    doc.text(wrapped, M.left, y); y += wrapped.length * 5 + 3
  }
  footer(`Dispensation is granted under ${data.dispensationClause}.`)
  footer(`I, ${data.surveyorName}${data.licenseNumber ? ` (${data.licenseNumber})` : ''}, Registered Land Surveyor, certify the above.`)
  footer(`Signed: ____________________     Place: ${data.place || '____________'}     Date: ${data.date}`)
  y += 6
  footer('For office use — Surveyor-General:', 'bold')
  footer('Approved: ____________________     Date: ____________________')

  // Stamp "Page i of N" at the top of every page (N is only known after layout).
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Page ${p} of ${pageCount}`, M.left, 12)
  }

  const blob = doc.output('blob')
  return { blob, pageCount }
}
