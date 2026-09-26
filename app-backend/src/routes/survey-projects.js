import SurveyProject from '../models/SurveyProject.js'
import SurveyorProfile from '../models/SurveyorProfile.js'
import { createProjectDirectories, deleteProjectDirectory } from '../utils/projectDirectories.js'
import { authenticateWithSchema } from '../utils/schemaAuth.js'
import { applyStepReset, canFinalize, canonicalStep } from '../utils/workflowReset.js'

export default async function surveyProjectRoutes(fastify, options) {
  // Get recent survey projects (last 5, sorted by last_used)
  fastify.get('/recent', {
    preHandler: [fastify.authenticate, authenticateWithSchema]
  }, async (request, reply) => {
    try {
      const userId = request.user.sub || request.user.id
      const limit = parseInt(request.query.limit) || 5
      
      fastify.log.info(`[GET /survey-projects/recent] Request from user: ${request.user?.email}, limit: ${limit}`)
      
      const profile = await SurveyorProfile.findByUserId(userId)
      
      if (!profile) {
        return reply.code(404).send({ 
          ok: false, 
          error: 'No surveyor profile found. Please complete your profile first.' 
        })
      }
      
      const db = request.db || (await import('../config/db.js')).default
      const projects = await SurveyProject.findRecent(db, profile.id, limit)
      
      fastify.log.info(`[GET /survey-projects/recent] Returning ${projects.length} recent projects`)
      
      return { ok: true, data: projects }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Failed to fetch recent projects' })
    }
  })

  // Get all survey projects (filtered by current user if authenticated)
  fastify.get('/', {
    preHandler: [fastify.authenticate, authenticateWithSchema]
  }, async (request, reply) => {
    try {
      const userId = request.user.sub || request.user.id
      
      // Always filter by authenticated user's surveyor profile
      const profile = await SurveyorProfile.findByUserId(userId)
      
      if (!profile) {
        fastify.log.warn(`[GET /survey-projects] No profile for user_id ${userId}`)
        return reply.code(404).send({ 
          ok: false, 
          error: 'No surveyor profile found. Please complete your profile first.' 
        })
      }
      
      const db = request.db || (await import('../config/db.js')).default
      const projects = await SurveyProject.findAll(db, profile.id)
      
      return { ok: true, projects }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Failed to fetch survey projects' })
    }
  })

  // Update project last_used timestamp
  fastify.post('/:id/touch', {
    preHandler: [fastify.authenticate, authenticateWithSchema]
  }, async (request, reply) => {
    try {
      const { id } = request.params
      const userId = request.user.sub || request.user.id
      
      fastify.log.info(`[POST /survey-projects/${id}/touch] Updating last_used for user: ${request.user?.email}`)
      
      const profile = await SurveyorProfile.findByUserId(userId)
      if (!profile) {
        return reply.code(404).send({ ok: false, error: 'No surveyor profile found' })
      }
      
      const db = request.db || (await import('../config/db.js')).default
      
      // Verify project exists (ownership is implicit from schema context)
      const project = await SurveyProject.findById(db, id)
      if (!project) {
        return reply.code(404).send({ ok: false, error: 'Project not found' })
      }
      
      await SurveyProject.updateLastUsed(db, id)
      
      return { ok: true, message: 'Project last_used updated' }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Failed to update project' })
    }
  })

  // Get survey project by ID
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, authenticateWithSchema]
  }, async (request, reply) => {
    try {
      const { id } = request.params
      const db = request.db || (await import('../config/db.js')).default
      const project = await SurveyProject.findById(db, id)
      
      if (!project) {
        return reply.code(404).send({ ok: false, error: 'Survey project not found' })
      }
      
      // Ownership is implicit from schema context - if project exists in user's schema, they own it
      
      return { ok: true, project }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Failed to fetch survey project' })
    }
  })

  // Create new survey project
  fastify.post('/', {
    preHandler: [fastify.authenticate, authenticateWithSchema]
  }, async (request, reply) => {
    try {
      fastify.log.info(`[POST /survey-projects] Creating project for user: ${request.user?.email}`)
      console.log(`[POST /survey-projects] Request body:`, JSON.stringify(request.body, null, 2))
      
      const {
        name,
        surveyorProfileId,
        projectId,
        clientName,
        district,
        surveyType,
        surveyDate,
        instruments,
        assistedBy,
        instrumentDescription,
        instrumentBaseSerial,
        instrumentRoverSerial,
        designation,
        workingDirectory,
        controlPoints
      } = request.body
      
      if (!name) {
        return reply.code(400).send({ 
          ok: false, 
          error: 'Project name is required' 
        })
      }
      
      // Get surveyor profile ID from authenticated user if not provided
      let profileId = surveyorProfileId
      if (!profileId) {
        const userId = request.user.sub || request.user.id
        const profile = await SurveyorProfile.findByUserId(userId)
        if (!profile) {
          return reply.code(400).send({ 
            ok: false, 
            error: 'Please complete your surveyor profile first' 
          })
        }
        profileId = profile.id
      }

      // Extract control points data
      const centralMeridian = controlPoints?.meridian || null
      const controlPointIds = controlPoints?.points || []

      const db = request.db || (await import('../config/db.js')).default
      // assistedBy/instrumentDescription/instrumentBaseSerial/instrumentRoverSerial
      // are deliberately NOT forwarded here: SurveyProject.create()'s INSERT
      // does not name those columns (migration 089 is unapplied on this
      // machine, so widening the INSERT would break project creation until
      // it is applied), exactly like `instruments` and `designation` already
      // behave. All four are persisted moments later by the project-setup
      // flow's SurveyProject.update() call, whose allowedColumns already
      // includes them.
      const project = await SurveyProject.create(db, {
        name,
        surveyorId: profileId,
        projectId,
        clientName,
        district,
        surveyType,
        surveyDate,
        instruments,
        designation,
        workingDirectory,
        centralMeridian,
        controlPointIds
      })

      // Create project directory structure if working directory is provided
      if (workingDirectory) {
        fastify.log.info(`[CREATE] Attempting to create directories for project ${project.id}`)
        fastify.log.info(`[CREATE] Working directory: ${workingDirectory}`)
        
        const dirResult = await createProjectDirectories(workingDirectory)
        
        if (!dirResult.success) {
          fastify.log.error(`[CREATE] Failed to create directories for project ${project.id}: ${dirResult.message}`)
        } else {
          fastify.log.info(`[CREATE] ✅ ${dirResult.message}`)
          if (dirResult.absolutePath) {
            fastify.log.info(`[CREATE] Absolute path: ${dirResult.absolutePath}`)
          }
        }
      } else {
        fastify.log.warn(`[CREATE] No working directory provided for project ${project.id}`)
      }

      return reply.code(201).send({ ok: true, project })
    } catch (error) {
      console.error(`[POST /survey-projects] ERROR DETAILS:`)
      console.error(`Message: ${error.message}`)
      console.error(`Stack:`, error.stack)
      console.error(`Full error:`, error)
      fastify.log.error(error)
      return reply.code(500).send({ 
        ok: false, 
        error: 'Failed to create survey project',
        details: error.message 
      })
    }
  })

  // Update survey project
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, authenticateWithSchema]
  }, async (request, reply) => {
    try {
      const { id } = request.params
      
      const db = request.db || (await import('../config/db.js')).default
      
      // Verify project exists (ownership is implicit from schema context)
      const existingProject = await SurveyProject.findById(db, id)
      if (!existingProject) {
        return reply.code(404).send({ ok: false, error: 'Survey project not found' })
      }
      
      const project = await SurveyProject.update(db, id, request.body)

      if (!project) {
        return reply.code(404).send({ ok: false, error: 'Survey project not found' })
      }

      // Create project directory structure if working directory is provided/updated
      if (request.body.workingDirectory) {
        fastify.log.info(`[UPDATE] Attempting to create directories for project ${id}`)
        fastify.log.info(`[UPDATE] Working directory: ${request.body.workingDirectory}`)
        
        const dirResult = await createProjectDirectories(request.body.workingDirectory)
        
        if (!dirResult.success) {
          fastify.log.error(`[UPDATE] Failed to create directories for project ${id}: ${dirResult.message}`)
        } else {
          fastify.log.info(`[UPDATE] ✅ ${dirResult.message}`)
          if (dirResult.absolutePath) {
            fastify.log.info(`[UPDATE] Absolute path: ${dirResult.absolutePath}`)
          }
        }
      } else {
        fastify.log.warn(`[UPDATE] No working directory in request body for project ${id}`)
      }

      return { ok: true, project }
    } catch (error) {
      console.error(`[PUT /survey-projects/${request.params.id}] ERROR DETAILS:`)
      console.error(`Message: ${error.message}`)
      console.error(`Stack:`, error.stack)
      console.error(`Request body:`, JSON.stringify(request.body, null, 2))
      fastify.log.error(error)
      return reply.code(500).send({ 
        ok: false, 
        error: 'Failed to update survey project',
        details: error.message 
      })
    }
  })

  // Delete survey project (soft delete or permanent delete)
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, authenticateWithSchema]
  }, async (request, reply) => {
    try {
      const { id } = request.params
      const { permanent } = request.query // Check if permanent deletion is requested
      
      const db = request.db || (await import('../config/db.js')).default
      
      // Verify project exists (ownership is implicit from schema context)
      const existingProject = await SurveyProject.findById(db, id)
      if (!existingProject) {
        return reply.code(404).send({ ok: false, error: 'Survey project not found' })
      }
      
      let project
      let message
      
      if (permanent === 'true') {
        // Permanent deletion - delete both database records AND files
        fastify.log.warn(`[DELETE] Permanently deleting project ${id} (${existingProject.name})`)
        
        // Delete from database first
        project = await SurveyProject.permanentDelete(db, id)
        
        if (!project) {
          return reply.code(404).send({ ok: false, error: 'Survey project not found' })
        }
        
        // Delete project directory and all files
        if (existingProject.working_directory) {
          fastify.log.info(`[DELETE] Deleting project directory: ${existingProject.working_directory}`)
          const dirResult = await deleteProjectDirectory(existingProject.working_directory)
          
          if (dirResult.success) {
            fastify.log.info(`[DELETE] ✅ ${dirResult.message}`)
            message = 'Survey project and all files permanently deleted'
          } else {
            fastify.log.warn(`[DELETE] ⚠️ Database deleted but directory cleanup failed: ${dirResult.message}`)
            message = 'Survey project deleted from database, but some files may remain'
          }
        } else {
          fastify.log.info(`[DELETE] No working directory specified for project ${id}`)
          message = 'Survey project permanently deleted (no files to clean up)'
        }
      } else {
        // Soft delete (archive)
        fastify.log.info(`[DELETE] Archiving project ${id} (${existingProject.name})`)
        project = await SurveyProject.delete(db, id)
        
        if (!project) {
          return reply.code(404).send({ ok: false, error: 'Survey project not found' })
        }
        
        message = 'Survey project archived successfully'
      }

      return { ok: true, message }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Failed to delete survey project' })
    }
  })

  // Get workflow state for a project
  fastify.get('/:id/workflow', {
    preHandler: [fastify.authenticate, authenticateWithSchema]
  }, async (request, reply) => {
    try {
      const { id } = request.params
      const db = request.db || (await import('../config/db.js')).default
      const project = await SurveyProject.findById(db, id)
      
      if (!project) {
        return reply.code(404).send({ ok: false, error: 'Survey project not found' })
      }
      
      // Ownership is implicit from schema context
      
      // Return workflow state or default
      const workflowState = project.workflow_state || {
        completed_steps: [],
        current_step: 'project_setup',
        step_data: {},
        generated_documents: {},
        can_finalize: false,
        finalized_at: null
      }
      
      fastify.log.info(`[GET /workflow] Retrieved workflow state for project ${id}`)
      
      return { ok: true, workflow_state: workflowState }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Failed to retrieve workflow state' })
    }
  })

  // Update workflow state for a project
  fastify.patch('/:id/workflow', {
    preHandler: [fastify.authenticate, authenticateWithSchema]
  }, async (request, reply) => {
    try {
      const { id } = request.params
      const { step, action, metadata } = request.body
      
      fastify.log.info(`[PATCH /workflow] Updating workflow for project ${id}: step=${step}, action=${action}`)
      
      const db = request.db || (await import('../config/db.js')).default
      
      // Get existing project
      const project = await SurveyProject.findById(db, id)
      
      if (!project) {
        return reply.code(404).send({ ok: false, error: 'Survey project not found' })
      }
      
      // Ownership is implicit from schema context
      
      // Get current workflow state
      const currentState = project.workflow_state || {
        completed_steps: [],
        current_step: 'project_setup',
        step_data: {},
        generated_documents: {},
        can_finalize: false
      }
      
      // Update based on action
      if (action === 'complete') {
        // Mark step as completed
        if (!currentState.completed_steps.includes(step)) {
          currentState.completed_steps.push(step)
          fastify.log.info(`[PATCH /workflow] Step '${step}' marked as completed`)
        }
        
        // Log metadata for debugging
        if (metadata && metadata.points) {
          fastify.log.info(`[PATCH /workflow] Received ${metadata.points.length} points`)
          if (metadata.points.length > 0) {
            fastify.log.info(`[PATCH /workflow] First point: ${JSON.stringify(metadata.points[0])}`)
          }
        }
        
        // Store step metadata
        currentState.step_data[step] = {
          ...currentState.step_data[step],
          ...metadata,
          completed_at: new Date().toISOString(),
          last_modified: new Date().toISOString()
        }
      } else if (action === 'set_current') {
        // Update current step
        currentState.current_step = step
        fastify.log.info(`[PATCH /workflow] Current step set to '${step}'`)
      } else if (action === 'update') {
        // Update step metadata without marking as complete
        currentState.step_data[step] = {
          ...currentState.step_data[step],
          ...metadata,
          last_modified: new Date().toISOString()
        }
      } else if (action === 'add_document') {
        // Store generated document reference
        const { document_key, document_url, document_metadata } = metadata
        currentState.generated_documents[document_key] = {
          url: document_url,
          generated_at: new Date().toISOString(),
          ...document_metadata
        }
        fastify.log.info(`[PATCH /workflow] Document '${document_key}' added`)
      } else if (action === 'reset_step') {
        // Clear the named step AND everything computed from it.
        //
        // Clearing only the named step is what produced the split-brain state
        // this now prevents: a csv-import reset deleted the `coordinate_points`
        // rows but left `step_data['calculations-part1']`, the field book, the
        // coordinate list and the area computation behind, each still marked
        // complete. The area step went on reporting adjusted coordinates that
        // no longer had a single source row, the Survey Plan map loaded an empty
        // point set, and the plan preview 404'd — with the workflow claiming the
        // project was further along than it was.
        const cleared = applyStepReset(currentState, step)

        // Send the surveyor back to the step being reset.
        //
        // Without this the pointer stayed wherever it was, which stranded the
        // project: the CSV import screen renders only when current_step is
        // 'csv-import' AND no points are loaded, and the step navigation that
        // would let you click back to it is itself hidden when there are no
        // imported points. Resetting from a later step therefore removed every
        // route back to the importer.
        const canonical = canonicalStep(step)
        currentState.current_step =
          (canonical === 'csv-import') ? 'csv-import' : canonical

        // If resetting CSV import step, also delete coordinate points from database
        if (canonical === 'csv-import') {
          try {
            // `db` is already schema-scoped -- getSurveyorPool sets
            // `search_path = <surveyor schema>, public` before every query -- so
            // the unqualified table name resolves to the right schema.
            //
            // The previous implementation looked the project up via an
            // unqualified `survey_projects JOIN surveyor_profiles` to discover
            // the schema name. That join resolved to `public`, which holds only
            // legacy projects, so for any project living in a surveyor schema it
            // returned no row -- and the DELETE, guarded by `rows.length > 0`,
            // never ran. The reset reported success while every coordinate point
            // survived, and the stale points then re-hydrated the workflow on the
            // next load.
            const deleted = await db.query(
              `DELETE FROM coordinate_points WHERE project_id = $1`,
              [id]
            )
            fastify.log.info(`[PATCH /workflow] Deleted ${deleted.rowCount} coordinate point(s) for project ${id}`)
          } catch (error) {
            fastify.log.error(`[PATCH /workflow] Failed to delete coordinate points: ${error.message}`)
          }
        }

        fastify.log.info(
          `[PATCH /workflow] Step '${step}' reset; cleared ${cleared.join(', ')}; ` +
          `current_step now '${currentState.current_step}'`
        )
      }
      
      // Check if workflow can be finalized (all required steps completed)
      currentState.can_finalize = canFinalize(currentState)
      
      // Update database using schema-aware connection
      const result = await db.query(
        `UPDATE survey_projects 
         SET workflow_state = $1, updated_at = NOW() 
         WHERE id = $2 
         RETURNING *`,
        [JSON.stringify(currentState), id]
      )
      
      if (result.rows.length === 0) {
        return reply.code(404).send({ ok: false, error: 'Failed to update workflow state' })
      }
      
      fastify.log.info(`[PATCH /workflow] Workflow state updated successfully for project ${id}`)
      
      return { ok: true, workflow_state: currentState }
    } catch (error) {
      console.error('[PATCH /workflow] Error:', error)
      fastify.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Failed to update workflow state' })
    }
  })
}
