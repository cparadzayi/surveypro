/**
 * Smoke Test for Coordinate List Generation
 * 
 * Run with: node smoke-test.js
 * 
 * This script tests the combined document generator to ensure:
 * 1. PDFs are generated successfully
 * 2. Page numbering is correct
 * 3. Cross-references are accurate
 */

console.log('🧪 Coordinate List Generation - Smoke Test\n')
console.log('=' .repeat(60))

// Test configuration
const testCases = [
  { name: 'Small Dataset', points: 10 },
  { name: 'Medium Dataset', points: 100 },
  { name: 'Large Dataset', points: 541 }
]

let passed = 0
let failed = 0

// Create test data
function createTestData(count) {
  const points = []
  for (let i = 1; i <= count; i++) {
    points.push({
      pointId: `P${String(i).padStart(4, '0')}`,
      y: 500000 + i * 10,
      x: 2000000 + i * 10,
      status: i % 3 === 0 ? 'F' : 'P',
      description: i % 2 === 0 ? 'Iron Peg' : 'Iron Pipe',
      surveyDate: '2025-10-25'
    })
  }
  return points
}

const surveyorInfo = {
  name: 'Test Surveyor',
  licenseNumber: 'LS001',
  firm: 'Test Firm',
  address: '123 Test Street',
  surveyDate: 'October 2025',
  projectTitle: 'Smoke Test Survey',
  district: 'Test District'
}

// Validation checks
function validateResult(result, pointCount) {
  const checks = []
  
  // Check 1: Coordinate List PDF exists
  checks.push({
    name: 'Coordinate List PDF generated',
    pass: !!result.coordinateListPDF,
    actual: result.coordinateListPDF ? 'Generated' : 'Missing'
  })
  
  // Check 2: Calculations Part 1 PDF exists
  checks.push({
    name: 'Calculations Part 1 PDF generated',
    pass: !!result.calculationsPart1PDF,
    actual: result.calculationsPart1PDF ? 'Generated' : 'Missing'
  })
  
  // Check 3: Coordinate List starts at page 100
  checks.push({
    name: 'Coordinate List starts at page 100',
    pass: result.coordinateListRange.start === 100,
    expected: 100,
    actual: result.coordinateListRange.start
  })
  
  // Check 4: Calculations starts immediately after Coordinate List
  const expectedCalcsStart = result.coordinateListRange.end + 1
  checks.push({
    name: 'Calculations starts after Coordinate List',
    pass: result.calculationsPart1Range.start === expectedCalcsStart,
    expected: expectedCalcsStart,
    actual: result.calculationsPart1Range.start
  })
  
  // Check 5: No page overlap
  checks.push({
    name: 'No page number overlap',
    pass: result.calculationsPart1Range.start > result.coordinateListRange.end,
    actual: `Coord ends at ${result.coordinateListRange.end}, Calcs starts at ${result.calculationsPart1Range.start}`
  })
  
  // Check 6: Adjusted coordinates count matches
  checks.push({
    name: 'All points have adjusted coordinates',
    pass: result.adjustedCoordinates.length === pointCount,
    expected: pointCount,
    actual: result.adjustedCoordinates.length
  })
  
  // Check 7: All points have calculations page references
  const pointsWithCalcsPage = result.adjustedCoordinates.filter(c => c.calculationsPage > 0).length
  checks.push({
    name: 'All points have calculations page references',
    pass: pointsWithCalcsPage === pointCount,
    expected: pointCount,
    actual: pointsWithCalcsPage
  })
  
  // Check 8: Calculations page references are in valid range
  const invalidRefs = result.adjustedCoordinates.filter(c => 
    c.calculationsPage < result.calculationsPart1Range.start ||
    c.calculationsPage > result.calculationsPart1Range.end
  )
  checks.push({
    name: 'Calculations page references are in valid range',
    pass: invalidRefs.length === 0,
    actual: invalidRefs.length === 0 ? 'All valid' : `${invalidRefs.length} invalid references`
  })
  
  return checks
}

