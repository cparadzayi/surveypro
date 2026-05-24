/**
 * Script to check which specific points are missing from the database
 * Compares CSV file with database to identify missing points
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration
const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'surveypro_v1',
  user: process.env.DB_USER || 'surveypro_user',
  password: process.env.DB_PASSWORD || 'surveypro2024'
});

async function checkMissingPoints() {
  const client = await pool.connect();
  
  try {
    console.log('\n🔍 Checking missing points for Project 7...\n');
    
    // 1. Get total count from database
    const countResult = await client.query(
      'SELECT COUNT(*) as count FROM surveyor_kuziva_paradzayi.coordinate_points WHERE project_id = 7'
    );
    const dbCount = parseInt(countResult.rows[0].count);
    console.log(`📊 Database: ${dbCount} points stored`);
    
    // 2. Get all point names from database
    const dbPointsResult = await client.query(
      'SELECT name FROM surveyor_kuziva_paradzayi.coordinate_points WHERE project_id = 7 ORDER BY name'
    );
    const dbPointNames = new Set(dbPointsResult.rows.map(r => r.name));
    
    // 3. Read CSV file and get all point names
    const csvPath = path.join(__dirname, '../../cadastral-standard/Maglas with calculated points amended.csv');
    
    if (!fs.existsSync(csvPath)) {
      console.error(`❌ CSV file not found: ${csvPath}`);
      console.log('\n📁 Available CSV files in cadastral-standard:');
      const cadastralDir = path.join(__dirname, '../../cadastral-standard');
      if (fs.existsSync(cadastralDir)) {
        const files = fs.readdirSync(cadastralDir).filter(f => f.endsWith('.csv'));
        files.forEach(f => console.log(`  - ${f}`));
      }
      return;
    }
    
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');
    
    // Parse CSV to get point names
    const csvPointNames = [];
    for (let i = 1; i < lines.length; i++) { // Skip header
      const row = lines[i].split(',');
      if (row.length > 0 && row[0].trim() !== '') {
        csvPointNames.push(row[0].trim());
      }
    }
    
    console.log(`📊 CSV file: ${csvPointNames.length} points\n`);
    
    // 4. Find missing points
    const missingPoints = csvPointNames.filter(name => !dbPointNames.has(name));
    const extraPoints = Array.from(dbPointNames).filter(name => !csvPointNames.includes(name));
    
    // 5. Find duplicates in CSV
    const csvDuplicates = {};
    csvPointNames.forEach(name => {
      csvDuplicates[name] = (csvDuplicates[name] || 0) + 1;
    });
    const duplicateNames = Object.keys(csvDuplicates).filter(name => csvDuplicates[name] > 1);
    
    // 6. Report results
    console.log('=' .repeat(60));
    console.log('ANALYSIS RESULTS');
    console.log('=' .repeat(60));
    
    console.log(`\n📈 Summary:`);
    console.log(`  CSV Points: ${csvPointNames.length}`);
    console.log(`  Database Points: ${dbCount}`);
    console.log(`  Missing from DB: ${missingPoints.length}`);
    console.log(`  Extra in DB: ${extraPoints.length}`);
    console.log(`  Duplicates in CSV: ${duplicateNames.length}`);
    
    if (duplicateNames.length > 0) {
      console.log(`\n⚠️  DUPLICATES IN CSV (${duplicateNames.length}):`);
      duplicateNames.forEach(name => {
        const count = csvDuplicates[name];
        const indices = csvPointNames.reduce((acc, n, idx) => {
          if (n === name) acc.push(idx + 2); // +2 for header and 0-index
          return acc;
        }, []);
        console.log(`  - "${name}": ${count} occurrences on rows ${indices.join(', ')}`);
      });
    }
    
    if (missingPoints.length > 0) {
      console.log(`\n❌ MISSING FROM DATABASE (${missingPoints.length}):`);
      
      // Group by ranges for better readability
      const sortedMissing = missingPoints.sort();
      
      if (missingPoints.length <= 20) {
        sortedMissing.forEach(name => console.log(`  - ${name}`));
      } else {
        console.log(`  First 10:`);
        sortedMissing.slice(0, 10).forEach(name => console.log(`    - ${name}`));
        console.log(`  ...`);
        console.log(`  Last 10:`);
        sortedMissing.slice(-10).forEach(name => console.log(`    - ${name}`));
        
        // Save full list to file
        const outputPath = path.join(__dirname, '../missing-points.txt');
        fs.writeFileSync(outputPath, sortedMissing.join('\n'));
        console.log(`\n  📄 Full list saved to: ${outputPath}`);
      }
    } else {
      console.log(`\n✅ No missing points - all CSV points are in database!`);
    }
    
    if (extraPoints.length > 0) {
      console.log(`\n➕ EXTRA IN DATABASE (not in CSV) (${extraPoints.length}):`);
      if (extraPoints.length <= 10) {
        extraPoints.forEach(name => console.log(`  - ${name}`));
      } else {
        console.log(`  First 10:`);
        extraPoints.slice(0, 10).forEach(name => console.log(`    - ${name}`));
        console.log(`  (${extraPoints.length - 10} more...)`);
      }
    }
    
    // 7. Check if missing points are in specific chunks
    if (missingPoints.length > 0) {
      console.log(`\n📦 Missing Points by Chunk (100 points each):`);
      const chunkSize = 100;
      const chunkCounts = {};
      
      missingPoints.forEach(name => {
        const csvIndex = csvPointNames.indexOf(name);
        const chunkNum = Math.floor(csvIndex / chunkSize) + 1;
        chunkCounts[chunkNum] = (chunkCounts[chunkNum] || 0) + 1;
      });
      
      Object.keys(chunkCounts).sort((a, b) => parseInt(a) - parseInt(b)).forEach(chunk => {
        console.log(`  Chunk ${chunk}: ${chunkCounts[chunk]} missing points`);
      });
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

checkMissingPoints();
