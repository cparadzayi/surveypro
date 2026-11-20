/**
 * Pre-print verification: reads what a generated document PRINTS and holds it to the project's data.
 *
 * Comparing stores (field book, calculations, database, parcels) cannot catch a document that was generated from
 * other data -- the Brackenhurst pack went to the Surveyor-General with template beacons (BM 001 - BM 008) in its
 * Beacon Comparison and Report on Survey, and coordinates 0.01 m off the diagrams. So this reads the finished PDF's
 * text and checks it against the coordinate points, rounded the way the record rounds them (banker's, 2 dp, from
 * the 3 dp calculations to the list and diagrams).
 *
 * Findings are { level: 'error' | 'warning', code, message }. An error means the document must not be printed.
 */
import { bankersRound } from './zim-geo.js'

/** Names the template and sample data use. They are never a real beacon. */
const TEMPLATE_NAME = /^BM\s?\d{3}$/i

/** A coordinate as a document prints it: "-85 633.03", "-85 633,03" (diagrams), "+2 144 068.00", "-85633.030". */
const NUMBER = /[-+−]?\s?(?:\d{1,3}(?: \d{3})+|\d{5,})[.,]\d{2,3}(?!\d)/g

const abs = (v) => Math.abs(v)
const fix = (v, d) => abs(v).toFixed(d)

/** Every printed figure of 10 000 or more (a coordinate; sides, distances and areas are smaller), as numbers. */
export function printedCoordinates(text) {
  const out = []
  for (const m of String(text ?? '').matchAll(NUMBER)) {
    const raw = m[0].replace(/[−+\s-]/g, '').replace(',', '.')
    const value = Number(raw)
    if (Number.isFinite(value) && value >= 10000) out.push({ raw: m[0].trim(), value, decimals: raw.split('.')[1].length })
  }
  return out
}

/** The values a coordinate may legitimately print as: the stored 3 dp, and its banker's 2 dp. */
export function allowedFigures(points) {
  const set = new Map()
  for (const p of points) {
    for (const v of [p.y, p.x]) {
      if (!Number.isFinite(v)) continue
      set.set(fix(v, 3), p.name)
      set.set(fix(bankersRound(abs(v), 2), 2), p.name)
    }
  }
  return set
}

/**
 * @param {object} input
 * @param {string} input.text            the document's text
 * @param {{name:string,y:number,x:number,status?:string}[]} input.points   the project's coordinate points
 * @param {string[]} [input.comparisonNames] beacons in the project's saved Beacon Comparison (empty when none saved)
 * @param {{y:number,x:number}[]} [input.extraPoints] control points the document may also print (trig list)
 * @param {number[]} [input.extraFigures] other figures the document may print (control and calibration values)
 */
