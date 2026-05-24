# SurveyPro — Development Brief
**As of: April 2026**
**Purpose: Onboarding reference for incoming development team**

---

## 1. What Is SurveyPro?

SurveyPro is a web-based professional land surveying software platform designed for Zimbabwe. It digitises and automates the full cadastral survey workflow, from project setup through to SI 727-compliant survey plan PDF generation. The system is currently in active production use by registered surveyors.

**Governing standard:** SI 727 of 1979 (Survey (Plans and Diagrams) Regulations), which prescribes all formatting, layout, rounding, and content requirements for survey plans lodged with the Surveyor-General's Office (SGO) in Zimbabwe.

**Coordinate system:** Zimbabwe uses the **Lo system** (Gauss-Conform / Transverse Mercator South-Orientated) on the **Cape datum** (Clarke 1880 ellipsoid, `towgs84=-136,-108,-292`). Coordinates are expressed as Y (Westing) and X (Southing) in the Lo29 or Lo31 zone depending on the project's central meridian.

---

## 2. Technology Stack

### Backend
| Component | Technology |
|---|---|
| Runtime | Node.js v22 (ESM modules) |
| Framework | Fastify |
| Database | PostgreSQL 15+ with PostGIS |
| Auth | JWT (`@fastify/jwt`) |
| PDF generation | PDFKit (server-side, `pdfkitGeoPDF.js`) |
| DXF generation | Custom (`dxfGenerator.js`) |
| File uploads | `@fastify/multipart` |
| Coordinate projection | proj4 (via Node) |

### Frontend
| Component | Technology |
|---|---|
| Framework | Vue 3 (Composition API, `<script setup>`) |
| Build tool | Vite |
| State management | Pinia |
| Routing | Vue Router 4 |
| HTTP client | Axios |
| Maps | MapLibre GL JS |
| Coordinate projection | proj4js |
| UI styling | Tailwind CSS |
| Language | TypeScript |

### Infrastructure
- Backend runs on port **3050** (`http://127.0.0.1:3050`)
- Frontend dev server runs on port **5173** (`http://localhost:5173`)
- Frontend proxies `/api/*` to the backend via Vite proxy config
- PostgreSQL database connection via `DATABASE_URL` environment variable

---

## 3. Multi-Tenancy Architecture

SurveyPro uses a **schema-per-surveyor** multi-tenancy model:

- Each registered surveyor gets a dedicated PostgreSQL schema named `surveyor_<username>` (e.g. `surveyor_surveyor_chitsikef`)
- All surveyor-specific tables (`survey_projects`, `coordinate_points`, `land_parcels`, etc.) live in the surveyor's schema
- Shared/reference data lives in the `public` schema (e.g. `zim_control_points`, `users`, `surveyor_profiles`)
- The `admin` schema holds system administration tables

**Schema creation:** When a new surveyor registers, the PostgreSQL function `create_surveyor_schema(p_username)` is called, which creates the schema and all required tables with correct constraints. This function lives in `migrations/040.do.sql` and was most recently updated in April 2026 to include all columns added by subsequent migrations.

**Connection routing:** `app-backend/src/config/db.js` exports `getSurveyorPool(schemaName)` which wraps the pg pool and prepends `SET search_path = <schema>, public` to every query. Routes obtain the surveyor's schema name from the JWT payload and call `getSurveyorPool()` accordingly.

---

## 4. Database Schema (Key Tables)

### Public Schema (Shared)
| Table | Purpose |
|---|---|
| `users` | Login credentials (email, hashed password, user_type) |
| `surveyor_profiles` | Professional details (name, licence number, surveyor_type, schema_name) |
| `zim_control_points` | National trig/control point database for Zimbabwe |

### Per-Surveyor Schema
| Table | Purpose |
|---|---|
| `survey_projects` | Survey projects with metadata (name, district, survey_type, central_meridian, datum, instruments, designation, township, whole_portion, working_directory) |
| `coordinate_points` | Beacon/point observations (name, geom PostGIS, y, x, elevation, description, status, project_id) |
| `land_parcels` | Stand/parcel polygons (stand designation, geom, area_m2, area_ha, perimeter_m, owner, project_id) |
| `project_control_points` | Junction table linking projects to national control points |
| `csv_imports` | Tracking of CSV imports per project |

### survey_projects Columns (current)
```sql
id, name, client_name, survey_type, survey_date, district,
central_meridian, working_directory, status, metadata JSONB,
workflow_state JSONB, last_used, datum, instruments,
designation, township, whole_portion, created_at, updated_at
```
`whole_portion` values: `'the whole'` | `'the remainder'` | `'a portion'` (SI 727 Seventh Schedule requirement).

