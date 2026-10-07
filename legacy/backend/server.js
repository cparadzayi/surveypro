import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import pg from 'pg'

const { Pool } = pg

// Create Fastify instance
const fastify = Fastify({ 
  logger: { 
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  } 
})

// Database connection
// Fail closed: this file previously fell back to a hardcoded, committed
// password, so a missing DATABASE_URL silently connected with a leaked secret
// instead of surfacing the misconfiguration.
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required (legacy backend is retired; migrate to app-backend)')
}
const db = new Pool({
  connectionString: process.env.DATABASE_URL
})

// Add database to fastify instance
fastify.decorate('db', db)

// Platformatic DB compatible query interface
fastify.decorate('platformatic', {
  db: {
    query: async (sqlQuery) => {
      const client = await db.connect()
      try {
        // Handle @databases/sql template queries
        if (sqlQuery && sqlQuery.text && sqlQuery.values) {
          const result = await client.query(sqlQuery.text, sqlQuery.values)
          return result.rows
        }
        // Handle raw string queries (fallback)
        const result = await client.query(sqlQuery)
        return result.rows
      } finally {
        client.release()
      }
    }
  }
})

async function startServer() {
  try {
    // Register core plugins
    await fastify.register(cors, {
      origin: true,
      credentials: true
    })

    await fastify.register(jwt, {
      secret: process.env.JWT_SECRET || 'surveypro-development-secret-key-2024'
    })

    await fastify.register(multipart)

    // Register custom plugins
    await fastify.register(import('./plugins/auth-simple.js'))
    await fastify.register(import('./plugins/projects.js'))
    await fastify.register(import('./plugins/field-data-simple.js'))
    
    console.log('✅ All plugins registered successfully')

    // Start the server
    const address = await fastify.listen({ port: 3042, host: '0.0.0.0' })
    console.log(`🚀 Server running on ${address}`)
  } catch (error) {
    console.error('❌ Server startup failed:', error)
    console.error(error.stack)
    process.exit(1)
  }
}

// Start the server
startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});
