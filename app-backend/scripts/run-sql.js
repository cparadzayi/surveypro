import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import db from '../src/config/db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function runSQL(filename) {
  try {
    const sqlPath = join(__dirname, '..', 'migrations', filename)
    const sql = readFileSync(sqlPath, 'utf8')
    
    console.log(`Running SQL from ${filename}...`)
    await db.query(sql)
    console.log('✅ SQL executed successfully!')
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Error executing SQL:', error.message)
    process.exit(1)
  }
}

const filename = process.argv[2]
if (!filename) {
  console.error('Usage: node run-sql.js <filename>')
  process.exit(1)
}

runSQL(filename)
