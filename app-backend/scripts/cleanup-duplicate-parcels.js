/**
 * Cleanup Script: Remove Duplicate Land Parcels
 * 
 * This script identifies and removes duplicate land parcels based on:
 * 1. Similar stand names (e.g., "2428a" vs "2428")
 * 2. Overlapping geometries (>95% overlap)
 * 3. Exact duplicate geometries
 * 
 * USAGE:
 *   node app-backend/scripts/cleanup-duplicate-parcels.js [--dry-run] [--project-id=N]
 * 
 * OPTIONS:
 *   --dry-run      Show what would be deleted without actually deleting
 *   --project-id=N Only check parcels in specific project
 *   --auto-fix     Automatically delete duplicates (USE WITH CAUTION!)
 */

import db from '../src/config/db.js'

// Parse command line arguments
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const autoFix = args.includes('--auto-fix')
const projectIdArg = args.find(arg => arg.startsWith('--project-id='))
const projectId = projectIdArg ? parseInt(projectIdArg.split('=')[1]) : null

console.log('🔍 Land Parcels Duplicate Cleanup Script')
console.log('==========================================')
console.log(`Mode: ${isDryRun ? '🔎 DRY RUN (no changes)' : autoFix ? '⚠️ AUTO-FIX (will delete!)' : '📋 REPORT ONLY'}`)
if (projectId) {
  console.log(`Project Filter: ${projectId}`)
}
console.log('')

/**
 * Normalize stand name for comparison
 */
function normalizeStand(stand) {
  if (!stand) return ''
  return stand.toLowerCase()
    .trim()
    .replace(/\s+/g, '') // Remove spaces
    .replace(/[a-z]$/, '') // Remove trailing letter
}

/**
 * Find all duplicate groups
 */
async function findDuplicates() {
  console.log('🔍 Scanning for duplicates...\n')
  
  const whereClause = projectId ? 'WHERE project_id = $1' : ''
  const params = projectId ? [projectId] : []
  
  // Get all parcels
  const result = await db.query(
    `SELECT id, project_id, stand, 
            ST_AsGeoJSON(geom)::jsonb as geometry,
            ST_Area(geom) as area_m2,
            created_at
     FROM land_parcels 
     ${whereClause}
     ORDER BY project_id, stand, created_at`,
    params
  )
  
  const parcels = result.rows
  console.log(`📊 Found ${parcels.length} total parcels\n`)
  
  const duplicateGroups = []
  const processed = new Set()
  
  // Check each parcel against others
  for (let i = 0; i < parcels.length; i++) {
    if (processed.has(parcels[i].id)) continue
    
    const parcel = parcels[i]
    const duplicates = [parcel]
    
    for (let j = i + 1; j < parcels.length; j++) {
      if (processed.has(parcels[j].id)) continue
      
      const other = parcels[j]
      
      // Skip if different projects
      if (parcel.project_id !== other.project_id) continue
      
      const isDuplicate = await checkIfDuplicate(parcel, other)
      
      if (isDuplicate) {
        duplicates.push(other)
        processed.add(other.id)
      }
    }
    
    if (duplicates.length > 1) {
      duplicateGroups.push(duplicates)
    }
    
    processed.add(parcel.id)
  }
  
  return duplicateGroups
}

/**
 * Check if two parcels are duplicates
 */
async function checkIfDuplicate(parcel1, parcel2) {
  // 1. Check similar stand names
  const norm1 = normalizeStand(parcel1.stand)
  const norm2 = normalizeStand(parcel2.stand)
  
  if (norm1 === norm2 && norm1.length > 0) {
    // Similar names - now check geometry overlap
    const overlapResult = await db.query(
      `SELECT 
        ST_Area(ST_Intersection(
          ST_GeomFromGeoJSON($1),
          ST_GeomFromGeoJSON($2)
        )) as overlap_area,
        ROUND((ST_Area(ST_Intersection(
          ST_GeomFromGeoJSON($1),
          ST_GeomFromGeoJSON($2)
        )) / NULLIF(ST_Area(ST_GeomFromGeoJSON($1)), 0) * 100)::numeric, 2) as overlap_percent
      WHERE ST_Intersects(
        ST_GeomFromGeoJSON($1),
        ST_GeomFromGeoJSON($2)
      )`,
      [JSON.stringify(parcel1.geometry), JSON.stringify(parcel2.geometry)]
    )
    
    if (overlapResult.rows.length > 0) {
      const overlapPercent = Number(overlapResult.rows[0].overlap_percent) || 0
      
      // Consider duplicate if >95% overlap or exact geometry match
      if (overlapPercent >= 95) {
        return true
      }
    }
  }
  
  // 2. Check for exact geometry match (even if names differ)
  const exactResult = await db.query(
    `SELECT ST_Equals(
      ST_GeomFromGeoJSON($1),
      ST_GeomFromGeoJSON($2)
    ) as is_equal`,
    [JSON.stringify(parcel1.geometry), JSON.stringify(parcel2.geometry)]
  )
  
  if (exactResult.rows[0]?.is_equal) {
    return true
  }
  
  return false
}

