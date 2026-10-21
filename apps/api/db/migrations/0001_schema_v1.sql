-- =====================================================================
-- SkillBridge KH - PostgreSQL schema v1 (Supabase / Neon compatible)
-- Run in a fresh database. Wrapped in a transaction so it is all-or-nothing.
-- =====================================================================
BEGIN;

-- ---------- Extensions ----------
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector: embeddings + similarity search
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive text (emails, usernames)
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ---------- Enums ----------
CREATE TYPE user_role          AS ENUM ('student', 'mentor', 'admin');
CREATE TYPE request_status     AS ENUM ('pending', 'accepted', 'declined', 'cancelled', 'completed');
CREATE TYPE session_status     AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');
CREATE TYPE roadmap_status     AS ENUM ('active', 'completed', 'archived');
CREATE TYPE step_status        AS ENUM ('todo', 'in_progress', 'done', 'skipped');
CREATE TYPE post_status        AS ENUM ('published', 'pending_review', 'hidden', 'removed');
CREATE TYPE risk_level         AS ENUM ('none', 'low', 'medium', 'high');
CREATE TYPE report_status      AS ENUM ('open', 'reviewed', 'dismissed', 'actioned');
CREATE TYPE notification_channel AS ENUM ('in_app', 'telegram', 'email');

