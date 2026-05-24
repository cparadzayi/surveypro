/**
 * Clear AI-Generated Parcels Script
 * 
 * Deletes all parcels created by the AI detection system.
 * AI parcels are identified by the "PARCEL-XXX" naming pattern.
 * 
 * Usage:
 *   node scripts/clear-ai-parcels.js
 *   node scripts/clear-ai-parcels.js --project-id=123  (clear for specific project)
 */

import db from '../src/config/db.js'

async function clearAIParcels() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2)
    const projectIdArg = args.find(arg => arg.startsWith('--project-id='))
    const projectId = projectIdArg ? parseInt(projectIdArg.split('=')[1]) : null

    console.log('🗑️  Clearing AI-generated parcels...\n')

    // Count AI parcels before deletion
    let countQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT project_id) as projects
      FROM land_parcels
      WHERE stand LIKE 'PARCEL-%'
    `
    let deleteQuery = `DELETE FROM land_parcels WHERE stand LIKE 'PARCEL-%'`

    if (projectId) {
      countQuery += ` AND project_id = $1`
      deleteQuery += ` AND project_id = $1`
      console.log(`📊 Filtering by project_id: ${projectId}\n`)
    }

    const countResult = await db.query(
      countQuery,
      projectId ? [projectId] : []
    )

    const { total, projects } = countResult.rows[0]

    if (total === 0) {
      console.log('✅ No AI-generated parcels found.')
      process.exit(0)
    }

    console.log(`📊 Found ${total} AI-generated parcels across ${projects} project(s)`)
    console.log(`   Pattern: PARCEL-001, PARCEL-002, etc.\n`)

    // Delete AI parcels
    const deleteResult = await db.query(
      deleteQuery,
      projectId ? [projectId] : []
    )

    console.log(`✅ Deleted ${deleteResult.rowCount} AI-generated parcels\n`)

    // Show remaining parcels
    const remainingQuery = projectId
      ? 'SELECT COUNT(*) as count FROM land_parcels WHERE project_id = $1'
      : 'SELECT COUNT(*) as count FROM land_parcels'

    const remainingResult = await db.query(
      remainingQuery,
      projectId ? [projectId] : []
    )

    console.log(`📊 Remaining parcels: ${remainingResult.rows[0].count}`)
    console.log('✅ Done!\n')

    process.exit(0)
  } catch (error) {
    console.error('❌ Error clearing AI parcels:', error)
    process.exit(1)
  }
}

clearAIParcels()
