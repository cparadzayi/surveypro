import pg from 'pg';
import { config } from 'dotenv';

config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkColumns() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'surveyor_surveyor_kuda' 
        AND table_name = 'coordinate_points'
      ORDER BY ordinal_position
    `);
    
    console.log('coordinate_points columns:');
    console.log(JSON.stringify(result.rows, null, 2));
    
    // Also check a sample row
    const sample = await pool.query(`
      SELECT * FROM surveyor_surveyor_kuda.coordinate_points 
      WHERE project_id = 5 
      LIMIT 1
    `);
    
    console.log('\nSample row:');
    console.log(JSON.stringify(sample.rows[0], null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkColumns();
