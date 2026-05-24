/**
 * Simple script to compare CSV with database and find missing points
 * Run with: node find-missing-points.js
 */

const fs = require('fs');
const path = require('path');

// Read CSV file
const csvPath = path.join(__dirname, 'cadastral-standard', 'Maglas with calculated points amended.csv');

console.log('\n🔍 Analyzing CSV file for missing points...\n');

if (!fs.existsSync(csvPath)) {
  console.error(`❌ CSV file not found: ${csvPath}`);
  console.log('\nTrying to find CSV files...');
  
  const searchDirs = [
    path.join(__dirname, 'cadastral-standard'),
    path.join(__dirname, 'sample docs'),
    __dirname
  ];
  
  searchDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.csv'));
      if (files.length > 0) {
        console.log(`\n📁 CSV files in ${path.basename(dir)}:`);
        files.forEach(f => console.log(`  - ${f}`));
      }
    }
  });
  
  process.exit(1);
}

// Parse CSV
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');

console.log(`📄 CSV File: ${path.basename(csvPath)}`);
console.log(`📊 Total lines: ${lines.length} (including header)\n`);

// Extract point names
const pointNames = [];
const duplicates = new Map();

for (let i = 1; i < lines.length; i++) {
  const row = lines[i].split(',');
  if (row.length > 0 && row[0].trim() !== '') {
    const name = row[0].trim();
    pointNames.push(name);
    
    // Track duplicates
    if (duplicates.has(name)) {
      duplicates.get(name).push(i + 1);
    } else {
      duplicates.set(name, [i + 1]);
    }
  }
}

// Find actual duplicates
const actualDuplicates = Array.from(duplicates.entries()).filter(([name, rows]) => rows.length > 1);

console.log('=' .repeat(60));
console.log('CSV ANALYSIS');
console.log('=' .repeat(60));

console.log(`\n📈 Statistics:`);
console.log(`  Total data rows: ${lines.length - 1}`);
console.log(`  Total point entries: ${pointNames.length}`);
console.log(`  Unique point names: ${duplicates.size}`);
console.log(`  Duplicate point names: ${actualDuplicates.length}`);

if (actualDuplicates.length > 0) {
  console.log(`\n⚠️  DUPLICATES FOUND (${actualDuplicates.length}):\n`);
  actualDuplicates.forEach(([name, rows]) => {
    console.log(`  "${name}": appears ${rows.length} times on rows ${rows.join(', ')}`);
    
    // Show coordinates for each occurrence
    rows.forEach(rowNum => {
      const row = lines[rowNum - 1].split(',');
      const y = row[1] || 'N/A';
      const x = row[2] || 'N/A';
      console.log(`    Row ${rowNum}: Y=${y}, X=${x}`);
    });
    console.log('');
  });
}

// Calculate expected vs actual database count
const expectedInDB = duplicates.size; // Unique points
const reportedInDB = 500; // What was reported

console.log(`\n📊 Database Comparison:`);
console.log(`  Expected unique points: ${expectedInDB}`);
console.log(`  Reported in database: ${reportedInDB}`);
console.log(`  Difference: ${expectedInDB - reportedInDB}`);

if (expectedInDB > reportedInDB) {
  console.log(`\n❌ MISSING: ${expectedInDB - reportedInDB} points are missing from database`);
  
  // Estimate which chunk might have failed
  const chunkSize = 100;
  const totalChunks = Math.ceil(expectedInDB / chunkSize);
  const missingCount = expectedInDB - reportedInDB;
  
  console.log(`\n📦 Chunk Analysis:`);
  console.log(`  Total unique points: ${expectedInDB}`);
  console.log(`  Chunk size: ${chunkSize}`);
  console.log(`  Expected chunks: ${totalChunks}`);
  console.log(`  Points in last chunk: ${expectedInDB % chunkSize || chunkSize}`);
  
  if (reportedInDB === 500 && expectedInDB > 500) {
    const lastChunkStart = 501;
    const lastChunkEnd = expectedInDB;
    console.log(`\n🎯 Likely Issue: Chunk ${Math.ceil(reportedInDB / chunkSize) + 1} failed`);
    console.log(`  Expected rows: ${lastChunkStart}-${lastChunkEnd} (${lastChunkEnd - lastChunkStart + 1} points)`);
    console.log(`  These points are likely missing from the database`);
  }
}

// Show point distribution
console.log(`\n📦 Point Distribution by Chunks:`);
const chunkSize = 100;
const numChunks = Math.ceil(expectedInDB / chunkSize);

for (let i = 0; i < numChunks; i++) {
  const start = i * chunkSize;
  const end = Math.min((i + 1) * chunkSize, expectedInDB);
  const count = end - start;
  console.log(`  Chunk ${i + 1}: Points ${start + 1}-${end} (${count} points)`);
}

console.log('\n' + '='.repeat(60));
console.log('\n💡 To find exact missing points, run the database query script:');
console.log('   check-missing-points.sql\n');
