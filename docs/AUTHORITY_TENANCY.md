# Authority tenancy: survey data belongs to the authority, surveyors administer it

Status: database layer built and verified (migrations 096-100); **jobs can be opened from VunGIS and head surveyors can appoint people through the API**; the application switch, delivery, review and reading accepted work back into VunGIS work through the API; the application runs on the shared tables behind `SURVEY_STORE=shared`; the screens are still to do (see *What is left*).

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

## Delivering a project, and the council's review

```
POST /api/survey-projects/:id/deliver     { authority_code? }     the surveyor hands the project to the council
GET  /api/survey-projects/:id/delivery                            not_delivered | awaiting_review | accepted | rejected | returned, and the reviewer's note
GET  /api/reviews/queue?authority=CODE                            delivered projects awaiting a decision (reviewer, head surveyor)
GET  /api/reviews/projects/:id                                    one delivered project: facts, parcels, point and beacon counts, past decisions, can_decide
POST /api/reviews/projects/:id/decision   { decision: accepted|rejected|returned, note }
```

On the survey-projects routes `:id` is the surveyor's own project; on /reviews it is the shared project id (what the council sees, and what the VunGIS importer reads).

**Delivery is a snapshot** (migration 102, `survey.deliver_project`). Until the application runs on the shared tables a project lives in its surveyor's private schema, so delivery copies that one project (points, parcels, beacons, control points, imports, history) into `survey.*` as the surveyor's project for that council and stamps `delivered_at`. Nothing else of the surveyor's work is shared. Delivering again after a return or rejection **replaces** the snapshot with the corrected work; the shared project row stays, so its review history is never lost. Once the application is switched, delivery reduces to stamping `delivered_at`.

It refuses, with a message: no council named; unknown council; the surveyor is not appointed to it today (as surveyor or head surveyor; the engagement, employed or contracted, is taken from the appointment); no declared survey class; no finalized parcel; already awaiting review; already accepted (final: a changed survey is a new project); delivered to another council before. Who is delivering comes from the token, never the request.

**Review** runs as the signed-in person, so the database decides who may review: an appointed reviewer or head surveyor of the project's council, never their own work. A decision needs a note when it rejects or returns. A trigger (`survey.project_review_guard`) makes a delivery decided once and refuses decisions on work nobody delivered, so no other client can get round the route. An *accepted* project is what the VunGIS importer reads: its parcels enter the register, carrying the declared class.

Verified end to end on a scratch database through a real SurveyPro server: every refusal above, the return with its note, re-delivery replacing the snapshot while keeping the earlier decision, acceptance, the database refusing a second decision, and the council's reader login feeding the VunGIS importer (two parcels, class B). Not exercised: delivery of a project with CSV imports and point history (same copy pattern as `adopt_surveyor_schema`, tested there). There are no screens yet.

## Running on the shared tables (SURVEY_STORE=shared)

Migration 103 and `config/sharedDb.js` are the application switch. With `SURVEY_STORE=shared` every request that touches survey data runs on `survey.*` **as the signed-in person**: each statement is inside a transaction that does `SET LOCAL ROLE surveypro_request` and sets `app.user_id`, so row-level security decides what they see and change. Nothing outlives the transaction, so the pooled-connection leak recorded in `CLAUDE.md` cannot happen on this path (`connect()` included: its `BEGIN` is what steps down, and `release()` rolls back anything left open). The default is still `SURVEY_STORE=schema`, the per-surveyor schemas, so nothing changes until it is set.

What changes for people:

- **One dataset.** A council's project is the working dataset itself: its head surveyor and reviewers read it while it is being done, the surveyor administers it, and delivery is a check and a timestamp (`survey.deliver_shared_project`), not a copy.
- **Private practice is unchanged in effect.** A project with no authority is visible to its surveyor alone; the council's head surveyor, reviewers and reader login never see it.
- **A project may be for a council from the start.** `POST /api/survey-projects` takes an optional `authorityCode`; the database refuses it unless the surveyor is appointed today, and fills the engagement (employed or contracted) from the appointment. `surveyor_user_id` defaults to the person asking, so nobody can create a project in another's name. A job launched from VunGIS is made the same way.
- **Frozen while it is with the council.** From delivery until a decision, and for good once accepted, nobody but the platform operator can change the project or anything under it (points, parcels, class). A return or rejection unfreezes it; delivering again freezes it again. What the council reviews is what they are looking at.
- **Refusals are 403s.** A refusal by the database comes back as 403 `not_allowed`, not a 500.
- **Per-project QGIS views are off** (`/spatial/create-project-views` and friends answer 410): they were built from each surveyor's own `survey_projects`. The council reads its work through its reader login on `survey_share`.

