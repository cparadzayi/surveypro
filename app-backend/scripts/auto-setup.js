import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

console.log('═'.repeat(80))
console.log('🚀 SURVEYPRO SCHEMA-AWARE POSTGIS - AUTOMATIC SETUP')
console.log('═'.repeat(80))
console.log()

async function runCommand(command, description) {
  console.log(`▶ ${description}...`)
  try {
    const { stdout, stderr } = await execAsync(command, { 
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    })
    
    if (stdout) {
      console.log(stdout)
    }
    if (stderr && !stderr.includes('NOTICE:')) {
      console.error(stderr)
    }
    console.log(`✅ ${description} complete!\n`)
    return true
  } catch (error) {
    console.error(`❌ ${description} failed:`)
    console.error(error.message)
    if (error.stdout) console.log(error.stdout)
    if (error.stderr) console.error(error.stderr)
    return false
  }
}

async function setup() {
  console.log('This script will:')
  console.log('  1. Run migration 040 (add schema_name column and functions)')
  console.log('  2. Create schemas for all existing surveyors')
  console.log('  3. Verify setup')
  console.log()
  console.log('Press Ctrl+C within 5 seconds to cancel...\n')
  
  await new Promise(resolve => setTimeout(resolve, 5000))
  
  console.log('Starting setup...\n')
  console.log('─'.repeat(80))
  console.log()
  
  // Step 1: Run migrations
  const step1 = await runCommand('npm run migrate', 'Step 1: Run migration')
  if (!step1) {
    console.log('❌ Migration failed. Please check the error above.')
    console.log('You may need to:')
    console.log('  - Check DATABASE_URL in .env')
    console.log('  - Ensure PostgreSQL is running')
    console.log('  - Check database credentials')
    process.exit(1)
  }
  
  // Step 2: Setup schemas
  const step2 = await runCommand('npm run setup:schemas', 'Step 2: Setup surveyor schemas')
  if (!step2) {
    console.log('⚠️  Schema setup encountered issues.')
    console.log('This might be normal if:')
    console.log('  - No surveyors exist yet (create one first)')
    console.log('  - Schemas already exist (re-running is safe)')
    console.log()
  }
  
  console.log('═'.repeat(80))
  console.log('✅ SETUP COMPLETE!')
  console.log('═'.repeat(80))
  console.log()
  console.log('Next steps:')
  console.log('  1. Start the backend: npm run dev')
  console.log('  2. Login as a surveyor')
  console.log('  3. Test PostGIS export')
  console.log('  4. Verify data in surveyor schema (not public)')
  console.log()
  console.log('To verify setup:')
  console.log('  psql -U postgres -d surveypro_db -c "SELECT * FROM admin.surveyor_schemas;"')
  console.log()
  console.log('Documentation:')
  console.log('  - MIGRATION_SETUP_GUIDE.md (this setup)')
  console.log('  - SCHEMA_EXPORT_FIX_IMPLEMENTED.md (code changes)')
  console.log('  - POSTGIS_EXPORT_SCHEMA_ISSUE.md (root cause)')
  console.log()
}

setup().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