-- ---------- Shared trigger: keep updated_at fresh ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 1. IDENTITY & AUTH
-- =====================================================================
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             CITEXT NOT NULL UNIQUE,
  password_hash     TEXT   NOT NULL,                 -- argon2id / bcrypt hash, NEVER plaintext
  role              user_role NOT NULL DEFAULT 'student',
  email_verified_at TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Refresh tokens are stored HASHED so a DB leak cannot be replayed.
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  user_agent  TEXT,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE profiles (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name        TEXT NOT NULL,
  avatar_url       TEXT,
  province         TEXT,                              -- e.g. Phnom Penh, Siem Reap
  birth_year       SMALLINT CHECK (birth_year BETWEEN 1950 AND 2030),
  education_level  TEXT,                              -- high_school, undergrad, graduate...
  bio              TEXT,
  interests        TEXT[] NOT NULL DEFAULT '{}',
  preferred_lang   TEXT NOT NULL DEFAULT 'en' CHECK (preferred_lang IN ('en', 'km')),
  telegram_chat_id BIGINT UNIQUE,                     -- set after linking the Telegram bot
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One-time codes used to link a Telegram account to a user
CREATE TABLE telegram_link_codes (
  code        TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

-- =====================================================================
-- 2. SKILLS & CAREERS (the knowledge base the AI reasons over)
-- =====================================================================
CREATE TABLE skills (
  id        SERIAL PRIMARY KEY,
  name      CITEXT NOT NULL UNIQUE,
  category  TEXT                                      -- technical, soft, language...
);

CREATE TABLE user_skills (
  user_id      UUID    NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  skill_id     INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  proficiency  SMALLINT NOT NULL DEFAULT 1 CHECK (proficiency BETWEEN 1 AND 5),
  PRIMARY KEY (user_id, skill_id)
);

CREATE TABLE careers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  salary_min_usd   INTEGER,
  salary_max_usd   INTEGER,
  demand_level     SMALLINT CHECK (demand_level BETWEEN 1 AND 5),  -- local market demand
  embedding        VECTOR(1536),                      -- text-embedding-3-small dimension
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- HNSW = fast approximate nearest-neighbour search. Cosine fits normalized text embeddings.
CREATE INDEX idx_careers_embedding ON careers USING hnsw (embedding vector_cosine_ops);

CREATE TABLE career_skills (
  career_id   UUID    NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  skill_id    INTEGER NOT NULL REFERENCES skills(id)  ON DELETE CASCADE,
  importance  SMALLINT NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  PRIMARY KEY (career_id, skill_id)
);
CREATE INDEX idx_career_skills_skill ON career_skills(skill_id);

-- Interest / personality quiz submissions
CREATE TABLE assessments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers     JSONB NOT NULL,
  summary     TEXT,                                   -- AI-written summary of the results
  embedding   VECTOR(1536),                           -- used to match careers + mentors
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assessments_user ON assessments(user_id, created_at DESC);

-- =====================================================================
-- 3. AI ROADMAPS
-- =====================================================================
CREATE TABLE roadmaps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  career_id     UUID REFERENCES careers(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  goal          TEXT NOT NULL,                        -- the user's own words
  status        roadmap_status NOT NULL DEFAULT 'active',
  ai_model      TEXT NOT NULL,                        -- audit: which model produced it
  raw_response  JSONB,                                -- keep the model output for debugging
  embedding     VECTOR(1536),                         -- find similar roadmaps / reuse
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_roadmaps_user ON roadmaps(user_id, created_at DESC);
CREATE INDEX idx_roadmaps_embedding ON roadmaps USING hnsw (embedding vector_cosine_ops);
CREATE TRIGGER trg_roadmaps_updated BEFORE UPDATE ON roadmaps
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE roadmap_steps (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id     UUID NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  resource_url   TEXT,
  est_weeks      SMALLINT,
  status         step_status NOT NULL DEFAULT 'todo',
  completed_at   TIMESTAMPTZ,
  UNIQUE (roadmap_id, position)
);

-- =====================================================================
-- 4. MENTORSHIP
-- =====================================================================
CREATE TABLE mentor_profiles (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline          TEXT NOT NULL,
  company           TEXT,
  years_experience  SMALLINT CHECK (years_experience >= 0),
  expertise         TEXT[] NOT NULL DEFAULT '{}',
  availability      JSONB NOT NULL DEFAULT '{}',      -- weekly slots, timezone
  is_verified       BOOLEAN NOT NULL DEFAULT FALSE,   -- admin approves mentors
  is_accepting      BOOLEAN NOT NULL DEFAULT TRUE,
  embedding         VECTOR(1536),                     -- semantic mentor matching
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mentor_expertise  ON mentor_profiles USING gin (expertise);
CREATE INDEX idx_mentor_embedding  ON mentor_profiles USING hnsw (embedding vector_cosine_ops);

CREATE TABLE mentorship_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentee_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentor_id     UUID NOT NULL REFERENCES mentor_profiles(user_id) ON DELETE CASCADE,
  message       TEXT NOT NULL,
  status        request_status NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  CHECK (mentee_id <> mentor_id)
);
CREATE INDEX idx_requests_mentor ON mentorship_requests(mentor_id, status);
CREATE INDEX idx_requests_mentee ON mentorship_requests(mentee_id, status);
-- A mentee may only have ONE open request per mentor
CREATE UNIQUE INDEX uq_open_request ON mentorship_requests(mentee_id, mentor_id)
  WHERE status IN ('pending', 'accepted');

CREATE TABLE mentorship_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID NOT NULL REFERENCES mentorship_requests(id) ON DELETE CASCADE,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  duration_min  SMALLINT NOT NULL DEFAULT 30,
  meeting_url   TEXT,
  status        session_status NOT NULL DEFAULT 'scheduled',
  notes         TEXT
);
CREATE INDEX idx_sessions_request ON mentorship_sessions(request_id, scheduled_at);

-- Real-time chat (Socket.io) is persisted here; chat room = accepted request
CREATE TABLE chat_messages (
  id          BIGSERIAL PRIMARY KEY,
  request_id  UUID NOT NULL REFERENCES mentorship_requests(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (length(body) <= 4000),
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_room ON chat_messages(request_id, created_at DESC);

CREATE TABLE mentor_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL UNIQUE REFERENCES mentorship_requests(id) ON DELETE CASCADE,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 5. ANONYMOUS FORUM + AI ANALYSIS
-- Anonymity model: author_id is stored (needed for moderation and crisis
-- follow-up) but the API NEVER returns it when is_anonymous = TRUE.
-- Public identity is a per-post random alias instead.
-- =====================================================================
CREATE TABLE forum_categories (
  id    SERIAL PRIMARY KEY,
  slug  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL
);

CREATE TABLE forum_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id      INTEGER NOT NULL REFERENCES forum_categories(id),
  title            TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 200),
  body             TEXT NOT NULL CHECK (length(body) <= 10000),
  is_anonymous     BOOLEAN NOT NULL DEFAULT TRUE,
  anonymous_alias  TEXT,                              -- e.g. "BraveLotus42"
  status           post_status NOT NULL DEFAULT 'published',
  embedding        VECTOR(1536),                      -- "similar posts" + topic clustering
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_posts_feed      ON forum_posts(category_id, created_at DESC) WHERE status = 'published';
CREATE INDEX idx_posts_author    ON forum_posts(author_id);
CREATE INDEX idx_posts_embedding ON forum_posts USING hnsw (embedding vector_cosine_ops);
CREATE TRIGGER trg_posts_updated BEFORE UPDATE ON forum_posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE forum_comments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id          UUID NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  author_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id        UUID REFERENCES forum_comments(id) ON DELETE CASCADE,
  body             TEXT NOT NULL CHECK (length(body) <= 4000),
  is_anonymous     BOOLEAN NOT NULL DEFAULT TRUE,
  anonymous_alias  TEXT,
  status           post_status NOT NULL DEFAULT 'published',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_post ON forum_comments(post_id, created_at);

CREATE TABLE forum_reactions (
  post_id   UUID NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL DEFAULT 'support' CHECK (kind IN ('support', 'helpful', 'relate')),
  PRIMARY KEY (post_id, user_id, kind)
);

-- Output of the AI moderation / sentiment pipeline (async job after a post is created)
CREATE TABLE forum_post_analysis (
  post_id      UUID PRIMARY KEY REFERENCES forum_posts(id) ON DELETE CASCADE,
  sentiment    REAL CHECK (sentiment BETWEEN -1 AND 1),
  topics       TEXT[] NOT NULL DEFAULT '{}',
  risk         risk_level NOT NULL DEFAULT 'none',    -- 'high' triggers a wellness resource banner
  model        TEXT NOT NULL,
  analyzed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_analysis_risk ON forum_post_analysis(risk) WHERE risk IN ('medium', 'high');

CREATE TABLE content_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id       UUID REFERENCES forum_posts(id)    ON DELETE CASCADE,
  comment_id    UUID REFERENCES forum_comments(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL,
  status        report_status NOT NULL DEFAULT 'open',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((post_id IS NOT NULL) <> (comment_id IS NOT NULL))  -- exactly one target
);
CREATE INDEX idx_reports_open ON content_reports(created_at) WHERE status = 'open';

-- =====================================================================
-- 6. WELLNESS, NOTIFICATIONS, AI COST CONTROL
-- =====================================================================
CREATE TABLE wellness_checkins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mood        SMALLINT NOT NULL CHECK (mood BETWEEN 1 AND 5),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_checkins_user ON wellness_checkins(user_id, created_at DESC);

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel     notification_channel NOT NULL DEFAULT 'in_app',
  type        TEXT NOT NULL,                          -- mentor_request, session_reminder...
  payload     JSONB NOT NULL DEFAULT '{}',
  read_at     TIMESTAMPTZ,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_unread ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;

-- Every OpenAI call is logged so we can rate-limit users and track spend
CREATE TABLE ai_usage_logs (
  id                BIGSERIAL PRIMARY KEY,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  feature           TEXT NOT NULL,                    -- roadmap, embedding, moderation, chat
  model             TEXT NOT NULL,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_usage_user_day ON ai_usage_logs(user_id, created_at DESC);

COMMIT;
