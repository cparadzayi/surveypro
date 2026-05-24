# Database Normalization - REVISED for Multiple Surveyor Types

## 🎯 New Requirements

**User Types in SurveyPro**:
1. **Registered Land Surveyors** (full license)
2. **Land Surveyors-in-Training** (provisional/candidate status)
3. **Survey Technicians** (technical support)
4. **Student Surveyors** (learning/intern status)

---

## 📊 Revised Schema Analysis

### Option A: Single Table with Type Field (Simple)
```sql
surveyors:
  - id (PK)
  - email (UNIQUE) ← Authentication
  - password_hash ← Authentication
  - surveyor_type (ENUM: 'registered', 'in_training', 'technician', 'student')
  - name
  - license_number (UNIQUE, NULLABLE) ← Only for registered surveyors
  - registration_number ← For in-training/technicians
  - firm
  - address
  - phone
  - supervisor_id (FK → surveyors.id) ← For students/in-training
  - is_active
  - created_at, updated_at
```

**Pros**:
- ✅ Simple: One table
- ✅ 3NF Compliant
- ✅ Easy queries
- ✅ All surveyor types in one place

**Cons**:
- ❌ Nullable fields (license_number not required for all)
- ❌ Mixed validation rules
- ❌ Less type safety

---

### Option B: Separate Tables by Type (Complex)
```sql
users:
  - id (PK)
  - email (UNIQUE)
  - password_hash
  - user_type (ENUM: 'registered_surveyor', 'surveyor_in_training', 'technician', 'student')
  - created_at

registered_surveyors:
  - id (PK)
  - user_id (FK → users.id, UNIQUE, NOT NULL)
  - name
  - license_number (UNIQUE, NOT NULL)
  - firm
  - address, phone
  - is_active

surveyors_in_training:
  - id (PK)
  - user_id (FK → users.id, UNIQUE, NOT NULL)
  - name
  - registration_number (UNIQUE, NOT NULL)
  - supervisor_id (FK → registered_surveyors.id)
  - firm
  - address, phone

survey_technicians:
  - id (PK)
  - user_id (FK → users.id, UNIQUE, NOT NULL)
  - name
  - registration_number
  - firm
  - address, phone

student_surveyors:
  - id (PK)
  - user_id (FK → users.id, UNIQUE, NOT NULL)
  - name
  - student_number
  - institution
  - supervisor_id (FK → registered_surveyors.id)
```

**Pros**:
- ✅ Type-specific validation
- ✅ No nullable fields
- ✅ Clear separation

**Cons**:
- ❌ Very complex
- ❌ Many tables to maintain
- ❌ Complex queries (multiple JOINs)
- ❌ Harder to add new types

---

### Option C: Hybrid with Profiles (RECOMMENDED)
```sql
-- Authentication table (all users)
users:
  - id (PK)
  - email (UNIQUE, NOT NULL)
  - password_hash (NOT NULL)
  - user_type (ENUM: 'registered_surveyor', 'surveyor_in_training', 'technician', 'student')
  - is_active (BOOLEAN DEFAULT true)
  - created_at
  - updated_at

-- Professional profile table (all surveyor types)
surveyor_profiles:
  - id (PK)
  - user_id (FK → users.id, UNIQUE, NOT NULL)
  - name (NOT NULL)
  - surveyor_type (ENUM: 'registered', 'in_training', 'technician', 'student')
  - license_number (UNIQUE) ← For registered surveyors only
  - registration_number ← For in-training/technicians
  - student_number ← For students
  - firm
  - address
  - phone
  - institution ← For students
  - supervisor_id (FK → surveyor_profiles.id) ← For students/in-training
  - qualification_date ← When they became registered
  - created_at
  - updated_at

-- Constraints to enforce business rules
ALTER TABLE surveyor_profiles
  ADD CONSTRAINT check_registered_has_license 
  CHECK (
    surveyor_type != 'registered' OR license_number IS NOT NULL
  );

ALTER TABLE surveyor_profiles
  ADD CONSTRAINT check_student_has_supervisor
  CHECK (
    surveyor_type != 'student' OR supervisor_id IS NOT NULL
  );
```

