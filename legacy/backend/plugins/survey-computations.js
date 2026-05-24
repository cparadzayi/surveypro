/// <reference path="../global.d.ts" />

import fp from 'fastify-plugin'

/**
 * Survey computations plugin
 * Provides COGO (Coordinate Geometry) calculations
 *
 * @param {import('fastify').FastifyInstance} app
 */
async function surveyComputationsPlugin(app, opts) {
  
  // Helper functions for survey calculations
  const surveyCalc = {
    // Calculate distance between two points
    distance(x1, y1, x2, y2) {
      return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))
    },

    // Calculate bearing from point 1 to point 2 (in degrees)
    bearing(x1, y1, x2, y2) {
      const dx = x2 - x1
      const dy = y2 - y1
      let bearing = Math.atan2(dx, dy) * (180 / Math.PI)
      if (bearing < 0) bearing += 360
      return bearing
    },

    // Calculate coordinates from starting point, distance, and bearing
    coordinate(x, y, distance, bearing) {
      const bearingRad = bearing * (Math.PI / 180)
      const newX = x + distance * Math.sin(bearingRad)
      const newY = y + distance * Math.cos(bearingRad)
      return { x: newX, y: newY }
    },

    // Calculate area of polygon using shoelace formula
    polygonArea(points) {
      let area = 0
      const n = points.length
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        area += points[i].x * points[j].y
        area -= points[j].x * points[i].y
      }
      return Math.abs(area / 2)
    },

    // Traverse closure calculation
    traverseClosure(courses) {
      let totalNorthing = 0
      let totalEasting = 0
      let perimeter = 0

      courses.forEach(course => {
        const bearingRad = course.bearing * (Math.PI / 180)
        const northing = course.distance * Math.cos(bearingRad)
        const easting = course.distance * Math.sin(bearingRad)
        totalNorthing += northing
        totalEasting += easting
        perimeter += course.distance
      })

      const misclosure = Math.sqrt(Math.pow(totalNorthing, 2) + Math.pow(totalEasting, 2))
      const precision = perimeter > 0 ? perimeter / misclosure : 0

      return {
        northing_error: totalNorthing,
        easting_error: totalEasting,
        misclosure: misclosure,
        precision: precision,
        perimeter: perimeter
      }
    }
  }

  // COGO - Inverse calculation (distance and bearing between two points)
  app.post('/computations/inverse', {
    onRequest: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (err) {
        reply.code(401).send({ error: 'Unauthorized' })
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['point1', 'point2', 'project_id'],
        properties: {
          project_id: { type: 'number' },
          point1: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } }
          },
          point2: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { point1, point2, project_id } = request.body

    const distance = surveyCalc.distance(point1.x, point1.y, point2.x, point2.y)
    const bearing = surveyCalc.bearing(point1.x, point1.y, point2.x, point2.y)

    const result = { distance, bearing }

    // Save computation
    await app.platformatic.entities.computation.save({
      input: {
        project_id,
        computation_type: 'distance',
        input_data: { point1, point2 },
        result_data: result,
        created_by: request.user.id
      }
    })

    reply.send(result)
  })

  // COGO - Forward calculation (calculate coordinates from bearing and distance)
  app.post('/computations/forward', {
    onRequest: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (err) {
        reply.code(401).send({ error: 'Unauthorized' })
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['start_point', 'distance', 'bearing', 'project_id'],
        properties: {
          project_id: { type: 'number' },
          start_point: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } }
          },
          distance: { type: 'number' },
          bearing: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    const { start_point, distance, bearing, project_id } = request.body

    const result = surveyCalc.coordinate(start_point.x, start_point.y, distance, bearing)

    // Save computation
    await app.platformatic.entities.computation.save({
      input: {
        project_id,
        computation_type: 'bearing',
        input_data: { start_point, distance, bearing },
        result_data: result,
        created_by: request.user.id
      }
    })

    reply.send(result)
  })

  // Calculate polygon area
  app.post('/computations/area', {
    onRequest: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (err) {
        reply.code(401).send({ error: 'Unauthorized' })
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['points', 'project_id'],
        properties: {
          project_id: { type: 'number' },
          points: {
            type: 'array',
            items: {
              type: 'object',
              properties: { x: { type: 'number' }, y: { type: 'number' } }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { points, project_id } = request.body

    if (points.length < 3) {
      return reply.code(400).send({ error: 'At least 3 points required for area calculation' })
    }

    const area = surveyCalc.polygonArea(points)
    const result = { area, unit: 'square_meters' }

    // Save computation
    await app.platformatic.entities.computation.save({
      input: {
        project_id,
        computation_type: 'area',
        input_data: { points },
        result_data: result,
        created_by: request.user.id
      }
    })

    reply.send(result)
  })

  // Traverse closure calculation
  app.post('/computations/traverse', {
    onRequest: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (err) {
        reply.code(401).send({ error: 'Unauthorized' })
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['courses', 'project_id'],
        properties: {
          project_id: { type: 'number' },
          courses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                bearing: { type: 'number' },
                distance: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { courses, project_id } = request.body

    const result = surveyCalc.traverseClosure(courses)

    // Save computation
    await app.platformatic.entities.computation.save({
      input: {
        project_id,
        computation_type: 'traverse',
        input_data: { courses },
        result_data: result,
        created_by: request.user.id
      }
    })

    reply.send(result)
  })

  // Get computation history for a project
  app.get('/computations/history/:projectId', {
    onRequest: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (err) {
        reply.code(401).send({ error: 'Unauthorized' })
      }
    },
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const projectId = parseInt(request.params.projectId)

    const computations = await app.platformatic.entities.computation.find({
      where: { project_id: { eq: projectId } },
      orderBy: [{ field: 'created_at', direction: 'DESC' }],
      limit: 100
    })

    reply.send(computations)
  })
}

// Export with fastify-plugin
export default fp(surveyComputationsPlugin)
