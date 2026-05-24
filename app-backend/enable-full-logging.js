// Full logging configuration for backend debugging
// This will create a detailed log file with all requests and errors

import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import { config } from 'dotenv'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'
import pool from './src/config/db.js'
import fs from 'fs'
import { createWriteStream } from 'fs'

// Load environment variables
config()

// Create log file stream
const logStream = createWriteStream('./backend-full.log', { flags: 'a' })

// Custom logger that writes to both console and file
const customLogger = {
  level: 'debug',
  stream: logStream,
  serializers: {
    req(request) {
      return {
        method: request.method,
        url: request.url,
        headers: request.headers,
        hostname: request.hostname,
        remoteAddress: request.ip,
        remotePort: request.socket?.remotePort
      }
    },
    res(reply) {
      return {
        statusCode: reply.statusCode
      }
    },
    err(error) {
      return {
        type: error.constructor.name,
        message: error.message,
        stack: error.stack
      }
    }
  }
}

// Create Fastify instance with enhanced logging
const app = Fastify({
  logger: customLogger,
  trustProxy: true,
  bodyLimit: 10 * 1024 * 1024 // 10MB limit for JSON bodies
})

// Log all requests
app.addHook('onRequest', async (request, reply) => {
  const logMessage = `\n${'='.repeat(80)}\n[${new Date().toISOString()}] ${request.method} ${request.url}\n${'='.repeat(80)}\n`
  console.log(logMessage)
  logStream.write(logMessage)
})

// Log all responses
app.addHook('onResponse', async (request, reply) => {
  const logMessage = `[${new Date().toISOString()}] Response: ${reply.statusCode} for ${request.method} ${request.url}\n`
  console.log(logMessage)
  logStream.write(logMessage)
})

// Log all errors
app.addHook('onError', async (request, reply, error) => {
  const logMessage = `[${new Date().toISOString()}] ❌ ERROR in ${request.method} ${request.url}\n` +
    `Error: ${error.message}\n` +
    `Stack: ${error.stack}\n` +
    `${'='.repeat(80)}\n`
  console.error(logMessage)
  logStream.write(logMessage)
})

// Register plugins
await app.register(cors, { 
  origin: true,
  credentials: true
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

// Register fs for file operations
import fsPromises from 'fs/promises'
app.decorate('fs', fsPromises)

// Add authentication decorator with enhanced logging
app.decorate('authenticate', async (request, reply) => {
  try {
    const logMsg = `[AUTH] 🔐 Verifying JWT for ${request.method} ${request.url}\n`
    console.log(logMsg)
    logStream.write(logMsg)
    
    await request.jwtVerify()
    
    const successMsg = `[AUTH] ✅ JWT verified for user: ${request.user?.id}\n`
    console.log(successMsg)
    logStream.write(successMsg)
  } catch (err) {
    const errorMsg = `[AUTH] ❌ JWT verification failed for ${request.method} ${request.url}\n` +
      `[AUTH] Error: ${err.message}\n`
    console.log(errorMsg)
    logStream.write(errorMsg)
    reply.code(401).send({ error: 'Unauthorized' })
  }
})

// Load routes
const __dirname = dirname(fileURLToPath(import.meta.url))
const routesDir = join(__dirname, 'src', 'routes')

// Auto-load all route files
const routeFiles = await fsPromises.readdir(routesDir)
  .then(files => files.filter(f => f.endsWith('.js')))

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
    } else if (routeName === 'area-parcels') {
      app.register(route.default, { prefix: '/api/area-parcels' })
      app.log.info(`✅ Registered route: /api/area-parcels (${file})`)
    } else if (routeName === 'parcels') {
      app.register(route.default, { prefix: '/api/parcels' })
      app.log.info(`✅ Registered route: /api/parcels (${file})`)
    } else if (routeName === 'survey-projects') {
      app.register(route.default, { prefix: '/api/survey-projects' })
      app.log.info(`✅ Registered route: /api/survey-projects (${file})`)
    } else if (routeName === 'csvImports') {
      app.register(route.default, { prefix: '/api' })
      app.log.info(`✅ Registered route: /api/csv-imports (${file})`)
    } else if (routeName === 'coordinatePoints') {
      app.register(route.default, { prefix: '/api' })
      app.log.info(`✅ Registered route: /api/coordinate-points (${file})`)
    } else {
      app.register(route.default, { prefix: '/api' })
      app.log.info(`✅ Registered route: /api/${routeName} (${file})`)
    }
  } catch (err) {
    app.log.error(`❌ Failed to load route ${file}: ${err.message}`)
  }
}

// Start server
const start = async () => {
  try {
    const port = process.env.PORT || 3050
    await app.listen({ port, host: '0.0.0.0' })
    const startMsg = `\n${'='.repeat(80)}\n🚀 Server started at ${new Date().toISOString()}\n` +
      `📡 Listening on http://localhost:${port}\n` +
      `📝 Full logs being written to: backend-full.log\n` +
      `${'='.repeat(80)}\n`
    console.log(startMsg)
    logStream.write(startMsg)
  } catch (err) {
    const errorMsg = `❌ Server failed to start: ${err.message}\n${err.stack}\n`
    console.error(errorMsg)
    logStream.write(errorMsg)
    process.exit(1)
  }
}

start()
