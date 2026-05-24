/// <reference path="../global.d.ts" />
'use strict'

import multer from 'multer'
import { parse } from 'csv-parse/sync'
import fp from 'fastify-plugin'
import PDFDocument from 'pdfkit'

// Will be initialized when needed
let toGeoJSON, DOMParser

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() })

/**
 * Field Data plugin for SurveyPro
 * Handles field book data import, management, and generation
 * 
 * @param {import('fastify').FastifyInstance} fastify
 */
async function fieldDataPlugin(fastify, opts) {
  // Get field data for a project
  fastify.get('/api/field-data/project/:projectId', async (request, reply) => {
    const { projectId } = request.params
    
    try {
      const result = await fastify.platformatic.entities.fieldData.find({
        where: {
          projectId: {
            eq: parseInt(projectId)
          }
        },
        orderBy: {
          field: 'point',
          direction: 'ASC'
        }
      })
      
      return result
    } catch (error) {
      fastify.log.error(error)
      reply.code(500).send({ error: 'Failed to fetch field data' })
    }
  })

  // Import field data from CSV
  fastify.post('/api/field-data/import', {
    preHandler: upload.single('file')
  }, async (request, reply) => {
    if (!request.file) {
      return reply.code(400).send({ error: 'No file uploaded' })
    }

    const projectId = parseInt(request.body.projectId)
    
    try {
      // Parse CSV file
      const records = parse(request.file.buffer, {
        columns: true,
        skip_empty_lines: true
      })

      // Transform and save records
      const fieldData = records.map(record => ({
        projectId,
        point: record.point,
        easting: parseFloat(record.easting),
        northing: parseFloat(record.northing),
        elevation: parseFloat(record.elevation),
        description: record.description || '',
        code: record.code || '',
        timestamp: new Date()
      }))

      // Save to database
      await fastify.platformatic.entities.fieldData.insert({
        fields: fieldData
      })

      return { message: 'Data imported successfully', count: fieldData.length }
    } catch (error) {
      fastify.log.error(error)
      reply.code(500).send({ error: 'Failed to import data' })
    }
  })

  // Get field data statistics
  fastify.get('/api/field-data/project/:projectId/stats', async (request, reply) => {
    const { projectId } = request.params

    try {
      const result = await fastify.platformatic.db.query(
        `SELECT 
          COUNT(*) as total_points,
          MIN(elevation) as min_elevation,
          MAX(elevation) as max_elevation,
          AVG(elevation) as avg_elevation
        FROM field_data 
        WHERE project_id = $1`,
        [projectId]
      )

      return result.rows[0]
    } catch (error) {
      fastify.log.error(error)
      reply.code(500).send({ error: 'Failed to fetch statistics' })
    }
  })

  // Helper function to generate PDF
  async function generatePdf(fieldBook) {
    // Lazy load the required modules
    if (!DOMParser) {
      const xmldom = await import('xmldom')
      DOMParser = xmldom.DOMParser
    }
    
    return new Promise((resolve) => {
      const doc = new PDFDocument()
      const buffers = []
      
      // Collect PDF data
      doc.on('data', buffers.push.bind(buffers))
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers)
        resolve(pdfData)
      })

      // Set up document
      doc.fontSize(16).font('Helvetica-Bold')
         .text(fieldBook.cover.title, { align: 'center', underline: true })
         .moveDown(2)
      
      // Add surveyor info
      doc.fontSize(12).font('Helvetica')
         .text(`Land Surveyor: ${fieldBook.cover.surveyor}`)
         .moveDown(2)
         
      // Add survey details
      doc.text(`Survey of: ${fieldBook.cover.surveyOf}`)
         .moveDown(2)
         .text(`Surveyed in: ${fieldBook.cover.surveyDate}`)
         .moveDown(2)
      
      // Add instruments
      doc.text('Instruments:')
      fieldBook.cover.instruments.forEach(instrument => {
        doc.moveDown(0.5)
           .text(`• ${instrument.name}`)
           .text(`  ${instrument.base}`)
           .text(`  ${instrument.rover}`)
      })
      
      doc.moveDown(2)
         .text('Address:')
         .text(fieldBook.cover.address.replace(/\n/g, '\n  '))
      
      // Add survey data table
      doc.addPage()
         .font('Helvetica-Bold')
         .fontSize(14)
         .text('SURVEY DATA', { align: 'center' })
         .moveDown(1)
      
      // Table headers
      const headers = ['Point', 'Northing', 'Easting', 'Elevation', 'Description']
      const columnWidth = doc.page.width / headers.length - 10
      let y = doc.y
      
      doc.font('Helvetica-Bold')
      headers.forEach((header, i) => {
        doc.text(header, 50 + (i * columnWidth), y, { width: columnWidth })
      })
      
      // Table rows
      doc.font('Helvetica')
      y += 20
      fieldBook.surveyData.forEach((row) => {
        if (y > doc.page.height - 50) {
          doc.addPage()
          y = 50
        }
        
        const values = [
          row.point || '',
          row.northing ? row.northing.toFixed(3) : '',
          row.easting ? row.easting.toFixed(3) : '',
          row.elevation ? row.elevation.toFixed(3) : '',
          row.description || ''
        ]
        
        values.forEach((value, i) => {
          doc.text(value, 50 + (i * columnWidth), y, { width: columnWidth })
        })
        
        y += 20
      })
      
      doc.end()
    })
  }

  // Helper function to generate GeoJSON
  async function generateGeoJson(surveyData) {
    // Lazy load the required modules
    if (!toGeoJSON) {
      const togeojson = (await import('@mapbox/togeojson')).default
      toGeoJSON = togeojson.toGeoJSON
    }
    
    const features = surveyData
      .filter(point => point.easting && point.northing)
      .map(point => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [parseFloat(point.easting), parseFloat(point.northing)]
        },
        properties: {
          point: point.point,
          elevation: point.elevation,
          description: point.description || ''
        }
      }))

    return {
      type: 'FeatureCollection',
      name: 'Survey Points',
      crs: {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:EPSG::20936' } // UTM36S for Zimbabwe
      },
      features: features
    }
  }

  // Generate Field Book endpoint
  fastify.get('/api/field-data/generate-field-book/:projectId', async (request, reply) => {
    const { projectId } = request.params
    const { format = 'json' } = request.query
    
    try {
      // Get project details
      const project = await fastify.platformatic.entities.project.find({ 
        where: { id: { eq: parseInt(projectId) } } 
      })
      
      if (!project || project.length === 0) {
        return reply.code(404).send({ error: 'Project not found' })
      }

      // Get survey data for the project
      const surveyData = await fastify.platformatic.entities.fieldData.find({
        where: { projectId: { eq: parseInt(projectId) } },
        orderBy: { field: 'point', direction: 'ASC' }
      })

      // Create field book content
      const fieldBook = {
        cover: {
          title: 'ELECTRONIC FIELD BOOK',
          surveyor: 'O Saunyama',
          surveyOf: 'STANDS 2283-2498, 2500-2523, 2829-2833, 2835-2836 MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A, SHABANI DISTRICT',
          surveyDate: 'February 2021',
          instruments: [
            {
              name: 'Trimble R6 GNSS Set',
              base: 'Base Serial Number S/N 5016424521',
              rover: 'Rover Serial Number S/N 5146476624'
            }
          ],
          address: 'BOX A1262\nAVONDALE\nHARARE'
        },
        surveyData: surveyData
      }

      // Return in requested format
      switch (format.toLowerCase()) {
        case 'pdf':
          const pdfBuffer = await generatePdf(fieldBook)
          reply.header('Content-Type', 'application/pdf')
               .header('Content-Disposition', `attachment; filename="field-book-${projectId}.pdf"`)
          return pdfBuffer

        case 'geojson':
          const geoJson = await generateGeoJson(surveyData)
          reply.header('Content-Type', 'application/geo+json')
               .header('Content-Disposition', `attachment; filename="survey-points-${projectId}.geojson"`)
          return geoJson

        default:
          return fieldBook
      }
      
    } catch (error) {
      fastify.log.error(error)
      reply.code(500).send({ error: 'Failed to generate field book' })
    }
  })
}

export default fp(fieldDataPlugin)
