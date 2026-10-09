-- 100: a launch token can be used once.
--
-- VunGIS opens a job in SurveyPro with a short-lived signed token (docs/AUTHORITY_TENANCY.md, "The hand-off with VunGIS"). It is valid
-- for ten minutes, but within those ten minutes it must still work only once, or a copy of the link (browser history, a log, a
-- screenshot) would sign somebody in. POST /auth/launch records the token's id here before it does anything else; a second use finds
-- the row and is refused.
--
-- Nothing in request-scoped work needs to read this: it is bookkeeping for the launch route, which runs as the owner.

CREATE TABLE IF NOT EXISTS survey.launch_token_use (
  jti              uuid PRIMARY KEY,
  used_at          timestamptz NOT NULL DEFAULT now(),
  issuer           varchar(40) NOT NULL,
  subject          varchar(255),
  authority_code   varchar(30),
  external_job_id  uuid
);
CREATE INDEX IF NOT EXISTS idx_launch_token_use_used_at ON survey.launch_token_use (used_at);
COMMENT ON TABLE survey.launch_token_use IS 'Launch tokens already used (single use). Rows older than a day can be deleted: a token expires in ten minutes.';

SELECT tenancy.classify('survey.launch_token_use', 'system', 'single-use record for launch tokens (migration 100)');