**Pros**:
- ✅ Clean separation: Auth vs Profile
- ✅ 3NF Compliant: No redundancy
- ✅ Flexible: Easy to add new types
- ✅ Type-specific validation via constraints
- ✅ Moderate complexity
- ✅ Single JOIN for most queries

**Cons**:
- ⚠️ Requires one JOIN
- ⚠️ Some nullable fields (but validated by constraints)

---

## 🎯 RECOMMENDED: Option C (Hybrid)

### Complete Schema

```sql
-- ============================================
-- 1. USERS TABLE (Authentication)
-- ============================================
CREATE TABLE users (
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

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_type ON users(user_type);

-- ============================================
-- 2. SURVEYOR PROFILES TABLE (Professional Info)
-- ============================================
CREATE TABLE surveyor_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Basic Info
  name VARCHAR(255) NOT NULL,
  surveyor_type VARCHAR(50) NOT NULL 
    CHECK (surveyor_type IN ('registered', 'in_training', 'technician', 'student')),
  
  -- Professional Identifiers
  license_number VARCHAR(100) UNIQUE,  -- For registered surveyors
  registration_number VARCHAR(100),     -- For in-training/technicians
  student_number VARCHAR(100),          -- For students
  
  -- Contact & Organization
  firm VARCHAR(255),
  address TEXT,
  phone VARCHAR(50),
  institution VARCHAR(255),  -- For students
  
  -- Supervision (for students and in-training)
  supervisor_id INTEGER REFERENCES surveyor_profiles(id),
  
  -- Professional Status
  qualification_date DATE,  -- When they became registered
  specializations TEXT[],   -- Array of specializations
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Business Rule Constraints
  CONSTRAINT check_registered_has_license 
    CHECK (surveyor_type != 'registered' OR license_number IS NOT NULL),
  
  CONSTRAINT check_student_has_number
    CHECK (surveyor_type != 'student' OR student_number IS NOT NULL),
  
  CONSTRAINT check_student_has_supervisor
    CHECK (surveyor_type != 'student' OR supervisor_id IS NOT NULL),
  
  CONSTRAINT check_in_training_has_supervisor
    CHECK (surveyor_type != 'in_training' OR supervisor_id IS NOT NULL)
);

CREATE INDEX idx_surveyor_profiles_user_id ON surveyor_profiles(user_id);
CREATE INDEX idx_surveyor_profiles_type ON surveyor_profiles(surveyor_type);
CREATE INDEX idx_surveyor_profiles_license ON surveyor_profiles(license_number);
CREATE INDEX idx_surveyor_profiles_supervisor ON surveyor_profiles(supervisor_id);

-- ============================================
-- 3. SURVEY PROJECTS TABLE (Updated)
-- ============================================
CREATE TABLE survey_projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  
  -- Primary surveyor (must be registered or in-training)
  surveyor_profile_id INTEGER NOT NULL REFERENCES surveyor_profiles(id),
  
  -- Optional: Supervising registered surveyor (for in-training projects)
  supervising_surveyor_id INTEGER REFERENCES surveyor_profiles(id),
  
  -- Project details
  project_id INTEGER REFERENCES projects(id),
  client_name VARCHAR(255),
  location TEXT,
  survey_type VARCHAR(100),
  survey_date DATE,
  instruments TEXT,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  working_directory TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Business rule: Supervising surveyor must be registered
  CONSTRAINT check_supervisor_is_registered
    CHECK (
      supervising_surveyor_id IS NULL OR
      EXISTS (
        SELECT 1 FROM surveyor_profiles 
        WHERE id = supervising_surveyor_id 
        AND surveyor_type = 'registered'
      )
    )
);

CREATE INDEX idx_survey_projects_surveyor ON survey_projects(surveyor_profile_id);
CREATE INDEX idx_survey_projects_supervisor ON survey_projects(supervising_surveyor_id);

-- ============================================
-- 4. TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_surveyor_profiles_updated_at 
  BEFORE UPDATE ON surveyor_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_survey_projects_updated_at 
  BEFORE UPDATE ON survey_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## 🎨 UI/UX Considerations

### Surveyor Banner Display
```vue
<!-- Different display based on surveyor type -->
<div v-if="auth.currentSurveyor" class="bg-blue-50 border-b border-blue-200 px-4 py-2">
  <div class="flex items-center gap-3">
    <!-- Icon based on type -->
    <svg v-if="auth.currentSurveyor.surveyor_type === 'registered'" class="w-5 h-5 text-blue-600">
      <!-- Verified badge icon -->
    </svg>
    <svg v-else-if="auth.currentSurveyor.surveyor_type === 'in_training'" class="w-5 h-5 text-yellow-600">
      <!-- In-progress icon -->
    </svg>
    <svg v-else-if="auth.currentSurveyor.surveyor_type === 'student'" class="w-5 h-5 text-green-600">
      <!-- Student icon -->
    </svg>
    
    <!-- Name and credentials -->
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-semibold">{{ auth.currentSurveyor.name }}</span>
      <span class="text-blue-400">•</span>
      
      <!-- Display appropriate credential -->
      <span v-if="auth.currentSurveyor.license_number" class="text-blue-700">
        License: {{ auth.currentSurveyor.license_number }}
      </span>
      <span v-else-if="auth.currentSurveyor.registration_number" class="text-yellow-700">
        Reg: {{ auth.currentSurveyor.registration_number }}
      </span>
      <span v-else-if="auth.currentSurveyor.student_number" class="text-green-700">
        Student: {{ auth.currentSurveyor.student_number }}
      </span>
      
      <!-- Type badge -->
      <span class="px-2 py-0.5 text-xs rounded-full" :class="{
        'bg-blue-100 text-blue-800': auth.currentSurveyor.surveyor_type === 'registered',
        'bg-yellow-100 text-yellow-800': auth.currentSurveyor.surveyor_type === 'in_training',
        'bg-purple-100 text-purple-800': auth.currentSurveyor.surveyor_type === 'technician',
        'bg-green-100 text-green-800': auth.currentSurveyor.surveyor_type === 'student'
      }">
        {{ formatSurveyorType(auth.currentSurveyor.surveyor_type) }}
      </span>
    </div>
  </div>
