import pg from 'pg';
import { config } from 'dotenv';

config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkMigrationStatus() {
  try {
    const result = await pool.query(`
      SELECT * FROM migrations 
      WHERE name = '076.do.sql'
      ORDER BY applied_at DESC
    `);
    
    console.log('Migration 076 status:');
    console.log(JSON.stringify(result.rows, null, 2));
    
    if (result.rows.length > 0) {
      console.log('\n⚠️  Migration 076 is marked as applied.');
      console.log('To re-run it, you need to either:');
      console.log('1. Delete the migration record: DELETE FROM migrations WHERE name = \'076.do.sql\';');
      console.log('2. Or manually run the SQL file');
    } else {
      console.log('\n✅ Migration 076 has not been applied yet.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkMigrationStatus();
