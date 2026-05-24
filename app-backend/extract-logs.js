import fs from 'fs'

// Read the full log file
const logContent = fs.readFileSync('./backend-full.log', 'utf8')

// Get the last 500 lines (or all if less)
const lines = logContent.split('\n')
const recentLines = lines.slice(-500)

// Write to a new file that's not gitignored
fs.writeFileSync('./recent-backend-logs.txt', recentLines.join('\n'), 'utf8')

console.log(`✅ Extracted ${recentLines.length} recent log lines to recent-backend-logs.txt`)
