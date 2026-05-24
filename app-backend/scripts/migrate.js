import pg from 'pg'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import { config } from 'dotenv'

config()

const __dirname = dirname(fileURLToPath(import.meta.url))

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
})

async function runMigration() {
  console.log('Running migrations...')
  try {
    // Create migrations tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations_history (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('✓ Migrations tracking table ready')
    
    // Get list of already applied migrations
    const appliedResult = await pool.query('SELECT migration_name FROM migrations_history')
    const appliedMigrations = new Set(appliedResult.rows.map(r => r.migration_name))
    console.log(`✓ Found ${appliedMigrations.size} previously applied migrations`)
    
    const dir = join(__dirname, '../migrations')
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.do.sql')) // Only run .do.sql files, not .undo.sql
      .sort()
    
    let newMigrationsCount = 0
    
    for (const f of files) {
      if (appliedMigrations.has(f)) {
        console.log(`⊘ Skipping ${f} (already applied)`)
        continue
      }
      
      const sql = fs.readFileSync(join(dir, f), 'utf8')
      console.log(`→ Applying migration: ${f}`)
      
      await pool.query('BEGIN')
      try {
        await pool.query(sql)
        await pool.query('INSERT INTO migrations_history (migration_name) VALUES ($1)', [f])
        await pool.query('COMMIT')
        console.log(`✓ Applied ${f}`)
        newMigrationsCount++
      } catch (err) {
        await pool.query('ROLLBACK')
        throw new Error(`Failed to apply ${f}: ${err.message}`)
      }
    }
    
    if (newMigrationsCount === 0) {
      console.log('✓ All migrations already applied - database is up to date')
    } else {
      console.log(`✓ Successfully applied ${newMigrationsCount} new migration(s)`)
    }
    
    process.exit(0)
  } catch (err) {
    console.error('❌ Migration failed:', err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

runMigration()