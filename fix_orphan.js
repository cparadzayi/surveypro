const fs = require('fs');
const content = fs.readFileSync('app-backend/src/services/pdfkitGeoPDF.js', 'utf8');

// EXACT BOUNDARIES (confirmed by file inspection):
// Line 8883 (0-indexed 8882) = closing } of new calculateBlockPositions
// Line 8884 (0-indexed 8883) = blank line — START of orphaned section
// Line 11154 (0-indexed 11153) = /** comment before first calculateInsetPositions — END (keep from here)
// So delete 0-indexed lines 8883 through 11152 inclusive
const ORPHAN_START = 8883;  // 0-indexed, inclusive
const ORPHAN_END   = 11153; // 0-indexed, exclusive (keep this line onwards)

// The orphaned old function body sits between two unique markers:
// START: the line containing "// (orphaned old body removed)"  (or the old constants block)
// END:   the line containing "/**" that starts the calculateInsetPositions comment
//        which is immediately followed by " * Calculate positions for inset boxes"
//
// Strategy: find the SECOND occurrence of "function calculateInsetPositions("
// (the first is the real one we want to keep; the orphaned body has a duplicate)
// and delete everything from the orphan marker up to (but not including) the
// "/**" comment that precedes the FIRST occurrence.

// Split preserving line endings
const lines = content.split('\n');
console.log('Total lines:', lines.length);

// Find ALL occurrences of "function calculateInsetPositions("
const occurrences = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim().startsWith('function calculateInsetPositions(')) {
    occurrences.push(i);
  }
}
console.log('calculateInsetPositions occurrences at lines:', occurrences.map(i => i+1));

if (occurrences.length < 2) {
  console.log('ERROR: Expected 2 occurrences, found', occurrences.length);
  process.exit(1);
}

// occurrences[0] = 11158 (0-indexed 11157) = ORPHAN (inside the duplicated old body)
// occurrences[1] = 15044 (0-indexed 15043) = REAL   (the one we want to keep)
const orphanFuncLine = occurrences[0]; // 0-indexed
const realFuncLine   = occurrences[1]; // 0-indexed

// deleteFrom: the blank line immediately after the new calculateBlockPositions closing }
// The new function ends around line 8883. Find the first blank line after line 8882
// that follows a closing brace.
let deleteFrom = -1;
for (let i = 8882; i < orphanFuncLine; i++) {
  if (lines[i].trim() === '' && i > 0 && lines[i-1].trim() === '}') {
    deleteFrom = i;
    break;
  }
}
if (deleteFrom === -1) {
  // fallback: just use line after 8883
  deleteFrom = 8883;
}

// deleteTo: the /** comment line before the REAL calculateInsetPositions
let deleteTo = realFuncLine - 1;
while (deleteTo > deleteFrom && !lines[deleteTo].trim().startsWith('/**')) {
  deleteTo--;
}

console.log('Delete from line (0-indexed):', deleteFrom, '-> line', deleteFrom+1, JSON.stringify(lines[deleteFrom]));
console.log('Delete to line (0-indexed, exclusive):', deleteTo, '-> line', deleteTo+1, JSON.stringify(lines[deleteTo]));
console.log('Lines to delete:', deleteTo - deleteFrom);

if (deleteTo <= deleteFrom) {
  console.log('ERROR: Nothing to delete, boundaries are wrong');
  process.exit(1);
}

const cleaned = [...lines.slice(0, deleteFrom), ...lines.slice(deleteTo)];
console.log('New total lines:', cleaned.length);
fs.writeFileSync('app-backend/src/services/pdfkitGeoPDF.js', cleaned.join('\n'), 'utf8');
console.log('Done.');
