/*
  # Add Foreign Key Constraint

  1. Changes
    - Add foreign key constraint between survey_projects.coordinate_system_id and coordinate_systems.id
    - This enables Supabase to perform joins between these tables
    - Allows the API to fetch coordinate system details with projects

  2. Security
    - No changes to existing RLS policies
    - Maintains data integrity with proper referential constraints
*/

-- Add foreign key constraint to link survey_projects to coordinate_systems
ALTER TABLE survey_projects 
ADD CONSTRAINT survey_projects_coordinate_system_id_fkey 
FOREIGN KEY (coordinate_system_id) 
REFERENCES coordinate_systems(id) 
ON DELETE SET NULL;