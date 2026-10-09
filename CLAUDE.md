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

### Running backend tests directly (filtered)
The backend is ESM (`"type": "module"`), so Jest must run under
`--experimental-vm-modules` — bare `npx jest` fails with "Cannot use import
statement outside a module". Use the same runner as `npm test`, from `app-backend`:
```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>
```
`<pattern>` matches test file paths (e.g. `diagramPdf`, or `diagram` for all
diagram suites). `npm test` runs the whole suite the same way.

## Architecture

### Backend: Fastify + PostgreSQL/PostGIS
- **Entry point:** `app-backend/src/server.js` — auto-loads all route files from `src/routes/`
- **Database:** `app-backend/src/config/db.js` — PostgreSQL pool with schema isolation logic
- **Multi-tenancy:** Each surveyor gets an isolated PostgreSQL schema (e.g., `surveyor_john_doe`). All queries must `SET search_path = surveyor_xxx, public` before executing. Never query without schema context on protected routes.
- **Route auto-loading:** Adding a new `.js` file to `src/routes/` registers it automatically — no explicit imports needed.
- **Authentication is mandatory.** `server.js` decorates `app.authenticate` *before* loading routes, and every route in `src/routes/` must set `preHandler: [app.authenticate]` (add `authenticateWithSchema` too for tenant-scoped data). This is enforced at boot: Fastify throws "preHandler hook should be a function" if the decorator is missing, so a plugin can never be mounted unauthenticated by accident. Only `health.js` (load-balancer probe), `testRoute.js`, and `auth/register` + `auth/login` are intentionally open.
  - A token requirement is *not* tenant isolation. Several plugins (notably `parcels.js`, `area-parcels.js`, `surveyors.js`, `historicalSurveyPoints.js`, `documents.js`) still take `:projectId` / `:id` at face value and use the global pool, so any authenticated user can read or mutate another surveyor's data. See "Known gaps" below.
  - In tests, register route plugins through `src/routes/__tests__/helpers/buildApp.js`, which supplies the decorator.

Key route files: `auth.js` (JWT), `survey-projects.js`, `landParcels.js`, `parcels.js`, `coordinatePoints.js`, `compute.js` (COGO/traverse), `spatial.js` (PostGIS ops), `geopdf*.js` (PDF generation), `documents.js` (file writes), `csvImports.js`, `historicalSurveyPoints.js`.

### Frontend: Vue 3 + Pinia + Vite
- **Module system:** Feature modules live in `src/views/modules/*/`. Each module is dynamically loaded and access-controlled. Current modules: `cadastral-standard`, `cadastral-extended`, `engineering`, `mining`, `topographical`, `least-squares`, `conversions`.
- **State:** Pinia stores in `src/stores/` — `auth.ts` (JWT/user), `modules.ts` (module catalog & RBAC), `parcels.ts`, `projectContext.ts`, `projectSelection.ts`, `spatial.ts`, `surveyLookup.ts`.
- **API client:** `src/services/api.ts` is the single HTTP client and the single source of truth for the base URL. **Always import it** (`import api from '@/services/api'`) rather than using bare `fetch`, bare `axios`, or re-deriving a base URL. Bare `fetch`/`axios` bypasses the auth interceptor, so those calls sent no `Authorization` header and fail against guarded routes; they also reintroduce CORS. Several call sites had hardcoded dead ports (`3042`) that way — there are none left.
- **Maps:** Leaflet + proj4leaflet for standard cadastral views; MapLibre GL for vector tile rendering.

### Numeric rounding — one implementation only
Banker's rounding (round-half-to-even) is implemented **once**, in `app-frontend/src/utils/dms.ts`, and mirrored by `bankersRound` in `app-backend/src/utils/zim-geo.js`. Five frontend modules used to carry divergent copies; three guarded the tie branch with comparisons that can never be true for a double (`< Number.EPSILON`, or `=== 0.5` against a float remainder), so exact ties silently fell through to `Math.round` and disagreed with the persisted coordinates by a centimetre. All copies are now re-exports of `utils/dms.ts`.

