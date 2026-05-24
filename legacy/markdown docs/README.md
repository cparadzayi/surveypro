# SurveyPro (Reboot Baseline)

This repository is undergoing a reboot. The original, complex prototype (multi-plugin, auth-removed, large field book + computations stack) has been **archived**. A **fresh minimal foundation** with clean authentication and a lightweight Vue 3 frontend now lives in `app-backend/` and `app-frontend/`.

## Why the Reboot?
The legacy code grew dense: overlapping plugins, progressive refactors, removed auth, and experimental computation layers. Rather than iteratively pruning further, a clean restart provides:

- Lower cognitive load
- Explicit, minimal auth pattern (register / login / me)
- Faster iteration toward a focused MVP
- Room to reintroduce only what’s truly needed (field book, computations) in properly staged steps

## Current Scope (Phase 1)
| Area | Status |
|------|--------|
| Auth (JWT, bcrypt) | ✅ Implemented (users table + /auth endpoints) |
| Health endpoint | ✅ `/api/health` |
| Basic frontend auth flows | ✅ Login / Register / Dashboard |
| Domain survey features | ⏳ Not yet reintroduced |
| Legacy advanced plugins | 📦 Archived in `legacy/` |
| PostGIS usage | ⏳ Not yet (plain PostgreSQL for now) |

## Directory Layout (Reboot)
```
SurveyPro/
├── app-backend/          # New minimal Platformatic backend (auth + health)
│   ├── migrations/       # 001.do.sql (users)
│   ├── plugins/          # auth.js, health.js
│   ├── platformatic.db.json
│   ├── package.json
│   └── .env.example
├── app-frontend/         # New minimal Vue 3 + Vite + Tailwind frontend
│   ├── src/ (auth views, store, router)
│   ├── package.json
│   └── README.md
├── legacy/               # Archived previous implementation (DO NOT EXTEND)
│   └── ARCHIVE_README.md
└── README.md             # This file
```

## Technology (Reboot Core)
Backend:
- Platformatic DB (auto entities, migrations autoApply)
- Fastify plugins: auth (JWT), health
- PostgreSQL (add PostGIS later when computations/geometry return)

Frontend:
- Vue 3 + Vite + TypeScript
- Pinia for state
- TailwindCSS utility styling
- Axios with token interceptor

## Getting Started (Fresh Stack)
### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### 1. Backend Setup
```bash
cd app-backend
cp .env.example .env   # edit DB_* variables & JWT_SECRET
npm install
npm run migrate
npm run dev
```
Server default: http://localhost:3042

`/.env.example` composes `DATABASE_URL` from `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`.

### 2. Frontend Setup
```bash
cd app-frontend
npm install
npm run dev
```
Frontend default: http://localhost:5173

If backend runs on another host/port set `VITE_API_BASE` in a `.env` (e.g. `VITE_API_BASE=http://localhost:3042/api`).

### 3. Test the Auth Flow (Manual)
Register:
```bash
curl -s -X POST http://localhost:3042/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"test@example.com","password":"pass123"}'
```
Login:
```bash
curl -s -X POST http://localhost:3042/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"test@example.com","password":"pass123"}'
```
Me:
```bash
curl -s -H 'authorization: Bearer <TOKEN>' http://localhost:3042/api/auth/me
```
Health:
```bash
curl -s http://localhost:3042/api/health
```

## API (Current Minimal Endpoints)
| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/auth/register | Create user & hash password |
| POST | /api/auth/login | Authenticate & return JWT |
| GET | /api/auth/me | Return current user profile |
| GET | /api/health | Health + entity listing |

## Roadmap (Incremental Reintroduction)
1. Add base survey entities (projects, points, field_book_entries)
2. Introduce coordinate transformations (deterministic helpers first)
3. Add computation sheets + area calculations
4. Integrate PostGIS & spatial indexes
5. File/CSV ingestion pipeline (hardened + validation)
6. PDF/GeoJSON export modules
7. Role-based access (optional) & audit logging

## Legacy Archive
All prior code (enhanced field book, computation plugins, coordinate conversion logic, auth-free iteration) now resides in `legacy/`. Treat it as reference only. Avoid editing to prevent polluting the clean baseline.

## Contributing (During Reboot)
Keep changes small & incremental:
1. Add migration
2. Add entity logic / plugin
3. Add minimal frontend UI
4. Write a short usage note

## Security Notes
- JWT secret must be strong & kept out of VCS (.env only)
- Add rate limiting before public exposure
- Password policy & email verification are future tasks

## License
MIT

---
Reboot baseline established. Next step: add first domain entity & guarded CRUD endpoints.
