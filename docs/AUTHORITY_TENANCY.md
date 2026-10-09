# Authority tenancy: survey data belongs to the authority, surveyors administer it

Status: database layer built and verified (migrations 096-100); **jobs can be opened from VunGIS and head surveyors can appoint people through the API**; the application switch, the administration and review screens, and reading accepted work back into VunGIS are still to do (see *What is left*).

## Why

SurveyPro is offered to local authorities. A council employs some surveyors and contracts others (often for cadastral surveys), and **the survey datasets belong to the council while the surveyor administers them**. SurveyPro could not say that: its only unit of isolation was the surveyor (one schema each, `surveyor_<name>`), it had no notion of an authority, a council's work was scattered across its surveyors' private schemas, and nothing recorded under whose appointment a surveyor was working. A council could not be shown its own data.

It also had a structural weakness: isolation depended on the application setting `search_path` correctly for every connection (the pooled-connection leak recorded in `CLAUDE.md`, *Known gaps*). VunGIS had the same class of problem and closed it by moving the rule into the database as row-level security, a classified contract that is checked, and logins that can only read what they are shown. SurveyPro now does the same.

## The model

```
survey.authority          the councils that use the service. code is the key shared with VunGIS (local_authorities.code)
survey.authority_member   appointments: user, authority, role, engagement, from, to
                            role        surveyor | head_surveyor | reviewer
                            engagement  employed | contracted          (not needed for a reviewer)
                          one person may hold appointments with several authorities (a contracted surveyor usually does)
survey.survey_projects    a project belongs to an AUTHORITY (or to nobody: private practice) and is administered by a SURVEYOR
  survey.project_csv_imports, coordinate_points, land_parcels, project_adopted_beacons,
  project_control_points, coordinate_point_history           everything below a project follows it
survey.project_review     an authority's reviewer accepts / rejects / returns a delivered project (append-only)
survey_share.*            what an authority reads: projects, points, parcels, beacons, reviews (views only)
```

The same table and column names as the per-surveyor schemas, so the existing queries run unchanged against `search_path = survey, public`.

### Who can do what (enforced by the database)

| | sees | changes |
|---|---|---|
| surveyor | their own projects | their own projects, **while appointed** to the authority (or if the project is private practice) |
| head surveyor | every project of their authority | every project of their authority; appoints surveyors and reviewers |
| reviewer | every project of their authority | nothing; records a review decision on a project that is not their own |
| contracted surveyor | their own projects at each authority they are appointed to | likewise, authority by authority |
| surveyor whose appointment ended | their old work, read-only | nothing |
| an authority's reader login | its authority's projects, through `survey_share` only | nothing |
| platform operator | everything | everything |

A project can never be accepted by the person who did it, including a head surveyor reviewing their own work.

### Coordinates carry their axes

SurveyPro stores Cape / Lo coordinates south-orientated: the X ordinate is the **westing** and the Y ordinate the **southing** (EPSG:2228x-2229x, `+axis=wsu`). `survey_share.points` and `parcels` say so explicitly:

| column | meaning |
|---|---|
| `srid`, `lo_zone` | the system; `lo_zone` is 25, 27, 29, 31 or 33 for Cape / Lo, otherwise NULL |
| `axis_order` | `westing_southing` for Cape / Lo, `easting_northing` for anything else (UTM and other projections need no change here) |
| `y_westing`, `x_southing` | filled only for Cape / Lo |
| `easting`, `northing` | filled only for other systems |

Nothing downstream should ever have to guess which is which.

## The contract (same idea as VunGIS)

`tenancy.relation_class` classifies every relation SurveyPro owns (`tenant`, `tenant_view`, `share_view`, `personal`, `reference`, `system`, `pending`). `tenancy.violations` lists any that departs from the rules of its class and must be empty. Among the rules:

- tenant data has row-level security;
- the request role cannot reach `system` relations and cannot write `reference` data;
- an authority's reader group may reach share views and **nothing else**;
- the legacy per-surveyor schemas must not be reachable by the request role (`tenancy.surveyor_schema_access`).

`tenancy.debt` counts the `pending` relations, the known gaps, which may only fall (today: the spatial module `public.projects/layers/features`, `project_meridian_cache`, `workflow_states`).

**Who is asking is passed in, never looked up inside a privileged function.** Inside a `SECURITY DEFINER` function `current_user` is the owner, so a function that worked out the caller for itself would believe whatever `app.user_id` the caller had set. The policies evaluate `app.user_id()` as the caller (it answers a direct-client login from its role, so it cannot be forged) and hand the answer to the helper functions as an argument. This is covered by tests that try to impersonate.

## Running it

### One-time administrator setup

The application login (`surveypro_app`) is deliberately not allowed to create roles. An administrator creates the two group roles once:

```sql
CREATE ROLE surveypro_request NOLOGIN;      -- the role request-scoped work runs as
GRANT surveypro_request TO surveypro_app;
CREATE ROLE survey_reader NOLOGIN;          -- the group an authority's reader logins belong to
```

then `npm run migrate` (096-099). If the roles were missing when the migrations ran, create them and run the grant block at the end of 097 and 099 again.

### Moving existing work into the shared tables

```sql
SELECT * FROM survey.unadopted_schemas;                                   -- what is left
SELECT * FROM survey.adopt_surveyor_schema('surveyor_surveyor_cparadzayi', <users.id>, <authority id>, 'employed');
SELECT * FROM survey.adopt_surveyor_schema('surveyor_surveyor_demo', <users.id>, NULL);          -- NULL authority = private practice
```

