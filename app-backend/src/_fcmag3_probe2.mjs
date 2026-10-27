import 'dotenv/config'
import pg from 'pg'
import fs from 'fs'
const n = 'surveyor_surveyor_cparadzayi'
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const of = await p.query(`select stand, designation, ST_AsGeoJSON(geom)::json g from ${n}.land_parcels where project_id=7 and (lower(stand) like '%outside figure%' or lower(designation) like '%outside figure%') limit 1`)
const par = await p.query(`select stand, area_m2, ST_AsGeoJSON(geom)::json g from ${n}.land_parcels where project_id=7 and geom is not null and not (lower(stand) like '%outside figure%' or lower(coalesce(designation,'')) like '%outside figure%') order by stand`)
const pts = await p.query(`select name, ST_X(geom) x, ST_Y(geom) y from ${n}.coordinate_points where project_id=7`)
const pr = await p.query(`select name,designation,township,district,central_meridian from ${n}.survey_projects where id=7`)
await p.end()
console.log('outside figure rows', of.rows.length, 'stands', par.rows.length, JSON.stringify(of.rows[0]?.g?.coordinates?.[0]?.length))
fs.writeFileSync(process.argv[2], JSON.stringify({ of: of.rows[0], par: par.rows, pts: pts.rows, pj: pr.rows[0] }))
