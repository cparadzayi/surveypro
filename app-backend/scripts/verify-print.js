/**
 * Verify a generated Comprehensive_Latest.pdf against the project's data before it is printed or lodged.
 *
 *   cd app-backend
 *   node scripts/verify-print.js "brackenhurst" [--pdf path/to/Comprehensive_Latest.pdf] [--schema surveyor_xxx]
 *
 * The project is found by name (or numeric id) in the surveyor schemas. The PDF defaults to
 * <Documents>/<project working directory>/output/calculations/Comprehensive_Latest.pdf. Exit code 1 when any error is
 * found (do not print), 0 otherwise; warnings are listed for review. See src/utils/printVerify.js.
 */
import 'dotenv/config'
import pg from 'pg'
import os from 'node:os'
import path from 'node:path'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { verifyPrinted, extractPdfText, printedConnections, alignmentFindings } from '../src/utils/printVerify.js'
import { beaconAlignment } from '../../app-shared/beaconAlignment.js'

const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const query = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
if (!query) { console.error('usage: node scripts/verify-print.js <project name or id> [--pdf file] [--schema name]'); process.exit(2) }

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  const schemas = flag('--schema')
    ? [flag('--schema')]
    : (await client.query("select schema_name from information_schema.schemata where schema_name like 'surveyor\\_%'")).rows.map((r) => r.schema_name)
  let found = null
  for (const sc of schemas) {
    const byId = /^\d+$/.test(query)
    const r = await client.query(
      `select id, name, working_directory, workflow_state from ${sc}.survey_projects where ${byId ? 'id = $1' : 'name ilike $1'} limit 2`,
      [byId ? Number(query) : `%${query}%`],
    ).catch(() => ({ rows: [] }))
    if (r.rows.length) { found = { sc, ...r.rows[0], many: r.rows.length > 1 }; break }
  }
  if (!found) { console.error(`no project matching "${query}"`); process.exit(2) }
  if (found.many) console.warn(`more than one project matches "${query}"; using "${found.name}"`)

  const points = (await client.query(
    `select name, status, ST_X(geom)::float8 as y, ST_Y(geom)::float8 as x from ${found.sc}.coordinate_points where project_id = $1`,
    [found.id],
  )).rows

  const comparison = found.workflow_state?.step_data?.['beacon-comparison']?.points ?? []
  const comparisonNames = comparison.map((p) => p.name)

  // The control points the survey tied to are printed too (trig list); they are not in coordinate_points.
  const extraPoints = (await client.query(
    `select c.y_gauss::float8 as y, c.x_gauss::float8 as x
       from ${found.sc}.project_control_points pcp join public.zim_control_points c on c.id = pcp.control_point_id
      where pcp.project_id = $1`,
    [found.id],
  ).catch(() => ({ rows: [] }))).rows

  const pdf = flag('--pdf') ?? path.join(
    os.homedir(), found.working_directory ?? '', 'output', 'calculations', 'Comprehensive_Latest.pdf',
  )
  if (!existsSync(pdf)) { console.error(`document not found: ${pdf}`); process.exit(2) }

  const text = await extractPdfText(pdf)
  // The trig list and the site calibration print their own figures: take every number of 10 000 or more in those
  // steps (the control selection and the calibration pairs) as legitimate.
  const stepData = found.workflow_state?.step_data ?? {}
  const extraFigures = []
  const collect = (o) => {
    if (typeof o === 'number') { if (Math.abs(o) >= 10000) extraFigures.push(o) }
    else if (Array.isArray(o)) o.forEach(collect)
    else if (o && typeof o === 'object') Object.values(o).forEach(collect)
  }
  collect(stepData['control-point-selection'])
  collect(stepData['site-calibration'])
  const findings = verifyPrinted({ text, points, comparisonNames, comparison, extraPoints, extraFigures })

  // SI 727 para (5): new beacons on the parent boundary, from the parcels' rings and the record's connections.
  const rings = (await client.query(
    `select metadata->'cape_lo_points' as p from ${found.sc}.land_parcels where project_id = $1`, [found.id],
  )).rows.map((r) => (Array.isArray(r.p) ? r.p.map((v) => String(v?.id ?? '')).filter(Boolean) : [])).filter((r) => r.length >= 3)
  const byName = new Map(points.map((p) => [p.name, p]))
  const alignment = beaconAlignment({
    rings, points: byName, isParent: (n) => /^F/i.test(byName.get(n)?.status ?? ''),
    connections: printedConnections(text).map((c) => ({ fromBeacon: c.from, toBeacon: c.to })),
  })
  findings.push(...alignmentFindings(alignment, text))

  console.log(`Project: ${found.name} (${found.sc}, id ${found.id})`)
  console.log(`Document: ${pdf}`)
  console.log(`Points: ${points.length}, saved comparison beacons: ${comparisonNames.length}, connections: ${printedConnections(text).length}`)
  console.log(`Beacons on the parent boundary (SI 727 para (5)): ${alignment.map((r) => `${r.beacon} ${(r.offset * 1000).toFixed(0)} mm / ${(r.limit * 1000).toFixed(0)} mm ${r.band}`).join(', ') || 'none'}\n`)
  const report = (list) => {
    for (const f of list.filter((x) => x.level === 'error')) console.log(`ERROR   [${f.code}] ${f.message}`)
    for (const f of list.filter((x) => x.level === 'warning')) console.log(`warning [${f.code}] ${f.message}`)
  }
  report(findings)
  let errors = findings.filter((f) => f.level === 'error').length
  let warnings = findings.filter((f) => f.level === 'warning').length

  // The diagrams saved on their own (output/diagrams) are lodged too: hold each to the same coordinates and to
  // the connections the record's Calculations print. Skipped with --pdf (a document checked on its own).
  const diagramsDir = path.join(path.dirname(path.dirname(pdf)), 'diagrams')
  if (!flag('--pdf') && existsSync(diagramsDir)) {
    const connections = printedConnections(text).map(({ stand, from, to }) => ({ stand, from, to }))
    const files = readdirSync(diagramsDir).filter((f) => /\.pdf$/i.test(f) && statSync(path.join(diagramsDir, f)).isFile())
    console.log(`\nDiagrams in ${diagramsDir}: ${files.length}`)
    for (const f of files) {
      const own = verifyPrinted({
        text: await extractPdfText(path.join(diagramsDir, f)), points, extraPoints, extraFigures,
        extraConnections: connections, listsAllPoints: false,
      })
      const e = own.filter((x) => x.level === 'error').length
      console.log(`  ${f}: ${e ? `${e} error(s)` : 'OK'}`)
      report(own.map((x) => ({ ...x, message: `${f}: ${x.message}` })))
      errors += e
      warnings += own.length - e
    }
  }
  console.log(errors ? `\nFAIL: ${errors} error(s). Do not print.` : `\nPASS: no errors${warnings ? ` (${warnings} warning(s) to review)` : ''}.`)
  process.exitCode = errors ? 1 : 0
} finally {
  await client.end()
}
