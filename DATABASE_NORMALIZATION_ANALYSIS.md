# Database Normalization Analysis: Users vs Surveyors

## 📊 Current Schema Analysis

### Current Tables
```sql
users:
  - id (PK)
  - email (UNIQUE)
  - password_hash
  - created_at

surveyors:
  - id (PK)
  - name
  - license_number (UNIQUE)
  - firm
  - address
  - phone
  - email
  - user_id (FK → users.id)  ← Optional relationship
  - is_active
  - created_at
  - updated_at

survey_projects:
  - id (PK)
  - surveyor_id (FK → surveyors.id)
  - project_id (FK → projects.id)
  - name, client_name, location, etc.
```

---

## 🔍 Normalization Testing (1NF, 2NF, 3NF)

### ✅ First Normal Form (1NF)
**Requirements**: 
- Each column contains atomic values
- No repeating groups
- Each row is unique

**Analysis**:
- ✅ `users`: All atomic values, unique by `id`
- ✅ `surveyors`: All atomic values, unique by `id`
- ⚠️ **Issue**: `surveyors.email` duplicates `users.email` when linked

**Verdict**: Mostly compliant, but redundancy exists

---

### ✅ Second Normal Form (2NF)
**Requirements**:
- Must be in 1NF
- No partial dependencies (all non-key attributes depend on entire primary key)

**Analysis**:
- ✅ `users`: All attributes depend on `id` (PK)
- ✅ `surveyors`: All attributes depend on `id` (PK)
- ✅ No composite keys, so no partial dependencies possible

**Verdict**: Fully compliant

---

### ⚠️ Third Normal Form (3NF)
**Requirements**:
- Must be in 2NF
- No transitive dependencies (non-key attributes should not depend on other non-key attributes)

**Analysis**:

#### Current Issues:
1. **Email Duplication**:
   ```
   users.email ← surveyors.user_id → surveyors.email
   ```
   - If `surveyors.user_id` is set, `surveyors.email` is redundant
   - Violates 3NF: `surveyors.email` depends on `users.email` via `user_id`

2. **Authentication vs Profile Data**:
   ```
   users table: Authentication concerns (email, password)
   surveyors table: Profile concerns (name, license, firm)
   ```
   - Mixed responsibilities
   - `user_id` in surveyors is optional (nullable), causing ambiguity

**Verdict**: ❌ Violates 3NF due to transitive dependencies

---

## 🎯 Expert Consultation: Industry Best Practices

### Option 1: Separate User & Surveyor (Current Approach)
**Use Case**: Multi-role system (admins, clients, surveyors)

```sql
users (authentication)
  ↓
surveyors (professional profile)
clients (client profile)
admins (admin profile)
```

**Pros**:
- ✅ Flexible: One user can have multiple roles
- ✅ Separation of concerns: Auth vs Profile
- ✅ Scalable: Easy to add new roles

**Cons**:
- ❌ Complexity: Two tables to manage
- ❌ Redundancy: Email duplication
- ❌ Nullable FK: `user_id` can be NULL (confusing)

---

### Option 2: Unified User-Surveyor (Recommended for Your App)
**Use Case**: Single-role system (all users are surveyors)

```sql
surveyors (authentication + profile)
  - id (PK)
  - email (UNIQUE) ← Authentication
  - password_hash ← Authentication
  - name ← Profile
  - license_number (UNIQUE) ← Profile
  - firm, address, phone ← Profile
  - is_active
  - created_at, updated_at
```

**Pros**:
- ✅ Simplicity: One table, one entity
- ✅ 3NF Compliant: No redundancy
- ✅ Clear semantics: Every user IS a surveyor
- ✅ Easier queries: No JOINs needed
- ✅ Better performance: Fewer table lookups

**Cons**:
- ⚠️ Less flexible: Hard to add non-surveyor users later
- ⚠️ Migration required: Need to merge existing data

---

### Option 3: User with Role Field (Hybrid Approach)
**Use Case**: Few roles, but need flexibility

```sql
users:
  - id (PK)
  - email (UNIQUE)
  - password_hash
  - role (ENUM: 'surveyor', 'admin', 'client')
  - created_at

surveyors (profile only, no auth):
  - id (PK)
  - user_id (FK → users.id, UNIQUE, NOT NULL) ← Required 1:1
  - name
  - license_number (UNIQUE)
  - firm, address, phone
  - is_active
```

