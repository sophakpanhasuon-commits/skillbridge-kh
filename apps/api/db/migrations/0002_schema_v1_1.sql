-- =====================================================================
-- Migration 0002 - schema v1.1 (SkillBridge KH)
-- Closes the Must-level gaps found in the requirements review.
-- Safe to run once on top of schema v1. Wrapped in a transaction.
-- =====================================================================
BEGIN;

-- FR-ADM-02 / NFR-SEC-12: every admin action (and every access to an
-- anonymous author's identity) must leave an audit trail.
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,              -- e.g. 'post.hide', 'mentor.verify', 'author.reveal'
  target_type TEXT NOT NULL,              -- 'post', 'comment', 'user', 'mentor'...
  target_id   TEXT NOT NULL,
  details     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_logs(actor_id, created_at DESC);

-- FR-CAR-05: admins can unpublish a career without deleting it.
ALTER TABLE careers
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE;

-- FR-RDM-01 (time available per week) and AIX-03 (versioned prompts).
ALTER TABLE roadmaps
  ADD COLUMN IF NOT EXISTS hours_per_week SMALLINT CHECK (hours_per_week BETWEEN 1 AND 80),
  ADD COLUMN IF NOT EXISTS prompt_version TEXT;

-- FR-FOR-07: medium/high-risk posts go to a moderator queue, so we must
-- know whether a human has reviewed the AI's flag yet.
ALTER TABLE forum_post_analysis
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS idx_analysis_risk;
CREATE INDEX idx_analysis_risk ON forum_post_analysis(risk, analyzed_at)
  WHERE risk IN ('medium', 'high') AND reviewed_at IS NULL;

-- SECURITY: Supabase exposes every table in the public schema through its
-- auto-generated REST API, reachable with the public "anon" key. Enabling
-- Row Level Security with NO policies blocks that route completely. Our
-- Express backend connects directly as the table owner (postgres), which
-- bypasses RLS, so the app itself keeps working.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

COMMIT;
