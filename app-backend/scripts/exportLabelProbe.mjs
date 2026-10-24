/**
 * Export one survey project as the "label probe" JSON that
 * src/services/__tests__/helpers/buildSurveyPlan.js turns into a generateGeoPDF()
 * request: its stands, outside figure and beacons, straight from the surveyor's schema.
 *
 *   node scripts/exportLabelProbe.mjs <schema> <projectId> <out.json>
 *   e.g. node scripts/exportLabelProbe.mjs surveyor_surveyor_cparadzayi 4 maglas1686.json
 *
 * Lets a labelling problem seen on a printed plan be reproduced offline with the
 * plan's real geometry, and a plan be added to the label regression gate.
 */
import 'dotenv/config'
import pg from 'pg'
import fs from 'fs'

const [schema, projectId, out] = process.argv.slice(2)
if (!schema || !projectId || !out || !/^[a-z0-9_]+$/i.test(schema) || !/^\d+$/.test(projectId)) {
  console.error('usage: node scripts/exportLabelProbe.mjs <schema> <projectId> <out.json>')
  process.exit(1)
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const isOutside = `(lower(stand) like '%outside figure%' or lower(coalesce(designation,'')) like '%outside figure%')`
const of = await pool.query(`select stand, designation, ST_AsGeoJSON(geom)::json g from ${schema}.land_parcels where project_id=$1 and ${isOutside} limit 1`, [projectId])
const par = await pool.query(`select stand, area_m2, ST_AsGeoJSON(geom)::json g from ${schema}.land_parcels where project_id=$1 and geom is not null and not ${isOutside} order by stand`, [projectId])
const pts = await pool.query(`select name, ST_X(geom) x, ST_Y(geom) y from ${schema}.coordinate_points where project_id=$1`, [projectId])
const pj = await pool.query(`select name,designation,township,district,central_meridian from ${schema}.survey_projects where id=$1`, [projectId])
await pool.end()
fs.writeFileSync(out, JSON.stringify({ of: of.rows[0], par: par.rows, pts: pts.rows, pj: pj.rows[0] }))
console.log(`${pj.rows[0]?.name}: ${par.rows.length} stands, ${pts.rows.length} points, outside figure ${of.rows.length ? 'found' : 'MISSING'} -> ${out}`)
