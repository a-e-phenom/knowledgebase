/*
  Normalized QA storage (one row per session/finding/comment/screenshot).
  Keeps shared behavior by defaulting workspace_id to Automation Engine.
*/

CREATE TABLE IF NOT EXISTS qa_sessions (
  workspace_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  id text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS qa_findings (
  workspace_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  id text NOT NULL,
  session_id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'not_started',
  environment text NOT NULL DEFAULT 'STG',
  categories text[] NOT NULL DEFAULT '{"bugs"}',
  figma_link text NOT NULL DEFAULT '',
  ticket_link text NOT NULL DEFAULT '',
  assignee text NOT NULL DEFAULT '',
  reporter text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id),
  CONSTRAINT qa_findings_session_fk
    FOREIGN KEY (workspace_id, session_id)
    REFERENCES qa_sessions (workspace_id, id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS qa_comments (
  workspace_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  id text NOT NULL,
  finding_id text NOT NULL,
  author text NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id),
  CONSTRAINT qa_comments_finding_fk
    FOREIGN KEY (workspace_id, finding_id)
    REFERENCES qa_findings (workspace_id, id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS qa_screenshots (
  workspace_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  id text NOT NULL,
  finding_id text NOT NULL,
  name text NOT NULL DEFAULT 'screenshot',
  data_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id),
  CONSTRAINT qa_screenshots_finding_fk
    FOREIGN KEY (workspace_id, finding_id)
    REFERENCES qa_findings (workspace_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_qa_findings_workspace_session ON qa_findings (workspace_id, session_id);
CREATE INDEX IF NOT EXISTS idx_qa_comments_workspace_finding ON qa_comments (workspace_id, finding_id);
CREATE INDEX IF NOT EXISTS idx_qa_screenshots_workspace_finding ON qa_screenshots (workspace_id, finding_id);

ALTER TABLE qa_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_screenshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shared workspace select qa_sessions" ON qa_sessions;
DROP POLICY IF EXISTS "Shared workspace insert qa_sessions" ON qa_sessions;
DROP POLICY IF EXISTS "Shared workspace update qa_sessions" ON qa_sessions;
DROP POLICY IF EXISTS "Shared workspace delete qa_sessions" ON qa_sessions;

DROP POLICY IF EXISTS "Shared workspace select qa_findings" ON qa_findings;
DROP POLICY IF EXISTS "Shared workspace insert qa_findings" ON qa_findings;
DROP POLICY IF EXISTS "Shared workspace update qa_findings" ON qa_findings;
DROP POLICY IF EXISTS "Shared workspace delete qa_findings" ON qa_findings;

DROP POLICY IF EXISTS "Shared workspace select qa_comments" ON qa_comments;
DROP POLICY IF EXISTS "Shared workspace insert qa_comments" ON qa_comments;
DROP POLICY IF EXISTS "Shared workspace update qa_comments" ON qa_comments;
DROP POLICY IF EXISTS "Shared workspace delete qa_comments" ON qa_comments;

DROP POLICY IF EXISTS "Shared workspace select qa_screenshots" ON qa_screenshots;
DROP POLICY IF EXISTS "Shared workspace insert qa_screenshots" ON qa_screenshots;
DROP POLICY IF EXISTS "Shared workspace update qa_screenshots" ON qa_screenshots;
DROP POLICY IF EXISTS "Shared workspace delete qa_screenshots" ON qa_screenshots;

CREATE POLICY "Shared workspace select qa_sessions"
  ON qa_sessions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared workspace insert qa_sessions"
  ON qa_sessions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Shared workspace update qa_sessions"
  ON qa_sessions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Shared workspace delete qa_sessions"
  ON qa_sessions FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "Shared workspace select qa_findings"
  ON qa_findings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared workspace insert qa_findings"
  ON qa_findings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Shared workspace update qa_findings"
  ON qa_findings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Shared workspace delete qa_findings"
  ON qa_findings FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "Shared workspace select qa_comments"
  ON qa_comments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared workspace insert qa_comments"
  ON qa_comments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Shared workspace update qa_comments"
  ON qa_comments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Shared workspace delete qa_comments"
  ON qa_comments FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "Shared workspace select qa_screenshots"
  ON qa_screenshots FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared workspace insert qa_screenshots"
  ON qa_screenshots FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Shared workspace update qa_screenshots"
  ON qa_screenshots FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Shared workspace delete qa_screenshots"
  ON qa_screenshots FOR DELETE TO anon, authenticated USING (true);

/*
  Backfill once from the richest existing QA blob row in workspace_app_data.
*/
WITH source AS (
  SELECT
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000001'::uuid) AS workspace_id,
    data,
    COALESCE(jsonb_array_length(data->'sessions'), 0) AS sessions_count,
    COALESCE((
      SELECT SUM(jsonb_array_length(COALESCE(s->'findings', '[]'::jsonb)))
      FROM jsonb_array_elements(COALESCE(data->'sessions', '[]'::jsonb)) s
    ), 0) AS findings_count,
    updated_at
  FROM workspace_app_data
  WHERE id = 'qa'
),
best AS (
  SELECT workspace_id, data
  FROM source
  ORDER BY findings_count DESC, sessions_count DESC, updated_at DESC
  LIMIT 1
),
sessions AS (
  SELECT
    b.workspace_id,
    s.value AS session
  FROM best b,
  LATERAL jsonb_array_elements(COALESCE(b.data->'sessions', '[]'::jsonb)) s
),
findings AS (
  SELECT
    s.workspace_id,
    s.session->>'id' AS session_id,
    f.value AS finding
  FROM sessions s,
  LATERAL jsonb_array_elements(COALESCE(s.session->'findings', '[]'::jsonb)) f
)
INSERT INTO qa_sessions (workspace_id, id, name, created_at)
SELECT
  workspace_id,
  session->>'id' AS id,
  COALESCE(NULLIF(session->>'name', ''), 'Untitled QA Page') AS name,
  COALESCE(NULLIF(session->>'createdAt', '')::timestamptz, now())
FROM sessions
WHERE COALESCE(session->>'id', '') <> ''
ON CONFLICT (workspace_id, id) DO NOTHING;

WITH source AS (
  SELECT
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000001'::uuid) AS workspace_id,
    data,
    COALESCE(jsonb_array_length(data->'sessions'), 0) AS sessions_count,
    COALESCE((
      SELECT SUM(jsonb_array_length(COALESCE(s->'findings', '[]'::jsonb)))
      FROM jsonb_array_elements(COALESCE(data->'sessions', '[]'::jsonb)) s
    ), 0) AS findings_count,
    updated_at
  FROM workspace_app_data
  WHERE id = 'qa'
),
best AS (
  SELECT workspace_id, data
  FROM source
  ORDER BY findings_count DESC, sessions_count DESC, updated_at DESC
  LIMIT 1
),
sessions AS (
  SELECT
    b.workspace_id,
    s.value AS session
  FROM best b,
  LATERAL jsonb_array_elements(COALESCE(b.data->'sessions', '[]'::jsonb)) s
),
findings AS (
  SELECT
    s.workspace_id,
    s.session->>'id' AS session_id,
    f.value AS finding
  FROM sessions s,
  LATERAL jsonb_array_elements(COALESCE(s.session->'findings', '[]'::jsonb)) f
)
INSERT INTO qa_findings (
  workspace_id, id, session_id, title, description, tags, priority, status, environment, categories,
  figma_link, ticket_link, assignee, reporter, created_at, updated_at
)
SELECT
  workspace_id,
  finding->>'id' AS id,
  session_id,
  COALESCE(NULLIF(finding->>'title', ''), 'Untitled'),
  COALESCE(finding->>'description', ''),
  COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(finding->'tags', '[]'::jsonb)) x), '{}'::text[]),
  COALESCE(NULLIF(finding->>'priority', ''), 'medium'),
  COALESCE(NULLIF(finding->>'status', ''), 'not_started'),
  COALESCE(NULLIF(finding->>'environment', ''), 'STG'),
  CASE
    WHEN jsonb_typeof(finding->'categories') = 'array' THEN
      COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(finding->'categories', '[]'::jsonb)) x), '{"bugs"}'::text[])
    WHEN COALESCE(finding->>'category', '') <> '' THEN ARRAY[finding->>'category']
    ELSE '{"bugs"}'::text[]
  END,
  COALESCE(finding->>'figmaLink', ''),
  COALESCE(finding->>'ticketLink', ''),
  COALESCE(finding->>'assignee', ''),
  COALESCE(finding->>'reporter', ''),
  COALESCE(NULLIF(finding->>'createdAt', '')::timestamptz, now()),
  COALESCE(NULLIF(finding->>'updatedAt', '')::timestamptz, now())
