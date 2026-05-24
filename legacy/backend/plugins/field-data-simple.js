/// <reference path="../global.d.ts" />
'use strict'

import { parse } from 'csv-parse/sync'
import fp from 'fastify-plugin'

/**
 * Simplified Field Data plugin for debugging
 * 
 * @param {import('fastify').FastifyInstance} fastify
 */
async function fieldDataPluginSimple(fastify, opts) {
  
  // Test endpoint to verify plugin is loaded
  fastify.get('/api/test', async (request, reply) => {
    return { status: 'Field data plugin loaded', timestamp: new Date().toISOString() }
  })

  // Simple test multipart endpoint
  fastify.post('/api/test-upload', async (request, reply) => {
    try {
      fastify.log.info('Test upload endpoint called')
      const data = await request.file()
      
      if (!data) {
        return { error: 'No file uploaded' }
      }

      const buffer = await data.toBuffer()
      const content = buffer.toString('utf-8')
      
      return { 
        success: true, 
        filename: data.filename,
        mimetype: data.mimetype,
        size: buffer.length,
        firstLine: content.split('\n')[0]
      }
    } catch (error) {
      fastify.log.error('Test upload error:', error)
      return { error: error.message }
    }
  })

  // Get field data for a project (simplified)
  fastify.get('/api/field-data/project/:projectId', async (request, reply) => {
    const { projectId } = request.params
    
    try {
      fastify.log.info(`Fetching field data for project ${projectId}`)
      
      const { field_book_entries } = fastify.platformatic.entities
      const entries = await field_book_entries.find({ where: { project_id: { eq: Number(projectId) } }, orderBy: [{ field: 'point', direction: 'asc' }] })
      fastify.log.info(`Found ${entries.length} field book entries`)
      return entries
    } catch (error) {
      fastify.log.error('Error fetching field data:', error)
      reply.code(500).send({ error: 'Failed to fetch field data', details: error.message })
    }
  })

  // Simplified CSV import  
  fastify.post('/api/field-data/import', async (request, reply) => {
    // Get uploaded file using fastify multipart
    const data = await request.file()
    
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' })
    }

    // Extract projectId from form fields (default to 3 for testing)
    let projectId = 3
    
    try {
      // Try to get projectId from request body if available
      if (request.body && request.body.projectId) {
        projectId = parseInt(request.body.projectId)
      }
    } catch (e) {
      // Use default projectId
    }
    
    try {
      fastify.log.info(`Importing CSV for project ${projectId}`)
      
      // Parse CSV
      const fileBuffer = await data.toBuffer()
      const fileContent = fileBuffer.toString('utf-8')
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: ','
      })

      fastify.log.info(`Parsed ${records.length} records from CSV`)

      // First, ensure we have an electronic field book
      const { electronic_field_books, field_book_entries } = fastify.platformatic.entities
      let fieldBook = await electronic_field_books.findOne({ where: { project_id: { eq: projectId } } })
      if (!fieldBook) {
        fastify.log.info('Creating new electronic field book')
        fieldBook = await electronic_field_books.save({ input: { project_id: projectId, title: 'ELECTRONIC FIELD BOOK', survey_date: new Date().toISOString().split('T')[0] } })
      }

      const fieldBookId = fieldBook.id
      fastify.log.info(`Using field book ID: ${fieldBookId}`)

      // Clear existing entries for this project (simple delete loop)
      const existing = await field_book_entries.find({ where: { project_id: { eq: projectId } }, limit: 5000 })
      for (const e of existing) {
        await field_book_entries.delete({ where: { id: { eq: e.id } } })
      }
      fastify.log.info(`Deleted ${existing.length} existing entries`)

      // Process and insert records
      let insertedCount = 0
      for (let i = 0; i < records.length; i++) {
        const record = records[i]
        
        try {
          // Parse coordinates
          const yCoord = parseFloat(record.Y || record.y)
          const xCoord = parseFloat(record.X || record.x)
          
          if (isNaN(yCoord) || isNaN(xCoord)) {
            fastify.log.warn(`Skipping record ${i + 1}: Invalid coordinates Y=${record.Y}, X=${record.X}`)
            continue
          }

          // Parse date
          let dateOfSurvey = null
          const dateStr = record['Date of survey'] || record['Date'] || record.date
          if (dateStr) {
            const parsedDate = new Date(dateStr)
            if (!isNaN(parsedDate.getTime())) {
              dateOfSurvey = parsedDate.toISOString().split('T')[0]
            }
          }

          // Insert the field entry
          await field_book_entries.save({ input: {
            project_id: projectId,
            field_book_id: fieldBookId,
            point: record.Point || record.point || `P${i + 1}`,
            y_coordinate: yCoord,
            x_coordinate: xCoord,
            status: (record.Status || record.status || 'P').charAt(0).toUpperCase(),
            calcs_page: (record['Calcs Page'] || record.Calcs) ? parseInt(record['Calcs Page'] || record.Calcs) : null,
            description: record.Description || record.description || '',
            date_of_survey: dateOfSurvey,
            survey_method: 'GNSS'
          } })

          insertedCount++
        } catch (err) {
          fastify.log.error(`Error processing record ${i + 1}:`, err.message)
        }
      }

      fastify.log.info(`Successfully inserted ${insertedCount} field entries`)

      return { 
        message: 'Field data imported successfully', 
        count: insertedCount,
        fieldBookId: fieldBookId,
        skipped: records.length - insertedCount
      }
    } catch (error) {
      fastify.log.error('Import error:', error)
      reply.code(500).send({ 
        error: 'Failed to import field data', 
        details: error.message 
      })
    }
  })
}

export default fp(fieldDataPluginSimple, {
  name: 'field-data-simple'
})