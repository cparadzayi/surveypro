import jsPDF from 'jspdf'
import type { CertificateRow } from './dispensationCertificate'

export interface DispensationCertificateData {
  portion: 'developed' | 'undeveloped'
  heading: string
  township: string
  parentProperty?: string
  district?: string
  province?: string
  generalPlanNumber?: string
  sgNumber?: string
  loZone?: string
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

  // Header
  line(data.heading, { size: 13, style: 'bold', align: 'center', gap: 9 })
  const metaLine = (label: string, value?: string) => { if (value) line(`${label}: ${value}`) }
  metaLine('Township', data.township)
  metaLine('Parent property', data.parentProperty)
  metaLine('District / Province', [data.district, data.province].filter(Boolean).join(' / ') || undefined)
  metaLine('General Plan', data.generalPlanNumber)
  metaLine('SG number', data.sgNumber)
  metaLine('System', data.loZone)
  y += 3

  // Table
  const showServ = data.portion === 'developed'
  const cols = showServ
    ? [{ w: 28, t: 'STAND No.' }, { w: 34, t: 'AREA (m²)' }, { w: contentW - 62, t: 'DETAILS OF SERVITUDES' }]
    : [{ w: 40, t: 'STAND No.' }, { w: 46, t: 'AREA (m²)' }, { w: contentW - 86, t: 'DETAILS OF SERVITUDES' }]

  const drawHeaderRow = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    let x = M.left
    const rowY = y
    for (const c of cols) { doc.rect(x, rowY - 4, c.w, 7); doc.text(c.t, x + 1.5, rowY, { maxWidth: c.w - 3 }); x += c.w }
    y += 7
  }
  drawHeaderRow()

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  for (const r of data.rows) {
    const servLines = showServ && r.servitudeText ? doc.splitTextToSize(r.servitudeText, cols[2].w - 3) : ['']
    const rowH = Math.max(6, servLines.length * 4 + 2)
    if (y + rowH > pageH - M.bottom) { doc.addPage(); y = M.top; drawHeaderRow(); doc.setFont('helvetica', 'normal'); doc.setFontSize(9) }
    let x = M.left
    const cells = [r.stand, r.areaM2 ? String(Math.round(r.areaM2)) : '', showServ ? servLines : ['']]
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

  const pageCount = doc.getNumberOfPages()
  const blob = doc.output('blob')
  return { blob, pageCount }
}