**Do not add another copy.** `app-frontend/src/utils/__tests__/bankersRoundParity.test.ts` asserts parity against the backend rule and would catch a regression — but only for modules it already imports.

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
HOST=0.0.0.0
JWT_SECRET=<>=32 chars; the process refuses to start if missing or short>
DB_HOST=localhost
DB_PORT=5432
DB_NAME=surveypro_app
DB_USER=surveypro_app
DB_PASSWORD=...
DATABASE_URL=postgres://user:pass@localhost:5432/surveypro_app
```

`DB_USER` is the dedicated non-superuser role, not `postgres`. See **Database roles** below for why, and for the one-time `CREATE ROLE` / grant / ownership setup a fresh database needs.

`JWT_SECRET` has **no default**. `server.js` calls `process.exit(1)` if it is unset or under 32 characters — the old fallback was the public literal `your-secret-key`, which would have let anyone mint a token for any user.

Never commit `.env`. It is git-ignored and was never tracked, but a DB password *was* committed in three other files (`legacy/backend/server.js`, `legacy/backend/test-server.js`, `app-backend/run-migration-076.bat`), all now read from the environment instead.

### Database roles — the app does NOT connect as `postgres`

The app connects as the dedicated role **`surveypro_app`** (`DB_USER` in `app-backend/.env`), a `NOSUPERUSER` login. `postgres` is a superuser and is **left alone**: it is shared with a second product at `C:\vungis` (database `vungu_master_db_v1`), whose `app-backend/.env` hardcodes its own database password and whose backend and Vite frontend usually run in the background.

That sharing is not hypothetical. The `postgres` password was rotated to a 48-character random value, verified working (old value rejected with `28P01`, `npm run migrate` clean), and later found **silently reverted on the server** — the original password authenticated again. Ruled out along the way: a single Postgres instance (`postgresql-x64-18`, PG 18), no `trust` rule in `pg_hba.conf` (all `scram-sha-256`), no scheduled task, no pgAdmin/DBeaver, and no copy of the password anywhere in either repository outside the vungis `.env`. Note the logs do **not** show the reverting `ALTER ROLE`: successful DDL is not logged at the default `log_statement = none`, only failed statements are. Never conclude anything from the absence of a statement in the Postgres log.

A shared superuser credential is not ours to rotate in isolation — the co-tenant can put it back at any time. Hence the separate role. What it needed, each requirement measured rather than assumed:

- `GRANT CONNECT, CREATE ON DATABASE surveypro_app` — `create_surveyor_schema()` runs `CREATE SCHEMA` as the **caller**, because the helper functions in `pg_proc` are `SECURITY INVOKER`.
- Ownership of `admin`, `public` and the three `surveyor_*` schemas plus their tables/views/sequences/functions — `npm run migrate` runs `ALTER TABLE` against objects `postgres` created. Ownership was moved per schema because `REASSIGN OWNED` refuses to run at all here ("required by the database system").
- Nothing else. Migration 005's `CREATE EXTENSION IF NOT EXISTS postgis` **was confirmed to succeed as a non-superuser**, so migrations do not need elevated rights.

Two traps in that reassignment, both hit and both fixed:

- **`public` is an extension schema and also holds 25 app tables.** Filtering out "schemas that belong to an extension" to leave extension-owned objects alone silently drops `public`, which is the schema the app owns the most tables in. The correct rule is to skip a schema only if it contains *nothing but* extension objects, which is what excludes `tiger` and `topology` and keeps `public`.
- **A `SERIAL`/`IDENTITY` sequence cannot be reassigned directly** (`0A000`, "linked to table") — `ALTER TABLE ... OWNER TO` moves the sequence with it, so the table must be moved and the sequence skipped.

Verified after the change: `npm run migrate` clean as `surveypro_app`; tenant pools, `SurveyorProfile.findVisibleTo`, `SurveyProject.findAll`, `list_project_views()`, PostGIS functions and geometry reads all work; the original `postgres` password still works, so the co-tenant app is unaffected.

To connect from anywhere else — psql, a GUI client, a hosting panel, CI — use `surveypro_app` with the password in `app-backend/.env`. **Anything still configured with the old `postgres` credential needs updating**, and should be pointed at the dedicated role rather than the superuser.

The old superuser password remains readable in git history (`legacy/backend/server.js` and friends have carried it since the initial commit, so it is in the tree of all ~1131 commits, across all five pushed branches). A history rewrite was considered and **declined**: it is irreversible, breaks every existing clone and open PR, and does not reliably retract a secret from a published repository anyway. Treat the history as read-only-by-trusted-parties; if this repository is ever made public, rotate again before doing so.

Two other files that looked alarming are not: `app-backend/backup-surveypro-20251009_005657.dump` is a **zero-byte** blob (no database contents were ever committed), and the JWT inside `app-backend/recent-backend-logs.txt` was already rotated out when the file was untracked.

Frontend `.env` (in `app-frontend/`; see `.env.example`):
```
VITE_API_BASE=/api                 # client baseURL, INCLUDING /api
VITE_DEV_PROXY_TARGET=http://127.0.0.1:3050   # dev proxy target, server ROOT, no /api
```

These are deliberately separate variables. `VITE_API_BASE` is used verbatim as the axios `baseURL`, so it must include `/api`; the dev proxy target must **not**, because Vite prepends the incoming `/api` path itself. They previously shared one variable, so following the documented dev value (`VITE_API_BASE=/api`) produced an invalid proxy target.

### The startup DB probe must not race the route loader

`src/config/db.js` runs a connection probe at import time and `process.exit(1)`s if it fails, so a broken `DATABASE_URL` stops the server instead of surfacing as 500s later. The failure mode was too eager, though: `db.js` is imported at the top of `server.js`, and cold start then loads ~30 route modules (pdfkit, proj4, turf). That loading competes with the probe's very first handshake, and the probe's `connectionTimeoutMillis` window expires while the event loop is busy — one measured boot took **24s** to reach "listening" against a `10s` budget, so the server exited with `Database connection error: Connection terminated due to connection timeout` on a database with 9 of 100 connections in use and no blocking.

Raising the timeout only moves the threshold, because module load time is not a fixed constant; this had already been bumped 2s → 10s for the same reason. The probe now **retries** (5 attempts, 1s apart) and only then exits. Fail-fast is preserved for a genuinely unreachable database — the failure just is not declared on the strength of one handshake that happened to lose a race.

Related trap when writing tests that import anything reaching `config/db.js` (directly or via `schemaAuth.js`): the probe opens a real pool at import. Without an explicit `pool.end()` in `afterAll`, the idle socket survives for `idleTimeoutMillis` (30s) and Jest reports "did not exit one second after the test run has completed".

## Database Migrations

Migrations live in `app-backend/migrations/` as numbered SQL files, applied with `npm run migrate` from `app-backend/`. The schema supports spatial columns (PostGIS geometry types) and per-surveyor schema isolation.

- **Never modify an already-applied migration.** `scripts/migrate.js` records a SHA-256 of each file in `migrations_history.checksum`. On every run it re-hashes the files on disk; a file that was edited after being applied is reported as `DRIFT` and the command exits non-zero, because applied migrations are never re-run and the change would otherwise never reach any database. Add a new numbered file instead.
- `npm run migrate:status` lists applied migrations and flags modified or missing ones.
- Rows applied before checksums existed have `checksum IS NULL` and are reported as unverifiable rather than silently treated as matching.

## Authorization model

Authorization is layered, and the layers are **not** interchangeable. Picking the wrong one is how the IDORs below got in.

1. **`app.authenticate`** — valid JWT or 401. Required on every route. Only `health.js` (load-balancer probe), `testRoute.js` (scaffold), and `auth/register` + `auth/login` are exempt.
2. **`authenticateWithSchema`** — resolves the caller's `surveyor_profiles` row and sets `request.db` to a pool whose `search_path` is `<their schema>, public`. Sets `request.db = null` when the caller has no profile, or a profile with no `schema_name`.
3. **`requireSchema`** — 400 when `request.db` is null. **This is the layer that makes a request fail closed.** Without it, a handler reading `request.db || <global pool>` silently continues on the shared pool, where `search_path` is `"$user", public`.
4. **`requireAdmin`** — 403 unless `request.surveyorProfile.role === 'admin'`.

`requireSchema` is now wired into all 48 route arrays across `landParcels`, `coordinatePoints`, `csvImports`, `survey-projects`, `geopdf-vector`, `spatial` and `surveyPlanPreview`, and all 44 `request.db || <global pool>` fallbacks are gone. Note `landParcels.js` had a third site with schema scoping switched off and a "temporarily disabled" note; that is now enabled too.

### Layers 3 and 4 must be `async` hooks

Both guards were declared `function (request, reply)`. That hangs every request that passes them.

Fastify 5 advances a hook chain only when the hook returns a thenable (`lib/hooks.js`): `const result = iterator(...); if (result && typeof result.then === 'function') result.then(...)`. There is no `else`. A synchronous hook that falls off the end returns `undefined`, so `next()` is never called — no error, no log line, no server-side timeout, the client waits forever. Measured: `/api/survey-projects` 30 ms once fixed, unbounded before, with `total=2 idle=2 waiting=0` in `pg` and one `'idle'` / `wait_event=ClientRead` session in `pg_stat_activity` — the request held no connection and was waiting inside JS, which is why every database-side theory was ruled out.

**Both are `async` now, and must stay that way.** Adding an explicit `return` does not help; it still returns `undefined`. A `done` third parameter also works.

The failure mode is why this survived a green suite: every prior test asserted a **deny** path (400/403), and a deny path calls `reply.send()`, which finishes the response without ever needing `next()`. The broken allow path had no coverage at all. When adding a guard, test that a request it **permits** reaches the handler, and bound the wait — a hang produces no failure message of its own and only shows up as a generic Jest timeout. `src/utils/__tests__/schemaAuth.hooks.test.js` pins all of this: the allow paths, the shape (`AsyncFunction`), and the underlying Fastify behaviour, so a future Fastify upgrade that makes sync hooks legal surfaces there instead of silently re-brokening the API.

### What the hang was hiding

The sync-hook defect did not just withhold responses — it withheld **the ability to see other bugs**, because a handler that never runs can never return an error. Once the guards became `async`, probing the previously-dead routes surfaced pre-existing defects that had never been reachable:

- **`GET /csv-imports/:id`** returned 500 with `column u.username does not exist` (`42703`). `public.users` has no `username` column — it has `email`. The query now selects `u.email AS imported_by_username`, keeping the alias so `services/csvImports.ts` is unchanged. **The alias was the point**: `imported_by_username` is a display name, and the frontend types it optional.
- **The same route recorded `imported_by = NULL` for every import.** It read `request.user?.id`, but the JWT payload is `{ sub, email }` — there is no `id` claim, so the expression was always `undefined`. Now `request.user?.sub ?? request.user?.id ?? null`, matching every other route. That also meant `imported_by_username` was structurally always null even once the column reference was fixed.

Both are in `src/routes/csvImports.js`. Neither is a security finding; both are the ordinary cost of a route that could never execute. **When a request path is found to be dead, treat everything downstream of it as unverified** — it has never run, so nothing in it has been exercised, and "no bug reports" is not evidence.

### Sweeping the whole guarded surface

Probing individual endpoints is a weak way to check a hook fix, so the surface was walked: 17 GET routes whose chain includes `requireSchema`/`requireAdmin`, plus all 9 GET routes in `spatial.js`. `spatial.js` is enumerated from its own path literals rather than by parsing each route's options object — that parse misses most of its routes, because the objects nest. All respond; nothing hangs. The `403`s from `/spatial/projects/1/layers` and friends are the ownership helpers working: `public.projects` holds one row, owned by `user_id = 2` (`demo@example.com`), so the admin legitimately sees none of it. That is the two-id-spaces situation below, not a scoping bug.

### Why `requireSchema` is not sufficient on its own

`search_path` scoping only isolates tables that are **per-surveyor**. Everything in `public` resolves to the same shared table for everyone no matter whose pool you borrow. Where a table is shared, isolation has to come from the row:

- **`spatial.js` layers/features** — `projects`, `layers` and `features` are `public`-only and carry no owner column except `projects.user_id`. The chain is `features.layer_id → layers.project_id → projects.user_id`. Every route resolved its target by bare ID, so any authenticated caller could read, rewrite or delete another user's layers and features. Now gated by `ownedProject` / `ownedLayer`.
- **`spatial.js` project-views routes** — keyed on `survey_projects`, which *is* per-surveyor, and `create_project_views()` / `drop_project_views()` are plpgsql that resolve `survey_projects` against the caller's `search_path` at run time. These use `ownedSurveyProject` + `request.db`, deliberately **not** `ownedProject`: the two `projects` tables are separate id spaces, so checking one against the other would reject legitimate owners.
- **`surveyors.js`** — `surveyor_profiles` and `users` are `public`-only, so schema scoping cannot help at all. Uses the `role` column instead.

### Roles

There was **no role model**: `surveyor_profiles` had no role column, `supervisor_id` was NULL for every row, and the JWT carried only `{ sub, email }` — yet the app shipped an admin surface (`SurveyorsView.vue` manages every surveyor; `SurveyorSelector.vue` creates one on the fly), and `PUT`/`DELETE /surveyors/:id` let **any** authenticated caller rewrite or delete **any** surveyor.

Migration `094_surveyor_role.do.sql` adds `role TEXT NOT NULL DEFAULT 'surveyor'` with a CHECK constraint. Reads are self + supervisees (`SurveyorProfile.findVisibleTo`); writes are admin-only. Migration deliberately leaves every pre-existing row at `'surveyor'` — granting a privilege is an explicit act, not a side effect of a schema change. To promote someone:

```sql
UPDATE surveyor_profiles SET role = 'admin'
 WHERE user_id = (SELECT id FROM users WHERE email = 'you@example.com');
