// Diagnostic route to check import issues
export default async function diagnosticRoute(fastify, options) {
  fastify.get('/diagnostic', async (request, reply) => {
    try {
      // Test importing each new service
      const testResults = {};
      
      // Test trueGeoPDF import
      try {
        const { TrueGeoPDFGenerator } = await import('../services/trueGeoPDF.js');
        testResults.trueGeoPDF = '✅ Import successful';
      } catch (error) {
        testResults.trueGeoPDF = `❌ Import failed: ${error.message}`;
      }
      
      // Test layerManager import
      try {
        const { LayerManager } = await import('../services/layerManager.js');
        testResults.layerManager = '✅ Import successful';
      } catch (error) {
        testResults.layerManager = `❌ Import failed: ${error.message}`;
      }
      
      // Test adaptiveRenderer import
      try {
        const { AdaptiveRenderer } = await import('../services/adaptiveRenderer.js');
        testResults.adaptiveRenderer = '✅ Import successful';
      } catch (error) {
        testResults.adaptiveRenderer = `❌ Import failed: ${error.message}`;
      }
      
      // Test crsDefinitions import
      try {
        const { getCRSByEPSG } = await import('../utils/crsDefinitions.js');
        testResults.crsDefinitions = '✅ Import successful';
      } catch (error) {
        testResults.crsDefinitions = `❌ Import failed: ${error.message}`;
      }
      
      return {
        success: true,
        message: 'Diagnostic completed',
        results: testResults,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Diagnostic failed: ${error.message}`,
        error: error.stack,
        timestamp: new Date().toISOString()
      };
    }
  })
  
  console.log('✅ Diagnostic route loaded successfully')
}
