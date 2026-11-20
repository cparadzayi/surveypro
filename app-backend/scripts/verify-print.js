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
import { existsSync } from 'node:fs'
import { verifyPrinted, extractPdfText } from '../src/utils/printVerify.js'

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
  const findings = verifyPrinted({ text, points, comparisonNames, extraPoints, extraFigures })

  console.log(`Project: ${found.name} (${found.sc}, id ${found.id})`)
  console.log(`Document: ${pdf}`)
  console.log(`Points: ${points.length}, saved comparison beacons: ${comparisonNames.length}\n`)
  const errors = findings.filter((f) => f.level === 'error')
  const warnings = findings.filter((f) => f.level === 'warning')
  for (const f of errors) console.log(`ERROR   [${f.code}] ${f.message}`)
  for (const f of warnings) console.log(`warning [${f.code}] ${f.message}`)
  console.log(errors.length ? `\nFAIL: ${errors.length} error(s). Do not print.` : `\nPASS: no errors${warnings.length ? ` (${warnings.length} warning(s) to review)` : ''}.`)
  process.exitCode = errors.length ? 1 : 0
} finally {
  await client.end()
}
