/**
 * Analyze the 544-point CSV file for duplicates and missing points
 */

const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'cadastral-standard', 'coordinate_list_2025-10-26.csv');

console.log('\n🔍 Analyzing coordinate_list_2025-10-26.csv\n');

const csvContent = fs.readFileSync(csvPath, 'utf-8');
const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');

console.log(`📄 File: coordinate_list_2025-10-26.csv`);
console.log(`📊 Total lines: ${lines.length}\n`);

// Parse header
const header = lines[0].split(',');
console.log(`Header: ${header.join(', ')}\n`);

// Extract point data
const points = [];
const pointMap = new Map();
const duplicates = new Map();

for (let i = 1; i < lines.length; i++) {
  const row = lines[i].split(',');
  if (row.length >= 4 && row[0].trim() !== '') {
    const pointName = row[0].trim();
    const status = row[1].trim();
    const y = parseFloat(row[2]);
    const x = parseFloat(row[3]);
    const description = row[4] ? row[4].trim() : '';
    
    points.push({ name: pointName, y, x, status, description, row: i + 1 });
    
    // Track duplicates
    if (pointMap.has(pointName)) {
      if (!duplicates.has(pointName)) {
        duplicates.set(pointName, [pointMap.get(pointName)]);
      }
      duplicates.get(pointName).push({ y, x, row: i + 1 });
    } else {
      pointMap.set(pointName, { y, x, row: i + 1 });
    }
  }
}

console.log('=' .repeat(60));
console.log('FILE ANALYSIS');
console.log('=' .repeat(60));

console.log(`\n📈 Statistics:`);
console.log(`  Total data rows: ${points.length}`);
console.log(`  Unique point names: ${pointMap.size}`);
console.log(`  Duplicate point names: ${duplicates.size}`);

// Analyze duplicates
if (duplicates.size > 0) {
  console.log(`\n⚠️  DUPLICATES FOUND (${duplicates.size}):\n`);
  
  for (const [name, occurrences] of duplicates.entries()) {
    const first = occurrences[0];
    console.log(`  "${name}": ${occurrences.length + 1} occurrences`);
    console.log(`    Row ${first.row}: Y=${first.y.toFixed(3)}, X=${first.x.toFixed(3)}`);
    
    occurrences.forEach((occ, idx) => {
      if (idx > 0) {
        const distance = Math.sqrt(
          Math.pow(occ.y - first.y, 2) + 
          Math.pow(occ.x - first.x, 2)
        );
        console.log(`    Row ${occ.row}: Y=${occ.y.toFixed(3)}, X=${occ.x.toFixed(3)} (distance: ${distance.toFixed(3)}m)`);
      }
    });
    console.log('');
  }
}

// Database comparison
const reportedInDB = 500;
const expectedUnique = pointMap.size;

console.log(`\n📊 Database Comparison:`);
console.log(`  Expected unique points: ${expectedUnique}`);
console.log(`  Reported in database: ${reportedInDB}`);
console.log(`  Missing from database: ${expectedUnique - reportedInDB}`);

// Chunk analysis
console.log(`\n📦 Chunk Analysis (100 points per chunk):`);
const chunkSize = 100;
const totalChunks = Math.ceil(expectedUnique / chunkSize);

for (let i = 0; i < totalChunks; i++) {
  const start = i * chunkSize + 1;
  const end = Math.min((i + 1) * chunkSize, expectedUnique);
  const count = end - start + 1;
  const status = end <= reportedInDB ? '✅' : '❌';
  console.log(`  Chunk ${i + 1}: Points ${start}-${end} (${count} points) ${status}`);
}

if (expectedUnique > reportedInDB) {
  const missingStart = reportedInDB + 1;
  const missingEnd = expectedUnique;
  const missingCount = missingEnd - missingStart + 1;
  
  console.log(`\n🎯 Likely Missing Points:`);
  console.log(`  Points ${missingStart}-${missingEnd} (${missingCount} points)`);
  console.log(`  These are likely in Chunk ${Math.ceil(missingStart / chunkSize)}`);
  
  // List the likely missing point names
  const sortedPoints = Array.from(pointMap.keys()).sort();
  const likelyMissing = sortedPoints.slice(reportedInDB, expectedUnique);
  
  console.log(`\n  Likely missing point names (first 20):`);
  likelyMissing.slice(0, 20).forEach(name => console.log(`    - ${name}`));
  
  if (likelyMissing.length > 20) {
    console.log(`    ... and ${likelyMissing.length - 20} more`);
  }
  
  // Save full list
  const outputPath = path.join(__dirname, 'likely-missing-points.txt');
  fs.writeFileSync(outputPath, likelyMissing.join('\n'));
  console.log(`\n  📄 Full list saved to: likely-missing-points.txt`);
}

console.log('\n' + '='.repeat(60));
console.log('\n💡 Next Step: Re-import this CSV with the new duplicate handling');
console.log('   The system will now properly handle duplicates and show detailed logs\n');
