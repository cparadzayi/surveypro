# Spatial Schema Normalization (3NF)

## Objective
Eliminate redundancy and update the spatial model (projects, feature_layers, features, feature_revisions) to Third Normal Form while preserving existing semantics and audit capabilities.

## Previous Issues
1. `features.project_id` duplicated `feature_layers.project_id` (update anomaly risk).
2. `feature_revisions.layer_id` and `feature_revisions.project_id` both derivable transitively via `feature_id` → `features.layer_id` → `feature_layers.project_id`.
3. Trigger function duplicated redundant FKs into revisions.
4. No constraint ensuring `bbox` has 4 numeric elements.
5. Index on `features(project_id)` became unnecessary after removing the column.

## Final Logical Model (Option A: Fully Normalized)
### projects
- id (PK)
- code (UNIQUE, optional)
- name (NOT NULL)
- description (nullable)
- created_at (DEFAULT now)

### feature_layers
- id (PK)
- project_id (FK → projects.id ON DELETE CASCADE NOT NULL)
- name (NOT NULL)
- layer_type (NOT NULL DEFAULT 'generic')
- geom_type (nullable)
- srid (DEFAULT 4326)
- created_at (DEFAULT now)
- UNIQUE(project_id, name)

### features
- id (PK)
- layer_id (FK → feature_layers.id ON DELETE CASCADE NOT NULL)
- fid (UUID NOT NULL DEFAULT gen_random_uuid())
- geometry JSONB (nullable for now; future: enforce NOT NULL + validation)
- properties JSONB DEFAULT '{}'::jsonb
- bbox DOUBLE PRECISION[] (CHECK length = 4)
- created_at (DEFAULT now)
- updated_at (DEFAULT now)
- UNIQUE(layer_id, fid)

### feature_revisions
- id (PK)
- feature_id (FK → features.id ON DELETE CASCADE NOT NULL)
- rev (INT NOT NULL, sequential per feature)
- geometry JSONB
- properties JSONB
- bbox DOUBLE PRECISION[] (CHECK length = 4)
- created_at (DEFAULT now)
- UNIQUE(feature_id, rev)

## Changes Implemented (Migration 005)
- Added bbox length check constraints to `features` and `feature_revisions`.
- Verified integrity of `features.project_id` vs `feature_layers.project_id` before dropping.
- Dropped redundant `features.project_id`.
- Dropped `feature_revisions.layer_id` and `feature_revisions.project_id`.
- Replaced trigger function with version inserting only `(feature_id, rev, geometry, properties, bbox)`.
- Removed obsolete index on `features(project_id)`.

## Trigger Logic (Post-Normalization)
`feature_revision_trigger()` now:
1. Determines next revision number per feature (`MAX(rev)+1`, 1 on insert).
2. Inserts snapshot row without redundant foreign keys.

## Rationale for Dropping Redundant FKs
- Reduces mutation anomalies.
- Simplifies plugin logic (no need to propagate multiple FK values on feature insert/update).
- Query patterns needing project or layer from a revision can join upward:
  `feature_revisions → features → feature_layers → projects`.

## Performance Considerations
- Additional joins acceptable at current scale; if historical queries by project or layer become hot paths, a selective covering index or reintroducing a denormalized column with a materialized view could be considered.
- Potential future indexes:
  - `(feature_id, rev DESC)` for rapid latest revision retrieval (currently `UNIQUE(feature_id, rev)` suffices).
  - GIN/GIN + expression indexes once geometry stored as PostGIS geometry.

## Future Enhancements
1. PostGIS migration: replace `geometry JSONB` with `geometry(Geometry, SRID)` and compute `bbox` via generated column or ST_Extent.
2. Add revision metadata: `actor_user_id`, `change_reason`.
3. Enforce geometry type via CHECK using ST_GeometryType after PostGIS.
4. Soft-delete or archive strategy for features (status field).
5. Introduce `project_members` table linking users to projects with roles.

## Rollback (Manual)
If needed to restore previous redundant columns:
```sql
ALTER TABLE features ADD COLUMN project_id INTEGER REFERENCES projects(id);
ALTER TABLE feature_revisions ADD COLUMN layer_id INTEGER REFERENCES feature_layers(id);
ALTER TABLE feature_revisions ADD COLUMN project_id INTEGER REFERENCES projects(id);
```
(Backfill would need joins from existing features and feature_layers.)

---
Document generated alongside migration `005.do.sql`.