### Migrations
83 numbered migration files in `app-backend/migrations/`. They are **not auto-applied** — each must be run manually via `psql` or a Node script. New columns added by migrations must also be reflected in the `create_surveyor_schema` DB function for new surveyors to get them automatically.

---

## 5. Backend Structure

```
app-backend/
├── src/
│   ├── server.js              # Fastify app entry point — registers all routes
│   ├── config/
│   │   └── db.js              # pg pool + getSurveyorPool() + schema helpers
│   ├── models/
│   │   ├── SurveyProject.js   # create/findAll/findById/update/delete
│   │   ├── SurveyorProfile.js # surveyor profile CRUD
│   │   ├── coordinatePoint.js # coordinate point CRUD + PostGIS
│   │   ├── landParcel.js      # land parcel CRUD + geometry
│   │   └── ...
│   ├── routes/
│   │   ├── auth.js            # POST /api/auth/login|register|logout, GET /api/auth/me
│   │   ├── survey-projects.js # CRUD /api/survey-projects/:id
│   │   ├── surveyors.js       # GET /api/surveyors (admin view of all surveyors)
│   │   ├── coordinatePoints.js # /api/coordinate-points
│   │   ├── landParcels.js     # /api/land-parcels
│   │   ├── compute.js         # /api/compute/* (area, bearing, traverse)
│   │   ├── geopdf-vector.js   # /api/geopdf/generate (SI 727 PDF generation)
│   │   ├── surveyPlanPreview.js # /api/survey-plan/*
│   │   ├── control-points.js  # /api/control-points
│   │   ├── spatial.js         # /api/spatial/* (PostGIS queries, QGIS support)
│   │   ├── csvImports.js      # /api/csv-import/*
│   │   ├── documents.js       # /api/documents (PDF storage)
│   │   └── ...
│   └── services/
│       ├── pdfkitGeoPDF.js    # Main SI 727 PDF generator (~8000+ lines)
│       ├── pdfkitLabeling.js  # Beacon labeling with collision avoidance
│       ├── blockPlacementEngine.js # Dynamic block placement (title, scale bar, etc.)
│       ├── dxfGenerator.js    # DXF export for CAD
│       └── ...
└── migrations/                # 83+ numbered SQL migration files
```

### API Routes Summary

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Authenticate, returns JWT |
| POST | `/api/auth/register` | Register new user + create surveyor schema |
| GET | `/api/auth/me` | Fetch current user profile |
| GET | `/api/surveyors` | List all surveyors (admin) |
| GET | `/api/survey-projects` | List projects for authenticated surveyor |
| POST | `/api/survey-projects` | Create new project |
| PUT | `/api/survey-projects/:id` | Update project (setup, workflow state) |
| DELETE | `/api/survey-projects/:id` | Soft-delete project |
| GET | `/api/coordinate-points?project_id=X` | List beacon points for project |
| POST | `/api/coordinate-points/batch` | Bulk upsert coordinate points |
| GET | `/api/land-parcels?project_id=X` | List stand polygons |
| POST | `/api/compute/area` | Compute area for a polygon |
| POST | `/api/compute/area/batch` | Batch area computation via QGIS polygons |
| POST | `/api/geopdf/generate` | Generate SI 727-compliant survey plan PDF |
| GET | `/api/control-points` | Search national control points |
| POST | `/api/csv-import` | Import coordinate CSV |
| GET | `/api/spatial/db-connection` | QGIS connection info |

---

## 6. Frontend Structure

```
app-frontend/src/
├── main.ts                    # App entry, Pinia + Router setup
├── App.vue                    # Root component with auth guard wrapper
├── router/index.ts            # Vue Router — module routes are dynamic
├── stores/
│   ├── auth.ts                # Pinia auth store (JWT, profile, session timeout 4h)
│   ├── modules.ts             # Module registry + role-based access
│   └── projectContext.ts      # Shared active project state across views
├── composables/
│   ├── useSurveyors.ts        # Fetch surveyors + survey projects, updateSurveyProject()
│   └── ...
├── services/
│   ├── api.ts                 # Axios instance with JWT interceptor
│   ├── spatial.ts             # Coordinate points, land parcels, QGIS connection
│   ├── compute.ts             # Area computation API calls
│   ├── geopdf.ts              # PDF generation API calls
│   └── ...
├── utils/
│   ├── dms.ts                 # DMS formatting (228°45'40" format — do NOT change)
│   ├── areaFormatting.ts      # Banker's rounding, m²/ha formatting
│   ├── displayConfig.ts       # DMS display policy
│   └── ...
└── views/
    ├── DashboardView.vue
    ├── LandingView.vue        # Login + Register
    ├── CompleteProfileView.vue
    └── modules/
        ├── cadastral-standard/ # Main cadastral workflow module
        └── lite/               # Lighter computation tools
```

