-- Function to create project-specific views for QGIS workflow
-- This ensures proper project_id linking when digitizing in QGIS

CREATE OR REPLACE FUNCTION create_project_views(p_project_id INTEGER)
RETURNS json AS $$
DECLARE
    v_coord_view TEXT;
    v_parcel_view TEXT;
    result json;
BEGIN
    v_coord_view := 'coordinate_points_project_' || p_project_id;
    v_parcel_view := 'land_parcels_project_' || p_project_id;
    
    -- Drop existing views if they exist
    EXECUTE format('DROP VIEW IF EXISTS %I CASCADE', v_coord_view);
    EXECUTE format('DROP VIEW IF EXISTS %I CASCADE', v_parcel_view);
    
    -- Create coordinate points view (read-only reference for QGIS)
    EXECUTE format('
        CREATE VIEW %I AS
        SELECT 
            id,
            %s as project_id,
            name,
            geom,
            elevation,
            description,
            survey_date,
            surveyor,
            created_at,
            updated_at
        FROM coordinate_points
        WHERE project_id = %s
    ', v_coord_view, p_project_id, p_project_id);
    
    -- Create land parcels view (writable for QGIS digitization)
    EXECUTE format('
        CREATE VIEW %I AS
        SELECT 
            id,
            %s as project_id,
            stand,
            geom,
            owner,
            title_deed,
            survey_date,
            surveyor,
            notes,
            area_m2,
            area_ha,
            perimeter_m,
            created_at,
            updated_at
        FROM land_parcels
        WHERE project_id = %s
    ', v_parcel_view, p_project_id, p_project_id);
    
    -- Make land_parcels view writable with INSERT rule
    EXECUTE format('
        CREATE OR REPLACE RULE %I AS
        ON INSERT TO %I
        DO INSTEAD
        INSERT INTO land_parcels (project_id, stand, geom, owner, title_deed, survey_date, surveyor, notes)
        VALUES (%s, NEW.stand, NEW.geom, NEW.owner, NEW.title_deed, NEW.survey_date, NEW.surveyor, NEW.notes)
        RETURNING 
            id,
            %s as project_id,
            stand,
            geom,
            owner,
            title_deed,
            survey_date,
            surveyor,
            notes,
            area_m2,
            area_ha,
            perimeter_m,
            created_at,
            updated_at
    ', v_parcel_view || '_insert', v_parcel_view, p_project_id, p_project_id);
    
    -- Make land_parcels view writable with UPDATE rule
    EXECUTE format('
        CREATE OR REPLACE RULE %I AS
        ON UPDATE TO %I
        DO INSTEAD
        UPDATE land_parcels
        SET stand = NEW.stand,
            geom = NEW.geom,
            owner = NEW.owner,
            title_deed = NEW.title_deed,
            survey_date = NEW.survey_date,
            surveyor = NEW.surveyor,
            notes = NEW.notes,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = OLD.id AND project_id = %s
        RETURNING 
            id,
            %s as project_id,
            stand,
            geom,
            owner,
            title_deed,
            survey_date,
            surveyor,
            notes,
            area_m2,
            area_ha,
            perimeter_m,
            created_at,
            updated_at
    ', v_parcel_view || '_update', v_parcel_view, p_project_id, p_project_id);
    
    -- Make land_parcels view writable with DELETE rule
    EXECUTE format('
        CREATE OR REPLACE RULE %I AS
        ON DELETE TO %I
        DO INSTEAD
        DELETE FROM land_parcels
        WHERE id = OLD.id AND project_id = %s
        RETURNING 
            id,
            %s as project_id,
            stand,
            geom,
            owner,
            title_deed,
            survey_date,
            surveyor,
            notes,
            area_m2,
            area_ha,
            perimeter_m,
            created_at,
            updated_at
    ', v_parcel_view || '_delete', v_parcel_view, p_project_id, p_project_id);
    
    -- Return success with view names
    result := json_build_object(
        'success', true,
        'project_id', p_project_id,
        'views', json_build_object(
            'coordinate_points', v_coord_view,
            'land_parcels', v_parcel_view
        )
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Test the function for project 26
SELECT create_project_views(26);

-- Verify views were created
SELECT 
    schemaname,
    viewname,
    viewowner
FROM pg_views
WHERE viewname LIKE '%_project_26'
ORDER BY viewname;
