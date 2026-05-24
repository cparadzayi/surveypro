import fp from 'fastify-plugin'
import bcrypt from 'bcrypt'
import fastifyJwt from '@fastify/jwt'

const SALT_ROUNDS = 10

async function authPlugin(app) {
  // Register JWT plugin early with static import
  app.register(fastifyJwt, { secret: process.env.JWT_SECRET || 'dev-insecure' })

  // Decorator for auth
  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  // Helper to resolve entity (user vs users) depending on mapper naming
  function getUsersEntity() {
    return app.platformatic.entities.user || app.platformatic.entities.users
  }

  // Register
  app.post('/api/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body
    const users = getUsersEntity()
    if (!users) {
      reply.code(500)
      return { error: 'Users entity not available' }
    }
    const existingArr = await users.find({ where: { email: { eq: email } }, limit: 1 })
    const existing = existingArr && existingArr.length ? existingArr[0] : null
    if (existing) {
      reply.code(409)
      return { error: 'Email already registered' }
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS)
    const saved = await users.save({ input: { email, password_hash: hash } })
    reply.code(201).send({ id: saved.id, email: saved.email })
  })

  // Login
  app.post('/api/auth/login', {
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
    const users = getUsersEntity()
    if (!users) {
      reply.code(500)
      return { error: 'Users entity not available' }
    }
    const found = await users.find({ where: { email: { eq: email } }, limit: 1 })
    const user = found && found.length ? found[0] : null
    if (!user) {
      reply.code(401)
      return { error: 'Invalid credentials' }
    }
    const storedHash = user.password_hash || user.passwordHash
    if (!storedHash) {
      reply.code(500)
      return { error: 'Password hash missing for user record' }
    }
    const ok = await bcrypt.compare(password, storedHash)
    if (!ok) {
      reply.code(401)
      return { error: 'Invalid credentials' }
    }
    const token = app.jwt.sign({ sub: user.id, email: user.email })
    reply.send({ token, user: { id: user.id, email: user.email } })
  })

  // Current user
  app.get('/api/auth/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const users = getUsersEntity()
    if (!users) {
      reply.code(500)
      return { error: 'Users entity not available' }
    }
    const found = await users.find({ where: { id: { eq: request.user.sub } }, limit: 1 })
    const user = found && found.length ? found[0] : null
    if (!user) return { error: 'User not found' }
    return { id: user.id, email: user.email, created_at: user.created_at }
  })
}

export default fp(authPlugin, { name: 'auth' })
