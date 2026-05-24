import pg from 'pg'
import { config } from 'dotenv'

config()

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
})

async function removeDuplicateProjects() {
  console.log('🔍 Searching for duplicate projects...\n')
  
  try {
    // Find duplicate projects (same name, surveyor, client)
    const duplicatesQuery = `
      SELECT 
        name,
        surveyor_id,
        client_name,
        COUNT(*) as count,
        ARRAY_AGG(id ORDER BY created_at DESC) as project_ids,
        ARRAY_AGG(created_at ORDER BY created_at DESC) as created_dates
      FROM survey_projects
      GROUP BY name, surveyor_id, client_name
      HAVING COUNT(*) > 1
      ORDER BY name
    `
    
    const result = await pool.query(duplicatesQuery)
    
    if (result.rows.length === 0) {
      console.log('✅ No duplicate projects found!')
      process.exit(0)
    }
    
    console.log(`Found ${result.rows.length} sets of duplicate projects:\n`)
    
    let totalDuplicates = 0
    
    for (const row of result.rows) {
      console.log(`📋 Project: "${row.name}"`)
      console.log(`   Client: ${row.client_name}`)
      console.log(`   Total copies: ${row.count}`)
      console.log(`   IDs: ${row.project_ids.join(', ')}`)
      
      // Keep the first (most recent) project, delete the rest
      const keepId = row.project_ids[0]
      const deleteIds = row.project_ids.slice(1)
      
      console.log(`   ✅ Keeping: ID ${keepId} (created: ${row.created_dates[0]})`)
      console.log(`   ❌ Deleting: IDs ${deleteIds.join(', ')}`)
      
      // Delete duplicate projects (hard delete)
      // First delete related records in project_control_points
      for (const deleteId of deleteIds) {
        await pool.query(
          `DELETE FROM project_control_points WHERE project_id = $1`,
          [deleteId]
        )
        
        // Delete from project_meridian_cache
        await pool.query(
          `DELETE FROM project_meridian_cache WHERE project_id = $1`,
          [deleteId]
        )
        
        // Delete the project
        await pool.query(
          `DELETE FROM survey_projects WHERE id = $1`,
          [deleteId]
        )
        totalDuplicates++
      }
      
      console.log('')
    }
    
    console.log(`\n✅ Successfully removed ${totalDuplicates} duplicate projects!`)
    console.log(`📊 Kept ${result.rows.length} unique projects (most recent versions)`)
    
    process.exit(0)
  } catch (err) {
    console.error('❌ Error removing duplicates:', err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

removeDuplicateProjects()
