# Platformatic API Development Patterns

## Issue: Field Name Resolution in Platformatic DB

When developing APIs with Platformatic DB, we encountered several challenges around field name resolution and SQL query patterns. Here's what we learned:

### 1. Entity vs Raw SQL Approaches

There are two main approaches to database operations in Platformatic:

#### Entity Operations
```javascript
// Using entity operations (preferred for simple CRUD)
const { feature: FeatureEntity } = app.platformatic.entities
const result = await FeatureEntity.find({
  where: { layer_id: { eq: layerId } }
})
```

#### SQL Template Literals
```javascript
// Using SQL template literals (for complex queries)
import sql from '@databases/sql'
const result = await app.platformatic.db.query(sql`
  SELECT * FROM features 
  WHERE layer_id = ${layerId}
`)
```

### 2. Field Name Resolution

Platformatic automatically maps database column names to camelCase JavaScript properties. For example:
- Database: `project_id` → JavaScript: `projectId`
- Database: `layer_type` → JavaScript: `layerType`

To handle this mapping:

```javascript
// Helper function to resolve field names
function resolveField(entity, logicalNames) {
  if (!entity) return null
  const fields = Object.keys(entity.fields || {})
  
  // Try exact match first
  for (const name of logicalNames) {
    if (fields.includes(name)) return name
  }
  
  // Try case-insensitive match
  const lowerMap = fields.reduce((acc,f) => {
    acc[f.toLowerCase()] = f
    return acc
  }, {})
  
  for (const name of logicalNames) {
    const found = lowerMap[name.toLowerCase()]
    if (found) return found
  }
  
  return null
}
```

### 3. Best Practices

1. **Consistent Approach**: Choose either entity operations or SQL template literals for similar operations:
   - Entity operations for standard CRUD
   - SQL template literals for complex queries or performance-critical operations

2. **Error Handling**:
   ```javascript
   try {
     const result = await FeatureEntity.save({/*...*/})
   } catch (err) {
     if (err.code === '23505') {
       // Handle unique constraint violation
       return reply.code(409).send({ error: 'duplicate key' })
     }
     return reply.code(500).send({ error: err.message })
   }
   ```

3. **Field Name Safety**:
   - Use the resolveField helper for dynamic field name resolution
   - Document expected field names in comments
   - Consider adding TypeScript types for entity shapes

4. **Testing Routes**:
   - Test with proper JWT authentication
   - Verify endpoint paths carefully (e.g., `/api/spatial/projects/:projectId/layers`)
   - Check server configuration (port numbers, host settings)

### 4. Configuration

1. **Environment Variables**:
   ```env
   PORT=3050
   PLT_SERVER_HOSTNAME=127.0.0.1
   ```

2. **Database Connection**:
   - Configure in `platformatic.db.json`
   - Use connection pooling appropriately
   - Handle migrations properly

### 5. Common Gotchas

1. **Field Name Mismatch**: The error "Unknown field" often means:
   - Using snake_case in entity operations instead of camelCase
   - Missing field in database schema
   - Typo in field name

2. **Authentication**: Ensure:
   - Valid JWT token format
   - Token not expired
   - Proper Authorization header: `Bearer <token>`

3. **Port Conflicts**:
   - Check `PORT` in `.env`
   - Verify no other services on same port
   - Kill existing Platformatic processes if needed

### 6. Debugging Tools

1. **Entity Inspection**:
   ```javascript
   app.get('/api/debug/entities', async () => {
     const result = {}
     for (const [k,v] of Object.entries(app.platformatic.entities)) {
       result[k] = Object.keys(v.fields || {})
     }
     return result
   })
   ```

2. **Database Schema Check**:
   ```javascript
   const tables = await app.platformatic.db.query(sql`
     SELECT table_name, column_name, data_type 
     FROM information_schema.columns 
     WHERE table_schema = 'public'
   `)
   ```

## Example Usage

Complete example of a feature endpoint using these patterns:

```javascript
app.post('/api/spatial/features', { 
  preHandler: [app.authenticate] 
}, async (req, reply) => {
  const { geometry, properties, layer_id } = req.body

  try {
    const { feature: FeatureEntity } = app.platformatic.entities
    if (!FeatureEntity) {
      return reply.code(500).send({ error: 'feature entity unavailable' })
    }

    // Compute additional fields
    const bbox = computeBBox(geometry)

    // Save using entity operations
    const saved = await FeatureEntity.save({
      input: {
        layerId: layer_id, // Note camelCase
        geometry,
        properties,
        bbox
      }
    })

    return reply.code(201).send(saved)
  } catch (err) {
    app.log.error(err)
    return reply.code(500).send({ error: err.message })
  }
})
```