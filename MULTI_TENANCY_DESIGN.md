# Multi-Tenancy Architecture: Schema Per Surveyor

## 🎯 Design Overview

SurveyPro will use **PostgreSQL schemas** to provide isolated workspaces for each surveyor, similar to GitHub repositories.

---

## 📐 Database Structure

```
surveypro_v1 (PostgreSQL database)

├── public schema (Shared Data)
│   ├── users (authentication)
│   ├── surveyors (surveyor profiles)
│   ├── districts (Zimbabwe districts)
│   ├── control_points_national (surveyor-general control)
│   ├── coordinate_systems (Lo29, Lo31, etc.)
│   ├── document_templates
│   └── system_settings
│
├── surveyor_<username> schema (Per Surveyor)
│   ├── survey_projects
│   ├── coordinate_points
│   ├── land_parcels
│   ├── field_book_data
│   ├── calculations
│   ├── documents
│   └── client_info
│
└── admin schema (Admin-only)
    ├── audit_logs
    ├── usage_statistics
    └── cross_surveyor_reports
```

---

## 🔑 Key Design Decisions

### 1. Schema Naming Convention

```
surveyor_<username>
```

Examples:
- `surveyor_john_doe`
- `surveyor_jane_smith`
- `surveyor_m_surveyor`

**Rules:**
- Lowercase only
- Underscores instead of spaces
- No special characters
- Max 63 characters (PostgreSQL limit)

### 2. Shared vs Surveyor-Specific Data

| Data Type | Location | Reason |
|-----------|----------|--------|
| User accounts | `public.users` | Shared authentication |
| Surveyor profiles | `public.surveyors` | Shared directory |
| Districts | `public.districts` | Zimbabwe standard |
| National control points | `public.control_points_national` | Surveyor-General data |
| Coordinate systems | `public.coordinate_systems` | Zimbabwe standard |
| **Survey projects** | `surveyor_X.*` | **Surveyor-owned** |
| **Coordinate points** | `surveyor_X.*` | **Surveyor-owned** |
| **Land parcels** | `surveyor_X.*` | **Surveyor-owned** |
| **Documents** | `surveyor_X.*` | **Surveyor-owned** |

### 3. Search Path Configuration

When a surveyor logs in, set:
```sql
SET search_path = surveyor_john_doe, public;
```

**Effect:**
- Unqualified queries go to `surveyor_john_doe` first
- Falls back to `public` for shared data
- Queries automatically isolated to surveyor's schema

---

## 🔄 Migration Strategy

### Option A: Big Bang Migration (Recommended for development)

1. Create schema for each existing surveyor
2. Migrate data to respective schemas
3. Update application code
4. Test thoroughly
5. Deploy

**Timeline:** 2-3 weeks

### Option B: Gradual Migration

1. New surveyors get schemas
2. Existing surveyors stay in `public`
3. Migrate existing surveyors one by one
4. Complete within 3-6 months

**Timeline:** 3-6 months

---

## 📝 Implementation Steps

### Step 1: Create Schema Management Functions

```sql
-- Function to create a new surveyor schema
CREATE OR REPLACE FUNCTION create_surveyor_schema(p_username VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_schema_name VARCHAR;
BEGIN
  -- Generate schema name
  v_schema_name := 'surveyor_' || lower(regexp_replace(p_username, '[^a-zA-Z0-9]', '_', 'g'));
  
  -- Create schema
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema_name);
  
  -- Create tables in schema
  EXECUTE format('
    CREATE TABLE %I.survey_projects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      client_name VARCHAR(255),
      survey_type VARCHAR(100),
      district VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )', v_schema_name);
  
  EXECUTE format('
    CREATE TABLE %I.coordinate_points (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES %I.survey_projects(id),
      name VARCHAR(50) NOT NULL,
      y NUMERIC(12, 3),
      x NUMERIC(12, 3),
      description TEXT,
      fp VARCHAR(1),
      geom GEOMETRY(Point, 22291),
      created_at TIMESTAMP DEFAULT NOW()
    )', v_schema_name, v_schema_name);
  
  EXECUTE format('
    CREATE TABLE %I.land_parcels (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES %I.survey_projects(id),
      stand VARCHAR(50),
      designation VARCHAR(255),
      owner VARCHAR(255),
      geom GEOMETRY(Polygon, 22291),
      area_m2 NUMERIC(12, 2),
      area_ha NUMERIC(12, 4),
      created_at TIMESTAMP DEFAULT NOW()
    )', v_schema_name, v_schema_name);
  
  -- Create indexes
  EXECUTE format('CREATE INDEX ON %I.coordinate_points(project_id)', v_schema_name);
  EXECUTE format('CREATE INDEX ON %I.coordinate_points USING GIST(geom)', v_schema_name);
  EXECUTE format('CREATE INDEX ON %I.land_parcels(project_id)', v_schema_name);
  EXECUTE format('CREATE INDEX ON %I.land_parcels USING GIST(geom)', v_schema_name);
  
  -- Grant permissions
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO surveypro_app', v_schema_name);
  EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO surveypro_app', v_schema_name);
  EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO surveypro_app', v_schema_name);
  
  RETURN v_schema_name;
END;
$$ LANGUAGE plpgsql;


-- Function to drop a surveyor schema (with safety checks)
CREATE OR REPLACE FUNCTION drop_surveyor_schema(p_username VARCHAR, p_confirm VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
  v_schema_name VARCHAR;
BEGIN
  v_schema_name := 'surveyor_' || lower(regexp_replace(p_username, '[^a-zA-Z0-9]', '_', 'g'));
  
  -- Safety check: require exact schema name as confirmation
  IF p_confirm != v_schema_name THEN
    RAISE EXCEPTION 'Confirmation does not match schema name. Expected: %', v_schema_name;
  END IF;
  
  -- Drop schema
  EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', v_schema_name);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;


-- Function to export surveyor data
CREATE OR REPLACE FUNCTION export_surveyor_data(p_username VARCHAR)
RETURNS TABLE(
  schema_name VARCHAR,
  table_name VARCHAR,
  row_count BIGINT
) AS $$
DECLARE
  v_schema_name VARCHAR;
BEGIN
  v_schema_name := 'surveyor_' || lower(regexp_replace(p_username, '[^a-zA-Z0-9]', '_', 'g'));
  
  RETURN QUERY
  SELECT 
    v_schema_name::VARCHAR,
    t.table_name::VARCHAR,
    (xpath('//row/c/text()', 
      query_to_xml(format('SELECT COUNT(*) AS c FROM %I.%I', v_schema_name, t.table_name), 
      false, true, ''))
    )[1]::text::BIGINT
  FROM information_schema.tables t
  WHERE t.table_schema = v_schema_name
    AND t.table_type = 'BASE TABLE';
END;
$$ LANGUAGE plpgsql;
```

