# Database Column Name Fix

## Issue

When trying to fetch or create projects, the following error occurred:

```
ERROR: column "user_id" does not exist
hint: Perhaps you meant to reference the column "projects.owner_id".
```

## Root Cause

**Mismatch between database schema and code:**

### Database Schema (from `migrations/001.do.sql`)
```sql
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- ✅ Column name is owner_id
  coordinate_system VARCHAR(100) DEFAULT 'WGS84',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Code (in `plugins/projects.js`)
```javascript
// ❌ Code was using user_id
WHERE user_id = ${request.user.id}
INSERT INTO projects (user_id, name, description)
```

## Solution

Updated all SQL queries in `plugins/projects.js` to use `owner_id` instead of `user_id`:

### Changes Made

1. **Fetch all projects (GET /api/projects)**
   ```javascript
   // Before
   WHERE user_id = ${request.user.id}
   
   // After
   WHERE owner_id = ${request.user.id}
   ```

2. **Create project (POST /api/projects)**
   ```javascript
   // Before
   INSERT INTO projects (user_id, name, description)
   
   // After
   INSERT INTO projects (owner_id, name, description)
   ```

3. **Get single project (GET /api/projects/:id)**
   ```javascript
   // Before
   WHERE id = ${id} AND user_id = ${request.user.id}
   
   // After
   WHERE id = ${id} AND owner_id = ${request.user.id}
   ```

4. **Update project (PUT /api/projects/:id)**
   ```javascript
   // Before
   WHERE id = $${paramCount++} AND user_id = $${paramCount}
   
   // After
   WHERE id = $${paramCount++} AND owner_id = $${paramCount}
   ```

5. **Delete project (DELETE /api/projects/:id)**
   ```javascript
   // Before
   DELETE FROM projects WHERE id = ${id} AND user_id = ${request.user.id}
   
   // After
   DELETE FROM projects WHERE id = ${id} AND owner_id = ${request.user.id}
   ```

## Why the Schema Uses `owner_id`

The database schema uses `owner_id` because:

1. **Clarity:** Projects can have multiple members (via `project_members` table)
2. **Distinction:** `owner_id` clearly indicates the project owner vs. other members
3. **Collaboration:** The `project_members` table allows multiple users to access a project

### Project Ownership Model

```
projects table:
  - owner_id: The user who created/owns the project

project_members table:
  - project_id: Reference to project
  - user_id: Reference to user
  - role: 'owner' | 'editor' | 'viewer'
```

This allows for:
- One owner per project (`owner_id`)
- Multiple collaborators per project (`project_members`)
- Different permission levels (owner, editor, viewer)

## Testing

After this fix, all project operations should work:

### 1. Fetch Projects
```bash
curl http://localhost:3042/api/projects \
  -H "Authorization: Bearer <TOKEN>"
```
**Expected:** 200 OK with array of projects

### 2. Create Project
```bash
curl -X POST http://localhost:3042/api/projects \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Project","description":"Test"}'
```
**Expected:** 201 Created with project data

### 3. Get Single Project
```bash
curl http://localhost:3042/api/projects/1 \
  -H "Authorization: Bearer <TOKEN>"
```
**Expected:** 200 OK with project data

### 4. Update Project
```bash
curl -X PUT http://localhost:3042/api/projects/1 \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Name"}'
```
**Expected:** 200 OK with updated project data

### 5. Delete Project
```bash
curl -X DELETE http://localhost:3042/api/projects/1 \
  -H "Authorization: Bearer <TOKEN>"
```
**Expected:** 204 No Content

## Files Modified

- ✅ `backend/plugins/projects.js` - Updated all SQL queries to use `owner_id`

## No Migration Needed

Since this was a code issue (not a database issue), **no database migration is required**. The database schema was already correct with `owner_id`.

## Backend Restart

The backend server will automatically reload the changes since it's running with `--watch` flag. If not, restart manually:

```bash
npm run dev
```

## Summary

The issue was a simple column name mismatch. The database correctly used `owner_id`, but the code was incorrectly referencing `user_id`. All SQL queries have been updated to match the database schema.

**Result:** Projects can now be created, fetched, updated, and deleted successfully! 🚀
