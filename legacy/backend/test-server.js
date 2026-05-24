import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import pg from 'pg'
import { parse } from 'csv-parse/sync'

const { Pool } = pg

console.log('Starting minimal server...')

// Create Fastify instance
const fastify = Fastify({ 
  logger: { 
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  } 
})

// Database connection
const db = new Pool({
  connectionString: 'postgres://postgres:cairo2025@localhost:5432/surveypro'
})

console.log('Database pool created')

// Add database to fastify instance
fastify.decorate('db', db)

// Simple platformatic-like query interface
fastify.decorate('platformatic', {
  db: {
    query: async (text, params = []) => {
      console.log('Executing query:', text, params)
      const client = await db.connect()
      try {
        const result = await client.query(text, params)
        console.log('Query result rows:', result.rows.length)
        return result
      } catch (error) {
        console.error('Database query error:', error)
        throw error
      } finally {
        client.release()
      }
    }
  }
})

console.log('Database interface decorated')

async function startServer() {
  try {
    // Register core plugins
    await fastify.register(cors, {
      origin: true,
      credentials: true
    })

    await fastify.register(multipart)

    console.log('CORS and multipart registered')

    // Test endpoint
    fastify.get('/api/test', async (request, reply) => {
      return { status: 'Server working', timestamp: new Date().toISOString() }
    })

    // Database test endpoint
    fastify.get('/api/db-test', async (request, reply) => {
      try {
        const result = await fastify.platformatic.db.query('SELECT NOW() as current_time')
        return { dbStatus: 'Connected', time: result.rows[0].current_time }
      } catch (error) {
        return { dbStatus: 'Error', error: error.message }
      }
    })

    // Get field data for a project
    fastify.get('/api/field-data/project/:projectId', async (request, reply) => {
      const { projectId } = request.params
      
      try {
        fastify.log.info(`Fetching field data for project ${projectId}`)
        
        const result = await fastify.platformatic.db.query(
          `SELECT 
            id, project_id, point, 
            y_coordinate as y, 
            x_coordinate as x, 
            status, calcs_page, description, date_of_survey,
            created_at, updated_at
           FROM field_book_entries 
           WHERE project_id = $1 
           ORDER BY point ASC`,
          [parseInt(projectId)]
        )
        
        fastify.log.info(`Found ${result.rows.length} field book entries`)
        return result.rows
      } catch (error) {
        fastify.log.error('Error fetching field data:', error)
        reply.code(500).send({ error: 'Failed to fetch field data', details: error.message })
      }
    })

    // CSV Import endpoint
    fastify.post('/api/field-data/import', async (request, reply) => {
      try {
        console.log('CSV import endpoint called')
        
        // Get the uploaded file
        const data = await request.file()
        
        if (!data) {
          return reply.code(400).send({ error: 'No file uploaded' })
        }

        // Get projectId from fields
        const projectId = 3 // Hardcode for testing
        console.log('Processing file for project:', projectId)

        // Read file content  
        const buffer = await data.toBuffer()
        const csvData = buffer.toString('utf-8')
        console.log('CSV data length:', csvData.length)
        
        fastify.log.info(`Importing CSV for project ${projectId}`)
        
        // Parse CSV
        const records = parse(csvData, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          delimiter: ','
        })

        fastify.log.info(`Parsed ${records.length} records from CSV`)

        // First, ensure we have an electronic field book
        let fieldBook = await fastify.platformatic.db.query(
          'SELECT * FROM electronic_field_books WHERE project_id = $1',
          [projectId]
        )

        if (fieldBook.rows.length === 0) {
          fastify.log.info('Creating new electronic field book')
          const createResult = await fastify.platformatic.db.query(
            `INSERT INTO electronic_field_books (project_id, title, survey_date)
             VALUES ($1, $2, $3) RETURNING *`,
            [projectId, 'ELECTRONIC FIELD BOOK', new Date()]
          )
          fieldBook = createResult
        }

        const fieldBookId = fieldBook.rows[0].id
        fastify.log.info(`Using field book ID: ${fieldBookId}`)

        // Clear existing entries for this project
        const deleteResult = await fastify.platformatic.db.query(
          'DELETE FROM field_book_entries WHERE project_id = $1',
          [projectId]
        )
        fastify.log.info(`Deleted ${deleteResult.rowCount} existing entries`)

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
            await fastify.platformatic.db.query(
              `INSERT INTO field_book_entries 
               (project_id, field_book_id, point, y_coordinate, x_coordinate, status, 
                calcs_page, description, date_of_survey, survey_method)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                projectId,
                fieldBookId,
                record.Point || record.point || `P${i + 1}`,
                yCoord,
                xCoord,
                (record.Status || record.status || 'P').charAt(0).toUpperCase(),
                record['Calcs Page'] || record.Calcs ? parseInt(record['Calcs Page'] || record.Calcs) : null,
                record.Description || record.description || '',
                dateOfSurvey,
                'GNSS'
              ]
            )

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

    console.log('Routes registered')

    // Start the server
    const address = await fastify.listen({ port: 3001, host: '127.0.0.1' })
    console.log(`🚀 Minimal server running on ${address}`)
  } catch (error) {
    console.error('❌ Server startup failed:', error)
    console.error(error.stack)
    process.exit(1)
  }
}

// Start the server
startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});