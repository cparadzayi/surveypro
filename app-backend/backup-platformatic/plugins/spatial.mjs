import fp from 'fastify-plugin'
import sql from '@databases/sql'

// Utility to compute bbox from a GeoJSON geometry (simple, no recursion for GeometryCol      return reply.code(500).send({
        error: 'layer creation failed',
        message: err.message
      })
    }
  })t)
function computeBBox(geometry) {
  if (!geometry) return null
  const coords = []
  function extract(c) {
    if (typeof c[0] === 'number') {
      coords.push(c)
    } else {
      for (const inner of c) extract(inner)
    }
  }
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates[0], geometry.coordinates[1], geometry.coordinates[0], geometry.coordinates[1]]
    case 'LineString':
    case 'MultiPoint':
      extract(geometry.coordinates)
      break
    case 'Polygon':
    case 'MultiLineString':
      extract(geometry.coordinates)
      break
    case 'MultiPolygon':
      extract(geometry.coordinates)
      break
    default:
      return null
  }
  if (!coords.length) return null
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity
  for (const [x,y] of coords) {
    if (x < minx) minx = x
    if (y < miny) miny = y
    if (x > maxx) maxx = x
    if (y > maxy) maxy = y
  }
  return [minx, miny, maxx, maxy]
}

async function spatialPlugin(app) {
  // Entities expected: projects, feature_layers, features, feature_revisions
  function snapshotEntities() {
    const ents = app.platformatic.entities || {}
    // Current DB shows singular keys: project, featureLayer, feature, featureRevision
    return {
      project: ents.project || null,
      featureLayer: ents.featureLayer || null,
      feature: ents.feature || null,
      featureRevision: ents.featureRevision || null
    }
  }

  // Initial log snapshot
  const snap = snapshotEntities()
  const availableKeys = Object.keys(app.platformatic.entities || {})
  app.log.info({ availableEntityKeys: availableKeys, projectEntityDetected: !!snap.project }, 'Spatial plugin entity keys at init')
  if (!snap.project) app.log.warn('project entity missing at init (will retry per request)')
  if (!snap.featureLayer) app.log.warn('featureLayer entity missing at init (check migrations)')
  if (!snap.feature) app.log.warn('feature entity missing at init (check migrations)')

  // Helper to safely access latest entities each request
  function getE() { return snapshotEntities() }

  function resolveField(entity, logicalNames) {
    if (!entity) return null
    const fields = Object.keys(entity.fields || {})
    for (const name of logicalNames) {
      if (fields.includes(name)) return name
    }
    // Try lower-case normalization
    const lowerMap = fields.reduce((acc,f)=>{acc[f.toLowerCase()] = f; return acc}, {})
    for (const name of logicalNames) {
      const found = lowerMap[name.toLowerCase()]
      if (found) return found
    }
    return null
  }

  // Create project
  app.post('/api/spatial/projects', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { name, code, description } = req.body || {}
    if (!name) return reply.code(400).send({ error: 'name required' })
  const { project: Project } = getE()
  if (!Project) return reply.code(500).send({ error: 'project entity unavailable' })
    // Derive allowed fields from entity metadata if available
  const allowed = new Set(Object.keys(Project.fields || {}))
    const input = { name }
    if (code && allowed.has('code')) input.code = code
    if (description && allowed.has('description')) input.description = description
    if (code && !allowed.has('code')) {
      app.log.warn('Ignoring unknown field code for projects entity')
    }
  const exists = (code && allowed.has('code')) ? await Project.find({ where: { code: { eq: code } }, limit: 1 }) : []
    if (exists?.length) return reply.code(409).send({ error: 'code already exists' })
  const saved = await Project.save({ input })
    reply.code(201).send(saved)
  })

  // List projects
  app.get('/api/spatial/projects', { preHandler: [app.authenticate] }, async () => {
  const { project: Project } = getE()
  if (!Project) return []
  return Project.find({})
  })

  // Create layer
  app.post('/api/spatial/projects/:projectId/layers', { preHandler: [app.authenticate] }, async (req, reply) => {
    const projectId = Number(req.params.projectId)
    const { name, layer_type, geom_type, srid } = req.body || {}
    if (!name) return reply.code(400).send({ error: 'name required' })

    // Get the Platformatic entities
    const { featureLayer: LayerEntity } = getE()
    if (!LayerEntity) return reply.code(500).send({ error: 'featureLayer entity unavailable', debug: availableKeys })

    try {
      // Try entity save with proper field mapping
      const saved = await LayerEntity.save({
        input: {
          project_id: projectId,
          name,
          layer_type: layer_type || 'generic',
          geom_type: geom_type || null,
          srid: srid || null
        }
      })

      app.log.info({ id: saved.id }, 'Created layer successfully')
      return reply.code(201).send(saved)

    } catch (err) {
      app.log.error({ err: err.message, code: err.code }, 'Layer creation failed')

      // Handle unique constraint violation
      if (err.code === '23505') {
        try {
          const existing = await LayerEntity.find({
            where: {
              project_id: { eq: projectId },
              name: { eq: name }
            },
            fields: ['id', 'name', 'layer_type', 'geom_type', 'srid'],
            limit: 1
          })

          if (existing?.length) {
            app.log.info({ id: existing[0].id }, 'Found layer after race condition')
            return reply.code(409).send(existing[0])
          }
        } catch (checkErr) {
          app.log.warn({ err: checkErr.message }, 'Race condition check failed')
        }
      }

      return reply.code(500).send({
        error: 'layer creation failed',
        message: err.message
      })
    }
  }
  }
  }
  }
  }
  })

  // List layers for a project
  app.get('/api/spatial/projects/:projectId/layers', { preHandler: [app.authenticate] }, async (req) => {
    const projectId = Number(req.params.projectId)
  const { featureLayer: LayerEntity } = getE()
  if (!LayerEntity) return []
    const projectIdField = resolveField(LayerEntity, ['projectId','project_id','project'])
    if (!projectIdField) return []
    return LayerEntity.find({ where: { [projectIdField]: { eq: projectId } } })
  })

  // Create / upsert feature
  app.post('/api/spatial/layers/:layerId/features', { preHandler: [app.authenticate] }, async (req, reply) => {
    const layerId = Number(req.params.layerId)
    const { geometry, properties } = req.body || {}
    const { featureLayer: LayerEntity, feature: FeatureEntity } = getE()
    if (!LayerEntity || !FeatureEntity) return reply.code(500).send({ error: 'entities unavailable', debug: { availableEntityKeys: availableKeys } })
    
    // Check layer exists using entity operations
    const layer = await LayerEntity.find({
      where: { id: { eq: layerId } },
      fields: ['id', 'project_id'],
      limit: 1
    })
    if (!layer?.[0]) return reply.code(404).send({ error: 'layer not found' })

    // Compute bbox for spatial index
    const bbox = computeBBox(geometry)

    try {
      // Save feature using entity operations
      const saved = await FeatureEntity.save({
        input: {
          layer_id: layerId,
          project_id: layer[0].project_id,
          geometry: geometry || null,
          properties: properties || {},
          bbox
        }
      })

      if (!saved?.id) {
        return reply.code(500).send({ error: 'feature creation failed' })
      }

      reply.code(201).send(saved)
    } catch (err) {
      app.log.error({ err: err.message, code: err.code }, 'Feature creation failed')
      return reply.code(500).send({ error: 'feature creation failed', message: err.message })
    }
  })

  // Update feature (new revision auto via trigger)
  app.put('/api/spatial/features/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const id = Number(req.params.id)
  const { feature: FeatureEntity } = getE()
  if (!FeatureEntity) return reply.code(500).send({ error: 'feature entity unavailable' })
  const found = await FeatureEntity.find({ where: { id: { eq: id } }, limit: 1 })
    const existing = found?.[0]
    if (!existing) return reply.code(404).send({ error: 'feature not found' })
    const { geometry = existing.geometry, properties = existing.properties } = req.body || {}
    const bbox = computeBBox(geometry)
  const updated = await FeatureEntity.save({ input: { id, geometry, properties, bbox } })
    reply.send(updated)
  })

  // BBOX query simplistic (client supplies bbox array)
  app.post('/api/spatial/layers/:layerId/query', { preHandler: [app.authenticate] }, async (req, reply) => {
    const layerId = Number(req.params.layerId)
    const { bbox } = req.body || {}
    if (!Array.isArray(bbox) || bbox.length !== 4) return reply.code(400).send({ error: 'bbox [minx,miny,maxx,maxy] required' })
    const [minx,miny,maxx,maxy] = bbox

    try {
      // Use SQL template literals for correct query
      const features = await app.platformatic.db.query(sql`
        SELECT *
        FROM features
        WHERE layer_id = ${layerId}
          AND bbox IS NOT NULL
      `)

      // Filter in memory - this will be replaced with PostGIS later
      return features.rows.filter(f => {
        const [fx1,fy1,fx2,fy2] = f.bbox
        return !(fx1 > maxx || fx2 < minx || fy1 > maxy || fy2 < miny)
      })
    } catch (err) {
      app.log.error({ err: err.message }, 'BBOX query failed')
      return reply.code(500).send({ error: 'query failed', message: err.message })
    }
  })

  // Debug: list entity field names and table schemas to help troubleshooting (auth protected)
  app.get('/api/spatial/debug/entities', { preHandler: [app.authenticate] }, async () => {
    const result = {}
    for (const [k,v] of Object.entries(app.platformatic.entities || {})) {
      result[k] = Object.keys(v.fields || {})
    }
    try {
      const tables = await app.platformatic.db.query(
        'SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = $1 ORDER BY table_name, ordinal_position',
        ['public']
      )
      result.__schema = tables.rows.reduce((acc, r) => {
        if (!acc[r.table_name]) acc[r.table_name] = []
        acc[r.table_name].push({ name: r.column_name, type: r.data_type })
        return acc
      }, {})
    } catch (e) {
      result.__schemaError = e.message
    }
    return result
  })
}

export default fp(spatialPlugin, { name: 'spatial' })
