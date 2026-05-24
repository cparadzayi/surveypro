/// <reference path="../global.d.ts" />

import fp from 'fastify-plugin'

async function projectsPlugin(app) {
  // Log entity keys once Platformatic is ready (debugging naming issues)
  app.addHook('onReady', async () => {
    const ek = app.platformatic && app.platformatic.entities ? Object.keys(app.platformatic.entities) : []
    app.log.info({ entityKeys: ek }, 'Projects plugin onReady entity keys')
  })
  // Test endpoint
  app.get('/api/projects/test', async (request, reply) => {
    return { message: 'Projects plugin loaded successfully' }
  })

  // Diagnostics: inspect Platformatic entities availability
  app.get('/api/_diag/entities', async () => {
    const hasPlatformatic = !!app.platformatic
    const entityKeys = hasPlatformatic && app.platformatic.entities ? Object.keys(app.platformatic.entities) : []
    return {
      hasPlatformatic,
      hasEntities: !!(app.platformatic && app.platformatic.entities),
      entityKeys
    }
  })

  // Helper to safely fetch the projects entity (supports singular/plural naming edge cases)
  function getProjectsEntity() {
    if (!app.platformatic || !app.platformatic.entities) return null
    return app.platformatic.entities.project || null
  }

  // Get all projects (no auth filtering for MVP)
  app.get('/api/projects', async () => {
    const projects = getProjectsEntity()
    if (!projects) {
      return { error: 'Project entity not loaded yet' }
    }
    // Use camelCase field name mapping (updatedAt) for ordering
    return projects.find({ orderBy: [{ field: 'updatedAt', direction: 'desc' }], limit: 100 })
  })

  // Create a new project (owner_id null while auth removed)
  app.post('/api/projects', async (request, reply) => {
    const { name, description } = request.body
    if (!name) {
      reply.code(400)
      return { error: 'Name is required' }
    }
    const projects = getProjectsEntity()
    if (!projects) {
      reply.code(503)
      return { error: 'Projects entity not available', entities_loaded: app.platformatic && app.platformatic.entities ? Object.keys(app.platformatic.entities) : [] }
    }
  const saved = await projects.save({ input: { name, description: description || null } })
    reply.code(201)
    return saved
  })

  // Create development project (helper)
  app.post('/api/projects/dev', async (request, reply) => {
    const { name, description } = request.body || {}
    try {
      const projects = getProjectsEntity()
      if (!projects) {
        reply.code(503)
        return { error: 'Projects entity not available', entities_loaded: app.platformatic && app.platformatic.entities ? Object.keys(app.platformatic.entities) : [] }
      }
  const saved = await projects.save({ input: { name: name || 'Test Project', description: description || 'Development project for testing', coordinate_system: 'Zimbabwe Cadastral' } })
      reply.code(201)
      return saved
    } catch (error) {
      app.log.error(error)
      reply.code(500).send({ error: 'Failed to create project' })
    }
  })

  // Get a single project
  app.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params
    const projects = getProjectsEntity()
    if (!projects) {
      reply.code(503)
      return { error: 'Projects entity not available', entities_loaded: app.platformatic && app.platformatic.entities ? Object.keys(app.platformatic.entities) : [] }
    }
    const project = await projects.findOne({ where: { id: { eq: Number(id) } } })
    if (!project) {
      reply.code(404)
      return { error: 'Project not found' }
    }
    return project
  })
}

export default fp(projectsPlugin)
