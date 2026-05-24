import os from 'os'
import path from 'path'

/**
 * System utility routes
 * Provides system information for the frontend
 */
export default async function systemRoutes(fastify, options) {
  /**
   * GET /system/info
   * Returns system information including home directory
   */
  fastify.get('/system/info', async (request, reply) => {
    try {
      const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir()
      
      return {
        ok: true,
        system: {
          homeDirectory: homeDir,
          platform: os.platform(),
          pathSeparator: path.sep
        }
      }
    } catch (error) {
      fastify.log.error('Error getting system info:', error)
      return reply.code(500).send({
        ok: false,
        error: 'Failed to get system information'
      })
    }
  })

  /**
   * POST /system/resolve-path
   * Resolves a relative path to absolute
   */
  fastify.post('/system/resolve-path', async (request, reply) => {
    try {
      const { path: relativePath } = request.body

      if (!relativePath) {
        return reply.code(400).send({
          ok: false,
          error: 'Path is required'
        })
      }

      // If already absolute, return as-is
      if (path.isAbsolute(relativePath)) {
        return {
          ok: true,
          absolutePath: relativePath,
          isRelative: false
        }
      }

      // Resolve from home directory
      const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir()
      const absolutePath = path.join(homeDir, relativePath)

      return {
        ok: true,
        absolutePath,
        isRelative: true,
        homeDirectory: homeDir
      }
    } catch (error) {
      fastify.log.error('Error resolving path:', error)
      return reply.code(500).send({
        ok: false,
        error: 'Failed to resolve path'
      })
    }
  })
}
