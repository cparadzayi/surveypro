export default async function healthRoutes(app) {
  app.get('/health', async (request, reply) => {
    return { status: 'ok' }
  })
}