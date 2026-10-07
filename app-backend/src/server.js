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

// Default to production so the error handler never leaks error.message just
// because NODE_ENV happened to be unset in the deploy target.
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production'
}

// Create Fastify instance
const app = Fastify({
  logger: {
    // Never write credentials to disk. A committed log file previously
    // contained 31 copies of a signed JWT in an Authorization header.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.Authorization',
        'req.headers.cookie',
        'req.headers["set-cookie"]',
        'res.headers["set-cookie"]'
      ],
      censor: '[redacted]'
    }
  },
  trustProxy: true
})

// Register plugins
await app.register(cors, { 
  origin: true,
  credentials: true,
  exposedHeaders: [
    'X-Used-Scale',
    'X-Suggested-Scale',
    'X-Used-Sheet-Size',
    'X-Plan-Scale',
    'X-Plan-Grid',
    'X-Plan-Areas'
  ]
})

// A missing/weak JWT secret must stop the process, not silently fall back.
// The old fallback ('your-secret-key') is public knowledge: anyone can mint a
// token for any user id/email, which turns every authenticated-only route into
// an unauthenticated one.
const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret || jwtSecret.length < 32) {
  console.error(
    'FATAL: JWT_SECRET is missing or shorter than 32 characters. Refusing to start.'
  )
  process.exit(1)
}

await app.register(jwt, {
  secret: jwtSecret
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

/**
 * Routes that are deliberately NOT mounted.
 *
 * Both of these are structurally incapable of executing, verified against the
 * live database rather than inferred:
 *
 *   parcels.js       selects/inserts 19 columns that exist in NO schema
 *                    (parcel_number, parcel_name, boundary_points, area_sqm,
 *                    geometry_geojson, compactness_index, bounding_box, ...), so
 *                    all 5 routes fail with `column "parcel_number" does not
 *                    exist`.
 *   area-parcels.js  all 7 routes query a table literally named `parcels`, which
 *                    exists in neither `public` nor any surveyor_* schema.
 *
 * The files stay on disk. To restore either, drop it from this set.
 *
 * Why not leave them mounted: each call cost a Postgres round-trip to return a
 * 500 whose body is the Postgres error text. That text is itself a small
 * disclosure -- it named columns and schemas to anyone who could reach the
 * endpoint. Unmounted, they return a plain 404.
 *
 * Note both are still called by the frontend (`stores/parcels.ts` via
 * `CadastralStandardView.vue`, and `services/areaParcels.ts`), so those callers
 * now see 404 instead of 500. Both already treat failure as "no data" rather
 * than crashing.
 *
 * The live parcel model is the 27-column per-surveyor `land_parcels` served by
 * landParcels.js. Rewriting parcels.js against it is a product decision -- it
 * means declaring that model canonical and rewiring the cadastral view -- so it
 * is tracked in CLAUDE.md rather than done here.
 */
const UNMOUNTED_ROUTES = new Set(['parcels.js', 'area-parcels.js'])

for (const file of routeFiles) {
  // Checked before the import so a dead module is never even evaluated.
  if (UNMOUNTED_ROUTES.has(file)) {
    app.log.warn(`⏭️  Skipping unmounted dead route: ${file}`)
    continue
  }

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