### Module System
Modules are registered in `stores/modules.ts` with role-based access control. Routes resolve dynamically: `/modules/:module/:submenu` → `SubmenuLoader.vue` → lazy-imports the correct view component. Access control is enforced in the router guard using `modulesStore.canAccessModule()`.

**User roles and access:**
| Role | Access |
|---|---|
| `registered` | All modules including Cadastral Standard |
| `in_training` | Professional modules, not Cadastral Standard creation |
| `technician` | Lite computation tools |
| `student` | Lite computation tools (read-only) |

---

## 7. Cadastral Standard Workflow

The most complex module. `CadastralStandardView.vue` (~6000 lines) orchestrates a multi-step workflow persisted to `survey_projects.workflow_state` (JSONB):

### Workflow Steps (in order)
1. **Project Setup** (`ProjectSetupView.vue`) — Project name, client, district, Lo zone (central meridian), datum, instruments used, survey date, designation (SI 727 title block line 1), township, `whole_portion` (the whole / the remainder / a portion)
2. **Control Point Selection** (`ControlPointSelectionView.vue`) — Select 1+ national trig beacons from `zim_control_points` that were used as fixed points
3. **Coordinate List** (`CoordinateListView.vue`) — Import/edit the list of beacons with Y, X coordinates; supports CSV import
4. **Found Beacons** (`FoundBeaconsView.vue`) — Record which existing beacons were found, their descriptions (pipe type/size, condition)
5. **Area Computation** (`AreaComputationView.vue`) — Compute stand areas using the coordinate traverses; Gauss formula
6. **Report on Survey** (`ReportOnSurveyView.vue`) — DSG narrative report with observations, instruments, methods
7. **DSG Certificate** (`DSGCertificateView.vue`) — Surveyor's professional certificate
8. **Survey Plan** (`SurveyPlanViewNew.vue` / `SurveyPlanMapView.vue`) — SI 727-compliant plan generation (see §8)

### Key State Management
- `selectedProjectId` — the active project; persisted across steps
- `workflow_state` JSONB in DB — tracks `completed_steps`, `current_step`, `step_data`, `generated_documents`
- `onSurveyorChange()` in `CadastralStandardView.vue` — **important**: does NOT reset `selectedProjectId` (this was a bug fixed April 2026)

---

## 8. Survey Plan PDF Generation (SI 727)

The most complex backend component. `pdfkitGeoPDF.js` (~8000+ lines) generates production-quality survey plans.

### SI 727 Layout Requirements
- **Page size:** A0, A1, A2, A3 (selected dynamically based on survey scale)
- **Left margin:** 50mm (binding)
- **Right margin:** 150mm (endorsements panel — outside the map figure)
- **Map figure:** Contains all survey data, title block, schedule of areas, beacons
- **Title block:** Top of map figure; dynamically placed to avoid collision with survey polygon
- **Scale bar + North arrow:** Below/adjacent to title block; also dynamically placed
- **Endorsements:** Right margin — SGO stamp, surveyor signature, date
- **Beacon symbols:** Triangles for trig beacons, crosses for found beacons, circles for new beacons
- **Edge labels:** Distance (metres, 3 decimal places) and bearing (DMS format: `228°45'40"` — **must not be changed to space-separated format**)

### Dynamic Block Placement Engine
`blockPlacementEngine.js` + `pdfkitGeoPDF.js` implements:
- `_findTitleSlot()` — scans top-to-bottom for a title block position that does not collide with the survey polygon
- Scale bar and North arrow are pre-placed relative to the found title slot
- Beacon labels use collision avoidance via `pdfkitLabeling.js`

### Multi-sheet Plans
Large subdivisions (many stands) generate multiple sheets. Each sheet has its own title block with sheet number and total sheet count.

