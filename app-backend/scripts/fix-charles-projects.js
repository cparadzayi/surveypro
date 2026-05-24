/**
 * Fix Charles Paradzayi's Project Linkage
 * This script specifically fixes the issue where Charles's 4 projects aren't showing up
 * Run with: node scripts/fix-charles-projects.js
 */

import db from '../src/config/db.js'

async function fixCharlesProjects() {
  console.log('🔧 Fixing Charles Paradzayi\'s project linkage...\n')
  
  try {
    // Step 1: Find Charles's surveyor profile
    console.log('📊 Step 1: Finding Charles Paradzayi in surveyor_profiles...')
    const profileResult = await db.query(`
      SELECT p.id, p.name, p.license_number, p.user_id, u.email
      FROM surveyor_profiles p
      JOIN users u ON u.id = p.user_id
      WHERE p.license_number = '293' OR p.name ILIKE '%paradzayi%'
      LIMIT 1
    `)
    
    if (profileResult.rows.length === 0) {
      console.error('❌ Could not find Charles Paradzayi in surveyor_profiles table')
      return
    }
    
    const charlesProfile = profileResult.rows[0]
    console.log(`✅ Found: ${charlesProfile.name} (Profile ID: ${charlesProfile.id}, License: ${charlesProfile.license_number})`)
    console.log(`   Email: ${charlesProfile.email}\n`)
    
    // Step 2: Find his projects in old surveyors table
    console.log('📊 Step 2: Finding projects linked to old surveyor_id...')
    const projectsResult = await db.query(`
      SELECT 
        sp.id,
        sp.name as project_name,
        sp.surveyor_id,
        sp.surveyor_profile_id,
        s.name as old_surveyor_name,
        s.license_number
      FROM survey_projects sp
      JOIN surveyors s ON s.id = sp.surveyor_id
      WHERE s.license_number = '293'
        AND sp.status = 'active'
    `)
    
    if (projectsResult.rows.length === 0) {
      console.log('⚠️  No projects found in old surveyors table for license 293')
      
      // Check if projects are already linked
      const linkedCheck = await db.query(`
        SELECT id, name
        FROM survey_projects
        WHERE surveyor_profile_id = $1
          AND status = 'active'
      `, [charlesProfile.id])
      
      if (linkedCheck.rows.length > 0) {
        console.log(`✅ Projects already linked to profile:`)
        linkedCheck.rows.forEach(row => {
          console.log(`   - ${row.name} (ID: ${row.id})`)
        })
      } else {
        console.log('❌ No projects found at all for Charles Paradzayi')
      }
      return
    }
    
    console.log(`✅ Found ${projectsResult.rows.length} projects:\n`)
    projectsResult.rows.forEach(row => {
      console.log(`   - ${row.project_name} (ID: ${row.id})`)
      console.log(`     Current profile_id: ${row.surveyor_profile_id || 'NULL'}`)
    })
    
    // Step 3: Link projects to the correct profile
    console.log(`\n🔧 Step 3: Linking projects to surveyor_profile_id ${charlesProfile.id}...\n`)
    
    const updateResult = await db.query(`
      UPDATE survey_projects sp
      SET surveyor_profile_id = $1
      FROM surveyors s
      WHERE s.id = sp.surveyor_id
        AND s.license_number = '293'
        AND sp.status = 'active'
      RETURNING sp.id, sp.name
    `, [charlesProfile.id])
    
    console.log(`✅ Successfully linked ${updateResult.rows.length} projects:\n`)
    updateResult.rows.forEach(row => {
      console.log(`   ✅ ${row.name} (ID: ${row.id})`)
    })
    
    // Step 4: Verify the fix
    console.log(`\n📊 Step 4: Verifying the fix...\n`)
    
    const verifyResult = await db.query(`
      SELECT 
        sp.id,
        sp.name,
        sp.surveyor_profile_id,
        p.name as surveyor_name,
        p.license_number
      FROM survey_projects sp
      JOIN surveyor_profiles p ON p.id = sp.surveyor_profile_id
      WHERE p.id = $1
        AND sp.status = 'active'
      ORDER BY sp.created_at DESC
    `, [charlesProfile.id])
    
    console.log(`✅ Charles Paradzayi now has ${verifyResult.rows.length} projects:\n`)
    verifyResult.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.name} (ID: ${row.id})`)
    })
    
    console.log('\n✨ Fix completed successfully!')
    console.log('\n💡 Next steps:')
    console.log('   1. Refresh the dashboard in your browser')
    console.log('   2. Charles should now see all 4 projects')
    
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await db.end()
  }
}

// Run the fix
fixCharlesProjects()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
