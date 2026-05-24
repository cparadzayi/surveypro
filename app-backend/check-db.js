const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'surveypro_v1',
  password: 'postgres',
  port: 5432,
});

async function checkColumn() {
  const client = await pool.connect();
  try {
    // Set search path to surveyor schema
    await client.query('SET search_path = surveyor_surveyor_chitsikef, public');
    
    // Check if parent_property column exists
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'surveyor_surveyor_chitsikef' 
        AND table_name = 'survey_projects' 
        AND column_name = 'parent_property'
    `);
    
    console.log('parent_property column exists:', result.rows.length > 0);
    
    // List all columns
    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'surveyor_surveyor_chitsikef' 
        AND table_name = 'survey_projects'
      ORDER BY ordinal_position
    `);
    console.log('All columns:');
    cols.rows.forEach(col => console.log(`  - ${col.column_name} (${col.data_type})`));
    
    // Try to add column if it doesn't exist
    if (result.rows.length === 0) {
      console.log('Adding parent_property column...');
      await client.query(`
        ALTER TABLE survey_projects 
        ADD COLUMN parent_property VARCHAR(500)
      `);
      console.log('Column added successfully');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkColumn();
