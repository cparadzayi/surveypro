# Route Order Fix for control-points.js

## Problem
The `/:id` route is matching before `/nearby` and `/stats` routes, causing validation errors.

## Solution
Reorder routes so specific paths come BEFORE parameterized paths.

## Correct Order:
1. `GET /` - List all (with filters)
2. `GET /nearby` - Specific path
3. `GET /stats` - Specific path  
4. `GET /monument/:monu_num` - Specific path with param
5. `GET /:id` - Generic param (MUST BE LAST)
6. `POST /`
7. `POST /bulk-import`
8. `PUT /:id`
9. `DELETE /:id`

## In Fastify
Routes are matched in the order they are registered. More specific routes must come before generic parameterized routes.

**Current (WRONG):**
```
GET / 
GET /:id          ← This catches /nearby and /stats!
GET /monument/:monu_num
POST /
PUT /:id
DELETE /:id
GET /nearby       ← Never reached!
GET /stats        ← Never reached!
```

**Should be (CORRECT):**
```
GET /
GET /nearby       ← Specific, comes first
GET /stats        ← Specific, comes first
GET /monument/:monu_num
GET /:id          ← Generic, comes last
POST /
POST /bulk-import
PUT /:id
DELETE /:id
```