**Pros**:
- ✅ Clear role separation
- ✅ 3NF Compliant: No email duplication
- ✅ Flexible: Can add other roles
- ✅ Enforced relationship: `NOT NULL` + `UNIQUE`

**Cons**:
- ⚠️ Still requires JOINs
- ⚠️ More complex than Option 2

---

## 💡 Recommendation for SurveyPro

### **Choose Option 2: Unified User-Surveyor Table**

**Reasoning**:
1. ✅ **Your app's purpose**: Land surveying application
2. ✅ **User base**: All users ARE land surveyors
3. ✅ **Simplicity**: Easier to understand and maintain
4. ✅ **Performance**: Faster queries, no JOINs
5. ✅ **3NF Compliant**: No redundancy

### Proposed Schema

```sql
-- Rename surveyors → users (or keep as surveyors)
CREATE TABLE surveyors (
  id SERIAL PRIMARY KEY,
  
  -- Authentication fields
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  
  -- Professional profile fields
  name VARCHAR(255) NOT NULL,
  license_number VARCHAR(100) UNIQUE NOT NULL,
  firm VARCHAR(255),
  address TEXT,
  phone VARCHAR(50),
  
  -- Status & timestamps
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Update survey_projects (no change needed)
CREATE TABLE survey_projects (
  id SERIAL PRIMARY KEY,
  surveyor_id INTEGER NOT NULL REFERENCES surveyors(id),
  name VARCHAR(255) NOT NULL,
  client_name VARCHAR(255),
  location TEXT,
  survey_type VARCHAR(100),
  survey_date DATE,
  instruments TEXT,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Remove users table entirely
DROP TABLE users CASCADE;
```

---

## 📋 Migration Plan

### Phase 1: Data Analysis
```sql
-- Check current data
SELECT 
  COUNT(*) as total_users,
  COUNT(CASE WHEN EXISTS (
    SELECT 1 FROM surveyors WHERE user_id = users.id
  ) THEN 1 END) as users_with_surveyor_profile
FROM users;

-- Check orphaned surveyors (no user_id)
SELECT COUNT(*) FROM surveyors WHERE user_id IS NULL;
```

### Phase 2: Data Migration
```sql
-- Backup existing data
CREATE TABLE users_backup AS SELECT * FROM users;
CREATE TABLE surveyors_backup AS SELECT * FROM surveyors;

-- Merge users into surveyors
UPDATE surveyors s
SET 
  email = u.email,
  password_hash = u.password_hash
FROM users u
WHERE s.user_id = u.id;

-- Handle surveyors without user_id (if any)
-- Option A: Create default credentials
-- Option B: Delete orphaned records
-- Option C: Manually link them

-- Drop old users table
ALTER TABLE surveyors DROP COLUMN user_id;
DROP TABLE users CASCADE;
```

### Phase 3: Code Updates

#### Backend Changes
```javascript
// OLD: app-backend/src/models/user.js
// DELETE THIS FILE

// NEW: app-backend/src/models/Surveyor.js (update)
class Surveyor {
  static async findByEmail(email) {
    const result = await db.query(
      'SELECT * FROM surveyors WHERE email = $1',
      [email]
    )
    return result.rows[0]
  }
  
  static async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash)
  }
  
  static async create({ email, password, name, license_number, firm }) {
    const hash = await bcrypt.hash(password, 10)
    const result = await db.query(
      `INSERT INTO surveyors (email, password_hash, name, license_number, firm)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [email, hash, name, license_number, firm]
    )
    return result.rows[0]
  }
}
```

#### Auth Routes Update
```javascript
// app-backend/src/routes/auth.js
import Surveyor from '../models/Surveyor.js'

// Login
app.post('/auth/login', async (request, reply) => {
  const { email, password } = request.body
  
  const surveyor = await Surveyor.findByEmail(email)
  if (!surveyor) {
    return reply.code(401).send({ error: 'Invalid credentials' })
  }
  
  const valid = await Surveyor.verifyPassword(password, surveyor.password_hash)
  if (!valid) {
    return reply.code(401).send({ error: 'Invalid credentials' })
  }
  
  const token = app.jwt.sign({ 
    sub: surveyor.id, 
    email: surveyor.email 
  })
  
  reply.send({ token, surveyor: {
    id: surveyor.id,
    email: surveyor.email,
    name: surveyor.name,
    license_number: surveyor.license_number,
    firm: surveyor.firm
  }})
})

