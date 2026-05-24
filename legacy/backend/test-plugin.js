export default async function testPlugin(app) {
  app.get('/test', async (request, reply) => {
    return { message: 'Plugin loaded!' }
  })
}
