/**
 * Test script for /documents/save-pdf endpoint
 * 
 * Usage: node test-save-pdf.js
 * 
 * Prerequisites:
 * - Backend server running on http://localhost:3050
 */

import http from 'http';

// Minimal valid PDF in base64 (212 bytes)
// This is a real PDF file with one blank page
const TEST_PDF_BASE64 = 
  'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoK' +
  'MiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8' +
  'PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDYxMiA3OTJdL1BhcmVudCAyIDAgUi9SZXNvdXJjZXM8PD4+' +
  'Pj4KZW5kb2JqCnhyZWYKMCA0CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAow' +
  'MDAwMDAwMDYzIDAwMDAwIG4gCjAwMDAwMDAxMjAgMDAwMDAgbiAKdHJhaWxlcgo8PC9TaXplIDQvUm9v' +
  'dCAxIDAgUj4+CnN0YXJ0eHJlZgoyMTIKJSVFT0Y=';

const API_HOST = '127.0.0.1';  // Use 127.0.0.1 instead of localhost
const API_PORT = 3050;

/**
 * Helper function to make HTTP POST requests
 */
function makeRequest(path, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({
            status: res.statusCode,
            data: parsed
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: responseData
          });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
}

/**
 * Helper function to check if server is running
 * Try multiple endpoints to verify server is up
 */
function checkServer() {
  return new Promise((resolve) => {
    // Try connecting to the documents endpoint itself
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: '/api/documents/save-pdf',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': 2
      }
    };
    
    const req = http.request(options, (res) => {
      // If we get 400 (bad request), server is running but we sent invalid data
      // If we get 200 or any response, server is up
      resolve(res.statusCode >= 200 && res.statusCode < 600);
    });
    
    req.on('error', (error) => {
      // Connection refused means server is not running
      if (error.code === 'ECONNREFUSED') {
        resolve(false);
      } else {
        // Other errors might mean server is running but something else is wrong
        resolve(true);
      }
    });
    
    req.write('{}');
    req.end();
  });
}

/**
 * Test 1: Successful save
 */
async function testSuccessfulSave() {
  console.log('\n📝 Test 1: Successful Save');
  console.log('━'.repeat(50));
  
  try {
    const response = await makeRequest('/api/documents/save-pdf', {
      pdfBase64: TEST_PDF_BASE64,
      filePath: 'Documents/test-save-pdf/output/complete-reports/test_report_001.pdf'
    });
    
    console.log('✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.success) {
      console.log('✅ Test PASSED: PDF saved successfully');
      console.log('   File:', response.data.filePath);
      console.log('   Size:', response.data.size, 'bytes');
    } else {
      console.log('❌ Test FAILED: Success was false');
    }
  } catch (error) {
    console.log('❌ Test FAILED with error:', error.message);
  }
}

/**
 * Test 2: Missing PDF data
 */
async function testMissingPdfData() {
  console.log('\n📝 Test 2: Missing PDF Data (should fail with 400)');
  console.log('━'.repeat(50));
  
  try {
    const response = await makeRequest('/api/documents/save-pdf', {
      filePath: 'Documents/test-save-pdf/test.pdf'
    });
    
    if (response.status === 400) {
      console.log('✅ Test PASSED: Correctly returned 400 error');
      console.log('   Message:', response.data.message);
    } else {
      console.log('❌ Test FAILED: Should have returned 400 error');
      console.log('   Got:', response.status, response.data);
    }
  } catch (error) {
    console.log('❌ Test FAILED with error:', error.message);
  }
}

/**
 * Test 3: Missing file path
 */
async function testMissingFilePath() {
  console.log('\n📝 Test 3: Missing File Path (should fail with 400)');
  console.log('━'.repeat(50));
  
  try {
    const response = await makeRequest('/api/documents/save-pdf', {
      pdfBase64: TEST_PDF_BASE64
    });
    
    if (response.status === 400) {
      console.log('✅ Test PASSED: Correctly returned 400 error');
      console.log('   Message:', response.data.message);
    } else {
      console.log('❌ Test FAILED: Should have returned 400 error');
      console.log('   Got:', response.status, response.data);
    }
  } catch (error) {
    console.log('❌ Test FAILED with error:', error.message);
  }
}

/**
 * Test 4: Save with absolute path
 */
async function testAbsolutePath() {
  console.log('\n📝 Test 4: Absolute Path');
  console.log('━'.repeat(50));
  
  // Use temp directory for absolute path test
  const tempDir = process.env.TEMP || process.env.TMP || '/tmp';
  const absolutePath = `${tempDir}/test-save-pdf/test_absolute.pdf`;
  
  try {
    const response = await makeRequest('/api/documents/save-pdf', {
      pdfBase64: TEST_PDF_BASE64,
      filePath: absolutePath
    });
    
    console.log('✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.success) {
      console.log('✅ Test PASSED: PDF saved with absolute path');
      console.log('   File:', response.data.filePath);
    } else {
      console.log('❌ Test FAILED');
    }
  } catch (error) {
    console.log('❌ Test FAILED with error:', error.message);
  }
}

/**
 * Test 5: Multiple saves with timestamps
 */
async function testMultipleSaves() {
  console.log('\n📝 Test 5: Multiple Saves with Timestamps');
  console.log('━'.repeat(50));
  
  const saves = 3;
  let successCount = 0;
  
  for (let i = 1; i <= saves; i++) {
    try {
      const timestamp = Date.now();
      const response = await makeRequest('/api/documents/save-pdf', {
        pdfBase64: TEST_PDF_BASE64,
        filePath: `Documents/test-save-pdf/output/complete-reports/test_report_${timestamp}.pdf`
      });
      
      if (response.data.success) {
        console.log(`  ✅ Save ${i}/${saves}: ${response.data.filePath}`);
        successCount++;
      }
      
      // Small delay to ensure unique timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    } catch (error) {
      console.log(`  ❌ Save ${i}/${saves} failed:`, error.message);
    }
  }
  
  if (successCount === saves) {
    console.log(`✅ Test PASSED: All ${saves} saves successful`);
  } else {
    console.log(`❌ Test FAILED: Only ${successCount}/${saves} saves successful`);
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║  📄 Testing /documents/save-pdf Endpoint      ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`\nBackend URL: http://${API_HOST}:${API_PORT}`);
  console.log('Checking server status...\n');
  
  // Check if backend is running
  const isRunning = await checkServer();
  if (!isRunning) {
    console.log(`❌ ERROR: Cannot connect to backend server at http://${API_HOST}:${API_PORT}`);
    console.log('\n💡 Make sure the backend server is running:');
    console.log('   1. Open a new terminal');
    console.log('   2. cd app-backend');
    console.log('   3. npm run dev');
    console.log('\n   The server should show: "Server running at http://127.0.0.1:3050"\n');
    console.log('⚠️  If server IS running, the endpoint might not be registered yet.');
    console.log('   Wait a few seconds and try again.\n');
    process.exit(1);
  }
  
  console.log('✅ Backend server is responding\n');
  
  // Run tests
  await testSuccessfulSave();
  await testMissingPdfData();
  await testMissingFilePath();
  await testAbsolutePath();
  await testMultipleSaves();
  
  console.log('\n' + '═'.repeat(50));
  console.log('✅ All tests completed!');
  console.log('═'.repeat(50) + '\n');
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
