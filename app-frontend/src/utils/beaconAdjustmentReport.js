// app-frontend/src/utils/beaconAdjustmentReport.js
// SI 727 §67(5) beacon comparison examination report (client-side jsPDF).
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { f3, f4, f4s, f3s, formatDMS } from '@/utils/surveyMath'
import { planScaleMmPerM, chooseExaggeration, scaleBarMetres, sanitizeReportFilename } from '@/utils/beaconReportGeometry'
import { computeSketchLayout, SKETCH_LINE_GAP } from '@/utils/beaconComparisonSketchLayout'
import { formatSignedDMS } from '@/utils/beaconComparisonSection'

const NAVY = [30, 58, 92]

// Standard ISO A-series page dimensions in mm, matching jsPDF's own built-in page-format
// table exactly (confirmed against jspdf/dist/jspdf.node.js's pageFormats constant) --
// used to evaluate paper-size candidates before any real page exists.
const SHEET_LADDER = [
  ['a4', 210, 297], ['a3', 297, 420], ['a2', 420, 594], ['a1', 594, 841], ['a0', 841, 1189],
]
const SHEET_CANDIDATES = SHEET_LADDER.flatMap(([fmt, pw, ph]) => [
  { fmt, orientation: 'portrait', w: pw, h: ph },
  { fmt, orientation: 'landscape', w: ph, h: pw },
])

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
    this.ensureSpace(20)
    this.sectionTitle('Transformation & Statistics')
    autoTable(this.doc, {
      startY: this.y, margin: { left: this.margin, right: this.margin }, theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1.5 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 85 } },
      body: [
        ['Translation dY (Westing, @ centroid)', f4(p.TY) + ' m' + (p.se ? '  ± ' + f4(p.se.TY) : '')],
        ['Translation dX (Southing, @ centroid)', f4(p.TX) + ' m' + (p.se ? '  ± ' + f4(p.se.TX) : '')],
        ['Scale factor', p.scale.toFixed(8) + (p.se ? '  ± ' + p.se.scale.toExponential(2) : '')],
        ['Scale (ppm)', p.ppm.toFixed(2) + ' ppm' + (p.se ? '  ± ' + p.se.ppm.toFixed(2) : '')],
        ['Rotation (theta)', formatDMS(p.rotDeg) + (p.se ? '  ± ' + p.se.rotSec.toFixed(1) + ' sec' : '')],
        ['Sigma-0 a priori', s.sig0.toFixed(4) + ' m'],
        ['Sigma-0 a posteriori', s.s0.toFixed(4) + ' m'],
        ['Degrees of freedom', String(s.DOF)],
        ['Chi-square', s.chi2.toFixed(4) + '  (bounds ' + s.chi2L.toFixed(2) + ' – ' + s.chi2U.toFixed(2) + ')'],
        ['Chi-square test', pass ? 'PASS — variance consistent with a priori Sigma-0'
                                 : 'FAIL — review Sigma-0 or check for residual blunders'],
      ],
    })
    this.y = this.doc.lastAutoTable.finalY + 6
  }

  addSnoopingLog(result) {
    this.ensureSpace(40)
    this.sectionTitle('Data-Snooping Log (iterative Baarda W-test)')
    autoTable(this.doc, {
      startY: this.y, margin: { left: this.margin, right: this.margin },
      head: [['Iteration', 'Active pts', 'Sigma-0 (m)', 'Chi-sq', 'Chi-sq bounds']],
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

  _drawColoredLine(x, y, segments) {
    let cx = x
    for (const seg of segments) {
      this.doc.setTextColor(seg.color[0], seg.color[1], seg.color[2])
      this.doc.text(seg.text, cx, y)
      cx += this.doc.getTextWidth(seg.text)
    }
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
    else if (!chiOk) line = 'Recommended with note — chi-square test outside bounds; review a priori Sigma-0.'
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
      head: [['Beacon', 'Hist Y', 'Hist X', 'Survey Y', 'Survey X', 'dY', 'dX', 'vY', 'vX', 'Dist', 'Brg (S)', 'W-max', 'Status']],
      body,
      styles: { fontSize: 7.5, cellPadding: 1, halign: 'right' },
      // SI 727 §67(5): historical = black (default), survey (Y/X) = red.
      columnStyles: {
        0: { halign: 'left' },
        3: { textColor: [220, 38, 38] }, 4: { textColor: [220, 38, 38] },
        12: { halign: 'center' },
      },
      headStyles: { fillColor: NAVY, halign: 'center', fontSize: 7.5 },
      didParseCell: d => { if (d.section === 'body' && body[d.row.index][12] === 'REJECT') d.cell.styles.fillColor = [252, 226, 226] },
    })
    const fy = this.doc.lastAutoTable.finalY + 5
    const fw = this.doc.internal.pageSize.getWidth() - 28
    this.doc.setFontSize(8); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(90)
    this.doc.text('BLACK = original (historical) · RED = survey · Bearings South-oriented (0°=S, 90°=W) · Residuals & W-max are undefined ( — ) for rejected beacons.', 14, fy, { maxWidth: fw })
    // Drawn as discrete single lines (not maxWidth auto-wrap, which jsPDF's
    // browser build fails to emit when called after an autoTable).
    const note = [
      'dY, dX = raw difference (survey minus historical): still includes the systematic datum shift, scale and rotation common to every beacon.',
      'vY, vX = residuals left after the best-fit Helmert transformation is removed - the beacon-specific misfit. Dist and Brg (S) are its size and direction.',
      'Acceptance / rejection is decided by the standardised residual W-max (Baarda data snooping), not by the raw difference dY/dX.',
    ]
    note.forEach((ln, i) => this.doc.text(ln, 14, fy + 6 + i * 4))
  }

  addTransformationResiduals(result) {
    const pts = result.pts
    if (!pts || !pts.length) return
    this.doc.addPage('a4', 'landscape')
    this.doc.setFontSize(11); this.doc.setFont('helvetica', 'bold')
    this.doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
    this.doc.text('Transformation Residuals (Historical transformed onto Survey)', 14, 14)
    const body = pts.map(p => [
      p.name, f3(p.yT), f3(p.xT), f3(p.yS), f3(p.xS),
      f4s(p.tvY), f4s(p.tvX), f4(p.tResid), formatDMS(p.tBrg), p.finalStatus || '—',
    ])
    autoTable(this.doc, {
      startY: 18, margin: { left: 14, right: 14 },
      head: [['Beacon', 'Transf Y', 'Transf X', 'Survey Y', 'Survey X',
              'vY (m)', 'vX (m)', 'Resid (m)', 'Brg (S)', 'Status']],
      body,
      styles: { fontSize: 7.5, cellPadding: 1, halign: 'right' },
      // Survey (Y/X) red per SI 727 §67(5); status centred.
      columnStyles: {
        0: { halign: 'left' },
        3: { textColor: [220, 38, 38] }, 4: { textColor: [220, 38, 38] },
        9: { halign: 'center' },
      },
      headStyles: { fillColor: NAVY, halign: 'center', fontSize: 7.5 },
      didParseCell: d => { if (d.section === 'body' && pts[d.row.index].finalStatus === 'REJECT') d.cell.styles.fillColor = [252, 226, 226] },
    })
    const p = result.adj.params
    let y = this.doc.lastAutoTable.finalY + 6
    if (y + 3 * 4 > this.doc.internal.pageSize.getHeight() - 12) { this.doc.addPage('a4', 'landscape'); y = 16 }
    this.doc.setFontSize(8); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(90)
    const note = [
      `Transf Y/X = historical coordinates transformed by the fitted 4-parameter Helmert (TY=${f4(p.TY)}, TX=${f4(p.TX)}, scale=${p.scale.toFixed(8)}, rotation=${formatDMS(p.rotDeg)}).`,
      `v = Transf - Survey (residual); Resid = sqrt(vY^2 + vX^2); Brg (S) is its South-oriented direction.`,
      `For accepted beacons v equals the least-squares residual; for rejected beacons it shows the misfit in the fitted frame (the blunder).`,
    ]
    note.forEach((ln, i) => this.doc.text(ln, 14, y + i * 4))
  }

  addReliabilityValidation(result) {
    const acc = result.pts.filter(p => p.finalStatus === 'ACCEPT')
    if (!acc.length) return
    const loo = result.loo || { rows: [], rmsLoo: null, maxLoo: null, note: 'LOO not available' }
    const looById = {}
    loo.rows.forEach(r => { looById[r.id] = r })
    this.doc.addPage('a4', 'landscape')
    this.doc.setFontSize(11); this.doc.setFont('helvetica', 'bold')
    this.doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
    this.doc.text('Reliability & Validation', 14, 14)
    const body = acc.map(p => {
      const lr = looById[p.id]
      return [
        p.name,
        p.rY != null ? p.rY.toFixed(3) : '-',
        p.rX != null ? p.rX.toFixed(3) : '-',
        lr ? f4s(lr.looY) : '-',
        lr ? f4s(lr.looX) : '-',
        lr ? f4(lr.looDist) : '-',
      ]
    })
    autoTable(this.doc, {
      startY: 18, margin: { left: 14, right: 14 },
      head: [['Beacon', 'Redund rY', 'Redund rX', 'LOO dY (m)', 'LOO dX (m)', 'LOO dist (m)']],
      body,
      styles: { fontSize: 8, cellPadding: 1.2, halign: 'right' },
      columnStyles: { 0: { halign: 'left' } },
      headStyles: { fillColor: NAVY, halign: 'center', fontSize: 8 },
    })
    const s = result.adj.stats
    let y = this.doc.lastAutoTable.finalY + 6
    if (y + 3 * 4 > this.doc.internal.pageSize.getHeight() - 12) { this.doc.addPage('a4', 'landscape'); y = 16 }
    this.doc.setFontSize(8); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(90)
    const note = [
      `Redundancy numbers r (sum = DOF = ${s.DOF}): r -> 1 well controlled / independently checkable; r -> 0 poorly controlled.`,
      `LOO = leave-one-out cross-validation: each beacon predicted from a fit that excludes it (independent, out-of-sample).`,
      `RMS LOO = ${loo.rmsLoo != null ? loo.rmsLoo.toFixed(4) + ' m' : '-'} ;  max LOO = ${loo.maxLoo != null ? loo.maxLoo.toFixed(4) + ' m' : '-'} ` +
        `${loo.note ? '(' + loo.note + ')' : '— the external (independent) accuracy estimate.'}`,
    ]
    note.forEach((ln, i) => this.doc.text(ln, 14, y + i * 4))
  }

  addEdgeCompliance(result) {
    const edges = result.edges
    if (!edges || !edges.rows.length) return
    this.doc.addPage('a4', 'landscape')
    this.doc.setFontSize(11); this.doc.setFont('helvetica', 'bold')
    this.doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
    this.doc.text(`SI 727 Edge Compliance — Class ${result.surveyClass || 'B'}`, 14, 14)
    const body = edges.rows.map(e => [
      `${e.from} - ${e.to}`, f3(e.dH), f3(e.dS), f4s(e.dDiff), f4(e.dAllow),
      e.distOk ? 'PASS' : 'FAIL',
      formatDMS(e.brgH), formatDMS(e.brgS),
      e.dirDiffSec.toFixed(1), e.dirAllowSec.toFixed(1),
      e.dirOk ? 'PASS' : 'FAIL',
    ])
    autoTable(this.doc, {
      startY: 18, margin: { left: 14, right: 14 },
      head: [['Line', 'd Hist (m)', 'd Surv (m)', 'dd (m)', 'dist tol (m)', 'dist',
              'Hist dir (S)', 'Survey dir (S)', 'dir diff (sec)', 'dir tol (sec)', 'dir']],
      body,
      styles: { fontSize: 7.5, cellPadding: 1, halign: 'right' },
      columnStyles: { 0: { halign: 'left' }, 5: { halign: 'center' }, 10: { halign: 'center' } },
      headStyles: { fillColor: NAVY, halign: 'center', fontSize: 7.5 },
      didParseCell: d => { if (d.section === 'body' && !edges.rows[d.row.index].pass) d.cell.styles.fillColor = [252, 226, 226] },
    })
    const s = edges.summary, p = result.adj.params
    let y = this.doc.lastAutoTable.finalY + 6
    // For large (O(n²)) networks the table can fill the page; keep the 4 note
    // lines from clipping off the bottom by starting them on a fresh page.
    if (y + 4 * 4 > this.doc.internal.pageSize.getHeight() - 12) {
      this.doc.addPage('a4', 'landscape'); y = 16
    }
    this.doc.setFontSize(8); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(90)
    const meanScale = s.meanScale != null ? s.meanScale.toFixed(8) : '-'
    const meanSwing = s.meanSwingDeg != null ? formatDMS(s.meanSwingDeg) : '-'
    const note = [
      `Lines: ${s.totalLines}.  Distance pass: ${s.distPass}.  Direction pass: ${s.dirPass}.  Both: ${s.bothPass}.`,
      `SI 727 mean scale ${meanScale}, mean swing ${meanSwing}  (Helmert scale ${p.scale.toFixed(8)}, rotation ${formatDMS(p.rotDeg)}).`,
      `Distance tolerance = factor x sqrt(0.075f + 0.00015 f^2), f = shorter line. Direction tolerance = K/(S+300) sec, S = historical ray length.`,
      `dir diff = raw (Survey - Hist) South-oriented direction difference in seconds. Independent SI 727 check (does not use the Helmert swing or the W-test).`,
    ]
    // Discrete single lines (not maxWidth auto-wrap, which jsPDF's browser build
    // fails to emit when called after an autoTable).
    note.forEach((ln, i) => this.doc.text(ln, 14, y + i * 4))
  }

  addEdgeComplianceSketch(result) {
    const edges = result.edges
    if (!edges || !edges.rows.length) return

    const byName = {}
    for (const p of result.pts) byName[p.name] = { y: p.yH, x: p.xH }
    const names = new Set()
    for (const row of edges.rows) { names.add(row.from); names.add(row.to) }
    const points = Array.from(names)
      .map((name) => ({ name, pt: byName[name] }))
      .filter((p) => !!p.pt)
    if (points.length < 2) return

    // Build every annotation's text once, up front -- text-width measurement (needed to
    // size each annotation's collision box) only depends on the currently-set font/size,
    // never on page dimensions, so this is identical across every paper-size candidate
    // below and the eventual real render; no need to rebuild it per candidate.
    this.doc.setFontSize(5.5)
    const edgeSpecs = edges.rows.map((row) => {
      const histText = row.dH.toFixed(3), survText = row.dS.toFixed(3)
      const distDiffText = `(${f3s(row.dDiff)})`
      const brgHText = formatDMS(row.brgH), brgSText = formatDMS(row.brgS)
      const dirDiffText = `(${formatSignedDMS(row.dirDiffSec / 3600)})`
      return {
        from: row.from, to: row.to,
        line1: `${histText} -> ${survText} ${distDiffText}`,
        line2: `${brgHText} -> ${brgSText} ${dirDiffText}`,
        histText, survText, distDiffText, brgHText, brgSText, dirDiffText,
      }
    })
    const measureText = (s) => this.doc.getTextWidth(s)

    // The title always lands at the same offset regardless of which page size is
    // eventually chosen (sectionTitle's own +5 advance is fixed), so the box's
    // page-relative origin is known before any page exists -- every candidate below
    // shares this same origin; only the available width/height budget changes.
    const boxOrigin = { x: this.margin, y: this.margin + 5 }

    // Try the ISO paper ladder smallest-first, both orientations at each size, and keep
    // the first candidate that renders every ray and every annotation collision-free (or,
    // failing that by A0, whichever candidate came closest). Nothing here touches a real
    // jsPDF page or draws anything -- computeSketchLayout is pure. See
    // docs/superpowers/specs/2026-08-04-beacon-sketch-paper-sizing-design.md.
    //
    // Known performance limit: for a very dense all-pairs network (20+ beacons, 190+
    // edges), evaluating all 10 candidates is synchronous and can take several seconds
    // with no user feedback, since no candidate ever reaches zero violations at that
    // density (measured ~9s at 30 beacons/435 edges) -- bestSoFarViolations below prunes
    // clearly-losing candidates early, but only saves a few percent in practice, since
    // violations accumulate at close to one per edge across most of each candidate's
    // loop rather than concentrating late where pruning would help. Realistic SI 727
    // comparisons (8-12 beacons) stay well under a second and are unaffected. A real fix
    // (spatial indexing instead of the current brute-force O(edges) collision scans, or
    // a UI-level progress indicator in the calling component) is a deliberately deferred
    // follow-up, not addressed here.
    let best = null
    for (const c of SHEET_CANDIDATES) {
      const maxAreaMm = { width: c.w - 2 * this.margin, height: c.h - boxOrigin.y - 40 }
      const layout = computeSketchLayout(
        points, edgeSpecs, boxOrigin, maxAreaMm, measureText, best ? best.layout.violations : Infinity,
      )
      if (!best || layout.violations < best.layout.violations) best = { fmt: c.fmt, orientation: c.orientation, layout }
      if (layout.violations === 0) break
    }

    this.doc.addPage(best.fmt, best.orientation); this.y = this.margin
    this.sectionTitle('Comparison Sketch — SI 727 §67(5)')

    const pageW = this.doc.internal.pageSize.getWidth()
    const { denom, label, boxX, boxYtop, boxW, boxH, pad, positioned, edgeGeom, annotations } = best.layout
    this.doc.setDrawColor(120); this.doc.setLineWidth(0.3); this.doc.rect(boxX, boxYtop, boxW, boxH)

    // Rays -- curved (cubic Bezier), always plain black, drawn before annotations so text
    // sits on top. Geometry (control points, sampled polyline) was already computed by
    // computeSketchLayout during the trial above; drawing it here does no new math.
    this.doc.setDrawColor(0, 0, 0); this.doc.setLineWidth(0.25)
    edgeGeom.forEach((geom) => {
      if (!geom) return
      this.doc.moveTo(geom.a.mmX, geom.a.mmY)
      this.doc.curveTo(geom.cp1.mmX, geom.cp1.mmY, geom.cp2.mmX, geom.cp2.mmY, geom.b.mmX, geom.b.mmY)
      this.doc.stroke()
    })

    // Beacon points + outward-offset name labels.
    const cx = points.reduce((s, p) => s + (positioned.get(p.name)?.mmX ?? 0), 0) / points.length
    const cy = points.reduce((s, p) => s + (positioned.get(p.name)?.mmY ?? 0), 0) / points.length
    this.doc.setFontSize(7); this.doc.setTextColor(20, 20, 20)
    for (const p of points) {
      const pos = positioned.get(p.name)
      this.doc.setDrawColor(0, 0, 0)
      this.doc.circle(pos.mmX, pos.mmY, 1.3, 'S')
      let ux = pos.mmX - cx, uy = pos.mmY - cy
      const ulen = Math.hypot(ux, uy) || 1
      ux /= ulen; uy /= ulen
      this.doc.text(p.name, pos.mmX + ux * 3.5, pos.mmY + uy * 3.5)
    }

    // Per-ray annotations: anchors were already found (avoiding every ray and every
    // earlier annotation) by computeSketchLayout during the trial above -- just draw the
    // colour-coded text at them. old/historical black, new/survey red, arrow grey, and
    // the parenthesised difference black when within SI 727 tolerance, red when outside.
    const ARROW_GREY = [130, 130, 130], BLACK = [0, 0, 0], RED = [220, 0, 0]
    this.doc.setFontSize(5.5)
    edges.rows.forEach((row, idx) => {
      const ann = annotations[idx]
      const spec = edgeSpecs[idx]
      if (!ann) return
      this._drawColoredLine(ann.anchor.mmX, ann.anchor.mmY, [
        { text: spec.histText, color: BLACK },
        { text: ' -> ', color: ARROW_GREY },
        { text: spec.survText, color: RED },
        { text: ' ' + spec.distDiffText, color: row.distOk ? BLACK : RED },
      ])
      this._drawColoredLine(ann.anchor.mmX, ann.anchor.mmY + SKETCH_LINE_GAP, [
        { text: spec.brgHText, color: BLACK },
        { text: ' -> ', color: ARROW_GREY },
        { text: spec.brgSText, color: RED },
        { text: ' ' + spec.dirDiffText, color: row.dirOk ? BLACK : RED },
      ])
    })

    // Tick-marked scale bar (bottom-left), matching addDisplacementPlot's own style.
    const mmPerM = 1000 / denom
    const barM = scaleBarMetres(mmPerM, 40), barMm = barM * mmPerM
    const sbx = boxX + pad, sby = boxYtop + boxH - 8
    this.doc.setDrawColor(40); this.doc.setLineWidth(0.5)
    this.doc.line(sbx, sby, sbx + barMm, sby)
    this.doc.line(sbx, sby - 1.2, sbx, sby + 1.2)
    this.doc.line(sbx + barMm, sby - 1.2, sbx + barMm, sby + 1.2)
    this.doc.setFontSize(7); this.doc.setTextColor(40)
    this.doc.text('0', sbx, sby + 4); this.doc.text(`${barM} m`, sbx + barMm, sby + 4, { align: 'right' })

    // South arrow (bottom-right), matching addDisplacementPlot's own style.
    const ax = boxX + boxW - pad - 4
    const ay0 = boxYtop + boxH - pad - 16, ay1 = boxYtop + boxH - pad
    this.doc.setDrawColor(40); this.doc.setLineWidth(0.6); this.doc.line(ax, ay0, ax, ay1)
    this._arrowhead(ax, ay0, ax, ay1, false, [40, 40, 40])
    this.doc.setFontSize(8); this.doc.setTextColor(40); this.doc.text('S', ax, ay1 + 4, { align: 'center' })

    // Callout + SI 727 summary under the box.
    this.y = boxYtop + boxH + 6
    this.doc.setFontSize(8); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(60)
    this.doc.text(
      `Scale ${label}. Black = historical, Red = current survey. Differences black = within SI 727 tolerance, red = outside.`,
      this.margin, this.y, { maxWidth: pageW - 2 * this.margin })
    this.y += 6
    const s = edges.summary
    this.doc.setTextColor(20)
    this.doc.text(
      `SI 727 Class ${result.surveyClass || 'B'} · ${s.bothPass} of ${s.totalLines} lines pass both checks`,
      this.margin, this.y)
    this.y += 12
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
    this.addTransformationResiduals(result)
    this.addReliabilityValidation(result)
    this.addEdgeCompliance(result)
    this.addEdgeComplianceSketch(result)
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