export function verifyPrinted({ text, points, comparisonNames = [], comparison = [], extraPoints = [], extraFigures = [] }) {
  const findings = []
  const err = (code, message) => findings.push({ level: 'error', code, message })
  const warn = (code, message) => findings.push({ level: 'warning', code, message })
  const doc = String(text ?? '')
  if (comparison.length && comparisonNames.length === 0) comparisonNames = comparison.map((r) => r.name)

  // 0. The Beacon Comparison's survey column must be this survey's own co-ordinates, as the Co-ordinate List
  //    prints them (banker's 2 dp of the field 3 dp). Its historical column is the previous survey's, so it is
  //    a legitimate figure in the document and is not held to the field data.
  const byName = new Map(points.map((p) => [p.name, p]))
  for (const r of comparison) {
    const p = byName.get(r.name)
    if (!p) continue
    for (const [axis, survey, field] of [['Y', r.yS, p.y], ['X', r.xS, p.x]]) {
      if (!Number.isFinite(Number(survey)) || !Number.isFinite(field)) continue
      const listed = bankersRound(abs(field), 2)
      const off = Math.abs(abs(Number(survey)) - listed)
      if (off < 0.0005) continue
      const msg = `Beacon Comparison survey ${axis} of ${r.name} is ${Number(survey).toFixed(3)}, but the field book has ` +
        `${field.toFixed(3)} and the Co-ordinate List ${field < 0 ? '-' : ''}${listed.toFixed(2)}`
      const halfUp = Math.round(abs(field) * 100) / 100
      if (Math.abs(abs(Number(survey)) - halfUp) < 0.0005) {
        err('COMPARISON_SURVEY_ROUNDING', `${msg}: the field value was rounded half-up, not by banker's rounding, so the two documents disagree`)
      } else if (off > 0.0051) {
        err('COMPARISON_SURVEY_MISMATCH', `${msg} (${off.toFixed(3)} m apart): the comparison was run on other figures than the survey's`)
      } else {
        warn('COMPARISON_SURVEY_PRECISION', `${msg}: within rounding of the field value but not as the list prints it`)
      }
    }
  }

  // 1. Template / sample beacons anywhere in the document.
  const template = [...new Set((doc.match(/\bBM\s?\d{3}\b/gi) ?? []).map((s) => s.replace(/\s+/, ' ').toUpperCase()))]
  if (template.length) {
    err('TEMPLATE_DATA', `the document prints template beacon names (${template.join(', ')}); the Beacon Comparison and the Report on Survey were generated from sample data, not this survey`)
  }

  // 2. A Beacon Comparison section needs a saved comparison, and its beacons must be the project's.
  if (/BEACON COMPARISON REPORT/i.test(doc)) {
    if (comparisonNames.length === 0) {
      err('COMPARISON_NOT_SAVED', 'the document has a Beacon Comparison but the project has none saved: it was generated from something other than this survey')
    } else {
      const have = new Set(points.map((p) => p.name))
      const foreign = comparisonNames.filter((n) => TEMPLATE_NAME.test(n) || !have.has(n))
      if (foreign.length) warn('COMPARISON_BEACON_NOT_SURVEYED', `Beacon Comparison lists beacon(s) with no co-ordinate in the survey: ${foreign.join(', ')}`)
    }
  }

  // 3. Every printed coordinate must be a stored figure, rounded the way the record rounds it.
  const allowed = allowedFigures([...points, ...extraPoints.map((p, i) => ({ name: `control ${i + 1}`, ...p }))])
  // The comparison's own figures are printed in its table (to 3 dp); they are checked in step 0, not here.
  for (const r of comparison) for (const v of [r.yH, r.xH, r.yS, r.xS]) extraFigures = [...extraFigures, Number(v)]
  for (const v of extraFigures) {
    if (!Number.isFinite(v)) continue
    allowed.set(fix(v, 3), 'control')
    allowed.set(fix(bankersRound(abs(v), 2), 2), 'control')
  }
  const seen = new Set()
  for (const c of printedCoordinates(doc)) {
    const key = `${c.decimals}:${c.value}`
    if (seen.has(key)) continue
    seen.add(key)
    const text = c.value.toFixed(c.decimals)
    if (allowed.has(text)) continue
    // A near miss is the failure that matters: a real beacon printed 0.01 m off, so two documents disagree.
    let near = null
    for (const p of points) {
      for (const v of [p.y, p.x]) {
        const d = Math.abs(abs(v) - c.value)
        if (d <= 0.025 && (!near || d < near.d)) near = { d, name: p.name, stored: abs(v) }
      }
    }
    if (near) {
      err('NEAR_MISS', `${c.raw} is printed, but ${near.name} is ${near.stored.toFixed(3)} (banker's ${bankersRound(near.stored, 2).toFixed(2)}): off by ${near.d.toFixed(3)} m`)
    } else {
      warn('UNKNOWN_FIGURE', `${c.raw} is printed but is no co-ordinate of this survey (check it is not sample or foreign data)`)
    }
  }

  // 4. Every point of the survey that the document should list must be there (found and placed beacons).
  for (const p of points) {
    const wanted = [fix(bankersRound(abs(p.y), 2), 2), fix(bankersRound(abs(p.x), 2), 2)]
    let flat = doc.replace(/,/g, '.')
    for (let prev = ''; prev !== flat;) { prev = flat; flat = flat.replace(/(\d) (\d{3})/g, '$1$2') }   // "2 144 068" -> "2144068"
    if (!/^(F|P)/i.test(String(p.status ?? ''))) continue
    if (!flat.includes(wanted[0]) && !flat.includes(wanted[1])) {
      warn('POINT_NOT_PRINTED', `${p.name} (${wanted.join(' / ')}) does not appear in the document`)
    }
  }

  return findings
}

/** The text of a PDF, page by page, with each visual line on its own line. Needs pdfjs-dist (a backend dependency). */
export async function extractPdfText(path) {
  const { readFileSync } = await import('node:fs')
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(readFileSync(path))
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    const rows = new Map()
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue
      const y = Math.round(it.transform[5] / 3)
      ;(rows.get(y) ?? rows.set(y, []).get(y)).push({ x: it.transform[4], s: it.str })
    }
    const lines = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, r]) => r.sort((a, b) => a.x - b.x).map((i) => i.s).join('  '))
    pages.push(lines.join('\n'))
  }
  return pages.join('\n')
}
