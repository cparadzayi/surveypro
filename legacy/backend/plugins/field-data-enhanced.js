/// <reference path="../global.d.ts" />
'use strict'

import multer from 'multer'
import { parse } from 'csv-parse/sync'
import fp from 'fastify-plugin'
import PDFDocument from 'pdfkit'

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() })

/**
 * Enhanced Field Data plugin for SurveyPro - Electronic Field Book Generation
 * Handles cadastral surveying field book data with Zimbabwe coordinate system
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
async function fieldDataPlugin(fastify, opts) {
  
  // Auth removed (MVP)

  // Create or get electronic field book for project
  fastify.post('/api/field-book/create/:projectId', async (request, reply) => {
    const { projectId } = request.params
    const { title, surveyorName, surveyOf, surveyLocation, instruments } = request.body

    try {
      const efb = fastify.platformatic.entities.electronic_field_books
      const existing = await efb.findOne({ where: { project_id: { eq: Number(projectId) } } })
      if (existing) return existing
      const created = await efb.save({ input: {
        project_id: Number(projectId),
        title: title || 'ELECTRONIC FIELD BOOK',
        surveyor_name: surveyorName || 'Land Surveyor',
        survey_of: surveyOf || null,
        survey_location: surveyLocation || null,
        instruments: instruments || [],
        survey_date: new Date().toISOString().split('T')[0]
      } })
      return created
    } catch (error) {
      fastify.log.error(error)
      reply.code(500).send({ error: 'Failed to create field book' })
    }
  })

  // Import field data from CSV with proper coordinate handling
  fastify.post('/api/field-data/import', {
    preHandler: upload.single('file')
  }, async (request, reply) => {
    if (!request.file) {
      return reply.code(400).send({ error: 'No file uploaded' })
    }

    const projectId = parseInt(request.body.projectId)
    
    try {
      // Parse CSV
      const fileContent = request.file.buffer.toString('utf-8')
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: ','
      })

      fastify.log.info(`Parsed ${records.length} records from CSV`)

      // Get or create field book
      const efb = fastify.platformatic.entities.electronic_field_books
      const fbe = fastify.platformatic.entities.field_book_entries
      let fieldBook = await efb.findOne({ where: { project_id: { eq: projectId } } })
      if (!fieldBook) {
        fieldBook = await efb.save({ input: { project_id: projectId, title: 'ELECTRONIC FIELD BOOK', survey_date: new Date().toISOString().split('T')[0] } })
      }
      const fieldBookId = fieldBook.id

      // Clear existing entries for this project
      const existingEntries = await fbe.find({ where: { project_id: { eq: projectId } }, limit: 10000 })
      for (const e of existingEntries) {
        await fbe.delete({ where: { id: { eq: e.id } } })
      }

      // Transform and validate records
      const fieldEntries = []
      for (let i = 0; i < records.length; i++) {
        const record = records[i]
        
        try {
          // Parse coordinates - handle Zimbabwe P(Y,X) format
          const yCoord = parseFloat(record.Y || record.y || record['Y (Westing)'] || record.Westing)
          const xCoord = parseFloat(record.X || record.x || record['X (Southing)'] || record.Southing)
          
          if (isNaN(yCoord) || isNaN(xCoord)) {
            fastify.log.warn(`Skipping record ${i + 1}: Invalid coordinates Y=${record.Y}, X=${record.X}`)
            continue
          }

          // Parse date
          let dateOfSurvey = null
          const dateStr = record['Date of survey'] || record['Date'] || record.date
          if (dateStr) {
            // Handle various date formats
            const parsedDate = new Date(dateStr)
            if (!isNaN(parsedDate.getTime())) {
              dateOfSurvey = parsedDate.toISOString().split('T')[0]
            } else {
              // Try parsing DD/MM/YYYY format
              const dateParts = dateStr.split('/')
              if (dateParts.length === 3) {
                const reformatted = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`
                const reformattedDate = new Date(reformatted)
                if (!isNaN(reformattedDate.getTime())) {
                  dateOfSurvey = reformattedDate.toISOString().split('T')[0]
                }
              }
            }
          }

          const entry = {
            project_id: projectId,
            field_book_id: fieldBookId,
            point: record.Point || record.point || `P${i + 1}`,
            y_coordinate: yCoord, // Westing in Zimbabwe system
            x_coordinate: xCoord, // Southing in Zimbabwe system
            status: (record.Status || record.status || 'P').charAt(0).toUpperCase(),
            calcs_page: record['Calcs Page'] || record.Calcs ? parseInt(record['Calcs Page'] || record.Calcs) : null,
            description: record.Description || record.description || '',
            date_of_survey: dateOfSurvey,
            monument_type: record['Monument Type'] || record.monument_type,
            survey_method: 'GNSS', // Default method
            accuracy_class: 'Class II' // Default accuracy class
          }

          fieldEntries.push(entry)
        } catch (err) {
          fastify.log.warn(`Error processing record ${i + 1}:`, err.message)
        }
      }

      // Insert field entries
      for (const entry of fieldEntries) {
        await fbe.save({ input: entry })
      }

      // Organize into pages
      // NOTE: organize_field_book_pages DB function call removed (reintroduce later if needed)

      // Update coordinate list
      await updateCoordinateList(fastify, projectId, fieldBookId)

      return { 
        message: 'Field data imported successfully', 
        count: fieldEntries.length,
        fieldBookId: fieldBookId,
        skipped: records.length - fieldEntries.length
      }
    } catch (error) {
      fastify.log.error(error)
      reply.code(500).send({ 
        error: 'Failed to import field data', 
        details: error.message 
      })
    }
  })

  // Get field data for a project (compatible with frontend)
  fastify.get('/api/field-data/project/:projectId', async (request, reply) => {
    const { projectId } = request.params
    
    try {
      const fbe = fastify.platformatic.entities.field_book_entries
      const rows = await fbe.find({ where: { project_id: { eq: Number(projectId) } }, orderBy: [{ field: 'point', direction: 'asc' }] })
      return rows.map(r => ({
        id: r.id,
        project_id: r.project_id,
        point: r.point,
        y: r.y_coordinate,
        x: r.x_coordinate,
        status: r.status,
        calcs_page: r.calcs_page,
        description: r.description,
        date_of_survey: r.date_of_survey,
        created_at: r.created_at,
        updated_at: r.updated_at
      }))
    } catch (error) {
      fastify.log.error(error)
      reply.code(500).send({ error: 'Failed to fetch field data' })
    }
  })

  // Get field book data for a project
  fastify.get('/api/field-book/:projectId', async (request, reply) => {
    const { projectId } = request.params
    
    try {
      // Get field book
      const efb = fastify.platformatic.entities.electronic_field_books
      const fb = await efb.findOne({ where: { project_id: { eq: Number(projectId) } } })
      if (!fb) {
        return reply.code(404).send({ error: 'Field book not found' })
      }
      const pagesEnt = fastify.platformatic.entities.field_book_pages
      const fbe = fastify.platformatic.entities.field_book_entries
      const pages = await pagesEnt.find({ where: { field_book_id: { eq: fb.id } }, orderBy: [{ field: 'page_number', direction: 'asc' }] })
      const entries = await fbe.find({ where: { field_book_id: { eq: fb.id } }, orderBy: [{ field: 'entry_number', direction: 'asc' }] })
      return { fieldBook: fb, pages, entries, totalEntries: entries.length }
    } catch (error) {
      fastify.log.error(error)
      reply.code(500).send({ error: 'Failed to fetch field book' })
    }
  })

  // Generate professional PDF field book
  fastify.get('/api/field-book/:projectId/pdf', async (request, reply) => {
    const { projectId } = request.params
    
    try {
      const fieldBookData = await getFieldBookData(fastify, parseInt(projectId))
      
      if (!fieldBookData) {
        return reply.code(404).send({ error: 'Field book not found' })
      }

      const pdfBuffer = await generateProfessionalPDF(fieldBookData)
      
      reply.header('Content-Type', 'application/pdf')
           .header('Content-Disposition', `attachment; filename="fieldbook-${projectId}.pdf"`)
           .send(pdfBuffer)
           
    } catch (error) {
      fastify.log.error(error)
      reply.code(500).send({ error: 'Failed to generate PDF' })
    }
  })

  // Generate coordinate list
  fastify.get('/api/field-book/:projectId/coordinate-list', async (request, reply) => {
    const { projectId } = request.params
    
    try {
      const cle = fastify.platformatic.entities.coordinate_list_enhanced
      const list = await cle.find({ where: { project_id: { eq: Number(projectId) } }, orderBy: [{ field: 'point', direction: 'asc' }] })
      return { coordinateList: list, totalPoints: list.length, generatedAt: new Date().toISOString() }
    } catch (error) {
      fastify.log.error(error)
      reply.code(500).send({ error: 'Failed to generate coordinate list' })
    }
  })

  // Generate field book endpoint (compatible with frontend)
  fastify.get('/api/field-data/generate-field-book/:projectId', async (request, reply) => {
    const { projectId } = request.params
    const { format = 'json' } = request.query
    
    try {
      const fieldBookData = await getFieldBookData(fastify, parseInt(projectId))
      
      if (!fieldBookData) {
        return reply.code(404).send({ error: 'Field book not found' })
      }

      // Return in requested format
      switch (format.toLowerCase()) {
        case 'pdf':
          const pdfBuffer = await generateProfessionalPDF(fieldBookData)
          reply.header('Content-Type', 'application/pdf')
               .header('Content-Disposition', `attachment; filename="field-book-${projectId}.pdf"`)
          return pdfBuffer

        case 'geojson':
          const geoJson = await generateGeoJson(fieldBookData.entries)
          reply.header('Content-Type', 'application/geo+json')
               .header('Content-Disposition', `attachment; filename="survey-points-${projectId}.geojson"`)
          return geoJson

        default:
          return {
            project: fieldBookData.project,
            fieldBook: fieldBookData.fieldBook,
            surveyData: fieldBookData.entries,
            totalEntries: fieldBookData.entries.length,
            generatedAt: new Date().toISOString()
          }
      }
    } catch (error) {
      fastify.log.error(error)
      reply.code(500).send({ error: 'Failed to generate field book' })
    }
  })

  // Get field book statistics
  fastify.get('/api/field-book/:projectId/stats', async (request, reply) => {
    const { projectId } = request.params

    try {
      const fbe = fastify.platformatic.entities.field_book_entries
      const rows = await fbe.find({ where: { project_id: { eq: Number(projectId) } }, limit: 20000 })
      if (!rows.length) return { total_points: 0 }
      const aggregate = {
        total_points: rows.length,
        found_monuments: rows.filter(r => r.status === 'F').length,
        placed_monuments: rows.filter(r => r.status === 'P').length,
        replaced_monuments: rows.filter(r => r.status === 'R').length,
        earliest_survey: rows.reduce((a, r) => r.date_of_survey && (!a || r.date_of_survey < a) ? r.date_of_survey : a, null),
        latest_survey: rows.reduce((a, r) => r.date_of_survey && (!a || r.date_of_survey > a) ? r.date_of_survey : a, null),
        survey_days: new Set(rows.filter(r => r.date_of_survey).map(r => r.date_of_survey)).size
      }
      return aggregate
    } catch (error) {
      fastify.log.error(error)
      reply.code(500).send({ error: 'Failed to fetch statistics' })
    }
  })

  // Helper function to get complete field book data
  async function getFieldBookData(fastify, projectId) {
    const efb = fastify.platformatic.entities.electronic_field_books
    const fbe = fastify.platformatic.entities.field_book_entries
    const projects = fastify.platformatic.entities.projects
    const fb = await efb.findOne({ where: { project_id: { eq: projectId } } })
    if (!fb) return null
    const project = await projects.findOne({ where: { id: { eq: projectId } } })
    const entries = await fbe.find({ where: { project_id: { eq: projectId } }, orderBy: [{ field: 'point', direction: 'asc' }] })
    return { project, fieldBook: fb, entries }
  }

  // Helper function to update coordinate list
  async function updateCoordinateList(fastify, projectId, fieldBookId) {
    // Clear existing coordinate list
    const cle = fastify.platformatic.entities.coordinate_list_enhanced
    const fbe = fastify.platformatic.entities.field_book_entries
    const efb = fastify.platformatic.entities.electronic_field_books
    const fb = await efb.findOne({ where: { project_id: { eq: projectId } } })
    if (!fb) return
    const existing = await cle.find({ where: { project_id: { eq: projectId } }, limit: 10000 })
    for (const e of existing) {
      await cle.delete({ where: { id: { eq: e.id } } })
    }
    const entries = await fbe.find({ where: { project_id: { eq: projectId } }, limit: 20000 })
    for (const entry of entries) {
      await cle.save({ input: {
        project_id: projectId,
        field_book_id: fb.id,
        point: entry.point,
        y_coordinate: entry.y_coordinate,
        x_coordinate: entry.x_coordinate,
        source_type: 'field',
        coordinate_status: entry.status === 'F' ? 'F' : 'P',
        field_book_page: 1
      } })
    }
  }

  // Helper function to generate GeoJSON
  async function generateGeoJson(entries) {
    const features = entries
      .filter(entry => entry.y_coordinate && entry.x_coordinate)
      .map(entry => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [entry.y_coordinate, entry.x_coordinate] // Note: GeoJSON uses [lon, lat] but we're using [Y, X] for Zimbabwe
        },
        properties: {
          point: entry.point,
          status: entry.status,
          description: entry.description || '',
          calcs_page: entry.calcs_page || null,
          date_of_survey: entry.date_of_survey || null,
          monument_type: entry.monument_type || null
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

  // Enhanced PDF generation for professional field books
  async function generateProfessionalPDF(data) {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 })
      const buffers = []
      
      doc.on('data', buffers.push.bind(buffers))
      doc.on('end', () => {
        resolve(Buffer.concat(buffers))
      })

      // Cover page
      doc.fontSize(20).font('Helvetica-Bold')
         .text('ELECTRONIC FIELD BOOK', { align: 'center' })
         .moveDown(2)

      doc.fontSize(14).font('Helvetica')
         .text(`Project: ${data.project.name}`, { align: 'left' })
         .moveDown(1)
         .text(`Surveyor: ${data.fieldBook.surveyor_name || 'Land Surveyor'}`)
         .moveDown(1)

      if (data.fieldBook.survey_of) {
        doc.text(`Survey of: ${data.fieldBook.survey_of}`)
           .moveDown(1)
      }

      doc.text(`Survey Date: ${new Date(data.fieldBook.survey_date).toLocaleDateString()}`)
         .moveDown(2)

      // Instruments section
      if (data.fieldBook.instruments) {
        try {
          const instruments = JSON.parse(data.fieldBook.instruments)
          if (instruments.length > 0) {
            doc.text('Instruments:', { underline: true })
               .moveDown(0.5)
            instruments.forEach(instrument => {
              doc.text(`• ${instrument.name || instrument}`)
                 .moveDown(0.3)
            })
            doc.moveDown(1)
          }
        } catch (e) {
          // Skip if instruments parsing fails
        }
      }

      // Survey data table
      doc.addPage()
      doc.fontSize(16).font('Helvetica-Bold')
         .text('SURVEY DATA', { align: 'center' })
         .moveDown(1.5)

      // Table setup
      const tableTop = doc.y
      const headers = ['Point', 'Y (Westing)', 'X (Southing)', 'Status', 'Calcs Page', 'Description', 'Date']
      const colWidths = [60, 80, 80, 50, 60, 120, 70]
      const tableWidth = colWidths.reduce((sum, width) => sum + width, 0)
      const startX = (doc.page.width - tableWidth) / 2

      // Draw headers
      doc.fontSize(10).font('Helvetica-Bold')
      let currentX = startX
      headers.forEach((header, i) => {
        doc.rect(currentX, tableTop, colWidths[i], 20).stroke()
        doc.text(header, currentX + 2, tableTop + 5, {
          width: colWidths[i] - 4,
          align: 'center'
        })
        currentX += colWidths[i]
      })

      // Draw data rows
      let currentY = tableTop + 20
      doc.fontSize(8).font('Helvetica')

      data.entries.forEach((entry, index) => {
        if (currentY > doc.page.height - 100) {
          doc.addPage()
          currentY = 50
        }

        currentX = startX
        const values = [
          entry.point || '',
          entry.y_coordinate ? entry.y_coordinate.toFixed(3) : '',
          entry.x_coordinate ? entry.x_coordinate.toFixed(3) : '',
          entry.status || '',
          entry.calcs_page || '',
          (entry.description || '').substring(0, 30) + ((entry.description || '').length > 30 ? '...' : ''),
          entry.date_of_survey ? new Date(entry.date_of_survey).toLocaleDateString() : ''
        ]

        values.forEach((value, i) => {
          doc.rect(currentX, currentY, colWidths[i], 15).stroke()
          doc.text(value.toString(), currentX + 2, currentY + 2, {
            width: colWidths[i] - 4,
            height: 15,
            align: 'left'
          })
          currentX += colWidths[i]
        })

        currentY += 15
      })

      // Summary page
      doc.addPage()
      doc.fontSize(16).font('Helvetica-Bold')
         .text('SURVEY SUMMARY', { align: 'center' })
         .moveDown(2)

      doc.fontSize(12).font('Helvetica')
         .text(`Total Points: ${data.entries.length}`)
         .moveDown(0.5)
         .text(`Found Monuments: ${data.entries.filter(e => e.status === 'F').length}`)
         .moveDown(0.5)
         .text(`Placed Monuments: ${data.entries.filter(e => e.status === 'P').length}`)
         .moveDown(0.5)
         .text(`Generated: ${new Date().toLocaleString()}`)

      doc.end()
    })
  }
}

export default fp(fieldDataPlugin, {
  name: 'field-data-enhanced'
})