### Metadata passed to PDF generator
```typescript
interface VectorGeoPDFRequest {
  metadata: {
    surveyOf: string          // "Stand 2283-2836 Sebanga Township"
    wholePortion: string      // "a portion" | "the whole" | "the remainder"
    township: string
    district: string
    surveyDate: string
    surveyorName: string
    licenseNumber: string
    datum: string             // "cape" | "wgs84"
    instruments: string
    centralMeridian: number   // 29 or 31
    totalStandCount: number
    standRange: string        // "2283 to 2836"
    // ...
  }
}
```

### Rounding Standards (SI 727 / SGO)
- **Distances:** 3 decimal places (millimetre precision)
- **Areas in m²:** 0 decimal places for areas > 1 ha, 2 decimal for smaller
- **Areas in ha:** 4 decimal places
- **Bearings:** DMS, seconds to 0 decimal places
- **Residuals:** 3 decimal places
- All rounding uses **Banker's rounding** (round half to even)

---

## 9. Coordinate System Details

### Lo System (Zimbabwe)
- **Projection:** Transverse Mercator South-Orientated (TMSO)
- **Datum:** Cape (Clarke 1880 Arc ellipsoid), `towgs84=-136,-108,-292,0,0,0,0`
- **Zones used:** Lo29 (central meridian 29°E) and Lo31 (central meridian 31°E)
- **Axes:** Y = Westing (positive west of meridian), X = Southing (positive south of equator)
- **proj4 string for Lo29:** `+proj=tmerc +axis=wsu +lat_0=0 +lon_0=29 +k=1 +x_0=0 +y_0=0 +ellps=clrk80 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs`
- **proj4 string for Lo31:** same but `+lon_0=31`
- **IMPORTANT:** `+axis=wsu` means the projection natively accepts `[Y_westing, X_southing]` — no sign manipulation needed

### Typical Coordinate Ranges
- Y (Westing): 90,000 – 110,000 m (distance west of central meridian)
- X (Southing): 2,200,000 – 2,800,000 m (distance south of equator)

### WGS84 Conversion
Use `proj4(loProjectionString, '+proj=longlat +datum=WGS84 +no_defs', [Y, X])` which returns `[lng, lat]`.

### Database Storage
PostGIS geometry stored with SRID corresponding to the Cape Lo zone. Coordinate points table has generated columns `y` and `x` extracted via `ST_Y(geom)` and `ST_X(geom)`.

---

## 10. QGIS Integration

QGIS is used as an external digitisation tool:
1. Surveyor connects QGIS to the PostgreSQL database (connection info from `/api/spatial/db-connection`)
2. Surveyor digitises land parcel polygons in QGIS, saving directly to the `land_parcels` table in their schema
3. SurveyPro reads back the polygons and computes areas via `/api/compute/area/batch`
4. Results are stored in `land_parcels.area_m2`, `area_ha`, `perimeter_m`

**QGIS schema access:** Each surveyor's schema is accessible directly. The `SET search_path` approach means QGIS should be pointed at the specific surveyor schema.

---

## 11. Authentication & Session Management

- **Registration:** POST `/api/auth/register` → creates user record + calls `createSurveyorSchema()` → returns JWT
- **Login:** POST `/api/auth/login` → validates password → returns JWT
- **JWT:** Stored in `localStorage`; decoded on backend via `@fastify/jwt`; expires per JWT config
- **Session timeout:** Client-side 4-hour inactivity timeout enforced in `auth.ts`
- **Profile completion:** New users without a `surveyor_profiles` record are redirected to `/complete-profile`
- **Route guard:** All routes except `/landing` require auth; module access is role-filtered

---

## 12. CSV Import Format

The system accepts coordinate point CSV files in the following format:

```csv
Point,Y,X,Status,Description,Date
P2,97538.004,2247107.872,F,50mm Iron Pipe in Concrete,2/11/2021
ZA,96271.080,2247869.919,F,50mm Iron Pipe in Concrete,2/11/2021
2283A,97057.022,2247854.388,P,12mm iron peg in concrete,2/11/2021
```

- **Status:** `F` = Fixed (existing trig/control beacon), `P` = Pegged (new beacon placed)
- **Y:** Westing in Lo system metres
- **X:** Southing in Lo system metres

---

## 13. Known Architecture Decisions & Constraints

1. **No ORM.** All database queries are raw SQL via the `pg` library. This is intentional for performance and PostGIS compatibility.

2. **ESM throughout backend.** `package.json` has `"type": "module"`. All imports use ES module syntax. No CommonJS `require()`.

3. **Migrations are manual.** There is no migration runner. Each `.sql` file must be applied manually. When adding columns to `survey_projects`, you must also update the `create_surveyor_schema` PostgreSQL function.

