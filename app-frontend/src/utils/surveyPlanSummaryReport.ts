import jsPDF from 'jspdf'

export interface SurveyPlanSummaryData {
  projectInfo: {
    designation: string
    surveyOf?: string
    district?: string
    township?: string
    surveyDate: string
    surveyorName: string
    licenseNumber: string
    firm?: string
  }
  parcels: Array<{
    id: number
    stand: string
    area_m2: number
    description?: string
  }>
  outsideFigureData?: {
    edges: Array<{
      side: string
      distance: number
      direction: string
      pointId: string
      y: number
      x: number
    }>
  }
  beaconGroups: Array<{
    points: string
    description: string
  }>
  scale: string
  sheetSize: string        // e.g. "ISO_A2"
  orientation: string      // e.g. "landscape"
  centralMeridian: number
  generatedAt?: Date
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatArea(m2: number): string {
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(4)} ha`
  return `${m2.toFixed(2)} m²`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-ZW', {
      day: '2-digit', month: 'long', year: 'numeric'
    })
  } catch {
    return iso
  }
}

function sheetLabel(sheetSize: string, orientation: string): string {
  const labels: Record<string, string> = {
    ISO_A2: 'ISO A2 (594 × 420 mm)',
    ISO_A1: 'ISO A1 (841 × 594 mm)',
    ISO_A0: 'ISO A0 (1189 × 841 mm)'
  }
  const base = labels[sheetSize] || sheetSize
  return `${base} — ${orientation}`
}

// ─── main export ─────────────────────────────────────────────────────────────

/**
 * Generates a compact A4 summary-statistics PDF for the survey plan.
 * Returns a Blob ready for download.
 */
export function generatePlanStatisticsPDF(data: SurveyPlanSummaryData): Blob {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const PW = 210
  const PH = 297
  const ML = 20
  const MR = 20
  const MT = 20
  const contentWidth = PW - ML - MR

  let y = MT

  // ── colour palette ──────────────────────────────────────────────────────
  const C = {
    primary:   [30,  64, 120] as [number, number, number],
    accent:    [70, 130, 180] as [number, number, number],
    light:     [220, 232, 245] as [number, number, number],
    altRow:    [245, 248, 252] as [number, number, number],
    border:    [180, 200, 220] as [number, number, number],
    text:      [30,  30,  30]  as [number, number, number],
    muted:     [100, 100, 100] as [number, number, number],
    white:     [255, 255, 255] as [number, number, number],
    green:     [34, 139,  34]  as [number, number, number],
  }

  // ── utility fns ──────────────────────────────────────────────────────────
  const setFont = (size: number, style: 'normal' | 'bold' = 'normal', color = C.text) => {
    pdf.setFont('helvetica', style)
    pdf.setFontSize(size)
    pdf.setTextColor(...color)
  }

  const hLine = (yPos: number, color = C.border, lw = 0.3) => {
    pdf.setDrawColor(...color)
    pdf.setLineWidth(lw)
    pdf.line(ML, yPos, PW - MR, yPos)
  }

  const sectionHeader = (title: string): number => {
    // background bar
    pdf.setFillColor(...C.primary)
    pdf.rect(ML, y, contentWidth, 7, 'F')
    setFont(9, 'bold', C.white)
    pdf.text(title.toUpperCase(), ML + 3, y + 5)
    y += 10
    return y
  }

  const kv = (label: string, value: string, indent = 0) => {
    setFont(8, 'bold', C.muted)
    pdf.text(label, ML + indent, y)
    setFont(8, 'normal', C.text)
    pdf.text(value || '—', ML + indent + 52, y)
    y += 5.5
  }

  // ── HEADER ───────────────────────────────────────────────────────────────
  // Top colour bar
  pdf.setFillColor(...C.primary)
  pdf.rect(0, 0, PW, 14, 'F')

  setFont(13, 'bold', C.white)
  pdf.text('SURVEY PLAN — SUMMARY REPORT', ML, 9.5)

  setFont(7, 'normal', [180, 210, 240])
  const genAt = (data.generatedAt || new Date()).toLocaleString('en-ZW')
  pdf.text(`Generated: ${genAt}`, PW - MR, 9.5, { align: 'right' })

  y = 20

  // ── PROJECT INFORMATION ──────────────────────────────────────────────────
  sectionHeader('Project Information')

  const rawSurveyOf = (data.projectInfo.surveyOf || '').trim()
  const townshipDesc = rawSurveyOf.replace(/^Stands?\s+[\d,\s\-–]+/i, '').trim()

  kv('Designation:', data.projectInfo.designation || '—')
  if (townshipDesc) kv('Survey of:', townshipDesc)
  kv('District:', data.projectInfo.district || '—')
  if (data.projectInfo.township) kv('Township:', data.projectInfo.township)
  kv('Survey Date:', formatDate(data.projectInfo.surveyDate))
  kv('Surveyor:', data.projectInfo.surveyorName || '—')
  kv('Licence No.:', data.projectInfo.licenseNumber || '—')
  if (data.projectInfo.firm) kv('Firm:', data.projectInfo.firm)

  y += 3
  hLine(y)
  y += 5

  // ── PLAN SPECIFICATIONS ──────────────────────────────────────────────────
  sectionHeader('Plan Specifications')

  kv('Paper Size:', sheetLabel(data.sheetSize, data.orientation))
  kv('Scale:', data.scale || '—')
  kv('Coordinate System:', `Cape Lo ${data.centralMeridian} (EPSG:${22260 + data.centralMeridian})`)
  kv('Outside Figure Edges:', String(data.outsideFigureData?.edges?.length || 0))

  y += 3
  hLine(y)
  y += 5

  // ── PARCEL STATISTICS ────────────────────────────────────────────────────
  sectionHeader('Parcel Statistics')

  const nonOF = data.parcels.filter(p => !p.stand.toLowerCase().includes('outside figure'))
  const totalArea = nonOF.reduce((s, p) => s + (p.area_m2 || 0), 0)
  const minArea = nonOF.length ? Math.min(...nonOF.map(p => p.area_m2 || 0)) : 0
  const maxArea = nonOF.length ? Math.max(...nonOF.map(p => p.area_m2 || 0)) : 0
  const avgArea = nonOF.length ? totalArea / nonOF.length : 0

  kv('Total Parcels:', String(nonOF.length))
  kv('Total Area:', formatArea(totalArea))
  kv('Average Parcel Area:', formatArea(avgArea))
  kv('Smallest Parcel:', formatArea(minArea))
  kv('Largest Parcel:', formatArea(maxArea))
  kv('Beacon Groups:', String(data.beaconGroups.length))

  y += 3
  hLine(y)
  y += 5

  // ── SCHEDULE OF AREAS TABLE ──────────────────────────────────────────────
  sectionHeader('Schedule of Areas')

  // Table header
  const colStand = ML
  const colDesc  = ML + 30
  const colM2    = ML + 110
  const colHa    = ML + 145

  pdf.setFillColor(...C.accent)
  pdf.rect(ML, y, contentWidth, 6, 'F')
  setFont(7.5, 'bold', C.white)
  pdf.text('Stand', colStand + 1, y + 4.2)
  pdf.text('Description', colDesc + 1, y + 4.2)
  pdf.text('Area (m²)', colM2 + 1, y + 4.2)
  pdf.text('Area (ha)', colHa + 1, y + 4.2)
  y += 7

  nonOF.forEach((p, i) => {
    if (i % 2 === 1) {
      pdf.setFillColor(...C.altRow)
      pdf.rect(ML, y - 1, contentWidth, 5.5, 'F')
    }
    setFont(7.5, 'bold', C.text)
    pdf.text(p.stand || '—', colStand + 1, y + 3.2)
    setFont(7, 'normal', C.muted)
    const desc = p.description || ''
    const truncDesc = desc.length > 38 ? desc.substring(0, 36) + '…' : desc
    pdf.text(truncDesc, colDesc + 1, y + 3.2)
    setFont(7.5, 'normal', C.text)
    pdf.text(p.area_m2.toFixed(2), colM2 + 1, y + 3.2)
    pdf.text((p.area_m2 / 10000).toFixed(4), colHa + 1, y + 3.2)
    y += 5.5

    // Page break guard
    if (y > PH - 30) {
      pdf.addPage()
      y = MT
    }
  })

  // Total row
  pdf.setFillColor(...C.light)
  pdf.rect(ML, y - 1, contentWidth, 6, 'F')
  setFont(8, 'bold', C.primary)
  pdf.text('TOTAL', colStand + 1, y + 3.5)
  pdf.text(totalArea.toFixed(2), colM2 + 1, y + 3.5)
  pdf.text((totalArea / 10000).toFixed(4), colHa + 1, y + 3.5)
  y += 8

  hLine(y)
  y += 5

  // ── OUTSIDE FIGURE DATA ──────────────────────────────────────────────────
  if (data.outsideFigureData?.edges?.length) {
    // Page break guard
    if (y > PH - 50) {
      pdf.addPage()
      y = MT
    }

    sectionHeader('Outside Figure Data')

    const colSide = ML
    const colPt   = ML + 20
    const colDist = ML + 55
    const colDir  = ML + 100

    pdf.setFillColor(...C.accent)
    pdf.rect(ML, y, contentWidth, 6, 'F')
    setFont(7.5, 'bold', C.white)
    pdf.text('Side', colSide + 1, y + 4.2)
    pdf.text('From Point', colPt + 1, y + 4.2)
    pdf.text('Distance (m)', colDist + 1, y + 4.2)
    pdf.text('Direction', colDir + 1, y + 4.2)
    y += 7

    data.outsideFigureData.edges.forEach((e, i) => {
      if (i % 2 === 1) {
        pdf.setFillColor(...C.altRow)
        pdf.rect(ML, y - 1, contentWidth, 5.5, 'F')
      }
      setFont(7.5, 'normal', C.text)
      pdf.text(e.side || String(i + 1), colSide + 1, y + 3.2)
      pdf.text(e.pointId || '—', colPt + 1, y + 3.2)
      pdf.text(e.distance.toFixed(3), colDist + 1, y + 3.2)
      pdf.text(e.direction || '—', colDir + 1, y + 3.2)
      y += 5.5

      if (y > PH - 30) {
        pdf.addPage()
        y = MT
      }
    })

    hLine(y)
    y += 5
  }

  // ── FOOTER on every page ─────────────────────────────────────────────────
  const totalPages = (pdf as any).internal.getNumberOfPages()
  for (let pg = 1; pg <= totalPages; pg++) {
    pdf.setPage(pg)
    pdf.setFillColor(...C.primary)
    pdf.rect(0, PH - 10, PW, 10, 'F')
    setFont(6.5, 'normal', [180, 210, 240])
    pdf.text(
      `SurveyPro — ${data.projectInfo.designation || 'Survey Plan'} | Page ${pg} of ${totalPages}`,
      ML, PH - 3.5
    )
    pdf.text('CONFIDENTIAL — For official survey purposes only', PW - MR, PH - 3.5, { align: 'right' })
  }

  return pdf.output('blob')
}