/**
 * Display duplicate group
 */
function displayGroup(group, groupIndex) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`📦 DUPLICATE GROUP #${groupIndex + 1} (${group.length} parcels)`)
  console.log(`${'='.repeat(80)}`)
  
  group.forEach((parcel, idx) => {
    const isKeep = idx === 0 // Keep the oldest one
    const icon = isKeep ? '✅ KEEP' : '🗑️  DELETE'
    
    console.log(`\n${icon} Parcel ID: ${parcel.id}`)
    console.log(`   Stand: ${parcel.stand}`)
    console.log(`   Normalized: ${normalizeStand(parcel.stand)}`)
    console.log(`   Project: ${parcel.project_id}`)
    console.log(`   Area: ${Number(parcel.area_m2).toFixed(2)} m²`)
    console.log(`   Created: ${parcel.created_at}`)
  })
  
  console.log(`\n💡 Strategy: Keep oldest (ID ${group[0].id}), delete ${group.length - 1} duplicate(s)`)
}

/**
 * Delete duplicates in a group
 */
async function deleteDuplicates(group) {
  const toDelete = group.slice(1) // Keep first (oldest), delete rest
  
  for (const parcel of toDelete) {
    if (isDryRun) {
      console.log(`   [DRY RUN] Would delete parcel ID ${parcel.id} (${parcel.stand})`)
    } else {
      await db.query('DELETE FROM land_parcels WHERE id = $1', [parcel.id])
      console.log(`   ✅ Deleted parcel ID ${parcel.id} (${parcel.stand})`)
    }
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    // Find all duplicate groups
    const duplicateGroups = await findDuplicates()
    
    if (duplicateGroups.length === 0) {
      console.log('✅ No duplicates found! Database is clean.\n')
      process.exit(0)
    }
    
    console.log(`\n⚠️  Found ${duplicateGroups.length} duplicate group(s)\n`)
    
    // Display all groups
    duplicateGroups.forEach((group, idx) => {
      displayGroup(group, idx)
    })
    
    // Summary
    const totalDuplicates = duplicateGroups.reduce((sum, group) => sum + (group.length - 1), 0)
    
    console.log(`\n${'='.repeat(80)}`)
    console.log('📊 SUMMARY')
    console.log(`${'='.repeat(80)}`)
    console.log(`Total duplicate groups: ${duplicateGroups.length}`)
    console.log(`Total parcels to delete: ${totalDuplicates}`)
    console.log(`Total parcels to keep: ${duplicateGroups.length}`)
    console.log('')
    
    // Execute deletions if not dry run
    if (!isDryRun) {
      if (autoFix) {
        console.log('⚠️  AUTO-FIX MODE: Deleting duplicates...\n')
        
        for (const group of duplicateGroups) {
          await deleteDuplicates(group)
        }
        
        console.log(`\n✅ Cleanup complete! Deleted ${totalDuplicates} duplicate parcel(s)\n`)
      } else {
        console.log('⚠️  To delete these duplicates, run with --auto-fix flag:')
        console.log('   node app-backend/scripts/cleanup-duplicate-parcels.js --auto-fix')
        console.log('')
        console.log('⚠️  Or run in dry-run mode first to verify:')
        console.log('   node app-backend/scripts/cleanup-duplicate-parcels.js --dry-run')
        console.log('')
      }
    } else {
      console.log('🔎 DRY RUN complete - no changes made')
      console.log('   To actually delete duplicates, run with --auto-fix:')
      console.log('   node app-backend/scripts/cleanup-duplicate-parcels.js --auto-fix')
      console.log('')
    }
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error)
    process.exit(1)
  } finally {
    await db.end()
  }
}

// Run the script
main()