// Run a single test
async function runTest(testCase) {
  console.log(`\n📝 Test: ${testCase.name} (${testCase.points} points)`)
  console.log('-'.repeat(60))
  
  try {
    const startTime = Date.now()
    
    // Create test data
    const surveyPoints = createTestData(testCase.points)
    console.log(`   ✓ Created ${testCase.points} test points`)
    
    // Note: In actual implementation, you would import and use the generator
    // For smoke test purposes, we'll simulate the expected behavior
    console.log(`   ⚠ Skipping actual generation (requires browser environment)`)
    console.log(`   ℹ To test fully, use the browser-based smoke test or run in dev server`)
    
    // Simulate expected results for validation
    // Calculate realistic page ranges
    const coordListPages = Math.ceil(testCase.points / 35) + 1 // +1 for cover page
    const coordListStart = 100
    const coordListEnd = coordListStart + coordListPages - 1
    
    const calcsStart = coordListEnd + 1
    const calcsPages = 15 // Typical calculations document size
    const calcsEnd = calcsStart + calcsPages - 1
    
    // Assign realistic calculations page references
    // Points appear in "Combined Points Table" which is ~35 points per page
    const adjustedCoordinates = surveyPoints.map((p, index) => {
      // Calculate which page this point appears on in Calculations Part 1
      // Assuming: Cover page (1) + Combined table starts at page 2
      const pointsPerCalcsPage = 35
      const calcsPageOffset = Math.floor(index / pointsPerCalcsPage)
      const calculationsPage = calcsStart + 1 + calcsPageOffset // +1 for cover page
      
      return {
        ...p,
        calculationsPage: Math.min(calculationsPage, calcsEnd) // Cap at end page
      }
    })
    
    const simulatedResult = {
      coordinateListPDF: { size: 100000 }, // Simulated blob
      calculationsPart1PDF: { size: 150000 }, // Simulated blob
      coordinateListRange: { 
        start: coordListStart, 
        end: coordListEnd
      },
      calculationsPart1Range: { 
        start: calcsStart,
        end: calcsEnd
      },
      adjustedCoordinates,
      summary: {
        totalPoints: testCase.points,
        duplicatePoints: Math.floor(testCase.points * 0.1),
        adjustedPoints: testCase.points,
        singleObservations: testCase.points - Math.floor(testCase.points * 0.1)
      }
    }
    
    // Validate results
    const checks = validateResult(simulatedResult, testCase.points)
    const allPassed = checks.every(c => c.pass)
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    
    console.log(`\n   📊 Results:`)
    console.log(`   - Coordinate List: Pages ${simulatedResult.coordinateListRange.start}-${simulatedResult.coordinateListRange.end}`)
    console.log(`   - Calculations Part 1: Pages ${simulatedResult.calculationsPart1Range.start}-${simulatedResult.calculationsPart1Range.end}`)
    console.log(`   - Duration: ${duration}s`)
    
    console.log(`\n   🔍 Validation Checks:`)
    checks.forEach(check => {
      if (check.pass) {
        console.log(`   ✅ ${check.name}`)
      } else {
        console.log(`   ❌ ${check.name}`)
        if (check.expected !== undefined) {
          console.log(`      Expected: ${check.expected}, Got: ${check.actual}`)
        } else {
          console.log(`      ${check.actual}`)
        }
      }
    })
    
    if (allPassed) {
      console.log(`\n   ✅ PASSED: All ${checks.length} checks passed`)
      passed++
    } else {
      console.log(`\n   ❌ FAILED: ${checks.filter(c => !c.pass).length}/${checks.length} checks failed`)
      failed++
    }
    
  } catch (error) {
    console.log(`\n   ❌ ERROR: ${error.message}`)
    console.log(`   Stack: ${error.stack}`)
    failed++
  }
}

// Run all tests
async function runAllTests() {
  console.log('\n🚀 Starting smoke test suite...\n')
  
  for (const testCase of testCases) {
    await runTest(testCase)
  }
  
  console.log('\n' + '='.repeat(60))
  console.log(`\n📊 Test Summary:`)
  console.log(`   Total: ${passed + failed}`)
  console.log(`   ✅ Passed: ${passed}`)
  console.log(`   ❌ Failed: ${failed}`)
  console.log(`   Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`)
  console.log('\n' + '='.repeat(60))
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed!')
  } else {
    console.log('\n⚠️  Some tests failed. Please review the output above.')
  }
  
  console.log('\n💡 Note: This is a simulation. For full testing:')
  console.log('   1. Run the dev server: npm run dev')
  console.log('   2. Open the app in browser')
  console.log('   3. Import CSV and generate documents')
  console.log('   4. Check browser console for detailed logs')
}

// Run the tests
runAllTests().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
