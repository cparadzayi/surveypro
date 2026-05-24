-- Migration 018: Refactor users and surveyors to support multiple surveyor types
-- Creates: users table (auth) + surveyor_profiles table (professional info)
-- Supports: Registered Surveyors, Surveyors-in-Training, Technicians, Students

BEGIN;

-- ============================================
-- 1. DROP EXISTING TABLES IF THEY EXIST
-- ============================================
DROP TABLE IF EXISTS surveyor_profiles CASCADE;
DROP TABLE IF EXISTS users_new CASCADE;

-- ============================================
-- 2. CREATE NEW USERS TABLE (Authentication)
-- ============================================

-- Recreate users_new table
CREATE TABLE users_new (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  user_type VARCHAR(50) NOT NULL 
    CHECK (user_type IN ('registered_surveyor', 'surveyor_in_training', 'technician', 'student')),
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_new_email ON users_new(email);
CREATE INDEX idx_users_new_type ON users_new(user_type);

-- Recreate surveyor_profiles table
CREATE TABLE surveyor_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users_new(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  surveyor_type VARCHAR(50) NOT NULL 
    CHECK (surveyor_type IN ('registered', 'in_training', 'technician', 'student')),
  license_number VARCHAR(100) UNIQUE,
  registration_number VARCHAR(100),
  student_number VARCHAR(100),
  firm VARCHAR(255),
  address TEXT,
  phone VARCHAR(50),
  institution VARCHAR(255),
  supervisor_id INTEGER REFERENCES surveyor_profiles(id),
  qualification_date DATE,
  specializations TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_registered_has_license 
    CHECK (surveyor_type != 'registered' OR license_number IS NOT NULL),
  CONSTRAINT check_student_has_number
    CHECK (surveyor_type != 'student' OR student_number IS NOT NULL)
);

CREATE INDEX idx_surveyor_profiles_user_id ON surveyor_profiles(user_id);
CREATE INDEX idx_surveyor_profiles_type ON surveyor_profiles(surveyor_type);
CREATE INDEX idx_surveyor_profiles_license ON surveyor_profiles(license_number);
CREATE INDEX idx_surveyor_profiles_supervisor ON surveyor_profiles(supervisor_id);

-- Migrate from old users table (without explicit IDs)
INSERT INTO users_new (email, password_hash, user_type, created_at)
SELECT 
  email,
  password_hash,
  'registered_surveyor',  -- Default to registered for existing users
  created_at
FROM users
ON CONFLICT (email) DO NOTHING;

-- Migrate from surveyors table (for surveyors without user accounts)
INSERT INTO users_new (email, password_hash, user_type, created_at)
SELECT 
  COALESCE(s.email, 'surveyor' || s.id || '@temp.com'),
  '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',  -- default: "password"
  'registered_surveyor',
  s.created_at
FROM surveyors s
LEFT JOIN users u ON u.id = s.user_id
WHERE s.is_active = true AND u.id IS NULL
ON CONFLICT (email) DO NOTHING;

-- Create surveyor profiles
INSERT INTO surveyor_profiles (
  user_id, name, surveyor_type, license_number, 
  firm, address, phone, created_at, updated_at
)
SELECT 
  un.id,
  s.name,
  'registered',  -- All existing surveyors are registered
  s.license_number,
  s.firm,
  s.address,
  s.phone,
  s.created_at,
  s.updated_at
FROM surveyors s
LEFT JOIN users u ON u.id = s.user_id
JOIN users_new un ON un.email = COALESCE(s.email, u.email, 'surveyor' || s.id || '@temp.com')
WHERE s.is_active = true
ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- 4. UPDATE SURVEY_PROJECTS TABLE
-- ============================================

-- Add new column for surveyor_profile_id
ALTER TABLE survey_projects 
  ADD COLUMN IF NOT EXISTS surveyor_profile_id INTEGER REFERENCES surveyor_profiles(id);

-- Add column for supervising surveyor (for in-training projects)
ALTER TABLE survey_projects 
  ADD COLUMN IF NOT EXISTS supervising_surveyor_id INTEGER REFERENCES surveyor_profiles(id);

-- Migrate existing surveyor_id to surveyor_profile_id
UPDATE survey_projects sp
SET surveyor_profile_id = (
  SELECT p.id 
  FROM surveyor_profiles p
  JOIN users_new u ON u.id = p.user_id
  LEFT JOIN users old_u ON old_u.email = u.email
  JOIN surveyors s ON s.user_id = old_u.id OR s.email = u.email
  WHERE s.id = sp.surveyor_id
  LIMIT 1
)
WHERE surveyor_profile_id IS NULL AND surveyor_id IS NOT NULL;

-- ============================================
-- 5. DROP OLD TABLES AND RENAME NEW ONES
-- ============================================

-- Drop old users table
DROP TABLE IF EXISTS users CASCADE;

-- Rename users_new to users
ALTER TABLE users_new RENAME TO users;

-- Rename indexes
ALTER INDEX idx_users_new_email RENAME TO idx_users_email;
ALTER INDEX idx_users_new_type RENAME TO idx_users_type;

-- Update foreign key in surveyor_profiles
ALTER TABLE surveyor_profiles 
  DROP CONSTRAINT IF EXISTS surveyor_profiles_user_id_fkey;
ALTER TABLE surveyor_profiles 
  ADD CONSTRAINT surveyor_profiles_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Make surveyor_profile_id NOT NULL after migration
ALTER TABLE survey_projects 
  ALTER COLUMN surveyor_profile_id SET NOT NULL;

-- Drop old surveyor_id column (keep for now, can drop manually later)
-- ALTER TABLE survey_projects DROP COLUMN IF EXISTS surveyor_id;

-- Drop old surveyors table (keep for now, can drop manually later)
-- DROP TABLE IF EXISTS surveyors CASCADE;

-- ============================================
-- 6. CREATE TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_surveyor_profiles_updated_at ON surveyor_profiles;
CREATE TRIGGER update_surveyor_profiles_updated_at 
  BEFORE UPDATE ON surveyor_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- ============================================
-- 7. VERIFICATION QUERIES (Run these after migration)
-- ============================================

-- Check users
-- SELECT user_type, COUNT(*) FROM users GROUP BY user_type;

-- Check surveyor profiles
-- SELECT surveyor_type, COUNT(*) FROM surveyor_profiles GROUP BY surveyor_type;

-- Check survey projects linkage
-- SELECT COUNT(*) FROM survey_projects WHERE surveyor_profile_id IS NULL;

-- View complete surveyor info
-- SELECT 
--   u.email, u.user_type,
--   p.name, p.surveyor_type, p.license_number,
--   p.firm
-- FROM users u
-- JOIN surveyor_profiles p ON p.user_id = u.id
-- LIMIT 10;
