import fp from 'fastify-plugin'

async function healthPlugin(app) {
  app.get('/api/health', async () => {
    let db = false
    try { await app.platformatic.db.query('SELECT 1'); db = true } catch {}
    const entities = app.platformatic.entities ? Object.keys(app.platformatic.entities) : []
    return { status: 'ok', db: db ? 'up' : 'down', entities }
  })
}

export default fp(healthPlugin, { name: 'health' })