FROM findings
WHERE COALESCE(finding->>'id', '') <> ''
  AND COALESCE(session_id, '') <> ''
ON CONFLICT (workspace_id, id) DO NOTHING;

WITH source AS (
  SELECT
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000001'::uuid) AS workspace_id,
    data,
    COALESCE(jsonb_array_length(data->'sessions'), 0) AS sessions_count,
    COALESCE((
      SELECT SUM(jsonb_array_length(COALESCE(s->'findings', '[]'::jsonb)))
      FROM jsonb_array_elements(COALESCE(data->'sessions', '[]'::jsonb)) s
    ), 0) AS findings_count,
    updated_at
  FROM workspace_app_data
  WHERE id = 'qa'
),
best AS (
  SELECT workspace_id, data
  FROM source
  ORDER BY findings_count DESC, sessions_count DESC, updated_at DESC
  LIMIT 1
),
sessions AS (
  SELECT
    b.workspace_id,
    s.value AS session
  FROM best b,
  LATERAL jsonb_array_elements(COALESCE(b.data->'sessions', '[]'::jsonb)) s
),
findings AS (
  SELECT
    s.workspace_id,
    f.value AS finding
  FROM sessions s,
  LATERAL jsonb_array_elements(COALESCE(s.session->'findings', '[]'::jsonb)) f
),
comments AS (
  SELECT
    f.workspace_id,
    f.finding->>'id' AS finding_id,
    c.value AS comment
  FROM findings f,
  LATERAL jsonb_array_elements(COALESCE(f.finding->'comments', '[]'::jsonb)) c
)
INSERT INTO qa_comments (workspace_id, id, finding_id, author, text, created_at)
SELECT
  workspace_id,
  comment->>'id' AS id,
  finding_id,
  COALESCE(comment->>'author', ''),
  COALESCE(comment->>'text', ''),
  COALESCE(NULLIF(comment->>'createdAt', '')::timestamptz, now())
