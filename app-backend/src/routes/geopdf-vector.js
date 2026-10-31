// Vector GeoPDF Generation Routes
import { writeFile, unlink, mkdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import LandParcel from '../models/landParcel.js'
import { computeAreaConsistency } from '../utils/area-computation.js'
import { authenticateWithSchema, requireSchema } from '../utils/schemaAuth.js'
import { getCapeLoSRID } from '../utils/capeLoSRID.js'
import { prjForDxf } from '../utils/crsDefinitions.js'
import { dxfToGeoreferencedGpkg, getOGR2OGRCommand, getGDALVersion } from '../utils/dxfGpkg.js'
import { creationArgs, creationOptions, driverSupport, gdalVersion, runGdal, vrtOf } from '../utils/gdalRunner.js'
import { dxfFromRecordedPlan } from '../services/generalPlanDxf.js'
import { chooseSheeting } from '../services/chooseSheeting.js'
import { zipSync } from 'fflate'
import { warningHints, encodeWarningsHeader } from '../utils/planWarnings.js'
import { abortOnClientGone, cancelledError, isCancelled, yieldOrCancel } from '../utils/cancellation.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Bundle a DXF with a .prj (ESRI/OGC WKT) CRS sidecar into a single ZIP, and —
 * when ogr2ogr is available AND includeGpkg is set — also include a
 * self-georeferencing .gpkg that QGIS places on true Zimbabwe ground without
 * any manual CRS step.
 */
async function zipDxfWithPrj(dxfBuffer, projection, baseName, logger, includeGpkg = true, signal = undefined) {
  const entries = {
    [`${baseName}.dxf`]: new Uint8Array(dxfBuffer),
    [`${baseName}.prj`]: new Uint8Array(Buffer.from(prjForDxf(projection) || '', 'utf8')),
  }
  if (includeGpkg) {
    const gpkg = await dxfToGeoreferencedGpkg(dxfBuffer, projection, logger, signal)
    if (gpkg) entries[`${baseName}.gpkg`] = new Uint8Array(gpkg)
  }
  return Buffer.from(zipSync(entries, { level: 9 }))
}

/**
 * Bundle N per-sheet DXFs into one ZIP, one .dxf per sheet, each with its own
 * .gpkg when asked for, plus ONE .prj for the plan.
 *
 * The sheeted plan is N files on purpose (Spec Part 1: in PDF the plan is one
 * document with a page per sheet, in DXF each sheet is its own file). The
 * archive is only how they travel together over HTTP; unzipped it is exactly
 * the N files the surveyor lodges.
 *
 * The .prj is written once, under the plan's own name, rather than once per
 * sheet: every sheet is in the same Lo zone, and CAD software pairs a sidecar to
 * its drawing by stem, so per-sheet sidecars would have to be named
 * `<sheet>.prj` beside `<sheet>.dxf` and no other — 2N files, every one of them
 * the same three lines.
 */
async function zipSheetedDxfWithPrj(files, projection, planBaseName, logger, includeGpkg = true, signal = undefined) {
  const entries = {}
  for (const file of files) {
    entries[file.filename] = new Uint8Array(file.buffer)
    if (includeGpkg) {
      const gpkg = await dxfToGeoreferencedGpkg(file.buffer, projection, logger, signal)
      if (gpkg) entries[file.filename.replace(/\.dxf$/, '.gpkg')] = new Uint8Array(gpkg)
    }
  }
  entries[`${planBaseName}.prj`] = new Uint8Array(Buffer.from(prjForDxf(projection) || '', 'utf8'))
  return Buffer.from(zipSync(entries, { level: 9 }))
}

function swapYxToXyGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') return geometry
  const { type, coordinates } = geometry
  if (!type || coordinates == null) return geometry

  const swapPair = (c) => (Array.isArray(c) && c.length >= 2 ? [c[1], c[0], ...c.slice(2)] : c)

  if (type === 'Point') {
    return { ...geometry, coordinates: swapPair(coordinates) }
  }
  if (type === 'LineString' || type === 'MultiPoint') {
    return { ...geometry, coordinates: coordinates.map(swapPair) }
  }
  if (type === 'Polygon' || type === 'MultiLineString') {
    return { ...geometry, coordinates: coordinates.map((ring) => ring.map(swapPair)) }
  }
  if (type === 'MultiPolygon') {
    return { ...geometry, coordinates: coordinates.map((poly) => poly.map((ring) => ring.map(swapPair))) }
  }
  return geometry
}

function swapYxToXyFeatureCollection(fc) {
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) return fc
  return {
    ...fc,
    features: fc.features.map((f) => ({
      ...f,
      geometry: swapYxToXyGeometry(f.geometry)
    }))
  }
}

/**
 * Generate Vector GeoPDF from GeoJSON
 * POST /api/geopdf/vector
 * 
 * Body:
 * - parcels: GeoJSON FeatureCollection of parcel polygons
 * - beacons: GeoJSON FeatureCollection of beacon points
 * - projection: EPSG code (e.g., "EPSG:22291" for Cape Lo 31)
 * - metadata: { title, surveyor, date, designation, etc. }
 */
