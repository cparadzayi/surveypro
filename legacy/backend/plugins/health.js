import fp from 'fastify-plugin'

async function healthPlugin(app) {
  app.get('/api/health', async () => {
    let dbOk = false
    try {
      await app.platformatic.db.query('SELECT 1')
      dbOk = true
    } catch (e) {
      dbOk = false
    }
    const entityKeys = app.platformatic && app.platformatic.entities ? Object.keys(app.platformatic.entities) : []
    return {
      status: 'ok',
      db: dbOk ? 'up' : 'error',
      entityCount: entityKeys.length,
      entities: entityKeys
    }
  })
}

export default fp(healthPlugin, { name: 'health' })