Somebody has to say which authority the work belongs to and whether the surveyor was employed or contracted; nothing is guessed. It copies (the private schema is left alone), is repeatable (every row remembers `legacy_schema`/`legacy_id`, so a second run copies nothing), and is atomic. Tested on a copy of a real surveyor's schema: 6 projects, 7 imports, 2,940 points, 831 parcels, 17 beacons, identical on comparison, in under a second.

### Appointing people and giving an authority its login

```sql
INSERT INTO survey.authority (code, name, kind) VALUES ('VUNGU', 'Vungu Rural District Council', 'rural');
INSERT INTO survey.authority_member (user_id, authority_id, role, engagement) VALUES (<id>, <authority id>, 'surveyor', 'contracted');
```

```
node scripts/create-authority-reader.js --authority VUNGU --apply     # as an administrator; writes .reader-vungu.env, never prints the password
```

In QGIS, add a PostgreSQL connection with those details; the layers are `survey_share.points`, `parcels`, `beacons`, `projects`.

### Checking it

```
DATABASE_URL=... node scripts/verify-authority-tenancy.js      # 70 checks: visibility, writes, appointments, readers, impersonation, reviews
select * from tenancy.violations;                              -- must be empty
select * from tenancy.surveyor_schema_access;                  -- must be empty
```

`verify-authority-tenancy.js` changes nothing (one transaction, rolled back).

## Opening a job from VunGIS, and appointing people

`POST /api/auth/launch` (and the `/launch` page that calls it) takes the signed token VunGIS issues for a job (Ed25519, ten minutes, single use) and opens a project for it. It never creates people: the surveyor must already have a SurveyPro account (same email as in VunGIS) and be **appointed** to the council today. Each failure says what to do next (no account; not appointed, naming the council; link used or expired). The project is created where the application looks for projects today, in the surveyor's own schema, with the council, engagement and job id kept in its metadata; `survey.adopt_surveyor_schema()` promotes those to real columns when the schema is moved. Opening the same job again reopens the same project.

```
VUNGIS_LAUNCH_PUBLIC_KEY=<PEM, from VunGIS: node scripts/generate-launch-keys.js>      # without it /api/auth/launch answers 503
```

Appointments are made by the council's **head surveyor**, employed or contracted alike (`routes/authority.js`; the database enforces who may do what):

```
GET  /api/authorities/mine                      my appointments
GET  /api/authorities/:code/members             the panel (a head surveyor or reviewer sees everyone; others see themselves)
POST /api/authorities/:code/members             { email, role: surveyor|reviewer, engagement: employed|contracted, valid_from?, valid_to?, note? }
POST /api/authorities/:code/members/:id/end     end it today
```

Only the platform operator can make a head surveyor; nobody can appoint themselves; a head surveyor can act only on their own council. `valid_to` is the first day the appointment no longer applies, so ending one takes effect at once. The very first head surveyor of a council is created by the platform operator in SQL; everything after goes through the API. There is no screen for this yet.

Verified end to end against a real SurveyPro server on a scratch database, driven from VunGIS: the appointments flow, the launch, the reopen, and every refusal (forged, altered, expired, wrong key, replayed, no account, not appointed, appointment ended, unknown council).

## The SI 727 survey class

SI 727 (the Land Survey (General) Regulations, 1979, Second Schedule paras 7 and 8) prescribes limits of error per survey class. Para 1 of the Schedule defines three classes by the kind of survey: **A** town survey-marks, **B** townships, **C** every other survey (there is no D). A parcel survey is B or C, and this code (`app-shared/si727Tolerances.js`) holds the limits for those two. The class changes every verdict made against those limits, so the surveyor **declares** it on the project rather than leaving it to a default (migration 101): `PATCH /api/survey-projects/:id/survey-class` with `{ "survey_class": "B" | "C" | null }` (stored in the project's metadata until the application is switched to the shared tables, then promoted to `survey.survey_projects.survey_class` by a trigger when the schema is adopted). The council's `survey_share.projects` view carries it, and VunGIS writes it to the register as the parcel's survey class. A class is a property of the *survey*; whether it has been delivered, accepted or approved is shown elsewhere (`delivered_at`, `survey.project_review`). There is no screen to declare it yet.

## What is left

1. **Switch the application over.** Request-scoped connections (`SET ROLE surveypro_request` plus `app.user_id`, reset on release, as `tenantPool` does in VunGIS) replace `getSurveyorPool(schema)` and `request.db`; `search_path` becomes `survey, public` and the per-surveyor schemas are retired. Projects take an `authority_id` (choose among the surveyor's appointments) and `surveyor_user_id`. This also closes the pooled-connection `search_path` leak at its root. The existing SQL needs no change.
2. **Screens:** appointments (the API exists), delivering a project, the reviewer's accept / reject / return.
3. **The rest of the hand-off with VunGIS** (`app-backend/docs/SURVEYPRO-INTEGRATION.md` in the VunGIS repository): the launch is done; still to come are delivering a project, the importer on the VunGIS side that reads the council's views, and plan documents stored as files with a checksum (formats beyond PDF to be redesigned).
4. **The spatial module** (`public.projects/layers/features`) still belongs to a user, not an authority.
5. **The migration chain does not build a fresh database** (migration 077 names `surveyor_surveyor_kuda`, a schema that only exists on one machine). VunGIS proves its chain from scratch on every change; SurveyPro should too, with a baseline snapshot. The scratch database used to verify this work was built from a schema-only dump instead.
6. **Retire the non-owner gap:** the application still connects as the owner of the tables, which bypasses row-level security. VunGIS closed that with a separate runtime login; do the same once the switch is made.
7. **The area and overlap triggers** (`auto_calculate_parcel_metrics`, `check_parcel_overlap`) exist only on the old `public.land_parcels`; the per-surveyor schemas never had them. The shared table has parity with the per-surveyor tables (none). Decide whether to reinstate them.
