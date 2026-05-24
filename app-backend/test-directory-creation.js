/**
 * Test script for project directory creation
 * Run with: node test-directory-creation.js
 */

import { createProjectDirectories } from './src/utils/projectDirectories.js'

async function testDirectoryCreation() {
  console.log('=== Testing Project Directory Creation ===\n')
  
  // Test 1: Relative path
  console.log('Test 1: Relative path')
  const relativePath = 'Documents/SurveyPro/Projects/Test_Project_2025-10-28'
  console.log(`Input: ${relativePath}`)
  const result1 = await createProjectDirectories(relativePath)
  console.log(`Success: ${result1.success}`)
  console.log(`Message: ${result1.message}`)
  console.log(`Absolute Path: ${result1.absolutePath}`)
  console.log(`Directories created: ${result1.directories?.length || 0}`)
  console.log('')
  
  // Test 2: Absolute path (Windows)
  console.log('Test 2: Absolute path (Windows)')
  const absolutePath = 'C:/Temp/SurveyPro_Test/Test_Project_2025-10-28'
  console.log(`Input: ${absolutePath}`)
  const result2 = await createProjectDirectories(absolutePath)
  console.log(`Success: ${result2.success}`)
  console.log(`Message: ${result2.message}`)
  console.log(`Absolute Path: ${result2.absolutePath}`)
  console.log(`Directories created: ${result2.directories?.length || 0}`)
  console.log('')
  
  // Test 3: Empty path (should fail)
  console.log('Test 3: Empty path (should fail)')
  const result3 = await createProjectDirectories('')
  console.log(`Success: ${result3.success}`)
  console.log(`Message: ${result3.message}`)
  console.log('')
  
  // Test 4: Re-run same path (should say already exists)
  console.log('Test 4: Re-run same path (should say already exists)')
  const result4 = await createProjectDirectories(relativePath)
  console.log(`Success: ${result4.success}`)
  console.log(`Message: ${result4.message}`)
  console.log(`Directories created: ${result4.directories?.length || 0}`)
  console.log('')
  
  console.log('=== Test Complete ===')
  console.log('\nTo verify:')
  console.log(`1. Check: ${result1.absolutePath}`)
  console.log(`2. Check: ${result2.absolutePath}`)
  console.log('\nBoth should contain:')
  console.log('  - input/')
  console.log('  - output/')
  console.log('    - field-book/')
  console.log('    - calculations/')
  console.log('    - coordinate-list/')
  console.log('    - reports/')
  console.log('    - certificates/')
  console.log('  - README.txt')
}

testDirectoryCreation().catch(console.error)