// Get current surveyor
app.get('/auth/me', {
  preHandler: [app.authenticate]
}, async (request) => {
  const surveyor = await Surveyor.findByEmail(request.user.email)
  return {
    id: surveyor.id,
    email: surveyor.email,
    name: surveyor.name,
    license_number: surveyor.license_number,
    firm: surveyor.firm,
    address: surveyor.address,
    phone: surveyor.phone,
    created_at: surveyor.created_at
  }
})
```

#### Frontend Changes
```typescript
// app-frontend/src/stores/auth.ts
interface Surveyor {
  id: number
  email: string
  name: string
  license_number: string
  firm?: string
  address?: string
  phone?: string
  created_at: string
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    surveyor: null as Surveyor | null,  // Simplified!
    loading: false,
    error: '' as string | null,
  }),
  getters: {
    isAuthed: (state) => !!state.token,
    surveyorId: (state) => state.surveyor?.id || null,
  },
  actions: {
    async login(email: string, password: string) {
      this.error = ''
      this.loading = true
      try {
        const { data } = await api.post('/auth/login', { email, password })
        this.token = data.token
        this.surveyor = data.surveyor
        localStorage.setItem('token', this.token)
        localStorage.setItem('surveyor', JSON.stringify(data.surveyor))
      } catch (e: any) {
        this.error = e.response?.data?.error || e.message
      } finally {
        this.loading = false
      }
    },
    
    async fetchProfile() {
      if (!this.token) return
      try {
        const { data } = await api.get('/auth/me')
        this.surveyor = data
        localStorage.setItem('surveyor', JSON.stringify(data))
      } catch (e: any) {
        console.error('Failed to fetch profile:', e)
      }
    },
    
    logout() {
      this.token = ''
      this.surveyor = null
      localStorage.removeItem('token')
      localStorage.removeItem('surveyor')
    }
  }
})
```

---

## 📊 Comparison Summary

| Aspect | Current (Separate) | Recommended (Unified) |
|--------|-------------------|----------------------|
| **Tables** | 2 (users + surveyors) | 1 (surveyors) |
| **3NF Compliance** | ❌ Violates | ✅ Compliant |
| **Email Duplication** | ❌ Yes | ✅ No |
| **Query Complexity** | ❌ Requires JOINs | ✅ Simple SELECT |
| **Code Complexity** | ❌ Two models | ✅ One model |
| **Performance** | ⚠️ Slower (JOINs) | ✅ Faster |
| **Flexibility** | ✅ Multi-role | ⚠️ Single-role |
| **Clarity** | ⚠️ Confusing | ✅ Clear |
| **Maintenance** | ❌ Complex | ✅ Simple |

---

## 🎯 Final Recommendation

### **Merge `users` and `surveyors` into a single `surveyors` table**

**Why?**
1. ✅ **Your app's domain**: All users ARE surveyors
2. ✅ **3NF Compliant**: Eliminates redundancy
3. ✅ **Simpler codebase**: One model, one table
4. ✅ **Better performance**: No JOINs needed
5. ✅ **Clearer semantics**: User = Surveyor (not User → Surveyor)

**When NOT to do this?**
- ❌ If you plan to add non-surveyor users (admins, clients, viewers)
- ❌ If you need role-based access with multiple roles per user
- ❌ If you want to keep authentication separate from profile

**For SurveyPro**: The unified approach is the **best fit** because:
- Your app is specifically for land surveyors
- Every user needs surveyor credentials (license number)
- Simpler is better for maintenance and performance

---

## 🚀 Next Steps

1. **Decide**: Confirm unified approach aligns with business requirements
2. **Backup**: Export current database
3. **Migrate**: Run migration scripts (provided above)
4. **Update Code**: Backend models + routes + frontend store
5. **Test**: Verify login, profile loading, project access
6. **Deploy**: Roll out changes

**Estimated Effort**: 2-3 hours for migration + testing

---

**Document Version**: 1.0  
**Date**: November 3, 2025  
**Recommendation**: ✅ Merge users + surveyors into single table