</div>
```

### Permission-Based Features
```typescript
// Computed properties for permissions
const canSignDocuments = computed(() => 
  auth.currentSurveyor?.surveyor_type === 'registered'
)

const requiresSupervision = computed(() => 
  ['in_training', 'student'].includes(auth.currentSurveyor?.surveyor_type || '')
)

const canCreateProjects = computed(() => 
  ['registered', 'in_training'].includes(auth.currentSurveyor?.surveyor_type || '')
)
```

---

## 📋 Migration Plan

### Phase 1: Create New Schema
```sql
-- Run the complete schema above
-- This creates users and surveyor_profiles tables
```

### Phase 2: Migrate Existing Data
```sql
-- Backup
CREATE TABLE surveyors_backup AS SELECT * FROM surveyors;

-- Migrate registered surveyors
INSERT INTO users (email, password_hash, user_type, created_at)
SELECT 
  COALESCE(s.email, 'surveyor' || s.id || '@temp.com'),  -- Handle missing emails
  COALESCE(u.password_hash, '$2b$10$default_hash'),      -- Handle missing passwords
  'registered_surveyor',
  s.created_at
FROM surveyors s
LEFT JOIN users u ON u.id = s.user_id
WHERE s.is_active = true;

-- Create surveyor profiles
INSERT INTO surveyor_profiles (
  user_id, name, surveyor_type, license_number, 
  firm, address, phone, created_at, updated_at
)
SELECT 
  u.id,
  s.name,
  'registered',
  s.license_number,
  s.firm,
  s.address,
  s.phone,
  s.created_at,
  s.updated_at
FROM surveyors s
JOIN users u ON u.email = COALESCE(s.email, 'surveyor' || s.id || '@temp.com')
WHERE s.is_active = true;

