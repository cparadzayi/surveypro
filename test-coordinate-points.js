const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'surveypro',
  password: 'postgres',
  port: 5432
});

async function testCoordinatePoints() {
  try {
    // Get count by project
    const countResult = await pool.query(
      'SELECT COUNT(*) as total_points, project_id FROM coordinate_points GROUP BY project_id ORDER BY project_id;'
    );
    
    console.log('\n=== COORDINATE POINTS BY PROJECT ===');
    countResult.rows.forEach(row => {
      console.log(`Project ${row.project_id}: ${row.total_points} points`);
    });
    
    // Get sample points
    const sampleResult = await pool.query(
      'SELECT id, name, x, y, z, project_id FROM coordinate_points ORDER BY project_id, name LIMIT 10;'
    );
    
    console.log('\n=== SAMPLE COORDINATE POINTS (First 10) ===');
    sampleResult.rows.forEach(row => {
      console.log(`ID: ${row.id}, Name: ${row.name}, X: ${row.x}, Y: ${row.y}, Z: ${row.z || 'NULL'}, Project: ${row.project_id}`);
    });
    
    // Get latest import details
    const latestResult = await pool.query(
      `SELECT project_id, COUNT(*) as count, 
              MIN(x) as min_x, MAX(x) as max_x,
              MIN(y) as min_y, MAX(y) as max_y
       FROM coordinate_points 
       GROUP BY project_id 
       ORDER BY project_id DESC 
       LIMIT 1;`
    );
    
    if (latestResult.rows.length > 0) {
      const latest = latestResult.rows[0];
      console.log('\n=== LATEST PROJECT DETAILS ===');
      console.log(`Project ID: ${latest.project_id}`);
      console.log(`Total Points: ${latest.count}`);
      console.log(`X Range: ${latest.min_x} to ${latest.max_x}`);
      console.log(`Y Range: ${latest.min_y} to ${latest.max_y}`);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

testCoordinatePoints();
