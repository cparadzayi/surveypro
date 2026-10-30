import { writeFile, unlink, mkdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { creationArgs, driverSupport, gdalVersion, locateTool, runGdal, toolFile } from '../utils/gdalRunner.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Tools are located by scanning the QGIS/OSGeo install directories rather than by a pinned version list
// (utils/gdalDiscovery.js) and run through utils/gdalRunner.js: argv arrays, the install's own PROJ data,
// and creation options taken from what the installed driver lists. Nothing here depends on which GDAL it is.
// This host once had QGIS 3.44.15 while the old list named 3.44.3, and /geopdf/check answered
// `{"available": false}` while GDAL sat on disk.
const getGDALCommand = () => locateTool('gdal_translate')
const getOGR2OGRCommand = () => locateTool('ogr2ogr')

/**
 * GeoPDF Generation Routes
 * Creates vector GeoPDFs from GeoJSON using GDAL/OGR
 */
export default async function geoPDFRoutes(fastify, options) {
  // /geopdf/generate runs GDAL with values taken from the request. It used to build shell strings from
  // them (and was reachable anonymously: remote command execution with no credential). A token is now
  // required, and the values go to GDAL as single arguments through utils/gdalRunner.js, never a shell.
  const auth = { preHandler: [fastify.authenticate] }

  
  /**
   * Check if GDAL/OGR is installed and available
   */
  fastify.get('/geopdf/check', auth, async (request, reply) => {
    try {
      const gdalCommand = await getGDALCommand()
      const ogrCommand = await getOGR2OGRCommand()

      if (!gdalCommand && !ogrCommand) {
        throw new Error('GDAL/OGR not found in any common location')
      }

      const version = await gdalVersion(gdalCommand || ogrCommand)
      if (!version) throw new Error('GDAL was found but did not report a version')

      fastify.log.info(`[GeoPDF] ✅ GDAL found: ${gdalCommand || ogrCommand}`)
      fastify.log.info(`[GeoPDF] Version: ${version.text}`)

      return {
        available: true,
        version: version.text,
        path: gdalCommand || ogrCommand,
        message: 'GDAL is available'
      }
    } catch (error) {
      fastify.log.warn('[GeoPDF] ⚠️ GDAL not found in common locations')
      fastify.log.warn(`[GeoPDF] Error: ${error.message}`)
      return {
        available: false,
        version: null,
        path: null,
        message: 'GDAL not found. Install QGIS or standalone GDAL to enable GeoPDF export.',
        error: error.message
      }
    }
  })

  /**
   * Generate GeoPDF from map image
   * POST /api/geopdf/generate
   * 
   * Body:
   * - mapImage: base64 encoded PNG image
   * - extent: { minX, minY, maxX, maxY } in Cape Lo coordinates
   * - projection: EPSG code (e.g., "EPSG:22291" for Cape Lo 31)
   * - metadata: { title, surveyor, date, designation, etc. }
   */
  fastify.post('/geopdf/generate', auth, async (request, reply) => {
    const tempDir = path.join(__dirname, '../../temp/geopdf')
    
    try {
      // Ensure temp directory exists
      if (!existsSync(tempDir)) {
        await mkdir(tempDir, { recursive: true })
      }

      const { mapImage, extent, projection, metadata } = request.body

      // Validate inputs
      if (!mapImage || !extent || !projection) {
        return reply.code(400).send({
          error: 'Missing required fields: mapImage, extent, projection'
        })
      }
      // Values go to GDAL as single arguments (never through a shell), but they should still be what they claim.
      if (!/^[A-Za-z]+:\d+$/.test(String(projection))) {
        return reply.code(400).send({ error: 'projection must look like EPSG:22291' })
      }
      const bounds = [extent.minX, extent.maxY, extent.maxX, extent.minY].map(Number)
      if (!bounds.every(Number.isFinite)) {
        return reply.code(400).send({ error: 'extent must have numeric minX, minY, maxX and maxY' })
      }

      // Generate unique filenames
      const timestamp = Date.now()
      const inputPng = path.join(tempDir, `map-${timestamp}.png`)
      const outputPdf = path.join(tempDir, `geopdf-${timestamp}.pdf`)

      // Decode base64 image and save
      const base64Data = mapImage.replace(/^data:image\/png;base64,/, '')
      await writeFile(inputPng, base64Data, 'base64')

      // Check file size
      const fs = await import('fs')
      const stats = fs.statSync(inputPng)
      const fileSizeKB = (stats.size / 1024).toFixed(2)
      fastify.log.info(`[GeoPDF] 📸 Map image saved: ${inputPng}`)
      fastify.log.info(`[GeoPDF] 📊 Image file size: ${fileSizeKB} KB`)

      // Build GDAL command for georeferencing
      // Using ISO 32000 encoding for Adobe Reader compatibility
      const gdalCmd = await getGDALCommand()

      if (!gdalCmd) {
        throw new Error('GDAL command not found')
      }
      const pdfDriver = await driverSupport(gdalCmd, 'PDF')
      if (!pdfDriver?.write) {
        throw new Error('This GDAL build cannot write PDF')
      }

      // GDAL PDF driver doesn't support raster images well
      // Solution: Create GeoTIFF first, then convert to PDF
      const tempTiff = path.join(tempDir, `temp-${timestamp}.tif`)

      // Step 1: Create GeoTIFF with georeferencing
      const tiffArgs = ['-of', 'GTiff', '-a_srs', projection, '-a_ullr', ...bounds, inputPng, tempTiff]

      // Step 2: Convert GeoTIFF to GeoPDF. The options are the ones this GDAL's PDF driver lists (an option
      // it does not know is dropped, not passed to be warned about); ISO 32000 encoding is for Adobe Reader.
      const { args: pdfOptions, dropped } = await creationArgs(gdalCmd, 'PDF', {
        GEO_ENCODING: 'ISO32000',
        DPI: 300,
        AUTHOR: metadata?.surveyorName || 'SurveyPro',
        TITLE: metadata?.title || 'Survey Plan',
        SUBJECT: metadata?.designation || 'Cadastral Survey',
        CREATOR: 'SurveyPro v1.0',
      }, { tool: 'raster' })
      if (dropped.length) fastify.log.info(`[GeoPDF] GDAL PDF driver has no option(s): ${dropped.join(', ')}`)
      const pdfArgs = ['-of', 'PDF', ...pdfOptions, tempTiff, outputPdf]

      fastify.log.info('[GeoPDF] 🔧 Running GDAL...')
      fastify.log.info(`[GeoPDF] ${toolFile(gdalCmd)} ${JSON.stringify(tiffArgs)}`)
      fastify.log.info(`[GeoPDF] ${toolFile(gdalCmd)} ${JSON.stringify(pdfArgs)}`)
      fastify.log.info(`[GeoPDF] Extent: ${JSON.stringify(extent)}`)

      // Execute Step 1: Create GeoTIFF
      fastify.log.info('[GeoPDF] Step 1: Creating GeoTIFF...')
      const { stderr: stderr1 } = await runGdal(gdalCmd, tiffArgs)

      if (stderr1 && !/warning/i.test(stderr1)) {
        fastify.log.warn(`[GeoPDF] GeoTIFF stderr: ${stderr1}`)
      }
      fastify.log.info('[GeoPDF] ✅ GeoTIFF created')

      // Execute Step 2: Convert to GeoPDF
      fastify.log.info('[GeoPDF] Step 2: Converting to GeoPDF...')
      const { stderr: stderr2 } = await runGdal(gdalCmd, pdfArgs)

      if (stderr2 && !/warning/i.test(stderr2)) {
        fastify.log.warn(`[GeoPDF] PDF stderr: ${stderr2}`)
      }

      fastify.log.info(`[GeoPDF] ✅ GeoPDF generated: ${outputPdf}`)

      // Read the generated PDF
      const pdfBuffer = await readFile(outputPdf)

      // TEMPORARILY DISABLED: Keep files for debugging
      // await unlink(inputPng).catch(err => fastify.log.warn('Failed to delete temp PNG:', err))
      // await unlink(outputPdf).catch(err => fastify.log.warn('Failed to delete temp PDF:', err))
      fastify.log.info(`[GeoPDF] 🔍 Files kept for debugging: ${inputPng}, ${outputPdf}`)

      // Send PDF as response
      reply
        .type('application/pdf')
        .header('Content-Disposition', `attachment; filename="survey-plan-geo-${timestamp}.pdf"`)
        .send(pdfBuffer)

    } catch (error) {
      fastify.log.error('[GeoPDF] ❌ Error generating GeoPDF:')
      fastify.log.error('[GeoPDF] Error message:', error.message)
      fastify.log.error('[GeoPDF] Error stack:', error.stack)
      if (error.stderr) fastify.log.error('[GeoPDF] STDERR:', error.stderr)
      if (error.stdout) fastify.log.error('[GeoPDF] STDOUT:', error.stdout)
      
      return reply.code(500).send({
        error: 'Failed to generate GeoPDF',
        message: error.message
      })
    }
  })

  /**
   * Get GeoPDF capabilities and system info
   */
  fastify.get('/geopdf/info', auth, async (request, reply) => {
    try {
      const gdalCmd = await getGDALCommand()

      // The version line for display, and what this build can actually write (asked of GDAL, not assumed)
      const version = gdalCmd ? await gdalVersion(gdalCmd) : null
      const pdf = gdalCmd ? await driverSupport(gdalCmd, 'PDF') : null
      const pdfSupported = !!pdf?.write

      return {
        gdal: {
          version: version?.text ?? 'Not installed',
          installed: !!version
        },
        formats: {
          pdf: pdfSupported,
          geoPdf: pdfSupported
        },
        projections: {
          supported: ['EPSG:22291', 'EPSG:22289', 'EPSG:4326'],
          default: 'EPSG:22291'
        },
        features: {
          coordinateDisplay: true,
          measurementTools: true,
          layerControl: false, // Phase 2
          attributeTables: false // Phase 2
        }
      }
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get GeoPDF info',
        message: error.message
      })
    }
  })
}