-- Update survey_projects to reference surveyor_profiles
ALTER TABLE survey_projects 
  ADD COLUMN surveyor_profile_id INTEGER REFERENCES surveyor_profiles(id);

UPDATE survey_projects sp
SET surveyor_profile_id = (
  SELECT p.id 
  FROM surveyor_profiles p
  JOIN users u ON u.id = p.user_id
  JOIN surveyors s ON s.user_id = u.id
  WHERE s.id = sp.surveyor_id
);

-- Drop old columns
ALTER TABLE survey_projects DROP COLUMN surveyor_id;
```

### Phase 3: Add Other Surveyor Types
```sql
-- Add surveyors-in-training, technicians, students manually or via import
-- Example:
INSERT INTO users (email, password_hash, user_type)
VALUES ('trainee@example.com', '$2b$10$...', 'surveyor_in_training');

INSERT INTO surveyor_profiles (
  user_id, name, surveyor_type, registration_number, supervisor_id
)
VALUES (
  (SELECT id FROM users WHERE email = 'trainee@example.com'),
  'John Trainee',
  'in_training',
  'SIT-2024-001',
  (SELECT id FROM surveyor_profiles WHERE license_number = 'LS-12345')
);
```

---

## 🔐 Backend Implementation

### Updated Auth Routes
```javascript
// app-backend/src/routes/auth.js
app.get('/auth/me', {
  preHandler: [app.authenticate]
}, async (request) => {
  const user = await db.query(
    `SELECT 
      u.id, u.email, u.user_type, u.is_active,
      p.id as profile_id,
      p.name,
      p.surveyor_type,
      p.license_number,
      p.registration_number,
      p.student_number,
      p.firm,
      p.address,
      p.phone,
      p.institution,
      p.supervisor_id,
      supervisor.name as supervisor_name
    FROM users u
    JOIN surveyor_profiles p ON p.user_id = u.id
    LEFT JOIN surveyor_profiles supervisor ON supervisor.id = p.supervisor_id
    WHERE u.email = $1`,
    [request.user.email]
  )
  
  const userData = user.rows[0]
  
  return {
    id: userData.id,
    email: userData.email,
    user_type: userData.user_type,
    profile: {
      id: userData.profile_id,
      name: userData.name,
      surveyor_type: userData.surveyor_type,
      license_number: userData.license_number,
      registration_number: userData.registration_number,
      student_number: userData.student_number,
      firm: userData.firm,
      address: userData.address,
      phone: userData.phone,
      institution: userData.institution,
      supervisor: userData.supervisor_id ? {
        id: userData.supervisor_id,
        name: userData.supervisor_name
      } : null
    }
  }
})
```

---

## 📊 Comparison: Before vs After

| Aspect | Old (2 tables) | New (2 tables + types) |
|--------|---------------|------------------------|
| **Tables** | users + surveyors | users + surveyor_profiles |
| **Surveyor Types** | ❌ Not supported | ✅ 4 types supported |
| **3NF Compliance** | ❌ Violates | ✅ Compliant |
| **Type Safety** | ❌ No validation | ✅ CHECK constraints |
| **Supervision** | ❌ Not supported | ✅ Supervisor tracking |
| **Flexibility** | ⚠️ Limited | ✅ Easy to extend |
| **Query Complexity** | ⚠️ Medium | ⚠️ Medium (1 JOIN) |

---

## 🎯 Final Recommendation

**Use Option C (Hybrid with Profiles)** because:

1. ✅ **Supports all 4 surveyor types**
2. ✅ **3NF Compliant** (no redundancy)
3. ✅ **Type-specific validation** (CHECK constraints)
4. ✅ **Supervision tracking** (for students/in-training)
5. ✅ **Flexible** (easy to add new types)
6. ✅ **Moderate complexity** (single JOIN)
7. ✅ **Professional standards** (matches real-world surveyor hierarchy)

**This design accounts for**:
- Registered surveyors (full license)
- Surveyors-in-training (provisional status, requires supervisor)
- Survey technicians (technical support)
- Student surveyors (learning, requires supervisor)

---

**Ready to implement?** This is the proper solution for your multi-type surveyor system! 🎉
