import fp from 'fastify-plugin';
import {
  geodeticToGrid,
  gridToGeodetic,
  formatCoordinatesWithPrecision,
  findCentralMeridian
} from '../utils/coordinateSystem.js';

async function coordinateSystemPlugin(fastify, options) {
  // Lightweight health endpoint (fallback if separate health plugin not loaded)
  fastify.get('/api/health', async () => {
    let dbOk = false
    try {
      await fastify.platformatic.db.query('SELECT 1')
      dbOk = true
    } catch {}
    const entities = fastify.platformatic && fastify.platformatic.entities ? Object.keys(fastify.platformatic.entities) : []
    return { status: 'ok', db: dbOk ? 'up' : 'down', entities }
  })
  // Convert geodetic to grid coordinates
  fastify.post('/api/coordinates/geodetic-to-grid', {
    schema: {
      body: {
        type: 'object',
        required: ['lat', 'lon'],
        properties: {
          lat: { type: 'number', minimum: -90, maximum: 90 },
          lon: { type: 'number', minimum: -180, maximum: 180 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { lat, lon } = request.body;
      const result = geodeticToGrid(lat, lon);
      return { 
        success: true, 
        data: {
          ...result,
          lat,
          lon
        }
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Convert grid to geodetic coordinates
  fastify.post('/api/coordinates/grid-to-geodetic', {
    schema: {
      body: {
        type: 'object',
        required: ['y', 'x', 'centralMeridian'],
        properties: {
          y: { type: 'number' },
          x: { type: 'number' },
          centralMeridian: { type: 'number', enum: [25, 27, 29, 31, 33] }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { y, x, centralMeridian } = request.body;
      const result = gridToGeodetic(y, x, centralMeridian);
      return { 
        success: true, 
        data: {
          ...result,
          y,
          x,
          centralMeridian
        }
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Format coordinates with automatic precision based on distance
  fastify.post('/api/coordinates/format-with-precision', {
    schema: {
      body: {
        type: 'object',
        required: ['point1', 'point2'],
        properties: {
          point1: {
            type: 'object',
            required: ['lat', 'lon'],
            properties: {
              lat: { type: 'number', minimum: -90, maximum: 90 },
              lon: { type: 'number', minimum: -180, maximum: 180 }
            }
          },
          point2: {
            type: 'object',
            required: ['lat', 'lon'],
            properties: {
              lat: { type: 'number', minimum: -90, maximum: 90 },
              lon: { type: 'number', minimum: -180, maximum: 180 }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { point1, point2 } = request.body;
      const result = formatCoordinatesWithPrecision(
        point1.lat, point1.lon,
        point2.lat, point2.lon
      );
      return { success: true, data: result };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });
}

export default fp(coordinateSystemPlugin, {
  name: 'coordinate-api',
  dependencies: []
});
