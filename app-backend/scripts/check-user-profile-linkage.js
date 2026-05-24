/**
 * Check User-Profile Linkage Script
 * Verifies that users are properly linked to their surveyor profiles
 * Run with: node scripts/check-user-profile-linkage.js
 */

import db from '../src/config/db.js'

async function checkLinkage() {
  console.log('🔍 Checking user-profile linkage...\n')
  
  try {
    // Check all users and their surveyor profiles
    const usersResult = await db.query(`
      SELECT 
        u.id as user_id,
        u.email,
        u.user_type,
        p.id as profile_id,
        p.name as profile_name,
        p.surveyor_type,
        p.license_number
      FROM users u
      LEFT JOIN surveyor_profiles p ON p.user_id = u.id
      ORDER BY u.email
    `)
    
    console.log('👥 Users and their surveyor profiles:\n')
    usersResult.rows.forEach(row => {
      if (row.profile_id) {
        console.log(`✅ ${row.email}`)
        console.log(`   User ID: ${row.user_id} | Profile ID: ${row.profile_id}`)
        console.log(`   Name: ${row.profile_name} | License: ${row.license_number}`)
        console.log(`   Type: ${row.user_type} | Surveyor: ${row.surveyor_type}\n`)
      } else {
        console.log(`⚠️  ${row.email}`)
        console.log(`   User ID: ${row.user_id} | NO SURVEYOR PROFILE`)
        console.log(`   Type: ${row.user_type}\n`)
      }
    })
    
    // Check for orphaned surveyor profiles (profiles without users)
    const orphanedResult = await db.query(`
      SELECT 
        p.id as profile_id,
        p.name,
        p.license_number,
        p.user_id
      FROM surveyor_profiles p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE u.id IS NULL
    `)
    
    if (orphanedResult.rows.length > 0) {
      console.log('\n⚠️  Orphaned surveyor profiles (no linked user):\n')
      orphanedResult.rows.forEach(row => {
        console.log(`   - ${row.name} (License: ${row.license_number})`)
        console.log(`     Profile ID: ${row.profile_id} | Expected User ID: ${row.user_id}\n`)
      })
    }
    
    // Check projects for each profile
    console.log('\n📋 Projects by profile:\n')
    const projectsResult = await db.query(`
      SELECT 
        p.id as profile_id,
        p.name as surveyor_name,
        p.license_number,
        p.user_id,
        COUNT(sp.id) as project_count
      FROM surveyor_profiles p
      LEFT JOIN survey_projects sp ON sp.surveyor_profile_id = p.id
      GROUP BY p.id, p.name, p.license_number, p.user_id
      ORDER BY p.name
    `)
    
    projectsResult.rows.forEach(row => {
      console.log(`   ${row.surveyor_name} (License: ${row.license_number})`)
      console.log(`   Profile ID: ${row.profile_id} | User ID: ${row.user_id || 'NULL'} | Projects: ${row.project_count}\n`)
    })
    
  } catch (error) {
    console.error('❌ Error checking linkage:', error)
    throw error
  } finally {
    await db.end()
  }
}

// Run the check
checkLinkage()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
