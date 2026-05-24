/**
 * Fix Project Linkage Script
 * Links old projects to new surveyor_profiles based on license_number
 * Run with: node scripts/fix-project-linkage.js
 */

import db from '../src/config/db.js'

async function fixProjectLinkage() {
  console.log('🔧 Starting project linkage fix...\n')
  
  try {
    // First, show the current state
    const beforeResult = await db.query(`
      SELECT COUNT(*) as count
      FROM survey_projects 
      WHERE surveyor_profile_id IS NULL AND surveyor_id IS NOT NULL
    `)
    console.log(`📊 Projects without surveyor_profile_id: ${beforeResult.rows[0].count}`)
    
    // Perform the fix
    const updateResult = await db.query(`
      UPDATE survey_projects sp
      SET surveyor_profile_id = (
        SELECT p.id 
        FROM surveyor_profiles p
        JOIN surveyors s ON s.license_number = p.license_number
        WHERE s.id = sp.surveyor_id
        LIMIT 1
      )
      WHERE sp.surveyor_profile_id IS NULL 
        AND sp.surveyor_id IS NOT NULL
      RETURNING id, name, surveyor_profile_id
    `)
    
    console.log(`\n✅ Fixed ${updateResult.rows.length} projects:\n`)
    updateResult.rows.forEach(row => {
      console.log(`   - ${row.name} (ID: ${row.id}) → Profile ID: ${row.surveyor_profile_id}`)
    })
    
    // Show projects by surveyor
    const summaryResult = await db.query(`
      SELECT 
        p.name as surveyor_name,
        p.license_number,
        COUNT(sp.id) as project_count
      FROM surveyor_profiles p
      LEFT JOIN survey_projects sp ON sp.surveyor_profile_id = p.id
      GROUP BY p.id, p.name, p.license_number
      HAVING COUNT(sp.id) > 0
      ORDER BY p.name
    `)
    
    console.log(`\n📋 Projects by Surveyor:`)
    summaryResult.rows.forEach(row => {
      console.log(`   - ${row.surveyor_name} (License: ${row.license_number}): ${row.project_count} projects`)
    })
    
    console.log('\n✨ Fix completed successfully!')
    
  } catch (error) {
    console.error('❌ Error fixing project linkage:', error)
    throw error
  } finally {
    await db.end()
  }
}

// Run the fix
fixProjectLinkage()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