```

Current state of this database: `cparadzayi@gmail.com` (profile 3, schema `surveyor_surveyor_cparadzayi`) is the admin; `demo@example.com` (profile 1, schema `surveyor_surveyor_demo`) is still `'surveyor'` and is correctly refused by `requireAdmin`. Note that `supervisor_id` is NULL on **both** rows, so `findVisibleTo` resolves to self-only for every user regardless of role — the hierarchy is a data gap, not a code one.

`GET /auth/me` returns `profile.role`; `stores/auth.ts` exposes it as `isAdmin`. The frontend only *hides* buttons — the API enforces independently, so hiding them is UX, not the control.

## Known gaps (deliberately not fixed)

These are open and should not be mistaken for covered:

- **`getSurveyorPool().connect()`** in `src/config/db.js` sets `search_path` but does not reset it on release, so a pooled connection can retain a previous tenant's schema. `query()` was fixed to use `SET LOCAL` inside a transaction; the `connect()` path (7 call sites) was left alone because a fire-and-forget reset after `release()` races, making the leak intermittent rather than fixed.
- **`shoelaceAreaYX`** is duplicated between `app-backend/src/utils/zim-geo.js` and `app-frontend/src/utils/registryGeometry.ts`. They currently agree, and the copy is load-bearing for area figures on legal plans, so it belongs in `app-shared/` — but `zim-geo.js` is imported widely and the move was left for a dedicated change.
- **`geopdf-vector.dxf-gpkg.test.js`** needs a real `ogr2ogr`. It used to be recorded here as "GDAL is not installed in the dev environment" — that was wrong. GDAL ships inside QGIS, and this host has **QGIS 3.44.15**, so `ogr2ogr` is on disk; the app simply could not find it (see *GDAL discovery* below). Fixed, so the suite is green; it does spawn real GDAL and takes ~25s.
- **`planSheeting.parity.test.js`** has one failing test (PDF vs DXF title-band parity, 42.7mm vs a 15mm tolerance) and takes ~54 minutes to run. It fails on a clean checkout.

### GDAL discovery

`utils/gdalDiscovery.js` owns finding `ogr2ogr` / `gdal_translate`. **Do not reintroduce a list of pinned install paths.** Both GeoPDF route files used to hardcode `C:\Program Files\QGIS 3.44.3\bin\ogr2ogr.exe` and two older versions; this host has `QGIS 3.44.15`, its `bin` is not on the machine PATH, so every lookup returned `null`. The app then reported `GDAL not found` and silently degraded GeoPDF/GeoPackage export to DXF + `.prj` — a whole export feature switched off by a version string, with no error anywhere.

Discovery is now: PATH, then every `QGIS *` directory under each install root, newest first, with each candidate accepted only on its own `--version` succeeding. Ordering is a preference, not a correctness dependency.

Two Windows details that cost time here, both pinned by measurement:

- A bare tool name is returned when it is on PATH, a **quoted** absolute path when it is not — and the two are not interchangeable. `exec('"<path with spaces>" --version')` works; `execFile('<path with spaces>', [...])` works; `execFile('"<path with spaces>"', [...])` fails `ENOENT`, because execFile does not strip quotes. `dxfGpkg.js` strips them before execFile for that reason.
- `dxfGpkg.js` sets `PROJ_LIB`/`PROJ_DATA` to QGIS's own `share/proj` when the tool came from a QGIS install, because the system PATH can resolve a PostGIS `proj.db` whose `DATABASE.LAYOUT.VERSION` GDAL cannot read, which breaks SRS parsing outright. That only ever ran when discovery returned a real install path — i.e. never, until now. With it firing, `ogr2ogr` no longer logs `PROJ: no database context specified`, and the `.gpkg` suite got slower (24s vs 14s) because the conversion now does real work instead of half-failing.

`GET /api/geopdf/check` is the live probe: it must answer `{"available": true}` on a host that has QGIS. It answered `false` here for as long as the version list was pinned.

### Test suite runtime

`npm test` takes **over two hours**, which makes it unusable as a pre-commit gate and is the reason changes here get verified in slices. It is not one slow test but roughly a dozen, and they share a cause:

- **The Maglas fixture is the bottleneck.** `sampleMaglasPlan.js` is only 3 KB, but the DXF and PDF tests that render it (`dxfGenerator.snapshot`, `dxfGeometry`, `adjoiningFeaturesDxf`, `dxfTopology`, `pdfkitGeoPDF.*`) each take **20-30 minutes** on the Maglas case, against a few seconds for the minimal fixtures in the same file. Something in the render path is superlinear in feature count — label placement, adjacency, or figure splitting. The DXF writer is the usual suspect: it appears to re-run work per feature rather than per sheet.
- Jest's default `testTimeout` is 5 s, but these are *individual tests* that pass, so this is genuine compute, not a hang. Nothing times out; the suite just runs.

Practical consequence: to check a change to the routes, run the affected suites explicitly rather than the whole suite.

```
cd app-backend
node --experimental-vm-modules node_modules/jest/bin/jest.js src/routes
```

`--testPathIgnorePatterns` takes **one** regex. Passing two separate arguments silently treats the second as a positional test-path filter, so `jest --testPathIgnorePatterns a b` runs the test named `b` instead of skipping it — that cost a 60-minute timeout here. Use alternation: `--testPathIgnorePatterns "a|b"`. Also note `npx jest` bypasses the project's ESM setup in `package.json` and fails all 104 suites with "Jest encountered an unexpected token"; always invoke `node --experimental-vm-modules` as `npm test` does.

Fixing the Maglas slowdown is a real performance bug in the DXF/PDF path and worth its own ticket — it is not a test-config problem.

### Dead routes — verified against the live database

These are **pre-existing functional breaks**, not security findings — they cannot execute at all. Both were auth-gated first (defence in depth, no current effect), then **unmounted** via `UNMOUNTED_ROUTES` in `src/server.js`, with the files kept on disk. They were left mounted only as a historical accident of the auto-loader; each call cost a Postgres round-trip to return a 500 whose body was the Postgres error text, and that text named columns and schemas to anyone who could reach the endpoint. Both now return a plain 404. The same set is mirrored in `enable-full-logging.js`, which duplicates the registration logic.

Both are still called by the frontend, so those callers now see 404 where they previously saw 500. That is behaviourally equivalent for both: `stores/parcels.ts` catches and leaves its list empty, and `services/areaParcels.ts` propagates either status as an error.

- **`src/routes/parcels.js`** — targets `land_parcels` but selects/inserts 19 columns that exist in **no** schema (`parcel_number`, `parcel_name`, `boundary_points`, `area_sqm`, `area_hectares`, `area_acres`, `geometry_geojson`, `compactness_index`, `shape_type`, `elongation_ratio`, `longest_side_m`, `shortest_side_m`, `average_side_m`, `is_valid_geometry`, `validation_errors`, `validation_warnings`, `self_intersections`, `has_spikes`, `bounding_box`). Every one of its 5 routes fails with `column "parcel_number" does not exist`. `public.land_parcels` exists but holds 0 rows. It is live-referenced: `stores/parcels.ts` is consumed by `CadastralStandardView.vue`.
- **`src/routes/area-parcels.js`** — all 7 routes query a table literally named `parcels`, which does not exist in `public` or in any surveyor schema. `services/areaParcels.ts` calls all 7 endpoints.

The live parcel model is the 27-column per-surveyor-schema `land_parcels` (`stand`, `designation`, `owner`, `geom`, `area_m2`, `area_ha`, `perimeter_m`, `closure_ratio`, …) with the real data — 15 parcels and 835 coordinate points, all in `surveyor_surveyor_cparadzayi`. That model is served by `landParcels.js` / `models/landParcel.js`, which already use `authenticateWithSchema`. Reconciling the frontend's `parcels` store against it is a product decision: it means choosing which of two parcel models is canonical.

## Key Domain Concepts

- **Survey Project:** Top-level entity grouping parcels, control points, and generated plans.
- **Land Parcel:** A cadastral lot with GeoJSON geometry, stored in the surveyor's schema.
- **Control Points:** Reference benchmarks — national registry in `public.zim_control_points`, project-specific in per-schema `project_control_points`.
- **Adopted Beacons:** Coordinates carried forward from a previous approved survey, cited by that survey's record number (e.g. 112/2021) — per-schema `project_adopted_beacons` (migration 095, route `adoptedBeacons.js`, import UI `AdoptedBeaconsImport.vue` in the Import CSV step). Never visited in the field, so they are deliberately NOT in `coordinate_points` (a CSV re-import deletes/inserts that table wholesale) and never enter the field book or Calculations Part 1. They print only in the Co-ordinate List's ADOPTED BEACONS section (after TRIG), keyed on `srNumber` — the Calcs cell cites the S.R. number, the F/B cell the source survey's date. That date is formatted by `formatAdoptedSurveyDate` ("February-21" → "February 2021") for the wide on-screen/export views, but the printed F. B column is narrow and hard against F/P, so the PDF stacks it via `formatAdoptedSurveyDateLines` as an abbreviated month over the year ("Feb" / "2021") at 8pt. They reach the document only through the 6th parameter of `generateCoordinateListPDF` (`adoptedBeacons`), so **every** generation entry point must fetch them (`listAdoptedBeacons`) and pass them on: `CadastralStandardView` (both the combined and the standalone coordinate-list calls), `SurveyPlanMapView`/`MapLibreAreaView` (`generateWithTwoPass`) and `CoordinateListView`. Omitting the parameter is silent — the section just does not print. When a name in the upload is already a live observation of the survey, `parseAdoptedBeaconsCSV` reports it in `conflicts` (not `errors`) and keeps the row; the import panel turns that into a confirmed "remove from this survey and adopt instead", calling the `reclassify` prop (`CadastralStandardView.handleAdoptedReclassify`), which deletes the `coordinate_points` rows and splices + **persists** the workflow state (`setImportedPoints` → `step_data['csv-import'].points`; `saveStepData('calculations-part1', …adjusted_coordinates)`), so the correction survives a reload. This exists because marks were sometimes captured as found beacons by mistake.
- **SI 727:** Zimbabwe cadastral standard governing survey plan layout — referenced throughout the codebase for block formatting and content requirements.
- **Traverse:** A series of connected survey legs used to establish coordinates; traverse closure and adjustment are computed server-side in `compute.js`.
