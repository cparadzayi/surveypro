const fs = require('fs');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');

// Read CSV file
const csvPath = process.argv[2] || './test-coordinates.csv';
const outputPath = process.argv[3] || './test-coordinates-preview.pdf';

console.log(`Reading CSV from: ${csvPath}`);
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// Parse CSV
const lines = csvContent.trim().split('\n');
const headers = lines[0].split(',');
const rows = lines.slice(1).map(line => line.split(','));

console.log(`Found ${rows.length} coordinate points`);

// Create PDF
const doc = new jsPDF();

// Add title
doc.setFontSize(16);
doc.text('Survey Coordinate Data Preview', 14, 15);

// Add metadata
doc.setFontSize(10);
doc.text(`File: ${csvPath}`, 14, 25);
doc.text(`Total Points: ${rows.length}`, 14, 30);
doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 35);

// Count point types
const placedCount = rows.filter(r => r[3] === 'P').length;
const foundCount = rows.filter(r => r[3] === 'F').length;

doc.text(`Placed Beacons (P): ${placedCount}`, 14, 40);
doc.text(`Found Beacons (F): ${foundCount}`, 14, 45);

// Add table
doc.autoTable({
  startY: 55,
  head: [headers],
  body: rows,
  styles: {
    fontSize: 9,
    cellPadding: 2
  },
  headStyles: {
    fillColor: [41, 128, 185],
    textColor: 255,
    fontStyle: 'bold'
  },
  columnStyles: {
    0: { cellWidth: 25 }, // Point
    1: { cellWidth: 30 }, // Y
    2: { cellWidth: 30 }, // X
    3: { cellWidth: 15, halign: 'center' }, // Status
    4: { cellWidth: 35 }, // Description
    5: { cellWidth: 30 } // Date
  },
  alternateRowStyles: {
    fillColor: [245, 245, 245]
  },
  didDrawCell: function(data) {
    // Highlight found vs placed beacons
    if (data.column.index === 3 && data.cell.section === 'body') {
      const status = data.cell.raw;
      if (status === 'F') {
        data.cell.styles.textColor = [22, 160, 133]; // Green for Found
        data.cell.styles.fontStyle = 'bold';
      } else if (status === 'P') {
        data.cell.styles.textColor = [230, 126, 34]; // Orange for Placed
        data.cell.styles.fontStyle = 'bold';
      }
    }
  }
});

// Add summary at bottom
const finalY = doc.lastAutoTable.finalY + 10;

doc.setFontSize(9);
doc.text('Legend:', 14, finalY);
doc.setTextColor(22, 160, 133);
doc.text('F = Found Beacon (existing marker verified)', 14, finalY + 5);
doc.setTextColor(230, 126, 34);
doc.text('P = Placed Beacon (new marker established)', 14, finalY + 10);
doc.setTextColor(0, 0, 0);

// Add coordinate range info
const yValues = rows.map(r => parseFloat(r[1]));
const xValues = rows.map(r => parseFloat(r[2]));

doc.text(`Coordinate Ranges:`, 14, finalY + 20);
doc.text(`Y (Westing): ${Math.min(...yValues).toFixed(3)} to ${Math.max(...yValues).toFixed(3)}`, 14, finalY + 25);
doc.text(`X (Northing): ${Math.min(...xValues).toFixed(1)} to ${Math.max(...xValues).toFixed(1)}`, 14, finalY + 30);

// Save PDF
doc.save(outputPath);
console.log(`PDF generated: ${outputPath}`);
console.log(`\nSummary:`);
console.log(`- Total points: ${rows.length}`);
console.log(`- Placed (P): ${placedCount}`);
console.log(`- Found (F): ${foundCount}`);
