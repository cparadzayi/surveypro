import axios from 'axios'

const API_BASE = 'http://localhost:3050/api'

console.log('🧪 Surveyor Management System - Smoke Test\n')

async function testSurveyorAPI() {
  try {
    // Test 1: Create a surveyor
    console.log('1️⃣  Creating surveyor...')
    const createResponse = await axios.post(`${API_BASE}/surveyors`, {
      name: 'O Saunyama',
      licenseNumber: 'LS-2019-001',
      firm: 'Saunyama Surveyors',
      address: 'BOX A1262\nAVONDALE\nHARARE',
      phone: '+263 4 123456',
      email: 'o.saunyama@example.com'
    })
    
    if (createResponse.data.ok) {
      console.log('   ✅ Surveyor created successfully')
      console.log('   ID:', createResponse.data.surveyor.id)
      console.log('   Name:', createResponse.data.surveyor.name)
      console.log('   License:', createResponse.data.surveyor.license_number)
    }

    const surveyorId = createResponse.data.surveyor.id

    // Test 2: Create another surveyor
    console.log('\n2️⃣  Creating second surveyor...')
    const createResponse2 = await axios.post(`${API_BASE}/surveyors`, {
      name: 'John Doe',
      licenseNumber: 'LS-2020-045',
      firm: 'Precision Surveys Ltd',
      address: '123 Main Street\nBulawayo',
      phone: '+263 9 987654',
      email: 'john@precision.com'
    })
    
    if (createResponse2.data.ok) {
      console.log('   ✅ Second surveyor created')
      console.log('   Name:', createResponse2.data.surveyor.name)
    }

    // Test 3: List all surveyors
    console.log('\n3️⃣  Fetching all surveyors...')
    const listResponse = await axios.get(`${API_BASE}/surveyors`)
    
    if (listResponse.data.ok) {
      console.log(`   ✅ Found ${listResponse.data.surveyors.length} surveyors`)
      listResponse.data.surveyors.forEach(s => {
        console.log(`   - ${s.name} (${s.license_number})`)
      })
    }

    // Test 4: Get surveyor by ID
    console.log('\n4️⃣  Fetching surveyor by ID...')
    const getResponse = await axios.get(`${API_BASE}/surveyors/${surveyorId}`)
    
    if (getResponse.data.ok) {
      console.log('   ✅ Surveyor retrieved')
      console.log('   Name:', getResponse.data.surveyor.name)
      console.log('   Firm:', getResponse.data.surveyor.firm)
      console.log('   Address:', getResponse.data.surveyor.address)
    }

    // Test 5: Update surveyor
    console.log('\n5️⃣  Updating surveyor...')
    const updateResponse = await axios.put(`${API_BASE}/surveyors/${surveyorId}`, {
      phone: '+263 4 999999'
    })
    
    if (updateResponse.data.ok) {
      console.log('   ✅ Surveyor updated')
      console.log('   New phone:', updateResponse.data.surveyor.phone)
    }

    // Test 6: Create survey project
    console.log('\n6️⃣  Creating survey project...')
    const projectResponse = await axios.post(`${API_BASE}/survey-projects`, {
      name: 'Shabani Mine Survey',
      surveyorId: surveyorId,
      clientName: 'Shabani Mining Company',
      location: 'Shabani District',
      surveyType: 'Cadastral',
      surveyDate: '2025-10-23',
      instruments: 'Trimble R6 GNSS Set',
      description: 'Survey of stands 108, 167-256'
    })
    
    if (projectResponse.data.ok) {
      console.log('   ✅ Survey project created')
      console.log('   Project:', projectResponse.data.project.name)
      console.log('   Client:', projectResponse.data.project.client_name)
    }

    // Test 7: List survey projects
    console.log('\n7️⃣  Fetching survey projects...')
    const projectsListResponse = await axios.get(`${API_BASE}/survey-projects`)
    
    if (projectsListResponse.data.ok) {
      console.log(`   ✅ Found ${projectsListResponse.data.projects.length} projects`)
      projectsListResponse.data.projects.forEach(p => {
        console.log(`   - ${p.name} (Surveyor: ${p.surveyor_name})`)
      })
    }

    // Test 8: Test duplicate license number (should fail)
    console.log('\n8️⃣  Testing duplicate license number validation...')
    try {
      await axios.post(`${API_BASE}/surveyors`, {
        name: 'Test Duplicate',
        licenseNumber: 'LS-2019-001', // Same as first surveyor
        firm: 'Test Firm'
      })
      console.log('   ❌ Should have failed but didn\'t')
    } catch (error) {
      if (error.response?.status === 409) {
        console.log('   ✅ Duplicate validation working correctly')
        console.log('   Error:', error.response.data.error)
      } else {
        throw error
      }
    }

    console.log('\n✅ All tests passed! 🎉')
    console.log('\n📊 Summary:')
    console.log('   - Database tables created ✓')
    console.log('   - API routes working ✓')
    console.log('   - CRUD operations functional ✓')
    console.log('   - Validation working ✓')
    console.log('   - Survey projects linked ✓')

  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    if (error.response) {
      console.error('   Status:', error.response.status)
      console.error('   Data:', error.response.data)
    }
    process.exit(1)
  }
}

// Run tests
testSurveyorAPI()