4. **`pdfkitGeoPDF.js` is monolithic.** The main PDF generator is ~8000+ lines. This is a known tech debt item. Do not split it without careful coordination as it has complex shared state.

5. **DMS format is fixed.** Bearing display format is `228°45'40"` (no spaces). This is an SGO requirement. Do not alter.

6. **Banker's rounding everywhere.** Standard JS `Math.round()` is not used for survey values. Use the `bankersRound()` utility in `app-frontend/src/utils/areaFormatting.ts` and the equivalent backend utility.

7. **Schema name pattern:** `surveyor_<email_prefix_lowercased_alphanum>`. Validated with regex `/^surveyor_[a-z0-9_]+$/` before use in queries (SQL injection prevention).

8. **Google Maps integration** in `AreasView.vue` converts Lo29/Lo31 coordinates to WGS84 using proj4 with `+axis=wsu` — passes `[Y, X]` directly (no sign flip).

---

## 14. Development Environment Setup

### Prerequisites
- Node.js v22+
- PostgreSQL 15+ with PostGIS extension
- QGIS 3.x (for polygon digitisation workflow)

### Backend
```bash
cd app-backend
cp .env.example .env          # Set DATABASE_URL, JWT_SECRET
npm install
npm run dev                   # Starts on http://127.0.0.1:3050
```

### Frontend
```bash
cd app-frontend
npm install
npm run dev                   # Starts on http://localhost:5173
```

### Database Setup
```bash
# Apply extensions first
psql -d <database> -f migrations/000_extensions.sql
# Then apply migrations in order
psql -d <database> -f migrations/001.do.sql
# ... through to latest (083)
```

### Environment Variables (Backend)
```
DATABASE_URL=postgresql://user:pass@localhost:5432/surveypro
JWT_SECRET=<strong-secret>
PORT=3050
HOST=127.0.0.1
NODE_ENV=development
```

---

## 15. Current Development Status (April 2026)

### Completed & Working
- Multi-tenant schema-per-surveyor architecture
- Full cadastral standard workflow (8 steps)
- SI 727-compliant PDF generation with dynamic title block placement
- Multi-sheet survey plan generation
- Coordinate import from CSV
- National control point database (Zimbabwe)
- Area computation (Gauss formula, Banker's rounding)
- QGIS polygon digitisation → area computation pipeline
- Google Maps preview of coordinate points (Lo → WGS84 conversion)
- Role-based access control
- `whole_portion` field (the whole / remainder / portion) — SI 727 Seventh Schedule

### Known Issues / In Progress
- `pdfkitGeoPDF.js` title block dynamic placement (collision avoidance) — recently fixed; needs end-to-end test with complex polygons
- Migration runner tooling — migrations applied manually; should be automated
- `pdfkitGeoPDF.js` file size (tech debt) — candidate for future refactoring into separate service files

### Recently Fixed (April 2026)
- `whole_portion` column missing from all surveyor schemas → applied `ALTER TABLE` to all 8 schemas + updated `create_surveyor_schema` function
- `selectedProjectId` reset to null by `onSurveyorChange()` after project creation → removed erroneous reset line in `CadastralStandardView.vue`
- `_titleX`/`_titleY` ReferenceError in scale bar placement → replaced with `_titleSlot.x`/`_titleSlot.y`

---

## 16. File Locations Quick Reference

| What | Where |
|---|---|
| Backend entry point | `app-backend/src/server.js` |
| Database config | `app-backend/src/config/db.js` |
| PDF generator | `app-backend/src/services/pdfkitGeoPDF.js` |
| Block placement | `app-backend/src/services/blockPlacementEngine.js` |
| Cadastral workflow view | `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue` |
| Project setup step | `app-frontend/src/views/modules/cadastral-standard/ProjectSetupView.vue` |
| Survey plan map | `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue` |
| Area computation view | `app-frontend/src/views/modules/lite/areas/AreasView.vue` |
| Auth store | `app-frontend/src/stores/auth.ts` |
| API service | `app-frontend/src/services/api.ts` |
| Surveyors composable | `app-frontend/src/composables/useSurveyors.ts` |
| DMS utility | `app-frontend/src/utils/dms.ts` |
| Area formatting | `app-frontend/src/utils/areaFormatting.ts` |
| Migrations | `app-backend/migrations/` (000–083) |
| Schema function | `app-backend/migrations/040.do.sql` (+ updated via `scripts/update-schema-function.js`) |

---

*This document was generated from the live codebase. Update it when major architectural changes are made.*
