import pg from 'pg'
import { config } from 'dotenv'

config()

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
})

async function setupSurveyorSchemas() {
  console.log('🚀 Setting up surveyor schemas...\n')
  
  try {
    // Get all surveyors without schemas
    const surveyorsResult = await pool.query(`
      SELECT s.id, s.name, u.email, s.schema_name
      FROM surveyor_profiles s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.id
    `)
    
    const surveyors = surveyorsResult.rows
    console.log(`Found ${surveyors.length} surveyor(s)\n`)
    
    if (surveyors.length === 0) {
      console.log('❌ No surveyors found in database')
      console.log('Please create at least one surveyor profile first')
      process.exit(1)
    }
    
    // Display surveyors
    console.log('Surveyors:')
    console.log('─'.repeat(80))
    for (const s of surveyors) {
      const status = s.schema_name ? `✅ ${s.schema_name}` : '⏳ No schema'
      console.log(`${s.id}. ${s.name} (${s.email}) - ${status}`)
    }
    console.log('─'.repeat(80))
    console.log()
    
    // Count surveyors needing schemas
    const needsSchema = surveyors.filter(s => !s.schema_name)
    
    if (needsSchema.length === 0) {
      console.log('✅ All surveyors already have schemas!')
      process.exit(0)
    }
    
    console.log(`Creating schemas for ${needsSchema.length} surveyor(s)...\n`)
    
    let successCount = 0
    let errorCount = 0
    
    for (const surveyor of needsSchema) {
      try {
        console.log(`Processing: ${surveyor.name} (${surveyor.email})`)
        
        // Create schema using the function
        const schemaResult = await pool.query(
          'SELECT create_surveyor_schema($1) AS schema_name',
          [surveyor.email]
        )
        
        const schemaName = schemaResult.rows[0].schema_name
        console.log(`  ✓ Created schema: ${schemaName}`)
        
        // Update surveyor profile
        await pool.query(
          'UPDATE surveyor_profiles SET schema_name = $1 WHERE id = $2',
          [schemaName, surveyor.id]
        )
        console.log(`  ✓ Updated profile with schema name`)
        
        // Verify tables created
        const tableCheck = await pool.query(`
          SELECT COUNT(*) as table_count
          FROM information_schema.tables
          WHERE table_schema = $1
        `, [schemaName])
        
        const tableCount = parseInt(tableCheck.rows[0].table_count)
        console.log(`  ✓ Verified ${tableCount} table(s) created`)
        
        successCount++
        console.log(`  ✅ Success!\n`)
        
      } catch (error) {
        console.error(`  ❌ Error: ${error.message}\n`)
        errorCount++
      }
    }
    
    // Summary
    console.log('═'.repeat(80))
    console.log('SUMMARY')
    console.log('═'.repeat(80))
    console.log(`✅ Successful: ${successCount}`)
    console.log(`❌ Failed: ${errorCount}`)
    console.log(`📊 Total: ${needsSchema.length}`)
    console.log()
    
    // Show final state
    if (successCount > 0) {
      console.log('All Surveyor Schemas:')
      console.log('─'.repeat(80))
      
      const finalCheck = await pool.query(`
        SELECT * FROM admin.surveyor_schemas
        ORDER BY surveyor_id
      `)
      
      for (const row of finalCheck.rows) {
        console.log(`${row.surveyor_id}. ${row.full_name} → ${row.schema_name} (${row.table_count} tables)`)
      }
      console.log('─'.repeat(80))
      console.log()
    }
    
    // Next steps
    if (successCount > 0) {
      console.log('✅ Setup complete! Next steps:')
      console.log('   1. Test PostGIS export with a surveyor account')
      console.log('   2. Verify data goes to surveyor schema (not public)')
      console.log('   3. Check QGIS connection with surveyor schema')
      console.log()
      console.log('To verify a specific schema:')
      console.log('   SELECT * FROM surveyor_xxx.coordinate_points;')
      console.log('   SELECT * FROM surveyor_xxx.land_parcels;')
    }
    
    process.exit(errorCount > 0 ? 1 : 0)
    
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

setupSurveyorSchemas()
