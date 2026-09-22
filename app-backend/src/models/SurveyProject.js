import db from '../config/db.js'

class SurveyProject {
  /**
   * Create a new survey project
   */
  static async create(dbConnection = db, {
    name,
    surveyorId,
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
  }) {
    const client = await dbConnection.connect()
    
    try {
      await client.query('BEGIN')
      
      // Create project (surveyor schema tables have limited columns - see migration 040.do.sql)
      // Available columns: name, client_name, survey_type, survey_date, district, central_meridian, working_directory, status, metadata
      const result = await client.query(
        `INSERT INTO survey_projects 
         (name, client_name, district, survey_type, survey_date, working_directory, central_meridian, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [name, clientName, district, surveyType, surveyDate, workingDirectory, centralMeridian, 'active']
      )
      
      const project = result.rows[0]
      
      // Insert control points if provided
      if (controlPointIds && controlPointIds.length > 0) {
        for (let i = 0; i < controlPointIds.length; i++) {
          await client.query(
            `INSERT INTO project_control_points (project_id, control_point_id, point_order)
             VALUES ($1, $2, $3)`,
            [project.id, controlPointIds[i], i + 1]
          )
        }
      }
      
      await client.query('COMMIT')
      return project
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Get all survey projects (optionally filtered by surveyor)
   */
  static async findAll(dbConnection = db, surveyorProfileId = null) {
    // Schema-per-surveyor: survey_projects table is in each surveyor's schema
    // The dbConnection is already set to the correct schema via SET search_path
    const query = `
      SELECT sp.*
      FROM survey_projects sp
      WHERE sp.status = 'active'
      ORDER BY sp.created_at DESC
    `
    
    const result = await dbConnection.query(query)
    const projects = result.rows
    
    // Fetch control points for each project
    for (const project of projects) {
      const controlPointsResult = await dbConnection.query(
        `SELECT cp.id, cp.monu_num, cp.monu_name, pcp.point_order
         FROM project_control_points pcp
         JOIN public.zim_control_points cp ON pcp.control_point_id = cp.id
         WHERE pcp.project_id = $1
         ORDER BY pcp.point_order`,
        [project.id]
      )
      
      project.control_points = controlPointsResult.rows
      project.control_point_ids = controlPointsResult.rows.map(cp => cp.id)
    }
    
    // Single summary line
    const summary = projects.map(p => `${p.name}(Lo${p.central_meridian || '?'},${p.control_point_ids?.length || 0}cp)`).join(', ')
    console.log(`[SurveyProject.findAll] ✅ ${projects.length} projects: ${summary}`)
    
    return projects
  }

  /**
   * Get survey project by ID
   */
  static async findById(dbConnection = db, id) {
    // Surveyor schema tables don't have surveyor_profile_id - ownership is implicit from schema
    const result = await dbConnection.query(
      `SELECT sp.*
       FROM survey_projects sp
       WHERE sp.id = $1`,
      [id]
    )
    
    const project = result.rows[0]
    if (!project) {
      console.log(`[SurveyProject.findById] ❌ Project ${id} not found`)
      return null
    }
    
    // Fetch control points for this project
    const controlPointsResult = await dbConnection.query(
      `SELECT cp.*, pcp.point_order
       FROM project_control_points pcp
       JOIN public.zim_control_points cp ON pcp.control_point_id = cp.id
       WHERE pcp.project_id = $1
       ORDER BY pcp.point_order`,
      [id]
    )
    
    project.control_points = controlPointsResult.rows
    project.control_point_ids = controlPointsResult.rows.map(cp => cp.id)
    
    console.log(`[SurveyProject.findById] ✅ "${project.name}" (Lo${project.central_meridian || '?'}, ${project.control_point_ids.length}cp)`)
    
    return project
  }

  /**
   * Update survey project
   */
  static async update(dbConnection = db, id, data) {
    const client = await dbConnection.connect()
    
    try {
      await client.query('BEGIN')
      
      // Extract control points data before processing
      const controlPoints = data.controlPoints
      delete data.controlPoints
      
      // Surveyor schema survey_projects table columns (see migrations 040.do.sql and 061)
      const allowedColumns = [
        'name', 'client_name', 'survey_type', 'survey_date', 'district',
        'central_meridian', 'working_directory', 'status', 'metadata',
        'workflow_state', 'last_used', 'datum', 'instruments', 'designation', 'township',
        'whole_portion', 'parent_property',
        'deed_of_transfer_no', 'parent_diagram_no', 'parent_diagram_annexed_to',
        'original_title_diagram_no', 'original_title_annexed_to', 'original_title_deed_no',
        'sr_no', 'file_no', 'gp_no', 'compilation',
        // Field book cover (migration 089)
        'assisted_by', 'instrument_description', 'instrument_base_serial', 'instrument_rover_serial'
      ]
      
      const fields = []
      const values = []
      let paramCount = 1

      // Which of the allowed columns actually exist on THIS table right now? A surveyor
      // schema lags the migration list on machines where e.g. 089 is unapplied, and
      // emitting a SET for a missing column is a Postgres 42703 -> 500. Mirroring the
      // create route's defensive split: migration 089's four fields (assisted_by,
      // instrument_description, instrument_base_serial, instrument_rover_serial) are
      // simply not persisted until that migration is applied -- the workflow_state copy
      // of the same data carries them meanwhile, and this query re-adds them as soon as
      // the column appears on any deploy.
      const colsResult = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'survey_projects'`
      )
      const existingColumns = new Set(colsResult.rows.map(r => r.column_name))

      Object.keys(data).forEach(key => {
        if (data[key] !== undefined) {
          let snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
          
          // Skip columns that don't exist in surveyor schemas
          // (surveyor_profile_id, project_id, instruments, designation)
          if (!allowedColumns.includes(snakeKey)) {
            console.log(`[SurveyProject.update] ⚠️ Skipping non-existent column: ${snakeKey}`)
            return
          }
          // Skip columns that exist in the migration list but not on the live table
          // (their migration is unapplied on this machine)
          if (!existingColumns.has(snakeKey)) {
            console.log(`[SurveyProject.update] ⚠️ Skipping column absent from schema (migration unapplied?): ${snakeKey}`)
            return
          }
          
          fields.push(`${snakeKey} = $${paramCount}`)
          
          // Handle JSON fields - stringify objects for workflow_state and metadata
          if ((snakeKey === 'workflow_state' || snakeKey === 'metadata') && typeof data[key] === 'object') {
            values.push(JSON.stringify(data[key]))
          } else {
            values.push(data[key])
          }
          
          paramCount++
        }
      })

      if (fields.length === 0 && !controlPoints) return null

      // Update project if there are fields to update
      let project
      if (fields.length > 0) {
        values.push(id)
        const query = `
          UPDATE survey_projects 
          SET ${fields.join(', ')}
          WHERE id = $${paramCount}
          RETURNING *
        `
        const result = await client.query(query, values)
        project = result.rows[0]
      } else {
        // Just fetch the project if only updating control points
        const result = await client.query('SELECT * FROM survey_projects WHERE id = $1', [id])
        project = result.rows[0]
      }
      
      // Update control points if provided
      if (controlPoints) {
        // Delete existing control points
        await client.query('DELETE FROM project_control_points WHERE project_id = $1', [id])
        
        // Update central meridian if provided
        if (controlPoints.meridian !== undefined) {
          await client.query(
            'UPDATE survey_projects SET central_meridian = $1 WHERE id = $2',
            [controlPoints.meridian, id]
          )
          project.central_meridian = controlPoints.meridian
        }
        
        // Insert new control points
        if (controlPoints.points && controlPoints.points.length > 0) {
          for (let i = 0; i < controlPoints.points.length; i++) {
            await client.query(
              `INSERT INTO project_control_points (project_id, control_point_id, point_order)
               VALUES ($1, $2, $3)`,
              [id, controlPoints.points[i], i + 1]
            )
          }
        }
      }
      
      await client.query('COMMIT')
      return project
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Get recent survey projects (sorted by last_used)
   */
  static async findRecent(dbConnection = db, surveyorProfileId, limit = 5) {
    // Surveyor schema tables don't have surveyor_profile_id - ownership is implicit from schema
    const query = `
      SELECT sp.*
      FROM survey_projects sp
      WHERE sp.status = 'active'
      ORDER BY sp.last_used DESC NULLS LAST, sp.created_at DESC
      LIMIT $1
    `
    
    const result = await dbConnection.query(query, [limit])
    const projects = result.rows
    
    // Fetch control points for each project
    for (const project of projects) {
      const controlPointsResult = await dbConnection.query(
        `SELECT cp.id, cp.monu_num, cp.monu_name, pcp.point_order
         FROM project_control_points pcp
         JOIN public.zim_control_points cp ON pcp.control_point_id = cp.id
         WHERE pcp.project_id = $1
         ORDER BY pcp.point_order`,
        [project.id]
      )
      
      project.control_points = controlPointsResult.rows
      project.control_point_ids = controlPointsResult.rows.map(cp => cp.id)
    }
    
    return projects
  }

  /**
   * Update last_used timestamp for a project
   */
  static async updateLastUsed(dbConnection = db, id) {
    const result = await dbConnection.query(
      'UPDATE survey_projects SET last_used = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    )
    return result.rows[0]
  }

  /**
   * Soft delete survey project (archive)
   */
  static async delete(dbConnection = db, id) {
    const result = await dbConnection.query(
      'UPDATE survey_projects SET status = \'archived\' WHERE id = $1 RETURNING *',
      [id]
    )
    return result.rows[0]
  }

  /**
   * Permanently delete survey project and all related data
   */
  static async permanentDelete(dbConnection = db, id) {
    const client = await dbConnection.connect()
    
    try {
      await client.query('BEGIN')
      
      // Delete related data in order (respecting foreign key constraints)
      // Note: Many tables have ON DELETE CASCADE, but we delete explicitly for clarity
      
      // 1. Delete coordinate point history (references coordinate_points)
      await client.query('DELETE FROM coordinate_point_history WHERE point_id IN (SELECT id FROM coordinate_points WHERE project_id = $1)', [id])
      
      // 2. Delete coordinate points
      await client.query('DELETE FROM coordinate_points WHERE project_id = $1', [id])
      
      // 3. Delete land parcels
      await client.query('DELETE FROM land_parcels WHERE project_id = $1', [id])
      
      // 4. Delete parcels (if any exist in the parcels table)
      await client.query('DELETE FROM parcels WHERE project_id = $1', [id])
      
      // 5. Delete CSV import history
      await client.query('DELETE FROM project_csv_imports WHERE project_id = $1', [id])
      
      // 6. Delete project control points
      await client.query('DELETE FROM project_control_points WHERE project_id = $1', [id])
      
      // 7. Delete project meridian cache
      await client.query('DELETE FROM project_meridian_cache WHERE project_id = $1', [id])
      
      // 8. Finally, delete the project itself
      const result = await client.query(
        'DELETE FROM survey_projects WHERE id = $1 RETURNING *',
        [id]
      )
      
      await client.query('COMMIT')
      return result.rows[0]
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}

export default SurveyProject
