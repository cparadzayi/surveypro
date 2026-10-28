-- Migration 107: password reset tokens
--
-- The app has no way to send e-mail, so a reset is issued by an administrator: they create a
-- single-use link for a surveyor and hand it over. Only a SHA-256 hash of the token is stored, so a
-- database read (or a backup) does not yield working links. A token is valid for a short time, can be
-- used once, and creating a new one for the same user retires the old ones.
--
-- Idempotent and non-destructive: creates one table.

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash  CHAR(64) NOT NULL UNIQUE,
  created_by  INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON public.password_reset_tokens(user_id) WHERE used_at IS NULL;

COMMENT ON TABLE public.password_reset_tokens IS
  'Single-use, short-lived password reset links issued by an administrator. token_hash is SHA-256 of the token; the token itself is never stored.';
