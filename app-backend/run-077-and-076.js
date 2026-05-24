import pg from 'pg';
import { config } from 'dotenv';
import fs from 'fs';

config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigrations() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Step 1: Running migration 077 to fix cape_lo_points...\n');
    
    // Read and execute migration 077
    const sql077 = fs.readFileSync('./migrations/077.do.sql', 'utf8');
    await client.query(sql077);
    
    console.log('\n✅ Migration 077 completed!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('🔄 Step 2: Re-running migration 076 to update edges...\n');
    
    // Read and execute migration 076
    const sql076 = fs.readFileSync('./migrations/076.do.sql', 'utf8');
    await client.query(sql076);
    
    console.log('\n✅ Migration 076 completed!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🎉 All migrations completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Run: node check-outside-figure.js');
    console.log('2. Verify parcel 47 now has correct beacon names (M8, 2836B, etc.)');
    console.log('3. Refresh your browser and generate a new GeoPDF');
    console.log('4. Check that Outside Figure Data table shows M8 as first beacon');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
