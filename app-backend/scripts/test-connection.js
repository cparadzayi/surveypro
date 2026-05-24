/**
 * Test database connection and check for zim_control_points table
 */

import pg from 'pg';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

const { Pool } = pg;

async function testConnection() {
  console.log('Testing database connection...\n');
  
  // Show what we're trying to connect to
  console.log('Connection details:');
  console.log('  Host:', process.env.DB_HOST || 'localhost');
  console.log('  Port:', process.env.DB_PORT || 5432);
  console.log('  Database:', process.env.DB_NAME || 'surveypro_v1');
  console.log('  User:', process.env.DB_USER || 'postgres');
  console.log('  Password:', process.env.DB_PASSWORD ? '***' : '(not set)');
  console.log('');
  
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'surveypro_v1',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
  });
  
  try {
    // Test basic connection
    const client = await pool.connect();
    console.log('✅ Connected to database successfully!\n');
    
    // Check current database
    const dbResult = await client.query('SELECT current_database()');
    console.log('Current database:', dbResult.rows[0].current_database);
    
    // Check if zim_control_points table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'zim_control_points'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      console.log('✅ zim_control_points table EXISTS\n');
      
      // Get table info
      const tableInfo = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'zim_control_points'
        ORDER BY ordinal_position;
      `);
      
      console.log('Table structure:');
      tableInfo.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
      
      // Check record count
      const countResult = await client.query('SELECT COUNT(*) FROM zim_control_points');
      console.log('\nCurrent record count:', countResult.rows[0].count);
      
    } else {
      console.log('❌ zim_control_points table DOES NOT EXIST\n');
      console.log('Available tables:');
      const tables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name;
      `);
      tables.rows.forEach(t => console.log(`  - ${t.table_name}`));
    }
    
    client.release();
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('\nFull error:', error);
  } finally {
    await pool.end();
  }
}

testConnection();
