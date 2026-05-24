const fs = require('fs');
const content = fs.readFileSync('app-backend/src/services/pdfkitGeoPDF.js', 'utf8');
const lines = content.split('\n');
console.log('Total lines:', lines.length);

// Confirmed boundaries:
// 0-indexed 8883 = blank line after new calculateBlockPositions closing }  (DELETE FROM HERE)
// 0-indexed 11153 = "/**" comment before first calculateInsetPositions     (KEEP FROM HERE)
// New boundaries (after previous partial cleanup):
// 0-indexed 8883 = "/**" starting first duplicate calculateInsetPositions (DELETE FROM HERE)
// 0-indexed 12769 = "/**" starting the real calculateInsetPositions       (KEEP FROM HERE)
const deleteFrom = 8883;
const deleteTo   = 12769;

console.log('deleteFrom line', deleteFrom+1, ':', JSON.stringify(lines[deleteFrom]));
console.log('deleteTo   line', deleteTo+1,   ':', JSON.stringify(lines[deleteTo]));
console.log('Lines to remove:', deleteTo - deleteFrom);

const cleaned = [...lines.slice(0, deleteFrom), ...lines.slice(deleteTo)];
console.log('New total lines:', cleaned.length);
fs.writeFileSync('app-backend/src/services/pdfkitGeoPDF.js', cleaned.join('\n'), 'utf8');
console.log('Done.');
