import pg from 'pg';
import { config } from 'dotenv';
import fs from 'fs';

config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    // Read the migration SQL
    const sql = fs.readFileSync('./migrations/076.do.sql', 'utf8');
    
    console.log('🔄 Running migration 076 manually...\n');
    
    // Execute the migration
    await client.query(sql);
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
