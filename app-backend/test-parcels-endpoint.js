// Quick test to verify parcels endpoint is working
const testEndpoint = async () => {
  try {
    const response = await fetch('http://localhost:3050/api/parcels/1');
    const data = await response.json();
    console.log('✓ Parcels endpoint is working!');
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('✗ Parcels endpoint failed:', error.message);
  }
};

testEndpoint();
