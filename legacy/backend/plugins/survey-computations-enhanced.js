/// <reference path="../global.d.ts" />

import fp from 'fastify-plugin'
import { geodeticToGrid, gridToGeodetic } from '../utils/coordinateSystem.js'

/**
 * Enhanced Survey computations plugin for SurveyPro
 * Provides COGO (Coordinate Geometry) calculations with Zimbabwe cadastral support
 *
 * @param {import('fastify').FastifyInstance} app
 */
async function surveyComputationsPlugin(app, opts) {
  
  // Auth removed for MVP – all endpoints open

  // Helper functions for survey calculations
  const surveyCalc = {
    // Calculate distance between two points (P(Y,X) format)
    distance(y1, x1, y2, x2) {
      return Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2))
    },

    // Calculate bearing from point 1 to point 2 (in degrees) - Zimbabwe P(Y,X)
    bearing(y1, x1, y2, x2) {
      const dy = y2 - y1  // Westing difference
      const dx = x2 - x1  // Southing difference
      let bearing = Math.atan2(dy, dx) * (180 / Math.PI)
      
      // Convert to surveyor's bearing (0-360 from North clockwise)
      bearing = 90 - bearing
      if (bearing < 0) bearing += 360
      if (bearing >= 360) bearing -= 360
      
      return bearing
    },

    // Calculate coordinates from starting point, distance, and bearing
    coordinate(y, x, distance, bearing) {
      const bearingRad = bearing * (Math.PI / 180)
      const newY = y + distance * Math.sin(bearingRad)  // Westing
      const newX = x + distance * Math.cos(bearingRad)  // Southing
      return { y: newY, x: newX }
    },

    // Calculate area of polygon using shoelace formula (P(Y,X) format)
    polygonArea(points) {
      let area = 0
      const n = points.length
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        area += points[i].y * points[j].x
        area -= points[j].y * points[i].x
      }
      return Math.abs(area / 2)
    },

    // Traverse closure calculation
    traverseClosure(courses) {
      let totalWesting = 0  // Y coordinate
      let totalSouthing = 0 // X coordinate
      let perimeter = 0

      courses.forEach(course => {
        const bearingRad = course.bearing * (Math.PI / 180)
        const westing = course.distance * Math.sin(bearingRad)
        const southing = course.distance * Math.cos(bearingRad)
        totalWesting += westing
        totalSouthing += southing
        perimeter += course.distance
      })

      const misclosure = Math.sqrt(Math.pow(totalWesting, 2) + Math.pow(totalSouthing, 2))
      const precision = perimeter > 0 ? perimeter / misclosure : 0

      return {
        westing_error: totalWesting,
        southing_error: totalSouthing,
        misclosure: misclosure,
        precision: precision,
        perimeter: perimeter,
        relative_accuracy: precision > 0 ? `1:${Math.round(precision)}` : 'N/A'
      }
    },

    // Stand area calculation with proper cadastral coordinates
    standAreaCalculation(boundaryPoints) {
      if (boundaryPoints.length < 3) {
        throw new Error('At least 3 points required for area calculation')
      }

      const area = this.polygonArea(boundaryPoints)
      
      // Calculate perimeter
      let perimeter = 0
      for (let i = 0; i < boundaryPoints.length; i++) {
        const j = (i + 1) % boundaryPoints.length
        perimeter += this.distance(
          boundaryPoints[i].y, boundaryPoints[i].x,
          boundaryPoints[j].y, boundaryPoints[j].x
        )
      }

      return {
        area_square_meters: area,
        area_hectares: area / 10000,
        perimeter: perimeter,
        boundary_coordinates: boundaryPoints
      }
    }
  }

  // Enhanced inverse calculation with field book integration
  app.post('/api/computations/inverse', {
    schema: {
      body: {
        type: 'object',
        required: ['project_id'],
        properties: {
          project_id: { type: 'number' },
          point1: {
            oneOf: [
              { type: 'string' }, // Point name from field book
              { 
                type: 'object',
                properties: { 
                  y: { type: 'number' }, 
                  x: { type: 'number' } 
                }
              }
            ]
          },
          point2: {
            oneOf: [
              { type: 'string' }, // Point name from field book
              { 
                type: 'object',
                properties: { 
                  y: { type: 'number' }, 
                  x: { type: 'number' } 
                }
              }
            ]
          }
        }
      }
    }
  }, async (request, reply) => {
    const { point1, point2, project_id } = request.body

    try {
      let coord1, coord2

      // Resolve point coordinates from field book if needed
      if (typeof point1 === 'string') {
        const result = await app.platformatic.db.query(
          'SELECT y_coordinate, x_coordinate FROM field_book_entries WHERE project_id = $1 AND point = $2',
          [project_id, point1]
        )
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: `Point ${point1} not found in field book` })
        }
        coord1 = { y: result.rows[0].y_coordinate, x: result.rows[0].x_coordinate }
      } else {
        coord1 = point1
      }

      if (typeof point2 === 'string') {
        const result = await app.platformatic.db.query(
          'SELECT y_coordinate, x_coordinate FROM field_book_entries WHERE project_id = $1 AND point = $2',
          [project_id, point2]
        )
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: `Point ${point2} not found in field book` })
        }
        coord2 = { y: result.rows[0].y_coordinate, x: result.rows[0].x_coordinate }
      } else {
        coord2 = point2
      }

      const distance = surveyCalc.distance(coord1.y, coord1.x, coord2.y, coord2.x)
      const bearing = surveyCalc.bearing(coord1.y, coord1.x, coord2.y, coord2.x)

      // Convert bearing to DMS format
      const bearingDMS = degreesToDMS(bearing)

      const result = { 
        distance: parseFloat(distance.toFixed(3)),
        bearing: parseFloat(bearing.toFixed(6)),
        bearing_dms: bearingDMS,
        point1: typeof point1 === 'string' ? point1 : 'Coordinate',
        point2: typeof point2 === 'string' ? point2 : 'Coordinate',
        coordinate1: coord1,
        coordinate2: coord2
      }

      // Save computation to database
      await saveComputation(app, project_id, 'inverse', {
        calculation_data: result,
        input_points: { point1, point2 }
      })

      reply.send(result)
    } catch (error) {
      app.log.error(error)
      reply.code(500).send({ error: 'Failed to perform inverse calculation' })
    }
  })

  // Enhanced forward calculation
  app.post('/api/computations/forward', {
    schema: {
      body: {
        type: 'object',
        required: ['start_point', 'distance', 'bearing', 'project_id'],
        properties: {
          project_id: { type: 'number' },
          start_point: {
            oneOf: [
              { type: 'string' },
              { 
                type: 'object',
                properties: { y: { type: 'number' }, x: { type: 'number' } }
              }
            ]
          },
          distance: { type: 'number' },
          bearing: { type: 'number' },
          new_point_name: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { start_point, distance, bearing, project_id, new_point_name } = request.body

    try {
      let startCoord

      // Resolve start point coordinates
      if (typeof start_point === 'string') {
        const fbe = app.platformatic.entities.field_book_entries
        const result = await fbe.findOne({ where: { project_id: { eq: project_id }, point: { eq: start_point } } })
        if (!result) {
          return reply.code(404).send({ error: `Point ${start_point} not found in field book` })
        }
        startCoord = { y: result.y_coordinate, x: result.x_coordinate }
      } else {
        startCoord = start_point
      }

      const newCoord = surveyCalc.coordinate(startCoord.y, startCoord.x, distance, bearing)

      const result = {
        start_point: typeof start_point === 'string' ? start_point : 'Coordinate',
        start_coordinate: startCoord,
        distance: distance,
        bearing: bearing,
        bearing_dms: degreesToDMS(bearing),
        new_coordinate: {
          y: parseFloat(newCoord.y.toFixed(3)),
          x: parseFloat(newCoord.x.toFixed(3))
        }
      }

      // If new point name provided, add to field book
      if (new_point_name) {
        // Get field book ID
        const efb = app.platformatic.entities.electronic_field_books
        const fbe = app.platformatic.entities.field_book_entries
        const fb = await efb.findOne({ where: { project_id: { eq: project_id } } })
        if (fb) {
          await fbe.save({ input: {
            project_id,
            field_book_id: fb.id,
            point: new_point_name,
            y_coordinate: newCoord.y,
            x_coordinate: newCoord.x,
            status: 'C',
            description: `Calculated from ${typeof start_point === 'string' ? start_point : 'coordinate'} bearing ${degreesToDMS(bearing)} distance ${distance}m`,
            survey_method: 'Calculation'
          } })
          result.added_to_field_book = new_point_name
        }
      }

      // Save computation
      await saveComputation(app, project_id, 'forward', {
        calculation_data: result,
        input_points: { start_point, distance, bearing }
      })

      reply.send(result)
    } catch (error) {
      app.log.error(error)
      reply.code(500).send({ error: 'Failed to perform forward calculation' })
    }
  })

  // Stand area calculation from field book points
  app.post('/api/computations/stand-area', {
    schema: {
      body: {
        type: 'object',
        required: ['project_id', 'boundary_points', 'stand_number'],
        properties: {
          project_id: { type: 'number' },
          stand_number: { type: 'string' },
          boundary_points: {
            type: 'array',
            items: { type: 'string' } // Point names from field book
          },
          property_description: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { project_id, boundary_points, stand_number, property_description } = request.body

    try {
      // Resolve all boundary point coordinates
      const coordinates = []
      for (const pointName of boundary_points) {
        const fbe = app.platformatic.entities.field_book_entries
        const result = await fbe.findOne({ where: { project_id: { eq: project_id }, point: { eq: pointName } } })
        if (!result) {
          return reply.code(404).send({ error: `Point ${pointName} not found in field book` })
        }
        coordinates.push({ point: pointName, y: result.y_coordinate, x: result.x_coordinate })
      }

      // Calculate area and perimeter
      const areaData = surveyCalc.standAreaCalculation(coordinates)

      // Get field book ID
      const efb = app.platformatic.entities.electronic_field_books
      const sc = app.platformatic.entities.stand_calculations
      const fb = await efb.findOne({ where: { project_id: { eq: project_id } } })

      const result = {
        stand_number,
        property_description: property_description || '',
        boundary_points: boundary_points,
        coordinates: coordinates,
        area_square_meters: areaData.area_square_meters,
        area_hectares: areaData.area_hectares,
        perimeter: areaData.perimeter,
        calculation_date: new Date().toISOString()
      }

      // Save to stand calculations table
      if (fb) {
        // Upsert simulation: try find existing
        const existing = await sc.findOne({ where: { project_id: { eq: project_id }, stand_number: { eq: stand_number } } })
        if (existing) {
          await sc.save({ input: { id: existing.id, project_id, field_book_id: fb.id, stand_number, property_description: property_description || '', area_hectares: areaData.area_hectares, area_square_meters: areaData.area_square_meters, perimeter: areaData.perimeter, boundary_coordinates: coordinates } })
        } else {
          await sc.save({ input: { project_id, field_book_id: fb.id, stand_number, property_description: property_description || '', area_hectares: areaData.area_hectares, area_square_meters: areaData.area_square_meters, perimeter: areaData.perimeter, boundary_coordinates: coordinates } })
        }
      }

      // Save computation record
      await saveComputation(app, project_id, 'area', {
        calculation_data: result,
        input_points: { boundary_points }
      })

      reply.send(result)
    } catch (error) {
      app.log.error(error)
      reply.code(500).send({ error: 'Failed to calculate stand area' })
    }
  })

  // Coordinate system transformation
  app.post('/api/computations/transform-coordinates', {
    schema: {
      body: {
        type: 'object',
        required: ['project_id', 'transformation_type'],
        properties: {
          project_id: { type: 'number' },
          transformation_type: { 
            type: 'string', 
            enum: ['geodetic_to_grid', 'grid_to_geodetic'] 
          },
          coordinates: {
            oneOf: [
              {
                type: 'object',
                properties: { lat: { type: 'number' }, lon: { type: 'number' } }
              },
              {
                type: 'object', 
                properties: { y: { type: 'number' }, x: { type: 'number' }, central_meridian: { type: 'number' } }
              }
            ]
          },
          point_name: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { project_id, transformation_type, coordinates, point_name } = request.body

    try {
      let result = {}

      if (transformation_type === 'geodetic_to_grid') {
        const gridCoords = geodeticToGrid(coordinates.lat, coordinates.lon)
        result = {
          input: coordinates,
          output: gridCoords,
          transformation: 'WGS84 to Zimbabwe Cadastral Grid'
        }
      } else if (transformation_type === 'grid_to_geodetic') {
        const geodeticCoords = gridToGeodetic(coordinates.y, coordinates.x, coordinates.central_meridian)
        result = {
          input: coordinates,
          output: geodeticCoords,
          transformation: 'Zimbabwe Cadastral Grid to WGS84'
        }
      }

      // Save computation
      await saveComputation(app, project_id, 'transformation', { calculation_data: result })

      reply.send(result)
    } catch (error) {
      app.log.error(error)
      reply.code(500).send({ error: 'Failed to transform coordinates' })
    }
  })

  // Get computation history with enhanced details
  app.get('/api/computations/history/:projectId', async (request, reply) => {
    const projectId = parseInt(request.params.projectId)

    try {
      const cse = app.platformatic.entities.calculation_sheets_enhanced
      const rows = await cse.find({ where: { project_id: { eq: projectId } }, orderBy: [{ field: 'created_at', direction: 'desc' }], limit: 100 })
      reply.send(rows)
    } catch (error) {
      app.log.error(error)
      reply.code(500).send({ error: 'Failed to fetch computation history' })
    }
  })

  // Get all stand calculations for a project
  app.get('/api/computations/stands/:projectId', async (request, reply) => {
    const projectId = parseInt(request.params.projectId)

    try {
      const sc = app.platformatic.entities.stand_calculations
      const rows = await sc.find({ where: { project_id: { eq: projectId } }, orderBy: [{ field: 'stand_number', direction: 'asc' }] })
      reply.send(rows)
    } catch (error) {
      app.log.error(error)
      reply.code(500).send({ error: 'Failed to fetch stand calculations' })
    }
  })

  // Helper function to convert decimal degrees to DMS
  function degreesToDMS(degrees) {
    const d = Math.floor(Math.abs(degrees))
    const minFloat = (Math.abs(degrees) - d) * 60
    const m = Math.floor(minFloat)
    const s = (minFloat - m) * 60
    
    return `${d}°${m}'${s.toFixed(1)}"`
  }

  // Helper: save computation using entities and auto-increment sheet_number
  async function saveComputation(app, project_id, sheet_type, { calculation_data, input_points }) {
    const efb = app.platformatic.entities.electronic_field_books
    const cse = app.platformatic.entities.calculation_sheets_enhanced
    const fb = await efb.findOne({ where: { project_id: { eq: project_id } } })
    if (!fb) return
    // Determine next sheet number
    const existing = await cse.find({ where: { field_book_id: { eq: fb.id } }, orderBy: [{ field: 'sheet_number', direction: 'desc' }], limit: 1 })
    const nextSheet = existing.length ? existing[0].sheet_number + 1 : 1
    await cse.save({ input: {
      project_id,
      field_book_id: fb.id,
      sheet_number: nextSheet,
      sheet_type,
      calculation_data,
      input_points: input_points || null
    } })
  }
}

// Export with fastify-plugin
export default fp(surveyComputationsPlugin, {
  name: 'survey-computations-enhanced'
})