### Step 2: Update Application Backend

**File: `app-backend/src/config/db.js`**

Add schema management:

```javascript
// Get database pool for specific surveyor
function getSurveyorPool(surveyorUsername) {
  const schemaName = `surveyor_${surveyorUsername.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
  
  return {
    async query(sql, params) {
      const client = await pool.connect()
      try {
        // Set search path for this connection
        await client.query(`SET search_path = ${schemaName}, public`)
        const result = await client.query(sql, params)
        return result
      } finally {
        client.release()
      }
    }
  }
}

// Create schema when new surveyor registers
async function createSurveyorSchema(surveyorUsername) {
  const result = await pool.query(
    'SELECT create_surveyor_schema($1) AS schema_name',
    [surveyorUsername]
  )
  return result.rows[0].schema_name
}

module.exports = {
  pool,
  query: pool.query.bind(pool),
  getSurveyorPool,
  createSurveyorSchema
}
```

### Step 3: Update User Registration

**File: `app-backend/src/routes/auth.js`**

```javascript
// Register new surveyor
fastify.post('/register', async (request, reply) => {
  const { username, email, password, full_name } = request.body
  
  try {
    // Create user account
    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await db.query(
      'INSERT INTO public.users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [username, email, hashedPassword]
    )
    
    // Create surveyor profile
    await db.query(
      'INSERT INTO public.surveyors (user_id, full_name) VALUES ($1, $2)',
      [user.rows[0].id, full_name]
    )
    
    // Create surveyor schema
    const schemaName = await db.createSurveyorSchema(username)
    
    // Update surveyor with schema name
    await db.query(
      'UPDATE public.surveyors SET schema_name = $1 WHERE user_id = $2',
      [schemaName, user.rows[0].id]
    )
    
    reply.send({ 
      ok: true, 
      message: 'Surveyor registered successfully',
      schema_name: schemaName 
    })
  } catch (error) {
    reply.status(500).send({ error: error.message })
  }
})
```

### Step 4: Update API Middleware

**File: `app-backend/src/middleware/auth.js`**

```javascript
async function authenticateAndSetSchema(request, reply) {
  try {
    // Verify JWT token
    await request.jwtVerify()
    
    // Get surveyor info
    const surveyor = await db.query(
      'SELECT schema_name FROM public.surveyors WHERE user_id = $1',
      [request.user.id]
    )
    
    if (!surveyor.rows[0]) {
      throw new Error('Surveyor not found')
    }
    
    // Attach schema name to request
    request.surveyorSchema = surveyor.rows[0].schema_name
    
    // Get surveyor-specific database pool
    request.db = db.getSurveyorPool(request.user.username)
    
  } catch (error) {
    reply.status(401).send({ error: 'Unauthorized' })
  }
}
```

### Step 5: Update QGIS Connection

**File: `app-backend/src/routes/spatial.js`**

```javascript
fastify.get('/db-connection', async (request, reply) => {
  // ... existing code ...
  
  reply.send({
    ok: true,
    connection: {
      host: 'localhost',
      port: 5432,
      database: 'surveypro_v1',
      schema: request.surveyorSchema, // ← Add schema
      username: 'postgres',
      sslmode: 'disable'
    },
    qgis_instructions: [
      '📌 STEP 1: CREATE CONNECTION',
      `  • Schema: ${request.surveyorSchema}`,
      // ... rest of instructions
    ]
  })
})
```

### Step 6: QGIS Schema Configuration

Users will need to specify schema when adding layers:

**In QGIS:**
1. Add PostGIS Layers → Connect
2. **Check "Also list tables with no geometry"**
3. **Schema dropdown:** Select `surveyor_john_doe`
4. Select tables from that schema
5. Add layers

---

## 🔐 Security & Permissions

### PostgreSQL Role Setup

```sql
-- Application role (used by backend)
CREATE ROLE surveypro_app WITH LOGIN PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE surveypro_v1 TO surveypro_app;
GRANT USAGE ON SCHEMA public TO surveypro_app;

