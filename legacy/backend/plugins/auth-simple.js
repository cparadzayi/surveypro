/// <reference path="../global.d.ts" />

import bcrypt from 'bcrypt'
import sql from '@databases/sql'
import fp from 'fastify-plugin'

/**
 * Simple Authentication plugin for SurveyPro
 * Uses @databases/sql for Platformatic DB compatibility
 */
async function authSimplePlugin(app) {
  // Register JWT
  await app.register(import('@fastify/jwt'), {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-this-in-production'
  })

  // Register route for user registration
  app.post('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password', 'first_name', 'last_name'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          first_name: { type: 'string', minLength: 1 },
          last_name: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password, first_name, last_name } = request.body

    try {
      // Check if user already exists
      const existingUser = await app.platformatic.db.query(
        sql`SELECT id FROM users WHERE email = ${email}`
      )

      if (existingUser.length > 0) {
        return reply.code(409).send({ error: 'User already exists' })
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, 10)

      // Create user using @databases/sql
      const userResult = await app.platformatic.db.query(
        sql`INSERT INTO users (email, password_hash, first_name, last_name, role) 
            VALUES (${email}, ${password_hash}, ${first_name}, ${last_name}, ${'user'}) 
            RETURNING id, email, first_name, last_name, role, created_at`
      )

      const user = userResult[0]

      // Generate JWT token
      const token = app.jwt.sign({ 
        id: user.id, 
        email: user.email, 
        role: user.role 
      })

      reply.code(201).send({
        message: 'User registered successfully',
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role
        },
        token
      })
    } catch (error) {
      app.log.error(error)
      reply.code(500).send({ error: 'Registration failed' })
    }
  })

  // Login route
  app.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body

    try {
      // Find user using @databases/sql
      const userResult = await app.platformatic.db.query(
        sql`SELECT id, email, password_hash, first_name, last_name, role 
            FROM users 
            WHERE email = ${email}`
      )

      if (userResult.length === 0) {
        return reply.code(401).send({ error: 'Invalid credentials' })
      }

      const user = userResult[0]

      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash)
      if (!isValid) {
        return reply.code(401).send({ error: 'Invalid credentials' })
      }

      // Generate JWT token
      const token = app.jwt.sign({ 
        id: user.id, 
        email: user.email, 
        role: user.role 
      })

      reply.send({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role
        },
        token
      })
    } catch (error) {
      app.log.error(error)
      reply.code(500).send({ error: 'Login failed' })
    }
  })

  // Get current user profile
  app.get('/auth/me', {
    onRequest: async function (request, reply) {
      try {
        await request.jwtVerify()
      } catch (err) {
        reply.send(err)
      }
    }
  }, async (request) => {
    // Get fresh user data from database
    const userResult = await app.platformatic.db.query(
      sql`SELECT id, email, first_name, last_name, role, created_at, updated_at 
          FROM users 
          WHERE id = ${request.user.id}`
    )

    if (userResult.length === 0) {
      throw new Error('User not found')
    }

    return {
      user: userResult[0]
    }
  })

  // Test endpoint
  app.get('/auth/test', async () => {
    return { message: 'Auth plugin loaded successfully' }
  })
}

export default fp(authSimplePlugin)