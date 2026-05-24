import fs from 'fs';
import PDFDocument from 'pdfkit';
import { parse } from 'csv-parse/sync';

// Read CSV file
const csvPath = process.argv[2] || '../../test-coordinates.csv';
const outputPath = process.argv[3] || '../../test-coordinates-preview.pdf';

console.log(`Reading CSV from: ${csvPath}`);
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// Parse CSV
const records = parse(csvContent, {
  columns: true,
  skip_empty_lines: true,
  trim: true
});

console.log(`Found ${records.length} coordinate points`);

// Count point types
const placedCount = records.filter(r => r.Status === 'P').length;
const foundCount = records.filter(r => r.Status === 'F').length;

// Create PDF
const doc = new PDFDocument({ margin: 50 });
doc.pipe(fs.createWriteStream(outputPath));

// Title
doc.fontSize(18).font('Helvetica-Bold').text('Survey Coordinate Data Preview', { align: 'center' });
doc.moveDown();

// Metadata
doc.fontSize(10).font('Helvetica');
doc.text(`File: ${csvPath}`);
doc.text(`Total Points: ${records.length}`);
doc.text(`Generated: ${new Date().toLocaleString()}`);
doc.moveDown();

// Summary
doc.fontSize(11).font('Helvetica-Bold');
doc.fillColor('#2980b9').text('Summary:', { continued: false });
doc.font('Helvetica').fillColor('black');
doc.text(`  Placed Beacons (P): ${placedCount}`, { indent: 20 });
doc.text(`  Found Beacons (F): ${foundCount}`, { indent: 20 });
doc.moveDown(1.5);

// Table header
doc.fontSize(11).font('Helvetica-Bold').fillColor('#2c3e50');
doc.text('Survey Points Table:', { underline: true });
doc.moveDown(0.5);

// Draw table
const tableTop = doc.y;
const colWidths = { point: 80, y: 90, x: 90, status: 50, desc: 100, date: 80 };
const rowHeight = 20;

// Header row
doc.fontSize(9).font('Helvetica-Bold');
doc.rect(50, tableTop, 540, rowHeight).fillAndStroke('#3498db', '#2980b9');
doc.fillColor('white');

let x = 55;
doc.text('Point', x, tableTop + 5, { width: colWidths.point });
x += colWidths.point;
doc.text('Y (Westing)', x, tableTop + 5, { width: colWidths.y });
x += colWidths.y;
doc.text('X (Northing)', x, tableTop + 5, { width: colWidths.x });
x += colWidths.x;
doc.text('Status', x, tableTop + 5, { width: colWidths.status });
x += colWidths.status;
doc.text('Description', x, tableTop + 5, { width: colWidths.desc });
x += colWidths.desc;
doc.text('Date', x, tableTop + 5, { width: colWidths.date });

// Data rows
doc.font('Helvetica').fontSize(8);
let currentY = tableTop + rowHeight;

records.forEach((row, index) => {
  // Alternate row colors
  const fillColor = index % 2 === 0 ? '#ecf0f1' : 'white';
  doc.rect(50, currentY, 540, rowHeight).fillAndStroke(fillColor, '#bdc3c7');
  
  // Status color
  const statusColor = row.Status === 'F' ? '#16a085' : '#e67e22';
  
  x = 55;
  doc.fillColor('black').text(row.Point || '', x, currentY + 5, { width: colWidths.point });
  x += colWidths.point;
  doc.text(row['Y (Westing)'] || '', x, currentY + 5, { width: colWidths.y });
  x += colWidths.y;
  doc.text(row['X (Northing)'] || '', x, currentY + 5, { width: colWidths.x });
  x += colWidths.x;
  doc.fillColor(statusColor).font('Helvetica-Bold').text(row.Status || '', x, currentY + 5, { width: colWidths.status });
  doc.fillColor('black').font('Helvetica');
  x += colWidths.status;
  doc.text(row.Description || '', x, currentY + 5, { width: colWidths.desc });
  x += colWidths.desc;
  doc.text(row.Date || '', x, currentY + 5, { width: colWidths.date });
  
  currentY += rowHeight;
  
  // Add new page if needed
  if (currentY > 700) {
    doc.addPage();
    currentY = 50;
  }
});

// Legend
doc.moveDown(2);
doc.fontSize(9).font('Helvetica-Bold').fillColor('black');
doc.text('Legend:');
doc.font('Helvetica').fontSize(8);
doc.fillColor('#16a085').text('  F = Found Beacon (existing marker verified and adopted)');
doc.fillColor('#e67e22').text('  P = Placed Beacon (new marker established)');

// Coordinate ranges
const yValues = records.map(r => parseFloat(r['Y (Westing)']));
const xValues = records.map(r => parseFloat(r['X (Northing)']));

doc.moveDown(1);
doc.fillColor('black').font('Helvetica-Bold').fontSize(9);
doc.text('Coordinate Ranges:');
doc.font('Helvetica').fontSize(8);
doc.text(`  Y (Westing): ${Math.min(...yValues).toFixed(3)} to ${Math.max(...yValues).toFixed(3)}`);
doc.text(`  X (Northing): ${Math.min(...xValues).toFixed(1)} to ${Math.max(...xValues).toFixed(1)}`);

// Finalize PDF
doc.end();

console.log(`\nPDF generated successfully: ${outputPath}`);
console.log(`\nSummary:`);
console.log(`- Total points: ${records.length}`);
console.log(`- Placed (P): ${placedCount}`);
console.log(`- Found (F): ${foundCount}`);
console.log(`\nYou can now open the PDF to review your coordinate data.`);