export default async function vectorGeoPDFRoutes(fastify, options) {
  // /capabilities reports whether ogr2ogr/GDAL is present on this host, which
  // is useful fingerprinting. Gated to match the sibling routes in this file.
  const auth = { preHandler: [fastify.authenticate] }

  
  /**
   * Get GeoPDF generation capabilities
   * GET /api/geopdf/capabilities
   */
  fastify.get('/capabilities', auth, async (request, reply) => {
    try {
      const ogrCmd = await getOGR2OGRCommand()
      
      // What this GDAL can do is asked of it (its driver list and the PDF driver's option list), not
      // inferred from a version number or from the install path.
      const pdf = ogrCmd ? await driverSupport(ogrCmd, 'PDF') : null
      const gpkg = ogrCmd ? await driverSupport(ogrCmd, 'GPKG') : null
      const geoEncoding = ogrCmd && pdf?.write ? (await creationOptions(ogrCmd, 'PDF')).dataset.has('GEO_ENCODING') : false
      const version = ogrCmd ? await gdalVersion(ogrCmd) : null

      const capabilities = {
        features: {
          gdalVector: {
            description: 'GDAL/ogr2ogr Vector Generation',
            supported: !!pdf?.write,
            capabilities: pdf?.write ? ['OGC GeoPDF', 'ISO 32000', 'Vector layers', 'Georeferencing'] : []
          },
          trueGeoPDF: {
            description: 'Custom True GeoPDF Generation',
            supported: true,
            capabilities: ['Vector rendering', 'Interactive features', 'Measurements', 'Layer management']
          },
          georeferencing: {
            description: 'GDAL Georeferencing',
            supported: geoEncoding,
            capabilities: geoEncoding ? ['EPSG:22291', 'Cape Lo support', 'ISO 32000 encoding'] : []
          },
          geopackage: {
            description: 'GeoPackage (georeferenced DXF companion)',
            supported: !!gpkg?.write,
            capabilities: gpkg?.write ? ['.gpkg alongside the DXF'] : []
          }
        },
        gdalVersion: ogrCmd ? await getGDALVersion(ogrCmd) : null,
        gdal: version ? { major: version.major, minor: version.minor, patch: version.patch } : null,
        ogrCommand: ogrCmd
      }

      reply.send(capabilities)
    } catch (error) {
      fastify.log.error('Error getting capabilities:', error)
      reply.code(500).send({ error: 'Failed to get capabilities', message: error.message })
    }
  })

  /**
   * Generate DXF (AutoCAD) file from GeoJSON
   * POST /api/geopdf/dxf
   * Accepts the same payload as /vector but returns a DXF file
   */
  fastify.post('/dxf', {
    preHandler: [fastify.authenticate, authenticateWithSchema, requireSchema]
  }, async (request, reply) => {
    // If the client goes away (Cancel, closed tab) ogr2ogr is killed and no further step starts.
    const clientGone = abortOnClientGone(reply)
    try {
      fastify.log.info('[DXF] DXF generation started')

      const {
        parcels,
        beacons,
        projection,
        metadata,
        outsideFigureData,
        scale,
        sheetSize,
        orientation,
        planType,
        beaconLabels,
        zip = false,
        includeGpkg = true,
        gpkgOnly = false,
        // Per-sheet payloads from app-frontend/src/utils/sheetPayloads.ts. When
        // present the request is for a cut-based multi-sheet plan and `parcels`
        // is ignored: each sheet already carries its own parcels, and the whole
        // plan's set would put every sheet's stands on every sheet.
        sheets = null,
        baseName = null,
      } = request.body

      if (sheets === null && (!parcels || !beacons)) {
        return reply.code(400).send({ error: 'Missing required fields: parcels, beacons' })
      }
      if (sheets !== null && !Array.isArray(sheets)) {
        return reply.code(400).send({ error: 'sheets must be an array of SheetPayload objects' })
      }

      fastify.log.info(`[DXF] Request planType=${JSON.stringify(planType)} zip=${zip} includeGpkg=${includeGpkg} gpkgOnly=${gpkgOnly} beaconLabels=${Array.isArray(beaconLabels) ? beaconLabels.length : 'none'}`)

      if (planType === 'diagram') {
        fastify.log.info('[DXF] 📐 Diagram plan type → single-stand Diagram DXF renderer')
        const { generateDiagramDXF } = await import('../services/diagramDxf.js')
        const diagram = await generateDiagramDXF(
          { parcels, beacons, metadata, projection, scale, sheetSize: (sheetSize === 'A3' ? 'A3' : 'A4'), orientation: 'portrait' },
          fastify.log
        )
        const ts = Date.now()

        if (gpkgOnly) {
          const gpkg = await dxfToGeoreferencedGpkg(diagram.dxfBuffer, projection, fastify.log, clientGone.signal)
          if (!gpkg) {
            return reply.code(500).send({ error: 'GeoPackage generation failed', message: 'ogr2ogr did not produce a .gpkg (see server logs).' })
          }
          return reply
            .type('application/geopackage+sqlite3')
            .headers({
              'Content-Disposition': `attachment; filename="diagram-${ts}.gpkg"`,
              'X-Used-Scale': diagram.scale,
              'X-Used-Sheet-Size': diagram.sheetSize,
            })
            .send(gpkg)
        }

        let dxfPayload = diagram.dxfBuffer
        if (zip) {
          dxfPayload = await zipDxfWithPrj(diagram.dxfBuffer, projection, `diagram-${ts}`, fastify.log, includeGpkg, clientGone.signal)
        }
        reply
          .type(zip ? 'application/zip' : 'application/dxf')
          .headers({
            'Content-Disposition': `attachment; filename="${zip ? `diagram-${ts}.zip` : `diagram-${ts}.dxf`}"`,
            'X-Used-Scale': diagram.scale,
            'X-Used-Sheet-Size': diagram.sheetSize,
          })
          .send(dxfPayload)
        return
      }

      // ── Cut-based multi-sheet plan: one DXF file per sheet ──
      // Spec Part 1. Two ways to ask for it, and the difference matters:
      //
      //   sheets: [one]  → ONE .dxf named by the payload, which is what the
      //     frontend's artefact loop saves per file (so the existing 409
      //     prompt-before-overwrite gate fires per sheet, as it does for every
      //     other artefact).
      //   sheets: [N], zip → one archive of N .dxf files, for a single download.
      //
      // N sheets with no zip is refused rather than quietly answered with sheet
      // 1 alone: a surveyor handed two files when they asked for a sheeted plan,
      // and only one of them, cannot tell it from a plan that fits.
      if (sheets !== null) {
        if (sheets.length === 0) {
          return reply.code(400).send({ error: 'sheets was given but empty' })
        }
        const { generateSheetedDXF } = await import('../services/dxfGenerator.js')
        await yieldOrCancel(clientGone.signal)
        const files = generateSheetedDXF(
          { sheets, metadata, beacons, projection, scale, sheetSize, orientation, planType, beaconLabels, baseName, sheetLayouts: request.body.sheetLayouts },
          fastify.log
        )
        // The sheets were drawn in one synchronous stretch: give the loop a turn so a closed connection
        // is seen before the (slower) GeoPackage step starts.
        await yieldOrCancel(clientGone.signal)
        const warningCount = files.reduce((sum, f) => sum + (f.warnings?.count || 0), 0)
        const warningSummary = files.map((f) => f.warnings?.summary).filter(Boolean)
        const sheetedHeaders = {
          'X-Sheet-Count': String(files.length),
          'X-Used-Scale': files[0].scale,
          'X-Used-Sheet-Size': files[0].sheetSize,
        }
        if (warningCount > 0) {
          sheetedHeaders['X-DXF-Warning-Count'] = String(warningCount)
          sheetedHeaders['X-DXF-Warnings'] = JSON.stringify(warningSummary)
        }
        fastify.log.info(`[DXF] 🗂️ Sheeted DXF: ${files.length} files (${files.map((f) => f.filename).join(', ')})`)

        if (gpkgOnly) {
          // One GeoPackage cannot hold "the DXF of the plan" when the plan is
          // several DXFs; say so rather than shipping the first sheet's geometry
          // under a name that promises the lot. Checked before the zip rule,
          // because it is the more specific answer to what the caller asked for.
          return reply.code(400).send({
            error: 'gpkgOnly is not available for a multi-sheet DXF',
            message: `${files.length} sheets cannot be one GeoPackage. Request the DXF, or ogr2ogr each sheet yourself.`,
          })
        }

        if (files.length > 1 && !zip) {
          return reply.code(400).send({
            error: 'A multi-sheet DXF is one file per sheet and cannot be sent as one',
            message: `This plan is ${files.length} sheets. Request it with zip: true for one archive of ${files.length} .dxf files, or one sheet at a time (sheets: [payload]) to save each file separately.`,
            sheets: files.map((f) => f.filename),
          })
        }

        if (zip) {
          const planBase = files[0].filename.replace(/-sheet-\d+-of-\d+\.dxf$/, '').replace(/\.dxf$/, '')
          const archive = await zipSheetedDxfWithPrj(files, projection, planBase, fastify.log, includeGpkg, clientGone.signal)
          return reply
            .type('application/zip')
            .headers({
              ...sheetedHeaders,
              'Content-Disposition': `attachment; filename="${planBase}-${files.length}-sheets.zip"`,
            })
            .send(archive)
        }

        return reply
          .type('application/dxf')
          .headers({
            ...sheetedHeaders,
            'Content-Disposition': `attachment; filename="${files[0].filename}"`,
          })
          .send(files[0].buffer)
      }

      const { generateDXF } = await import('../services/dxfGenerator.js')

      await yieldOrCancel(clientGone.signal)
      const { buffer, warnings } = generateDXF(
        { parcels, beacons, outsideFigureData, metadata, projection, scale, sheetSize, orientation, planType, beaconLabels, beaconGroups: request.body.beaconGroups },
        fastify.log
      )

      // Drawn in one synchronous stretch: give the loop a turn so a closed connection is seen before
      // the (slower) GeoPackage step starts.
      await yieldOrCancel(clientGone.signal)
      const ts = Date.now()

      if (gpkgOnly) {
        const gpkg = await dxfToGeoreferencedGpkg(buffer, projection, fastify.log, clientGone.signal)
        if (!gpkg) {
          return reply.code(500).send({ error: 'GeoPackage generation failed', message: 'ogr2ogr did not produce a .gpkg (see server logs).' })
        }
        reply
          .type('application/geopackage+sqlite3')
          .header('Content-Disposition', `attachment; filename="survey-plan-${ts}.gpkg"`)
          .header('X-DXF-Warning-Count', String(warnings.count))
        if (warnings.count > 0) {
          reply.header('X-DXF-Warnings', JSON.stringify(warnings.summary))
        }
        reply.send(gpkg)
        return
      }

      if (zip) {
        const dxfPayload = await zipDxfWithPrj(buffer, projection, `survey-plan-${ts}`, fastify.log, includeGpkg, clientGone.signal)
        reply
          .type('application/zip')
          .header('Content-Disposition', `attachment; filename="survey-plan-${ts}.zip"`)
          .header('X-DXF-Warning-Count', String(warnings.count))
        if (warnings.count > 0) {
          reply.header('X-DXF-Warnings', JSON.stringify(warnings.summary))
        }
        reply.send(dxfPayload)
        return
      }

      const filename = `survey-plan-${ts}.dxf`
      reply
        .type('application/dxf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('X-DXF-Warning-Count', String(warnings.count))
      if (warnings.count > 0) {
        reply.header('X-DXF-Warnings', JSON.stringify(warnings.summary))
      }
      reply.send(buffer)

    } catch (error) {
      if (isCancelled(error)) {
        fastify.log.info('[DXF] Client disconnected; DXF generation cancelled')
        return reply.code(499).send()   // the socket is closed; this only settles the handler
      }
      fastify.log.error('[DXF] Generation failed:', error)
      reply.code(500).send({ error: 'DXF generation failed', message: error.message })
    }
  })

  /**
   * Generate Vector GeoPDF from GeoJSON
   * POST /api/geopdf/vector
   */
  fastify.post('/vector', {
    preHandler: [fastify.authenticate, authenticateWithSchema, requireSchema]
  }, async (request, reply) => {
    console.log('========================================')
    console.log('[GeoPDF ROUTE] 🚀 ROUTE HANDLER EXECUTING - VERSION 2026-01-06-18:05')
    console.log('========================================')
    
    const tempDir = path.join(__dirname, '../../temp/geopdf')

    // The renderer yields between beacons; if the client has gone (Cancel, closed tab) before the PDF
    // was sent, this signal stops it instead of letting it run on, unseen, for minutes.
    const clientGone = abortOnClientGone(reply)
    
    let vectorPdfCreated = false
    
    try {
      fastify.log.info('[GeoPDF] 🚀 Vector GeoPDF generation started - CODE VERSION 2026-01-06-18:30')
      
      // Ensure temp directory exists
      if (!existsSync(tempDir)) {
        await mkdir(tempDir, { recursive: true })
      }

      const {
        parcels,
        beacons,
        annotations,
        projection,
        metadata,
        extent,
        outsideFigureData,
        beaconLabels,
        projectId,
        renderEngine = 'pdfkit',
        scale,
        sheetSize,
        planType = null,  // SI 727 plan type — 'general-developed' enforces 1:500 ceiling
        // True GeoPDF (ISO 32000-2) options — forwarded to the PDFKit renderer
        trueGeoPDF = false,
        interactive = false,
        enableLayers = false,
        enableMeasurements = false
      } = request.body
      
      // 🔥 DIAGNOSTIC: Log ALL request body keys to see what's actually being sent
      fastify.log.info(`[GeoPDF] 🔥 Request body keys: ${Object.keys(request.body).join(', ')}`)
      fastify.log.info(`[GeoPDF] 🔥 beaconLabels type: ${typeof beaconLabels}`)
      fastify.log.info(`[GeoPDF] 🔥 beaconLabels value: ${JSON.stringify(beaconLabels)}`)
      
      fastify.log.info(`[GeoPDF] 📊 Request data: projectId=${projectId}, parcels=${parcels?.features?.length || 0}, beacons=${beacons?.features?.length || 0}`)

      // Validate inputs
      if (!parcels || !beacons || !projection) {
        return reply.code(400).send({
          error: 'Missing required fields: parcels, beacons, projection'
        })
      }

      // Query Outside Figure parcel from database if projectId provided
      let outsideFigure = null
      if (projectId) {
        const dbConnection = request.db
        const outsideFigureParcel = await LandParcel.findOutsideFigure(dbConnection, projectId)
        
        if (outsideFigureParcel && outsideFigureParcel.geom) {
          outsideFigure = {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: {
                stand: outsideFigureParcel.stand,
                designation: outsideFigureParcel.designation,
                area_m2: outsideFigureParcel.area_m2,
                isOutsideFigure: true
              },
              geometry: outsideFigureParcel.geom
            }]
          }
          outsideFigure = swapYxToXyFeatureCollection(outsideFigure)
        }
      }

      // Extent is optional (used previously for GDAL georeferencing)
      const safeExtent = extent || null
      
      // ⭐ COMPUTE AREA/CONSISTENCY ON-THE-FLY: Complete automation
      // This ensures consistent data using same computation logic as /compute/area
      // Computes: area, centroid, edges, residuals, closure error, closure ratio
      fastify.log.info('[GeoPDF] Computing area/consistency data on-the-fly for all parcels...')
      
      // Load coordinate points once for beacon name matching
      let coordinatePointsList = []
      if (projectId) {
        try {
          const dbConnection = request.db
          // Geometry is stored in project's native CRS — read directly, no transform needed
          const coordinatePoints = await dbConnection.query(
            `SELECT name, ST_Y(geom) as y, ST_X(geom) as x FROM coordinate_points WHERE project_id = $1`,
            [projectId]
          )
          const projRow = await dbConnection.query('SELECT central_meridian FROM survey_projects WHERE id = $1', [projectId])
          const nativeSrid = projRow.rows.length > 0 ? getCapeLoSRID(projRow.rows[0].central_meridian) : 22291
          coordinatePointsList = coordinatePoints.rows
          fastify.log.info(`[GeoPDF] 📍 Loaded ${coordinatePoints.rows.length} coordinate points (nativeSrid=${nativeSrid}) for beacon name matching`)
        } catch (coordError) {
          fastify.log.warn(`[GeoPDF] ⚠️ Failed to load coordinate points: ${coordError.message}`)
        }
      } else {
        fastify.log.warn('[GeoPDF] ⚠️ No projectId provided - beacon names will be generic')
      }
      
      // Helper function to find beacon name by coordinates with tolerance
      function findBeaconName(y, x, tolerance = 0.01) {
        for (const pt of coordinatePointsList) {
          const dy = Math.abs(pt.y - y)
          const dx = Math.abs(pt.x - x)
          if (dy < tolerance && dx < tolerance) {
            return pt.name
          }
        }
        return null
      }
      
      const parcelsWithComputedData = {
        ...parcels,
        features: parcels.features.map((parcel, index) => {
          try {
            // Skip Outside Figure parcel (no area computation needed)
            const isOutsideFigure = 
              parcel.properties.stand?.toLowerCase().includes('outside figure') ||
              parcel.properties.designation?.toLowerCase().includes('outside figure') ||
              parcel.properties.metadata?.isOutsideFigure === true ||
              parcel.properties.isOutsideFigure === true
            
            if (isOutsideFigure) {
              fastify.log.info(`[GeoPDF] Skipping area computation for Outside Figure parcel`)
              return parcel
            }
            
            // Extract coordinates from GeoJSON geometry (unwrap double-nested [[ring]] → [ring])
            let coords = parcel.geometry.coordinates[0]
            if (Array.isArray(coords) && coords.length === 1 && Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
              coords = coords[0]
            }
            
            // Convert GeoJSON coords to Cape Lo {y, x} format with beacon names
            // GeoJSON from capeLoPointToGeoJson: [0] = Southing (Cape Lo X), [1] = Westing (Cape Lo Y)
            // Cape Lo convention: y = Westing, x = Southing
            const points = coords.slice(0, -1).map((coord, idx) => {
              const y = coord[1]  // Westing (Cape Lo Y)
              const x = coord[0]  // Southing (Cape Lo X)
              // findBeaconName uses SQL naming: pt.y=ST_Y(geom)=Southing, pt.x=ST_X(geom)=Westing
              // Pass (x=Southing, y=Westing) to match SQL column aliases
              const name = findBeaconName(x, y) || `Point${idx}`
              return { y, x, id: name, name }
            })
            
            // Compute complete area/consistency data using SAME logic as /compute/area endpoint
            const areaData = computeAreaConsistency(points, {
              hectaresThreshold: 10000,
              roundMetersDecimals: 2,
              roundHectaresDecimals: 4,
              includeResiduals: true
            })
            
            // Attach computed data to parcel properties
            return {
              ...parcel,
              properties: {
                ...parcel.properties,
                // Edge data for labels
                edges: areaData.edges.map(edge => ({
                  bearing: edge.bearingDeg,
                  distance: edge.distance,
                  distanceRounded: edge.distanceRounded,
                  directionDMS: edge.directionDMS,
                  from: edge.from,
                  to: edge.to
                })),
                // Area data for Schedule of Areas
                area_m2: areaData.area.abs_m2,
                area_ha: areaData.area.hectares_rounded,
                area_display: areaData.area.display,
                // Centroid for reference
                centroid_y: areaData.centroid.y,
                centroid_x: areaData.centroid.x,
                // Closure data for quality indicators
                closure_error_m: areaData.residuals.closureError,
                closure_error_formatted: areaData.residuals.closureErrorFormatted,
                closure_ratio: areaData.closure.ratio,
                closure_ratio_formatted: areaData.closure.ratioFormatted,
                perimeter_m: areaData.closure.perimeter
              }
            }
          } catch (error) {
            fastify.log.warn(`[GeoPDF] Failed to compute area/consistency for parcel ${parcel.properties.stand || parcel.properties.id}: ${error.message}`)
            return parcel // Return original parcel without computed data
          }
        })
      }
      
      fastify.log.info(`[GeoPDF] ✅ Computed area/consistency for ${parcelsWithComputedData.features.length} parcels`)
      
      // ⭐ PERSIST COMPUTED DATA: Save edges and closure data back to parcel metadata
      // This ensures data is available for Comprehensive_Latest.pdf generation later
      if (projectId) {
        fastify.log.info('[GeoPDF] 💾 Saving computed edges/closure data to parcel metadata...')
        
        const dbConnection = request.db
        
        for (const parcel of parcelsWithComputedData.features) {
          try {
            const stand = parcel.properties.stand
            if (!stand) continue
            
            // Find parcel in database by stand number
            const dbParcel = await LandParcel.findByStand(dbConnection, projectId, stand)
            if (!dbParcel) {
              fastify.log.warn(`[GeoPDF] Parcel ${stand} not found in database - skipping metadata save`)
              continue
            }
            
            // Log first edge to verify beacon names are included
            if (parcel.properties.edges && parcel.properties.edges.length > 0) {
              const firstEdge = parcel.properties.edges[0]
              fastify.log.info(`[GeoPDF] Sample edge for ${stand}: from=${JSON.stringify(firstEdge.from)}, to=${JSON.stringify(firstEdge.to)}`)
            }
            
            // Prepare metadata with computed data
            const updatedMetadata = {
              ...(dbParcel.metadata || {}),
              residuals: {
                edges: parcel.properties.edges || [],
                sumDy: parcel.properties.edges?.reduce((sum, e) => sum + (e.dy || 0), 0) || 0,
                sumDx: parcel.properties.edges?.reduce((sum, e) => sum + (e.dx || 0), 0) || 0,
                closureError: parcel.properties.closure_error_m,
                closureErrorFormatted: parcel.properties.closure_error_formatted,
              },
              closure: {
                perimeter: parcel.properties.perimeter_m,
                error: parcel.properties.closure_error_m,
                ratio: parcel.properties.closure_ratio,
                ratioFormatted: parcel.properties.closure_ratio_formatted,
              },
              last_computed: new Date().toISOString()
            }
            
            // Update parcel metadata in database
            await LandParcel.update(dbConnection, dbParcel.id, { metadata: updatedMetadata })
            fastify.log.info(`[GeoPDF] ✅ Saved metadata for parcel ${stand} (${parcel.properties.edges?.length || 0} edges)`)
          } catch (saveError) {
            fastify.log.warn(`[GeoPDF] Failed to save metadata for parcel ${parcel.properties.stand}: ${saveError.message}`)
          }
        }
        
        fastify.log.info('[GeoPDF] ✅ Metadata save complete')
      }

      if (renderEngine === 'pdfkit') {
        fastify.log.info('[GeoPDF] 🎨 Using PDFKit professional renderer (SI 727 layout + labels)')

        if (planType === 'diagram') {
          fastify.log.info('[GeoPDF] 📐 Diagram plan type → single-stand Diagram renderer')
          // The office numbers the diagram prints; logged so a blank cell can be told apart from a number that never arrived.
          fastify.log.info({ fileNo: metadata?.fileNo, srNo: metadata?.srNo, gpNo: metadata?.gpNo, compilation: metadata?.compilation, diagramSgNo: metadata?.diagramSgNo }, '[GeoPDF] Diagram office numbers received')
          const { generateDiagramPDF } = await import('../services/diagramPdf.js')
          const diagram = await generateDiagramPDF(
            { parcels: parcelsWithComputedData, beacons, metadata, projection,
              scale, sheetSize: (sheetSize === 'A3' ? 'A3' : 'A4'), orientation: 'portrait' },
            fastify.log
          )
          const ts = Date.now()
          reply
            .type('application/pdf')
            .headers({
              'Content-Disposition': `attachment; filename="diagram-${ts}.pdf"`,
              'X-Used-Scale': diagram.scale,
              'X-Used-Sheet-Size': diagram.sheetSize,
            })
            .send(diagram.pdfBuffer)
          return
        }

        const { generateGeoPDF: generatePDFKitGeoPDF, generateSheetedGeoPDF } = await import('../services/pdfkitGeoPDF.js')

        fastify.log.info(`[GeoPDF] 📐 Forwarding scale=${scale}, sheetSize=${sheetSize} to PDFKit renderer`)

        // First-pass render — detects whether multi-sheet is required
        const firstPass = await generatePDFKitGeoPDF(
          {
            signal: clientGone.signal,
            parcels: parcelsWithComputedData,
            beacons,
            annotations,
            outsideFigure,
            projection,
            extent: safeExtent,
            metadata,
            outsideFigureData,
            beaconLabels,
            scale,
            sheetSize,
            planType,
            trueGeoPDF,
            interactive,
            enableLayers,
            enableMeasurements,
            // dxf: true asks for this same render as a DXF (see below)
            recordOps: request.body.dxf === true
          },
          fastify.log
        )

        const suggestedScale = firstPass?.suggestedScale ?? null
        const usedScale       = firstPass?.scale ?? scale
        const usedSheetSize   = firstPass?.sheetSize ?? sheetSize ?? null
        const tileGrid        = firstPass?.tileGrid ?? null

        // The DXF of a General Plan is the PDF's own drawing: the render above, recorded, written out in
        // ground coordinates. It goes through everything the PDF went through (computed areas, outside
        // figure, side annotations), so the two cannot differ in what they hold.
        if (request.body.dxf === true && firstPass?.ops) {
          const { dxfBuffer } = dxfFromRecordedPlan(firstPass, request.body.dxfVersion)
          const { zip = true, includeGpkg = true, gpkgOnly = false } = request.body
          const ts = Date.now()
          const dxfHeaders = { 'X-Used-Scale': usedScale, 'X-Used-Sheet-Size': usedSheetSize }
          if (gpkgOnly) {
            const gpkg = await dxfToGeoreferencedGpkg(dxfBuffer, projection, fastify.log, clientGone.signal)
            if (!gpkg) return reply.code(500).send({ error: 'GeoPackage generation failed', message: 'ogr2ogr did not produce a .gpkg (see server logs).' })
            return reply.type('application/geopackage+sqlite3').headers({ ...dxfHeaders, 'Content-Disposition': `attachment; filename="survey-plan-${ts}.gpkg"` }).send(gpkg)
          }
          if (zip) {
            const payload = await zipDxfWithPrj(dxfBuffer, projection, `survey-plan-${ts}`, fastify.log, includeGpkg, clientGone.signal)
            return reply.type('application/zip').headers({ ...dxfHeaders, 'Content-Disposition': `attachment; filename="survey-plan-${ts}.zip"` }).send(payload)
          }
          return reply.type('application/dxf').headers({ ...dxfHeaders, 'Content-Disposition': `attachment; filename="survey-plan-${ts}.dxf"` }).send(dxfBuffer)
        }

        let finalPdfBuffer
        let isMultiSheet = false

        // A plan is several sheets when the SURVEYOR divided the figure, and
        // that fact arrives in the request: `sheets` is what the frontend's
        // buildSheetPayloads derived from the stored cut. More than one sheet
        // means the cut really divided the figure; exactly one means it did
        // not (no cut, or a cut that was withdrawn) and the mature single-plan
        // renderer is the right one.
        //
        // `tileGrid` is kept only as a legacy signal for a request that claims
        // a figure which does not fit one sheet. Tiling was retired
        // (planSheeting.js always resolves a best-effort single sheet), so
        // `needsTiling` is permanently false and this route's `tileGrid` is
        // permanently null — gating on it alone silently dropped every cut.
        const sheets = Array.isArray(request.body.sheets) ? request.body.sheets : null
        let sheetLayouts = null
        let sheetedWarnings = []
        const cutDividesFigure = sheets !== null && sheets.length > 1

        if (tileGrid || cutDividesFigure) {
          // SI 727 Reg 32(3): the figure does not fit one sheet. There is
          // nothing to tile anymore — a sheet boundary is a survey judgement,
          // so the only path to several sheets is the surveyor's own cuts.
          // Cut-based SheetPayloads come from the frontend's buildSheetPayloads;
          // the presence of `sheets` IS the evidence the cuts have been drawn.
          const choice = chooseSheeting({
            recommendedSheetSize: 'multi-sheet-required',
            cuts: Array.isArray(request.body.sheets) ? request.body.sheets : (request.body.cuts ?? []),
          })
          if (!choice.ok) {
            return reply.code(400).send({ error: choice.error, message: choice.message })
          }

          if (!Array.isArray(sheets) || sheets.length === 0) {
            return reply.code(400).send({
              error: 'sheets-required',
              message: 'The cuts are drawn but this plan\'s per-sheet payloads were not included in the request. Rebuild them from the map and generate again.',
            })
          }

          fastify.log.warn(`[GeoPDF] 🗺️ SI 727 Reg 32(3): multi-sheet plan — ${sheets.length} sheets from the surveyor's cuts`)
          const sheetedResult = await generateSheetedGeoPDF(
            {
              signal: clientGone.signal,
              sheets,
              metadata,
              beacons,
              projection,
              scale,
              sheetSize,
              planType,
              // Everything the single-sheet pass above already had. A sheet is
              // that same render restricted to its own stands, so withholding
              // the computed parcels, the refined beacon labels or the side
              // annotations is what made a cut plan look unlike the plan it was
              // cut from -- blank Area column, no servitude statement, unlabelled
              // beacons.
              parcels: parcelsWithComputedData,
              beaconLabels,
              annotations,
            },
            fastify.log
          )
          finalPdfBuffer = sheetedResult.pdf
          sheetedWarnings = sheetedResult.warnings ?? []
          sheetLayouts = sheetedResult.layouts ?? null
          isMultiSheet = true
        } else {
          finalPdfBuffer = firstPass?.pdfBuffer ?? firstPass
        }

        const ts = Date.now()
        const replyHeaders = {
          'Content-Disposition': isMultiSheet
            ? `attachment; filename="general-plan-multisheet-${ts}.pdf"`
            : `attachment; filename="survey-plan-professional-${ts}.pdf"`,
          'X-Used-Scale':      usedScale,
          'X-Used-Sheet-Size': usedSheetSize,
        }
        // What the renderer warned about (blocks overlapping the figure, tick marks over a
        // block, ...), in plain sentences, so the surveyor is told about a known fault
        // instead of finding it on the printed plan.
        const planWarningsHeader = encodeWarningsHeader(
          isMultiSheet ? sheetedWarnings : warningHints(firstPass?.warnings),
        )
        if (planWarningsHeader) replyHeaders['X-Plan-Warnings'] = planWarningsHeader
        if (suggestedScale) {
          replyHeaders['X-Suggested-Scale'] = suggestedScale
          fastify.log.warn(`[GeoPDF] 📏 Suggested scale for next render: ${suggestedScale}`)
        }
        if (isMultiSheet) {
          replyHeaders['X-Sheet-Count'] = String(request.body.sheets.length)
          // Each sheet's own scale and paper. X-Used-Scale above is the whole-plan
          // first pass's, which no sheet was drawn at.
          if (sheetLayouts?.length) {
            replyHeaders['X-Sheet-Layouts'] = JSON.stringify(sheetLayouts)
            replyHeaders['X-Used-Scale'] = sheetLayouts[0].scale
            replyHeaders['X-Used-Sheet-Size'] = sheetLayouts[0].sheetSize
          }
        }

        reply
          .type('application/pdf')
          .headers(replyHeaders)
          .send(finalPdfBuffer)

        return
      }
      
      // GDAL engine. Every file is written under this request's own names and removed in the finally below.
      if (!/^[A-Za-z]+:\d+$/.test(String(projection))) {
        return reply.code(400).send({ error: 'projection must look like EPSG:22291 for the gdal render engine' })
      }
      const timestamp = Date.now()
      const parcelsGeoJSON = path.join(tempDir, `parcels-${timestamp}.geojson`)
      const beaconsGeoJSON = path.join(tempDir, `beacons-${timestamp}.geojson`)
      const annotationsGeoJSON = annotations ? path.join(tempDir, `annotations-${timestamp}.geojson`) : null
      const layersVrt = path.join(tempDir, `vector-${timestamp}.vrt`)
      const outputPdf = path.join(tempDir, `vector-geopdf-${timestamp}.pdf`)
      const tempFiles = [parcelsGeoJSON, beaconsGeoJSON, annotationsGeoJSON, layersVrt, outputPdf].filter(Boolean)

      try {
        // Write parcels, beacons and (when given) annotations to GeoJSON files
        const layers = [
          { name: 'parcels', file: parcelsGeoJSON, data: swapYxToXyFeatureCollection(parcelsWithComputedData) },
          { name: 'beacons', file: beaconsGeoJSON, data: swapYxToXyFeatureCollection(beacons) },
          ...(annotationsGeoJSON ? [{ name: 'annotations', file: annotationsGeoJSON, data: swapYxToXyFeatureCollection(annotations) }] : []),
        ]
        for (const l of layers) await writeFile(l.file, JSON.stringify(l.data))

        const ogrCmd = await getOGR2OGRCommand()
        if (!ogrCmd) {
          throw new Error('ogr2ogr command not found. Install QGIS or GDAL.')
        }
        const pdfDriver = await driverSupport(ogrCmd, 'PDF')
        if (!pdfDriver?.write) {
          throw new Error('This GDAL build cannot write PDF (ogr2ogr has no PDF driver with write support).')
        }

        // The PDF driver makes its layers when the file is created and cannot add one to a file that
        // already exists ("Layer ... cannot be created by the output driver"), so the layers cannot be
        // appended one ogr2ogr call at a time. A VRT presents them as one datasource: one call writes all.
        await writeFile(layersVrt, vrtOf(layers.map((l) => ({ name: l.name, file: l.file }))))

        // Creation options come from what THIS GDAL's PDF driver lists (and the right kind: a dataset option
        // is -dsco, not -lco); one it does not know is dropped and logged instead of being warned about.
        const { args: creation, dropped } = await creationArgs(ogrCmd, 'PDF', { GEO_ENCODING: 'ISO32000' })
        if (dropped.length) fastify.log.info(`[GeoPDF] GDAL PDF driver has no option(s): ${dropped.join(', ')}`)

        const { stderr } = await runGdal(ogrCmd,
          ['-f', 'PDF', ...creation, '-s_srs', projection, '-a_srs', projection, outputPdf, layersVrt],
          { signal: clientGone.signal, timeout: 120_000 })
        if (stderr && !/warning/i.test(stderr)) {
          fastify.log.warn(`[GeoPDF] ogr2ogr stderr: ${stderr.substring(0, 2000)}`)
        }
        vectorPdfCreated = true
        fastify.log.info('[GeoPDF] GDAL vector PDF created successfully')

        if (!existsSync(outputPdf)) {
          return reply.code(500).send({
            error: 'Failed to generate vector GeoPDF',
            message: 'ogr2ogr did not produce an output PDF. Check server logs for GDAL errors.'
          })
        }

        const pdfBuffer = await readFile(outputPdf)
        reply
          .type('application/pdf')
          .header('Content-Disposition', `attachment; filename="survey-plan-vector-geo-${timestamp}.pdf"`)
          .send(pdfBuffer)
        return
      } catch (ogrError) {
        // A client that went away kills ogr2ogr (an AbortError) and is answered by the outer handler;
        // anything else is a GDAL failure.
        if (clientGone.signal.aborted || ogrError?.name === 'AbortError') throw cancelledError()
        if (!isCancelled(ogrError)) {
          fastify.log.error({
            msg: '[GeoPDF] GDAL vector generation failed',
            error: ogrError?.message,
            stderr: ogrError?.stderr,
            stdout: ogrError?.stdout
          })
          return reply.code(500).send({
            error: 'Failed to generate vector GeoPDF',
            message: 'ogr2ogr did not produce an output PDF. Check server logs for GDAL errors.'
          })
        }
        throw ogrError
      } finally {
        await Promise.all(tempFiles.map((file) => unlink(file).catch(() => {})))
      }

    } catch (error) {
      // The client went away and the render stopped on purpose: nobody is left to answer.
      if (isCancelled(error)) {
        fastify.log.info('[GeoPDF] Client disconnected; vector GeoPDF generation cancelled')
        return reply.code(499).send()   // the socket is closed; this only settles the handler
      }
      // Structured error logging
      fastify.log.error({
        msg: 'Error generating vector GeoPDF',
        error: error.message,
        stack: error.stack,
        stderr: error.stderr,
        stdout: error.stdout,
        projection: request.body.projection,
        parcelCount: request.body.parcels?.features?.length,
        beaconCount: request.body.beacons?.features?.length
      })

      // Cleanup temp files on error
      const timestamp = Date.now()
      const cleanupFiles = [
        path.join(tempDir, `parcels-${timestamp}.geojson`),
        path.join(tempDir, `beacons-${timestamp}.geojson`),
        path.join(tempDir, `annotations-${timestamp}.geojson`),
        path.join(tempDir, `vector-geopdf-${timestamp}.pdf`)
      ]

      await Promise.all(
        cleanupFiles.map(file => 
          unlink(file).catch(() => {
            // Ignore cleanup errors
          })
        )
      )

      return reply.code(500).send({
        error: 'Failed to generate vector GeoPDF',
        message: error.message,
        suggestion: error.message.includes('ogr2ogr') 
          ? 'Check GDAL/QGIS installation and PROJ_LIB environment variable'
          : 'Check server logs for details',
        stderr: error.stderr?.substring(0, 500), // Limit error output
        timestamp: new Date().toISOString()
      })
    }
  })
  
  fastify.log.info('POST /geopdf/vector route registration COMPLETE')
}
