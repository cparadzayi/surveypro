/**
 * Script to check for duplicate point names in CSV file
 * Usage: node check-duplicates.js <path-to-csv-file>
 */

const fs = require('fs');
const path = require('path');

// Get CSV file path from command line argument
const csvFilePath = process.argv[2];

if (!csvFilePath) {
  console.error('Usage: node check-duplicates.js <path-to-csv-file>');
  process.exit(1);
}

if (!fs.existsSync(csvFilePath)) {
  console.error(`File not found: ${csvFilePath}`);
  process.exit(1);
}

// Read and parse CSV
const csvContent = fs.readFileSync(csvFilePath, 'utf-8');
const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');

console.log(`\n📊 Analyzing CSV file: ${path.basename(csvFilePath)}`);
console.log(`Total lines: ${lines.length}`);

if (lines.length < 2) {
  console.error('CSV file must have at least a header and one data row');
  process.exit(1);
}

// Parse header
const header = lines[0].toLowerCase().split(',').map(h => h.trim());
console.log(`Header columns: ${header.join(', ')}`);

const pointIndex = header.findIndex(h => h === 'point' || h === 'name' || h === 'id');
if (pointIndex === -1) {
  console.error('Could not find "Point", "Name", or "ID" column in header');
  process.exit(1);
}

console.log(`\nPoint name column index: ${pointIndex} (${header[pointIndex]})`);

// Track point names and their occurrences
const pointNames = new Map();
const duplicates = new Map();

// Parse data rows
for (let i = 1; i < lines.length; i++) {
  const row = lines[i].split(',').map(cell => cell.trim());
  if (row.length === 0 || (row.length === 1 && row[0] === '')) continue;
  
  const pointName = row[pointIndex] || '';
  if (!pointName) {
    console.warn(`⚠️  Row ${i + 1}: Empty point name`);
    continue;
  }
  
  if (pointNames.has(pointName)) {
    // Duplicate found
    const occurrences = pointNames.get(pointName);
    occurrences.push(i + 1);
    pointNames.set(pointName, occurrences);
    duplicates.set(pointName, occurrences);
  } else {
    pointNames.set(pointName, [i + 1]);
  }
}

// Report results
console.log(`\n📈 Analysis Results:`);
console.log(`Total unique point names: ${pointNames.size}`);
console.log(`Total data rows: ${lines.length - 1}`);
console.log(`Duplicate point names found: ${duplicates.size}`);

if (duplicates.size > 0) {
  console.log(`\n❌ DUPLICATES DETECTED:\n`);
  
  const sortedDuplicates = Array.from(duplicates.entries())
    .sort((a, b) => a[1][0] - b[1][0]); // Sort by first occurrence
  
  sortedDuplicates.forEach(([name, rows]) => {
    console.log(`  "${name}": appears ${rows.length} times on rows ${rows.join(', ')}`);
  });
  
  // Check if duplicates are in chunk 6 (rows 501-544)
  console.log(`\n🔍 Checking if duplicates affect Chunk 6 (rows 501-544):`);
  let chunk6Affected = false;
  
  sortedDuplicates.forEach(([name, rows]) => {
    const inChunk6 = rows.filter(r => r >= 501 && r <= 544);
    if (inChunk6.length > 0) {
      chunk6Affected = true;
      console.log(`  ⚠️  "${name}": ${inChunk6.length} occurrence(s) in chunk 6 (rows ${inChunk6.join(', ')})`);
    }
  });
  
  if (!chunk6Affected) {
    console.log(`  ✅ No duplicates found in chunk 6`);
  }
  
} else {
  console.log(`\n✅ No duplicate point names found!`);
}

// Show point distribution by chunks
console.log(`\n📦 Point Distribution by Chunks (100 points each):`);
const totalPoints = lines.length - 1;
const chunkSize = 100;
const numChunks = Math.ceil(totalPoints / chunkSize);

for (let i = 0; i < numChunks; i++) {
  const start = i * chunkSize + 1;
  const end = Math.min((i + 1) * chunkSize, totalPoints);
  const count = end - start + 1;
  console.log(`  Chunk ${i + 1}: Rows ${start + 1}-${end + 1} (${count} points)`);
}

console.log(`\n✅ Analysis complete!\n`);
