// app-frontend/src/utils/beaconAdjustmentReport.js
// SI 727 §67(5) beacon comparison examination report (client-side jsPDF).
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { f3, f4, f4s, formatDMS } from '@/utils/surveyMath'
import { planScaleMmPerM, chooseExaggeration, scaleBarMetres, sanitizeReportFilename } from '@/utils/beaconReportGeometry'

const NAVY = [30, 58, 92]

class BeaconAdjustmentReport {
  constructor() {
    this.doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    this.pw = this.doc.internal.pageSize.getWidth()
    this.ph = this.doc.internal.pageSize.getHeight()
    this.margin = 18
    this.y = 18
  }

  sectionTitle(t) {
    this.doc.setFontSize(11); this.doc.setFont('helvetica', 'bold')
    this.doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
    this.doc.text(t, this.margin, this.y); this.y += 5
  }

  ensureSpace(h) {
    if (this.y + h > this.ph - 16) { this.doc.addPage('a4', 'portrait'); this.y = this.margin }
  }

  addHeader(meta) {
    this.doc.setFontSize(15); this.doc.setFont('helvetica', 'bold')
    this.doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
    this.doc.text('BEACON COMPARISON & ADJUSTMENT', this.pw / 2, this.y, { align: 'center' }); this.y += 7
    this.doc.setFontSize(10); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(90)
    this.doc.text('SI 727 of 1979 — Section 67(5)  ·  Cape Lo P(Y,X), South-oriented', this.pw / 2, this.y, { align: 'center' }); this.y += 6
    this.doc.setDrawColor(200, 170, 75); this.doc.setLineWidth(0.8)
    this.doc.line(this.margin, this.y, this.pw - this.margin, this.y); this.y += 6
    autoTable(this.doc, {
      startY: this.y, margin: { left: this.margin, right: this.margin }, theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
      body: [
        ['Surveyor', meta.surveyorName || '—'],
        ['PLS No.', meta.plsNumber || '—'],
        ['Location / description', meta.location || '—'],
        ['Prior survey / Diagram-GP No.', meta.priorSurvey || '—'],
        ['Examination date', meta.date || '—'],
      ],
    })
    this.y = this.doc.lastAutoTable.finalY + 6
  }

