/**
 * One-time diagnostic script for project 3
 */
import pg from 'pg'
import { config } from 'dotenv'
config()

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    // Find schema with project 3
    const schemas = await client.query(`
      SELECT schema_name FROM information_schema.schemata 
      WHERE schema_name LIKE 'surveyor_%' ORDER BY schema_name
    `)
    
    for (const row of schemas.rows) {
      try {
        const countResult = await client.query(
          `SELECT count(*) as cnt FROM ${row.schema_name}.land_parcels WHERE project_id = 3`
        )
        if (parseInt(countResult.rows[0].cnt) > 0) {
          await client.query(`SET search_path = ${row.schema_name}, public`)
          console.log(`Schema: ${row.schema_name}`)
          
          // Check project central_meridian
          const projResult = await client.query(
            `SELECT id, name, designation, central_meridian, survey_type FROM survey_projects WHERE id = 3`
          )
          if (projResult.rows.length > 0) {
            console.log('Project:', projResult.rows[0])
          }
          
          // Delete remaining corrupted parcels (X > 2300000)
          const badResult = await client.query(`
            SELECT id, stand FROM land_parcels
            WHERE project_id = 3 AND ST_XMax(geom) > 2300000
          `)
          if (badResult.rows.length > 0) {
            const ids = badResult.rows.map(r => r.id)
            const stands = badResult.rows.map(r => r.stand)
            console.log(`Deleting ${badResult.rows.length} remaining corrupted parcels: ${stands.join(', ')}`)
            await client.query(`DELETE FROM land_parcels WHERE id = ANY($1)`, [ids])
            console.log('✅ Deleted')
          } else {
            console.log('No corrupted parcels remaining')
          }
          
          // Show what's left
          const parcelsResult = await client.query(`
            SELECT id, stand,
                   ST_XMin(geom) as xmin, ST_XMax(geom) as xmax,
                   ST_YMin(geom) as ymin, ST_YMax(geom) as ymax
            FROM land_parcels WHERE project_id = 3 ORDER BY stand
          `)
          console.log(`\nRemaining parcels: ${parcelsResult.rows.length}`)
          for (const row of parcelsResult.rows) {
            console.log(`  Stand ${row.stand}: X=[${parseFloat(row.xmin).toFixed(0)}, ${parseFloat(row.xmax).toFixed(0)}] Y=[${parseFloat(row.ymin).toFixed(0)}, ${parseFloat(row.ymax).toFixed(0)}]`)
          }
          break
        }
      } catch (e) { /* skip schemas without land_parcels */ }
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
