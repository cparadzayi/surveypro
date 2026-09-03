// touch: 2026-02-26-08:34
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import { config } from 'dotenv'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'
import pool from './config/db.js'

// Load environment variables
config()

// Create Fastify instance
const app = Fastify({
  logger: true,
  trustProxy: true
})

// Register plugins
await app.register(cors, { 
  origin: true,
  credentials: true,
  exposedHeaders: [
    'X-Used-Scale',
    'X-Suggested-Scale',
    'X-Tile-Grid',
    'X-Used-Sheet-Size'
  ]
})

await app.register(jwt, {
  secret: process.env.JWT_SECRET || 'your-secret-key'
})

await app.register(multipart, {
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit for PDF files
  }
})

// Register database pool as a decorator
app.decorate('pg', pool)

// Add authentication decorator BEFORE loading routes
app.decorate('authenticate', async (request, reply) => {
  try {
    await request.jwtVerify()
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized' })
  }
})

// Load routes
const __dirname = dirname(fileURLToPath(import.meta.url))
const routesDir = join(__dirname, 'routes')

// Auto-load all route files
const routeFiles = await import('fs').then(fs => 
  fs.promises.readdir(routesDir)
    .then(files => files.filter(f => f.endsWith('.js')))
)

app.log.info(`📂 Found ${routeFiles.length} route files: ${routeFiles.join(', ')}`)

for (const file of routeFiles) {
  try {
    app.log.info(`📥 Loading route: ${file}`)
    const route = await import(pathToFileURL(join(routesDir, file)).href)
    const routeName = file.replace('.js', '')
    
    // Special handling for routes that need specific prefixes
    if (routeName === 'control-points') {
      app.register(route.default, { prefix: '/api/control-points' })
      app.log.info(`✅ Registered route: /api/control-points (${file})`)
    } else if (routeName === 'parcels') {
      app.register(route.default, { prefix: '/api/parcels' })
      app.log.info(`✅ Registered route: /api/parcels (${file})`)
    } else if (routeName === 'surveyPlanPreview') {
      app.register(route.default, { prefix: '/api/survey-plan' })
      app.log.info(`✅ Registered route: /api/survey-plan (${file})`)
    } else if (routeName === 'geopdf-vector') {
      app.register(route.default, { prefix: '/api/geopdf' })
      app.log.info(`✅ Registered route: /api/geopdf (${file})`)
    } else if (routeName === 'area-parcels') {
      app.register(route.default, { prefix: '/api/area-parcels' })
      app.log.info(`✅ Registered route: /api/area-parcels (${file})`)
    } else if (routeName === 'survey-projects') {
      app.register(route.default, { prefix: '/api/survey-projects' })
      app.log.info(`✅ Registered route: /api/survey-projects (${file})`)
    } else if (routeName === 'workingPlan') {
      app.register(route.default, { prefix: '/api/working-plan' })
      app.log.info(`✅ Registered route: /api/working-plan (${file})`)
    } else if (routeName === 'csvImports') {
      app.register(route.default, { prefix: '/api' })
      app.log.info(`✅ Registered route: /api/csv-imports (${file})`)
    } else {
      app.register(route.default, { prefix: '/api' })
      app.log.info(`✅ Registered route: /api (${file})`)
    }
  } catch (error) {
    app.log.error(`❌ Failed to load route ${file}:`)
    app.log.error(error)
    console.error(`Route loading error for ${file}:`, error)
  }
}

// Error handler
app.setErrorHandler((error, request, reply) => {
  app.log.error(error)
  
  // Handle validation errors
  if (error.validation) {
    return reply.code(400).send({
      error: 'Validation Failed',
      messages: error.validation
    })
  }

  // Handle database errors
  if (error.code === '23505') { // Unique violation
    return reply.code(409).send({
      error: 'Conflict',
      message: 'Resource already exists'
    })
  }

  // Default error
  reply.code(500).send({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An error occurred'
      : error.message
  })
})

// Start server
const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3050
    const host = process.env.HOST || '127.0.0.1'
    
    await app.listen({ port, host })
    app.log.info(`Server running at http://${host}:${port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()