  addTransformStats(result) {
    const p = result.adj.params, s = result.adj.stats
    const pass = s.chi2 >= s.chi2L && s.chi2 <= s.chi2U
    this.sectionTitle('Transformation & Statistics')
    autoTable(this.doc, {
      startY: this.y, margin: { left: this.margin, right: this.margin }, theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1.5 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 85 } },
      body: [
        ['Translation ΔY (Westing, @ centroid)', f4(p.TY) + ' m'],
        ['Translation ΔX (Southing, @ centroid)', f4(p.TX) + ' m'],
        ['Scale factor', p.scale.toFixed(8)],
        ['Scale (ppm)', p.ppm.toFixed(2) + ' ppm'],
        ['Rotation θ', formatDMS(p.rotDeg) + '  (' + p.rotDeg.toFixed(6) + '°)'],
        ['σ₀ a priori', s.sig0.toFixed(4) + ' m'],
        ['σ₀ a posteriori', s.s0.toFixed(4) + ' m'],
        ['Degrees of freedom', String(s.DOF)],
        ['Chi-square χ²', s.chi2.toFixed(4) + '  (bounds ' + s.chi2L.toFixed(2) + ' – ' + s.chi2U.toFixed(2) + ')'],
        ['Chi-square test', pass ? 'PASS — variance consistent with a priori σ₀'
                                 : 'FAIL — review σ₀ or check for residual blunders'],
      ],
    })
    this.y = this.doc.lastAutoTable.finalY + 6
  }

  addSnoopingLog(result) {
    this.ensureSpace(40)
    this.sectionTitle('Data-Snooping Log (iterative Baarda W-test)')
    autoTable(this.doc, {
      startY: this.y, margin: { left: this.margin, right: this.margin },
      head: [['Iteration', 'Active pts', 'σ₀ (m)', 'χ²', 'χ² bounds']],
      body: result.log.map(L => [String(L.iter), String(L.n), L.s0.toFixed(5),
        L.chi2.toFixed(4), `${L.chi2L.toFixed(2)} – ${L.chi2U.toFixed(2)}`]),
      styles: { fontSize: 9, cellPadding: 1.5 }, headStyles: { fillColor: NAVY },
    })
    this.y = this.doc.lastAutoTable.finalY + 6
  }

  _arrowhead(x1, y1, x2, y2, rej, rgb) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy)
    if (len < 1.4) return
    const ux = dx / len, uy = dy / len, h = 2.4, w = 1.3
    const bx = x2 - ux * h, by = y2 - uy * h
    if (rgb) this.doc.setFillColor(rgb[0], rgb[1], rgb[2])
    else if (rej) this.doc.setFillColor(220, 38, 38)
    else this.doc.setFillColor(70, 90, 200)
    this.doc.triangle(x2, y2, bx - uy * w, by + ux * w, bx + uy * w, by - ux * w, 'F')
  }

  addDisplacementPlot(result) {
    this.doc.addPage('a4', 'portrait'); this.y = this.margin
    this.sectionTitle('Holistic Displacement Plot')
    const pts = result.pts
    const boxX = this.margin, boxYtop = this.y, boxW = this.pw - 2 * this.margin, boxH = 170
    this.doc.setDrawColor(120); this.doc.setLineWidth(0.3); this.doc.rect(boxX, boxYtop, boxW, boxH)

    // Conventional plan layout: East = −Y (right), North = −X (up).
    const es = pts.map(p => -p.yH), ns = pts.map(p => -p.xH)
    const minE = Math.min(...es), maxE = Math.max(...es)
    const minN = Math.min(...ns), maxN = Math.max(...ns)
    const spanE = maxE - minE, spanN = maxN - minN
    const pad = 16, innerW = boxW - 2 * pad, innerH = boxH - 2 * pad
    const s = planScaleMmPerM(spanE, spanN, innerW, innerH)
    const offX = boxX + pad + (innerW - spanE * s) / 2
    const offY = boxYtop + pad + (innerH - spanN * s) / 2
    const PX = e => offX + (e - minE) * s
    const PY = n => offY + (maxN - n) * s
    const maxDisp = Math.max(0, ...pts.map(p => Math.hypot(p.yS - p.yH, p.xS - p.xH)))
    const k = chooseExaggeration(maxDisp, s, 22)

    for (const p of pts) {
      const x1 = PX(-p.yH), y1 = PY(-p.xH)
      const x2 = x1 + (-(p.yS - p.yH)) * s * k
      const y2 = y1 - (-(p.xS - p.xH)) * s * k
      const rej = p.finalStatus === 'REJECT'
      this.doc.setLineWidth(rej ? 0.6 : 0.4)
      if (rej) this.doc.setDrawColor(220, 38, 38); else this.doc.setDrawColor(70, 90, 200)
      this.doc.line(x1, y1, x2, y2)
      this._arrowhead(x1, y1, x2, y2, rej)
      this.doc.setFillColor(20, 20, 20); this.doc.circle(x1, y1, 0.8, 'F')
      if (rej) this.doc.setFillColor(220, 38, 38); else this.doc.setFillColor(37, 99, 235)
      this.doc.circle(x2, y2, 0.7, 'F')
      this.doc.setFontSize(6.5); this.doc.setTextColor(rej ? 198 : 60, rej ? 30 : 60, rej ? 30 : 60)
      this.doc.text(p.name, x1 + 1.5, y1 - 1.2)
    }

    // True-metre scale bar (bottom-left of box)
    const barM = scaleBarMetres(s, 40), barMm = barM * s
    const sbx = boxX + pad, sby = boxYtop + boxH - 8
    this.doc.setDrawColor(40); this.doc.setLineWidth(0.5)
    this.doc.line(sbx, sby, sbx + barMm, sby)
    this.doc.line(sbx, sby - 1.2, sbx, sby + 1.2)
    this.doc.line(sbx + barMm, sby - 1.2, sbx + barMm, sby + 1.2)
    this.doc.setFontSize(7); this.doc.setTextColor(40)
    this.doc.text('0', sbx, sby + 4); this.doc.text(`${barM} m`, sbx + barMm, sby + 4, { align: 'right' })

    // South arrow (bottom-right of box) + label
    const ax = boxX + boxW - pad - 4
    const ay0 = boxYtop + boxH - pad - 16, ay1 = boxYtop + boxH - pad
    this.doc.setDrawColor(40); this.doc.setLineWidth(0.6); this.doc.line(ax, ay0, ax, ay1)
    this._arrowhead(ax, ay0, ax, ay1, false, [40, 40, 40])
    this.doc.setFontSize(8); this.doc.setTextColor(40); this.doc.text('S', ax, ay1 + 4, { align: 'center' })

    // Callout under the box
    this.y = boxYtop + boxH + 6
    this.doc.setFontSize(8); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(60)
    this.doc.text(
      `Displacement vectors exaggerated ×${k}. Black dot = historical position; blue dot = accepted survey position; `
      + `red dot/vector = rejected beacon. Bearings South-oriented (0°=S, 90°=W).`,
      this.margin, this.y, { maxWidth: this.pw - 2 * this.margin })
    this.y += 12
  }

  addCertification(result, meta) {
    this.ensureSpace(60)
    this.sectionTitle('Certification')
    const acc = result.pts.filter(p => p.finalStatus === 'ACCEPT').length
    const rej = result.pts.filter(p => p.finalStatus === 'REJECT')
    const s = result.adj.stats
    const chiOk = s.chi2 >= s.chi2L && s.chi2 <= s.chi2U
    let line
    if (!result.converged) line = 'Did not converge within 25 iterations — REFER for manual review.'
    else if (rej.length > 0) line = `Referred — ${rej.length} beacon(s) exceed tolerance: ${rej.map(p => p.name).join(', ')}.`
    else if (!chiOk) line = 'Recommended with note — chi-square test outside bounds; review a priori σ₀.'
    else line = 'Recommended for approval — all compared beacons within tolerance.'

    this.doc.setFontSize(9); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(20)
    this.doc.text(
      `Beacons compared: ${result.pts.length}.  Accepted: ${acc}.  Rejected: ${rej.length}.  W-test critical value: ${meta.critW}.`,
      this.margin, this.y, { maxWidth: this.pw - 2 * this.margin }); this.y += 6
    this.doc.setFont('helvetica', 'bold')
    this.doc.text(`Recommendation: ${line}`, this.margin, this.y, { maxWidth: this.pw - 2 * this.margin }); this.y += 16

    this.doc.setFont('helvetica', 'normal'); this.doc.setDrawColor(60); this.doc.setLineWidth(0.3)
    const colW = (this.pw - 2 * this.margin - 10) / 2
    this.doc.line(this.margin, this.y, this.margin + colW, this.y)
    this.doc.line(this.margin + colW + 10, this.y, this.pw - this.margin, this.y)
    this.y += 4; this.doc.setFontSize(8); this.doc.setTextColor(90)
    this.doc.text('Examined by (Office of the Surveyor-General)', this.margin, this.y)
    this.doc.text('Date', this.margin + colW + 10, this.y)
    this.y += 8
  }

  addScheduleLandscape(result) {
    this.doc.addPage('a4', 'landscape')
    this.doc.setFontSize(11); this.doc.setFont('helvetica', 'bold')
    this.doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
    this.doc.text('Comparison Schedule — SI 727 §67(5)', 14, 14)
    const body = result.pts.map(p => [
      p.name, f3(p.yH), f3(p.xH), f3(p.yS), f3(p.xS),
      f4s(p.dY), f4s(p.dX), f4s(p.vY), f4s(p.vX),
      f4(p.resDist), formatDMS(p.resBrg),
      (p.wMax != null ? p.wMax.toFixed(2) : '—'), p.finalStatus || '—',
    ])
    autoTable(this.doc, {
      startY: 18, margin: { left: 14, right: 14 },
      head: [['Beacon', 'Hist Y', 'Hist X', 'Survey Y', 'Survey X', 'ΔY', 'ΔX', 'vY', 'vX', 'Dist', 'Brg (S)', 'W-max', 'Status']],
      body,
      styles: { fontSize: 7.5, cellPadding: 1, halign: 'right' },
      columnStyles: { 0: { halign: 'left' }, 12: { halign: 'center' } },
      headStyles: { fillColor: NAVY, halign: 'center', fontSize: 7.5 },
      didParseCell: d => { if (d.section === 'body' && body[d.row.index][12] === 'REJECT') d.cell.styles.fillColor = [252, 226, 226] },
    })
    const fy = this.doc.lastAutoTable.finalY + 5
    this.doc.setFontSize(8); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(90)
    this.doc.text('BLACK = original (historical) · RED = survey · Bearings South-oriented (0°=S, 90°=W) · Residuals & W-max are undefined ( — ) for rejected beacons.', 14, fy)
  }

  addFooters() {
    const n = this.doc.getNumberOfPages()
    for (let i = 1; i <= n; i++) {
      this.doc.setPage(i)
      const w = this.doc.internal.pageSize.getWidth(), h = this.doc.internal.pageSize.getHeight()
      this.doc.setFontSize(7); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(140)
      this.doc.text(`SurveyPro · computer-generated · ${new Date().toISOString().slice(0, 10)}`, 14, h - 8)
      this.doc.text(`Page ${i} of ${n}`, w - 14, h - 8, { align: 'right' })
    }
  }

  generate(result, meta) {
    this.addHeader(meta)
    this.addTransformStats(result)
    this.addSnoopingLog(result)
    this.addDisplacementPlot(result)
    this.addCertification(result, meta)
    this.addScheduleLandscape(result)
    this.addFooters()
    return this.doc
  }
}

export function generateBeaconAdjustmentReport(result, meta) {
  const r = new BeaconAdjustmentReport()
  r.generate(result, meta)
  const id = meta.priorSurvey || meta.date || 'report'
  r.doc.save(`beacon-comparison-${sanitizeReportFilename(id)}.pdf`)
}
