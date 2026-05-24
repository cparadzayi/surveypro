# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SurveyPro is a web-based surveying and cadastral mapping platform for professional land surveyors in Zimbabwe. It generates SI 727-compliant survey plans, manages land parcels with spatial geometry, and performs geodetic computations. The system uses PostgreSQL with PostGIS for spatial data.

## Repository Structure

```
surveypro-nov-alpha/
├── app-backend/      # Fastify 5 API server (Node.js)
├── app-frontend/     # Vue 3 + TypeScript SPA
├── app-shared/       # Shared code (block-definitions.js for SI 727 format)
├── legacy/           # Old Platformatic DB implementation — do not modify
├── docs/             # Implementation notes and feature docs
└── qgis/             # QGIS integration scripts
```

## Development Commands

### Backend (`cd app-backend`)
```bash
npm run dev           # Fastify dev server with nodemon (port 3050)
npm run start         # Production start
npm run test          # Jest unit tests
npm run test:watch    # Watch mode tests
npm run test:coverage # Coverage report
npm run migrate       # Apply database migrations
npm run seed:sample   # Seed sample data
```

### Frontend (`cd app-frontend`)
```bash
npm run dev           # Vite dev server (port 5173, proxies /api → 3050)
npm run dev:host      # Dev server exposed on network (for mobile testing)
npm run build         # Production build → dist/
npm run preview       # Preview production build
```

### Running a single backend test
```bash
cd app-backend && npx jest --testPathPattern=<filename>
```

## Architecture

### Backend: Fastify + PostgreSQL/PostGIS
- **Entry point:** `app-backend/src/server.js` — auto-loads all route files from `src/routes/`
- **Database:** `app-backend/src/config/db.js` — PostgreSQL pool with schema isolation logic
- **Multi-tenancy:** Each surveyor gets an isolated PostgreSQL schema (e.g., `surveyor_john_doe`). All queries must `SET search_path = surveyor_xxx, public` before executing. Never query without schema context on protected routes.
- **Route auto-loading:** Adding a new `.js` file to `src/routes/` registers it automatically — no explicit imports needed.

Key route files: `auth.js` (JWT), `survey-projects.js`, `landParcels.js`, `coordinatePoints.js`, `compute.js` (COGO/traverse), `spatial.js` (PostGIS ops), `geopdf*.js` (PDF generation), `csvImports.js`.

### Frontend: Vue 3 + Pinia + Vite
- **Module system:** Feature modules live in `src/views/modules/*/`. Each module is dynamically loaded and access-controlled. Current modules: `cadastral-standard`, `cadastral-extended`, `engineering`, `mining`, `topographical`, `least-squares`, `conversions`.
- **State:** Pinia stores in `src/stores/` — `auth.ts` (JWT/user), `modules.ts` (module catalog & RBAC), `parcels.ts`, `projectContext.ts`.
- **API client:** Axios in `src/services/` — base URL from `VITE_API_BASE` env var.
- **Maps:** Leaflet + proj4leaflet for standard cadastral views; MapLibre GL for vector tile rendering.

### Coordinate Reference System (CRS) Strategy
- Survey geometry is stored in the **native local CRS** (Zimbabwe Lo zones: Lo 25, 27, 29, 31, 33) — not WGS84.
- `proj4` handles on-the-fly conversions for display/export.
- CRS is auto-detected from coordinate ranges; SRID constraint on PostGIS columns is intentionally removed to support multi-zone storage.

### PDF/Document Generation
- `pdf-lib` and `pdfkit` produce SI 727-compliant survey plan PDFs.
- `app-shared/block-definitions.js` defines the shared block layout standard (used by both backend PDF generation and frontend preview).
- GeoPDF routes (`geopdf.js`, `geopdf-vector.js`) embed spatial markup for GIS import.

## Environment Configuration

Backend `.env` (in `app-backend/`):
```
PORT=3050
JWT_SECRET=...
DATABASE_URL=postgres://user:pass@localhost:5432/surveypro_db
```

Frontend `.env` (in `app-frontend/`):
```
VITE_API_BASE=http://127.0.0.1:3050
```

## Database Migrations

Migrations live in `app-backend/migrations/` as numbered SQL files. Run `npm run migrate` from `app-backend/`. The schema supports spatial columns (PostGIS geometry types) and per-surveyor schema isolation. When adding new tables, create a new migration file — never modify existing ones.

## Key Domain Concepts

- **Survey Project:** Top-level entity grouping parcels, control points, and generated plans.
- **Land Parcel:** A cadastral lot with GeoJSON geometry, stored in the surveyor's schema.
- **Control Points:** Reference benchmarks — national registry in `public.zim_control_points`, project-specific in per-schema `project_control_points`.
- **SI 727:** Zimbabwe cadastral standard governing survey plan layout — referenced throughout the codebase for block formatting and content requirements.
- **Traverse:** A series of connected survey legs used to establish coordinates; traverse closure and adjustment are computed server-side in `compute.js`.
