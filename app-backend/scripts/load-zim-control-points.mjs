/**
 * Load the national control-point registry (public.zim_control_points) from a CSV, cleaning it first.
 *
 *   node scripts/load-zim-control-points.mjs <file.csv> [--apply] [--report <dir>]
 *
 * Without --apply it only reports what it would do. With --apply it backs the current table up to
 * <report dir>/zim_control_points.backup.json, then upserts in ONE transaction, keyed on monu_num: existing
 * rows are updated in place (their ids are kept, so nothing that points at them breaks) and new ones are
 * added. Nothing is deleted from the registry.
 *
 * Rows that are NOT loaded (objective defects, each listed in the excluded report with its reason):
 *   - Gauss_Lo is not one of the Cape Lo zones 25/27/29/31/33 (the table's own CHECK would refuse it);
 *   - Type is blank or not PRIM/SEC/TERT/QUART/TSM (likewise: bench marks, magnetic stations, pegs);
 *   - a duplicate: the same MonuNum again (any case), or another number at exactly the same position
 *     (the first is kept);
 *   - a missing or non-numeric Y/X.
 * A blank MonuName is not an error: it takes the MonuNum, as the TSM rows already do.
 * Rows remarked DESTROYED / NOT FOUND are loaded unchanged; whether a mark exists is a field matter.
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import pg from 'pg'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--') && a !== args[args.indexOf('--report') + 1])
const apply = args.includes('--apply')
const reportDir = args.includes('--report') ? args[args.indexOf('--report') + 1] : process.cwd()
if (!file) { console.error('usage: load-zim-control-points.mjs <file.csv> [--apply] [--report <dir>]'); process.exit(2) }

const ZONES = new Set([25, 27, 29, 31, 33])
const TYPES = new Set(['PRIM', 'SEC', 'TERT', 'QUART', 'TSM'])

function parseRow(l) {
  const out = []; let cur = '', q = false
  for (let i = 0; i < l.length; i++) {
    const ch = l[i]
    if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '')
const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
const head = parseRow(lines[0]).map((h) => h.trim())
const rows = lines.slice(1).map((l, i) => {
  const f = parseRow(l)
  const o = { _line: i + 2 }
  head.forEach((h, k) => { o[h] = (f[k] ?? '').trim() })
  return o
})

const num = (s) => (s === '' || s == null ? null : Number.isFinite(Number(s)) ? Number(s) : NaN)
const date = (s) => {
  const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  const mo = +m[1], d = +m[2], y = +m[3]
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null
}

const excluded = []
const seenNum = new Map()
const seenPos = new Map()
const keep = []
for (const r of rows) {
  const why = []
  const lo = Number(r.Gauss_Lo)
  const y = num(r.Y_Gauss), x = num(r.X_Gauss)
  if (!ZONES.has(lo)) why.push(`Gauss_Lo ${r.Gauss_Lo || 'blank'} is not a Cape Lo zone`)
  if (!TYPES.has(r.Type)) why.push(`Type ${r.Type ? `"${r.Type}"` : 'blank'} is not a control point class`)
  if (y === null || Number.isNaN(y) || x === null || Number.isNaN(x)) why.push('Y/X missing or not a number')
  if (!r.MonuNum) why.push('no MonuNum')
  if (why.length === 0) {
    const nk = r.MonuNum.toUpperCase()
    const pk = `${lo}|${y}|${x}`
    if (seenNum.has(nk)) why.push(`duplicate of ${seenNum.get(nk)} (same number)`)
    else if (seenPos.has(pk)) why.push(`duplicate of ${seenPos.get(pk)} (same position)`)
    else { seenNum.set(nk, `${r.MonuNum} (line ${r._line})`); seenPos.set(pk, `${r.MonuNum} (line ${r._line})`) }
  }
  if (why.length) excluded.push({ line: r._line, monuNum: r.MonuNum, monuName: r.MonuName, type: r.Type, lo: r.Gauss_Lo, y: r.Y_Gauss, x: r.X_Gauss, reason: why.join('; ') })
  else keep.push(r)
}

const toRecord = (r) => [
  r.MonuNum,
  r.MonuName || r.MonuNum,
  r.Type,
  r.Comp_sheet || null,
  r.TOPO || null,
  Number(r.Gauss_Lo),
  num(r.Y_Gauss),
  num(r.X_Gauss),
  num(r.MSL_Hgt),
  num(r.PedHgt),
  num(r.PillHgt),
  num(r.TopSignal),
  num(r.BotSignal),
  date(r.Last_insp),
  r.DegSqr || null,
  r.Remark || null,
  r.AREA_NM || null,
]
const COLS = ['monu_num', 'monu_name', 'type', 'comp_sheet', 'topo', 'gauss_lo', 'y_gauss', 'x_gauss', 'msl_hgt', 'ped_hgt', 'pill_hgt', 'top_signal', 'bot_signal', 'last_insp', 'deg_sqr', 'remark', 'area_nm']
// VALUES carries text; the table's own column types are applied here.
const TYPES_SQL = ['varchar', 'varchar', 'varchar', 'varchar', 'varchar', 'integer', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'date', 'varchar', 'text', 'varchar']
const records = keep.map(toRecord)
const nameFilled = keep.filter((r) => !r.MonuName).length

console.log(`file rows:        ${rows.length}`)
console.log(`to load:          ${records.length}`)
console.log(`excluded:         ${excluded.length}`)
const byReason = {}
for (const e of excluded) { const k = e.reason.replace(/duplicate of .*? \(same (number|position)\)/, 'duplicate ($1)').replace(/Type .*? is not/, 'Type is not').replace(/Gauss_Lo .*? is not/, 'Gauss_Lo is not'); byReason[k] = (byReason[k] || 0) + 1 }
console.log('  by reason:', byReason)
console.log(`blank names set to their number: ${nameFilled}`)

fs.mkdirSync(reportDir, { recursive: true })
const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
fs.writeFileSync(
  path.join(reportDir, 'zim_control_points.excluded.csv'),
  ['line,MonuNum,MonuName,Type,Gauss_Lo,Y_Gauss,X_Gauss,reason', ...excluded.map((e) => [e.line, e.monuNum, e.monuName, e.type, e.lo, e.y, e.x, e.reason].map(q).join(','))].join('\n'),
)
console.log(`excluded rows listed in ${path.join(reportDir, 'zim_control_points.excluded.csv')}`)

if (!apply) { console.log('\n(dry run: nothing written. Re-run with --apply.)'); process.exit(0) }

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  const before = (await client.query('SELECT * FROM public.zim_control_points ORDER BY id')).rows
  fs.writeFileSync(path.join(reportDir, 'zim_control_points.backup.json'), JSON.stringify(before, null, 1))
  console.log(`backed up ${before.length} existing rows to ${path.join(reportDir, 'zim_control_points.backup.json')}`)

  await client.query('BEGIN')
  let inserted = 0, updated = 0
  const existing = new Set(before.map((r) => r.monu_num))
  const CHUNK = 300
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK)
    const params = []
    const values = chunk.map((rec, ri) => {
      const ph = rec.map((v, ci) => { params.push(v); return `$${ri * COLS.length + ci + 1}` })
      return `(${ph.join(',')})`
    })
    await client.query(
      `INSERT INTO public.zim_control_points (${COLS.join(',')}, updated_at)
       SELECT ${COLS.map((c, i) => `v.${c}::${TYPES_SQL[i]}`).join(', ')}, now() FROM (VALUES ${values.join(',')}) AS v(${COLS.join(',')})
       ON CONFLICT (monu_num) DO UPDATE SET
         ${COLS.filter((c) => c !== 'monu_num').map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, updated_at = now()`,
      params,
    )
    for (const rec of chunk) (existing.has(rec[0]) ? updated++ : inserted++)
  }
  const after = (await client.query('SELECT count(*)::int n FROM public.zim_control_points')).rows[0].n
  if (after !== before.length + inserted) throw new Error(`row count ${after} != ${before.length} + ${inserted}`)
  await client.query('COMMIT')
  console.log(`applied: ${inserted} inserted, ${updated} updated; registry now ${after} rows`)
} catch (err) {
  await client.query('ROLLBACK').catch(() => {})
  console.error('FAILED, rolled back:', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