-- Grant access to all surveyor schemas (auto-granted by create function)
-- Each surveyor schema grants permissions during creation

-- Admin role (for DBA tasks)
CREATE ROLE surveypro_admin WITH LOGIN PASSWORD 'admin_password';
GRANT ALL ON DATABASE surveypro_v1 TO surveypro_admin;
```

### Row-Level Security (Optional Extra Layer)

Even with schemas, you can add RLS for paranoid security:

```sql
ALTER TABLE surveyor_john_doe.survey_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY schema_isolation ON surveyor_john_doe.survey_projects
  FOR ALL
  USING (current_schema() = 'surveyor_john_doe');
```

---

## 📊 Monitoring & Management

### View All Surveyor Schemas

```sql
SELECT 
  schema_name,
  (SELECT COUNT(*) FROM information_schema.tables 
   WHERE table_schema = schema_name) AS table_count
FROM information_schema.schemata
WHERE schema_name LIKE 'surveyor_%'
ORDER BY schema_name;
```

### Get Storage Per Surveyor

```sql
SELECT 
  schemaname AS schema_name,
  SUM(pg_total_relation_size(schemaname||'.'||tablename)) AS total_bytes,
  pg_size_pretty(SUM(pg_total_relation_size(schemaname||'.'||tablename))) AS total_size
FROM pg_tables
WHERE schemaname LIKE 'surveyor_%'
GROUP BY schemaname
ORDER BY total_bytes DESC;
```

### Export Surveyor Data

```bash
# Backup specific surveyor
pg_dump -h localhost -U postgres -d surveypro_v1 \
  --schema=surveyor_john_doe \
  -f surveyor_john_doe_backup.sql

# Restore to different database
psql -h localhost -U postgres -d surveypro_v1_new \
  -f surveyor_john_doe_backup.sql
```

---

## 🚀 Migration from Current Setup

### Phase 1: Prepare (Week 1)

- [ ] Create schema management functions
- [ ] Test schema creation/deletion
- [ ] Update database connection layer
- [ ] Add schema field to surveyors table

### Phase 2: Backend Updates (Week 2)

- [ ] Update authentication middleware
- [ ] Update all API routes to use surveyor-specific pool
- [ ] Add schema creation to registration
- [ ] Update QGIS connection endpoint

### Phase 3: Data Migration (Week 3)

- [ ] Create schemas for existing surveyors
- [ ] Migrate existing data to respective schemas
- [ ] Verify data integrity
- [ ] Update foreign keys and references

### Phase 4: Testing (Week 4)

- [ ] Test with multiple surveyor accounts
- [ ] Verify data isolation
- [ ] Test QGIS connectivity per schema
- [ ] Performance testing

### Phase 5: Deployment

- [ ] Backup production database
- [ ] Run migration script
- [ ] Deploy updated backend
- [ ] Deploy updated frontend
- [ ] Monitor for issues

---

## 🎯 Benefits Summary

✅ **Strong Isolation** - Surveyors cannot access each other's data  
✅ **Simple Backups** - `pg_dump --schema=surveyor_X`  
✅ **Easy Exports** - Give surveyor their entire dataset  
✅ **Shared Data** - National control points in `public` schema  
✅ **Scalable** - Works for 10-1000 surveyors  
✅ **PostgreSQL Native** - No complex workarounds  
✅ **GitHub-like UX** - Each surveyor has their "repository"  
✅ **Company Support** - Multiple surveyors can work for same firm  
✅ **Audit Trail** - Easy to track per-surveyor activity  
✅ **Billing Ready** - Track storage/usage per surveyor  

---

## 📞 Next Steps

1. **Review this design** - Approve architecture
2. **Create migration script** - `001_create_schema_management.sql`
3. **Update backend** - Implement connection pooling per schema
4. **Test with 2-3 test surveyors** - Verify isolation
5. **Migrate existing data** - Production cutover plan
6. **Update documentation** - User guide with schema concept

---

*Architecture Version: 1.0*  
*Recommended for: 10-500 surveyors*  
*PostgreSQL Version: 12+*
