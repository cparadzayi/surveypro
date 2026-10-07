-- Role-based authorisation for surveyor management.
--
-- The app ships an admin surface with no concept of who may use it:
-- `surveyor_profiles` had no role column, the JWT carried only
-- { sub, email }, and GET/PUT/DELETE /surveyors let ANY authenticated caller
-- read, rewrite and DELETE any other surveyor's record -- including their
-- address, phone and email, which live in `public` and are populated.
--
-- Two new columns would be redundant; one is enough. `role` is checked by
-- requireAdmin() in src/utils/schemaAuth.js and by surveyors.js.
--
-- Promotion is explicit, never automatic:
--   UPDATE surveyor_profiles SET role = 'admin'
--    WHERE user_id = (SELECT id FROM users WHERE email = 'you@example.com');

ALTER TABLE surveyor_profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'surveyor';

-- A CHECK rather than an enum: adding a role later is then a one-line change
-- instead of a new type plus ALTER TYPE. It also rejects the blank-string and
-- typo'd-role bugs an unconstrained TEXT column would let through.
ALTER TABLE surveyor_profiles
  DROP CONSTRAINT IF EXISTS surveyor_profiles_role_check;
ALTER TABLE surveyor_profiles
  ADD CONSTRAINT surveyor_profiles_role_check
  CHECK (role IN ('surveyor', 'admin'));

-- Rows that predate this column are real working accounts, so they land on the
-- lower role rather than having admin granted retroactively to every existing
-- surveyor in the deployment. Until you run the promotion above,
-- SurveyorsView (the management UI) will show only the signed-in user.