FROM comments
WHERE COALESCE(comment->>'id', '') <> ''
  AND COALESCE(finding_id, '') <> ''
ON CONFLICT (workspace_id, id) DO NOTHING;

WITH source AS (
  SELECT
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000001'::uuid) AS workspace_id,
    data,
    COALESCE(jsonb_array_length(data->'sessions'), 0) AS sessions_count,
    COALESCE((
      SELECT SUM(jsonb_array_length(COALESCE(s->'findings', '[]'::jsonb)))
      FROM jsonb_array_elements(COALESCE(data->'sessions', '[]'::jsonb)) s
    ), 0) AS findings_count,
    updated_at
  FROM workspace_app_data
  WHERE id = 'qa'
),
best AS (
  SELECT workspace_id, data
  FROM source
  ORDER BY findings_count DESC, sessions_count DESC, updated_at DESC
  LIMIT 1
),
sessions AS (
  SELECT
    b.workspace_id,
    s.value AS session
  FROM best b,
  LATERAL jsonb_array_elements(COALESCE(b.data->'sessions', '[]'::jsonb)) s
),
findings AS (
  SELECT
    s.workspace_id,
    f.value AS finding
  FROM sessions s,
  LATERAL jsonb_array_elements(COALESCE(s.session->'findings', '[]'::jsonb)) f
),
screenshots AS (
  SELECT
    f.workspace_id,
    f.finding->>'id' AS finding_id,
    sh.value AS screenshot
  FROM findings f,
  LATERAL jsonb_array_elements(COALESCE(f.finding->'screenshots', '[]'::jsonb)) sh
)
INSERT INTO qa_screenshots (workspace_id, id, finding_id, name, data_url, created_at)
SELECT
  workspace_id,
  screenshot->>'id' AS id,
  finding_id,
  COALESCE(NULLIF(screenshot->>'name', ''), 'screenshot'),
  COALESCE(screenshot->>'dataUrl', ''),
  COALESCE(NULLIF(screenshot->>'createdAt', '')::timestamptz, now())
FROM screenshots
WHERE COALESCE(screenshot->>'id', '') <> ''
  AND COALESCE(finding_id, '') <> ''
  AND COALESCE(screenshot->>'dataUrl', '') LIKE 'data:image/%'
ON CONFLICT (workspace_id, id) DO NOTHING;

