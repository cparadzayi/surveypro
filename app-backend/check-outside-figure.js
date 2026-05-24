import pg from 'pg';
import { config } from 'dotenv';

config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkOutsideFigure() {
  try {
    // First, get all surveyor schemas
    const schemasResult = await pool.query(`
      SELECT schema_name 
      FROM surveyor_profiles 
      WHERE schema_name IS NOT NULL
      ORDER BY schema_name
    `);
    
    console.log('Checking schemas:', schemasResult.rows.map(r => r.schema_name).join(', '));
    console.log('');
    
    // Check each schema
    for (const schemaRow of schemasResult.rows) {
      const schema = schemaRow.schema_name;
      
      const result = await pool.query(`
        SELECT 
          id, 
          stand,
          project_id,
          jsonb_array_length(metadata->'residuals'->'edges') as edge_count,
          metadata->'residuals'->'edges'->0->'from'->>'id' as first_beacon_from,
          metadata->'residuals'->'edges'->0->'to'->>'id' as first_beacon_to,
          metadata->'cape_lo_points' IS NOT NULL as has_cape_lo_points,
          jsonb_array_length(metadata->'cape_lo_points') as point_count
        FROM ${schema}.land_parcels 
        WHERE stand ILIKE '%outside figure%'
           OR designation ILIKE '%outside figure%'
      `);
      
      if (result.rows.length > 0) {
        console.log(`\n📂 Schema: ${schema}`);
        console.log('Outside Figure Parcels:');
        console.log(JSON.stringify(result.rows, null, 2));
        
        // Also check the actual edges data
        const edgesResult = await pool.query(`
          SELECT 
            id,
            stand,
            metadata->'residuals'->'edges'->0 as first_edge,
            metadata->'cape_lo_points'->0 as first_point
          FROM ${schema}.land_parcels 
          WHERE stand ILIKE '%outside figure%'
             OR designation ILIKE '%outside figure%'
        `);
        
        console.log('\nFirst edge and point data:');
        console.log(JSON.stringify(edgesResult.rows, null, 2));
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkOutsideFigure();