### Cut-over

```
node scripts/cutover-to-shared.js                                  # dry run: each schema, whose it is, what would move
node scripts/cutover-to-shared.js --apply                          # moves them as private practice
node scripts/cutover-to-shared.js --apply --map surveyor_kuda=VUNGU:employed --map surveyor_x=GWERU:contracted
# then set SURVEY_STORE=shared and restart
```

Nobody's work is guessed onto a council: a schema moves as private practice unless `--map` names the authority and engagement; a project opened from a council's job keeps its own. The private schemas are copied, never changed or dropped, so setting `SURVEY_STORE=schema` again is the way back (work done on the shared store since is not copied back). **Project ids change** (`legacy_schema` / `legacy_id` say which is which): anything holding an old id must reopen the project.

Verified on a scratch database through a real SurveyPro server: private and council projects, who sees what (surveyor, another surveyor, head surveyor, reviewer), writes refused for a stranger and a reviewer, delivery in place, the freeze and the unfreeze on a return, acceptance, the council's reader login and the VunGIS importer reading the working dataset, and the cut-over itself (dry run, an unknown authority and a malformed `--map` refused, counts verified, a second run copying nothing, then the moved work served through the shared store). `verify-authority-tenancy.js` passes (its review checks now deliver the projects first, as 102 requires).

Not done: the screens; the application's own login is still the owner of the tables (server-side functions need it), so retiring that, as VunGIS did with a separate runtime login, remains; the spatial module is still per user; registration still creates a per-surveyor schema (needed for the way back, to go when the schemas are retired).

## The SI 727 survey class

SI 727 (the Land Survey (General) Regulations, 1979, Second Schedule paras 7 and 8) prescribes limits of error per survey class. Para 1 of the Schedule defines three classes by the kind of survey: **A** town survey-marks, **B** townships, **C** every other survey (there is no D). A parcel survey is B or C, and this code (`app-shared/si727Tolerances.js`) holds the limits for those two. The class changes every verdict made against those limits, so the surveyor **declares** it on the project rather than leaving it to a default (migration 101): `PATCH /api/survey-projects/:id/survey-class` with `{ "survey_class": "B" | "C" | null }` (stored in the project's metadata until the application is switched to the shared tables, then promoted to `survey.survey_projects.survey_class` by a trigger when the schema is adopted). The council's `survey_share.projects` view carries it, and VunGIS writes it to the register as the parcel's survey class. A class is a property of the *survey*; whether it has been delivered, accepted or approved is shown elsewhere (`delivered_at`, `survey.project_review`). There is no screen to declare it yet.

## What is left

1. **Make the switch the default and retire the private schemas.** The code is written and verified (see above); what remains is running the cut-over on the live database, setting `SURVEY_STORE=shared`, and later dropping the per-surveyor schemas, the `survey.*` snapshot function and registration's schema creation.
2. **Screens:** appointments, delivering a project (with the survey class), and the reviewer's queue and accept / reject / return. The APIs exist.
3. **The rest of the hand-off with VunGIS** (`app-backend/docs/SURVEYPRO-INTEGRATION.md` in the VunGIS repository): the launch, delivery, review and the VunGIS importer are done; still to come are plan documents stored as files with a checksum (formats beyond PDF to be redesigned).
4. **The spatial module** (`public.projects/layers/features`) still belongs to a user, not an authority.
5. **The migration chain does not build a fresh database** (migration 077 names `surveyor_surveyor_kuda`, a schema that only exists on one machine). VunGIS proves its chain from scratch on every change; SurveyPro should too, with a baseline snapshot. The scratch database used to verify this work was built from a schema-only dump instead.
6. **Retire the non-owner gap:** the application still connects as the owner of the tables, which bypasses row-level security. VunGIS closed that with a separate runtime login; do the same once the switch is made.
7. **The area and overlap triggers** (`auto_calculate_parcel_metrics`, `check_parcel_overlap`) exist only on the old `public.land_parcels`; the per-surveyor schemas never had them. The shared table has parity with the per-surveyor tables (none). Decide whether to reinstate them.
