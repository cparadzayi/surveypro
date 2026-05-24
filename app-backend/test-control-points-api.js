/**
 * Test control points API endpoint
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3042/api';

async function testControlPointsAPI() {
  console.log('Testing Control Points API...\n');
  
  try {
    // Test 1: Get all control points (no filter)
    console.log('Test 1: Fetching all control points (limit 10)...');
    const response1 = await axios.get(`${API_BASE}/control-points`, {
      params: { limit: 10 }
    });
    console.log(`✅ Success! Found ${response1.data.pagination.total} total control points`);
    console.log(`   Returned ${response1.data.data.length} points`);
    if (response1.data.data.length > 0) {
      console.log(`   First point: ${response1.data.data[0].monu_num} (Lo${response1.data.data[0].gauss_lo})`);
    }
    console.log('');
    
    // Test 2: Get control points for Lo31
    console.log('Test 2: Fetching control points for Lo31...');
    const response2 = await axios.get(`${API_BASE}/control-points`, {
      params: {
        gauss_lo: 31,
        limit: 1000
      }
    });
    console.log(`✅ Success! Found ${response2.data.data.length} control points for Lo31`);
    if (response2.data.data.length > 0) {
      console.log(`   Sample points:`);
      response2.data.data.slice(0, 5).forEach(cp => {
        console.log(`   - ${cp.monu_num}: ${cp.monu_name} (${cp.type})`);
      });
    } else {
      console.log('   ⚠️  No control points found for Lo31');
    }
    console.log('');
    
    // Test 3: Check all meridians
    console.log('Test 3: Checking control points by meridian...');
    for (const lo of [27, 29, 31, 33]) {
      const response = await axios.get(`${API_BASE}/control-points`, {
        params: { gauss_lo: lo, limit: 1 }
      });
      console.log(`   Lo${lo}: ${response.data.pagination.total} points`);
    }
    console.log('');
    
    // Test 4: Test with type filter
    console.log('Test 4: Fetching PRIM control points for Lo31...');
    const response4 = await axios.get(`${API_BASE}/control-points`, {
      params: {
        gauss_lo: 31,
        type: 'PRIM',
        limit: 100
      }
    });
    console.log(`✅ Success! Found ${response4.data.data.length} PRIM control points for Lo31`);
    console.log('');
    
    console.log('✅ All tests passed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    } else if (error.request) {
      console.error('   No response received from server');
      console.error('   Is the backend running on http://localhost:3042?');
    }
  }
}

testControlPointsAPI();
