// Simple test route to verify route loading
export default async function testRoute(fastify, options) {
  fastify.get('/test', async (request, reply) => {
    return { message: 'Test route is working', timestamp: new Date().toISOString() }
  })
  
  console.log('✅ Test route loaded successfully')
}
