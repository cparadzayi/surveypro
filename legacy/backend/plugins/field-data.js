/// <reference path="../global.d.ts" />
'use strict'

import multer from 'multer'
import { parse } from 'csv-parse/sync'
import fp from 'fastify-plugin'
import PDFDocument from 'pdfkit'

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
      const result = await fastify.platformatic.db.query(
        'SELECT * FROM field_data WHERE project_id = $1 ORDER BY point ASC',
        [parseInt(projectId)]
      )
      
      return result.rows
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
    if (!projectId) {
      return reply.code(400).send({ error: 'Project ID is required' })
    }

    try {
      // Parse CSV
      const fileContent = request.file.buffer.toString()
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      })

      // Transform and validate records
      const fieldData = records.map((record) => {
        // Handle different date formats
        let dateOfSurvey = null
        if (record['Date of survey'] || record['Date']) {
          const dateStr = record['Date of survey'] || record['Date']
          dateOfSurvey = new Date(dateStr).toISOString().split('T')[0]
        }

        return {
          projectId: projectId,
          point: record.Point || record.point || record.Name,
          y: parseFloat(record.Y || record.y),
          x: parseFloat(record.X || record.x),
          status: (record.Status || record.status || 'P').charAt(0).toUpperCase(),
          calcsPage: record['Calcs Page'] || record['Calcs'] ? parseInt(record['Calcs Page'] || record['Calcs']) : null,
          description: record.Description || record.description || null,
          dateOfSurvey: dateOfSurvey
        }
      })

      // Delete existing data for this project
      await fastify.platformatic.db.query(
        'DELETE FROM field_data WHERE project_id = $1',
        [projectId]
      )

      // Insert new data using raw SQL for better control
      for (const data of fieldData) {
        await fastify.platformatic.db.query(
          `INSERT INTO field_data 
           (project_id, point, y, x, status, calcs_page, description, date_of_survey)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            data.projectId,
            data.point,
            data.y,
            data.x,
            data.status,
            data.calcsPage,
            data.description,
            data.dateOfSurvey
          ]
        )
      }

      return { 
        message: 'Field data imported successfully', 
        count: fieldData.length 
      }
    } catch (error) {
      fastify.log.error(error)
      reply.code(500).send({ error: 'Failed to import field data', details: error.message })
    }
  })

  // Generate field book
  fastify.post('/api/field-book/generate', async (request, reply) => {
    const { projectId } = request.body

    if (!projectId) {
      return reply.code(400).send({ error: 'Project ID is required' })
    }

    try {
      // Get project data
      const projectResult = await fastify.platformatic.db.query(
        'SELECT * FROM projects WHERE id = $1',
        [projectId]
      )

      if (projectResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Project not found' })
      }

      // Get field data
      const fieldDataResult = await fastify.platformatic.db.query(
        'SELECT * FROM field_data WHERE project_id = $1 ORDER BY point',
        [projectId]
      )

      // Group into pages (20 entries per page)
      const entriesPerPage = 20
      const pages = []
      const fieldData = fieldDataResult.rows

      for (let i = 0; i < fieldData.length; i += entriesPerPage) {
        pages.push({
          pageNumber: Math.floor(i / entriesPerPage) + 1,
          entries: fieldData.slice(i, i + entriesPerPage)
        })
      }

      return {
        project: projectResult.rows[0],
        pages: pages,
        totalEntries: fieldData.length,
        totalPages: pages.length,
        generatedAt: new Date().toISOString()
      }
    } catch (error) {
      fastify.log.error(error)
      reply.code(500).send({ error: 'Failed to generate field book' })
    }
  })

  // Get statistics for field data
  fastify.get('/api/field-data/project/:projectId/stats', async (request, reply) => {
    const { projectId } = request.params

    try {
      const result = await fastify.platformatic.db.query(
        `SELECT 
          COUNT(*) as total_points,
          COUNT(CASE WHEN status = 'F' THEN 1 END) as found_monuments,
          COUNT(CASE WHEN status = 'P' THEN 1 END) as placed_monuments,
          MIN(date_of_survey) as earliest_survey,
          MAX(date_of_survey) as latest_survey
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
      const headers = ['Point', 'Y (Westing)', 'X (Southing)', 'Status', 'Calcs Page', 'Description', 'Date of Survey']
      const columnWidth = (doc.page.width - 100) / headers.length
      let yPos = doc.y
      
      doc.font('Helvetica-Bold').fontSize(9)
      headers.forEach((header, i) => {
        doc.text(header, 50 + (i * columnWidth), yPos, { width: columnWidth, align: 'left' })
      })
      
      // Table rows
      doc.font('Helvetica').fontSize(8)
      yPos += 20
      fieldBook.surveyData.forEach((row) => {
        if (yPos > doc.page.height - 50) {
          doc.addPage()
          doc.font('Helvetica-Bold').fontSize(9)
          headers.forEach((header, i) => {
            doc.text(header, 50 + (i * columnWidth), 50, { width: columnWidth, align: 'left' })
          })
          doc.font('Helvetica').fontSize(8)
          yPos = 70
        }
        
        const values = [
          row.point || '',
          row.y ? row.y.toFixed(3) : '',
          row.x ? row.x.toFixed(3) : '',
          row.status || '',
          row.calcs_page || '',
          row.description || '',
          row.date_of_survey ? new Date(row.date_of_survey).toLocaleDateString() : ''
        ]
        
        values.forEach((value, i) => {
          doc.text(value.toString(), 50 + (i * columnWidth), yPos, { width: columnWidth, align: 'left' })
        })
        
        yPos += 15
      })
      
      doc.end()
    })
  }

  // Helper function to generate GeoJSON
  async function generateGeoJson(surveyData) {
    const features = surveyData
      .filter(point => point.x && point.y) // Only include points with coordinates
      .map(point => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [parseFloat(point.x), parseFloat(point.y)]
        },
        properties: {
          point: point.point,
          status: point.status,
          description: point.description || '',
          calcs_page: point.calcs_page || null,
          date_of_survey: point.date_of_survey || null
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
      const projectResult = await fastify.platformatic.db.query(
        'SELECT * FROM projects WHERE id = $1',
        [parseInt(projectId)]
      )
      
      if (projectResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Project not found' })
      }
      
      const project = projectResult.rows[0]

      // Get survey data for the project
      const surveyDataResult = await fastify.platformatic.db.query(
        'SELECT * FROM field_data WHERE project_id = $1 ORDER BY point ASC',
        [parseInt(projectId)]
      )
      
      const surveyData = surveyDataResult.rows

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
