import 'dotenv/config'
import pg from 'pg'
import fs from 'fs'
const n = 'surveyor_surveyor_cparadzayi'
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const par = await p.query(`select stand, area_m2, ST_AsGeoJSON(geom)::json g from ${n}.land_parcels where project_id=7 and geom is not null order by stand`)
const pts = await p.query(`select name, ST_X(geom) x, ST_Y(geom) y, description from ${n}.coordinate_points where project_id=7`)
const ring = await p.query(`select ST_AsGeoJSON(ST_ExteriorRing(d.geom))::json g, ST_Area(d.geom) a from (select (ST_Dump(ST_Union(ST_Buffer(geom,0.01)))).geom from ${n}.land_parcels where project_id=7 and geom is not null) d order by 2 desc`)
const pr = await p.query(`select name,designation,township,district,central_meridian from ${n}.survey_projects where id=7`)
await p.end()
const pj = pr.rows[0]
console.log('parcels', par.rows.length, 'points', pts.rows.length, 'rings', ring.rows.length, JSON.stringify(par.rows[0].g).slice(0,150))
fs.writeFileSync(process.argv[2], JSON.stringify({ par: par.rows, pts: pts.rows, ring: ring.rows, pj }))
