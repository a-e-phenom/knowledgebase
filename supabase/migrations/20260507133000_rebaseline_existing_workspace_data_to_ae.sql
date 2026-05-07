/*
  Re-baseline existing workspace-scoped data into Automation Engine workspace.
  Keeps one "best/latest" record per logical id and copies it to AE.
  Non-AE rows are preserved (no deletes).
*/

DO $$
DECLARE
  ae uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  -- workspace_app_data: keep newest row per id.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workspace_app_data'
      AND column_name = 'workspace_id'
  ) THEN
    CREATE TEMP TABLE _wad_best ON COMMIT DROP AS
    SELECT DISTINCT ON (id)
      id, data, updated_at
    FROM workspace_app_data
    ORDER BY id, updated_at DESC;

    INSERT INTO workspace_app_data (workspace_id, id, data, updated_at)
    SELECT ae, id, data, updated_at
    FROM _wad_best
    ON CONFLICT (workspace_id, id) DO UPDATE
    SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;
  END IF;

  -- workspace_modules: keep newest row per id.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workspace_modules'
      AND column_name = 'workspace_id'
  ) THEN
    CREATE TEMP TABLE _wm_best ON COMMIT DROP AS
    SELECT DISTINCT ON (id)
      id, data, updated_at
    FROM workspace_modules
    ORDER BY id, updated_at DESC;

    INSERT INTO workspace_modules (workspace_id, id, data, updated_at)
    SELECT ae, id, data, updated_at
    FROM _wm_best
    ON CONFLICT (workspace_id, id) DO UPDATE
    SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;
  END IF;

  -- workspace_apps intentionally untouched here to avoid moving existing rows.

  -- Normalized QA tables: dedupe by id and assign to AE.
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='qa_sessions') THEN
    CREATE TEMP TABLE _qa_sessions_best ON COMMIT DROP AS
    SELECT DISTINCT ON (id)
      id, name, created_at
    FROM qa_sessions
    ORDER BY id, created_at DESC;

    CREATE TEMP TABLE _qa_findings_best ON COMMIT DROP AS
    SELECT DISTINCT ON (id)
      id, session_id, title, description, tags, priority, status, environment, categories,
      figma_link, ticket_link, assignee, reporter, created_at, updated_at
    FROM qa_findings
    ORDER BY id, updated_at DESC, created_at DESC;

    CREATE TEMP TABLE _qa_comments_best ON COMMIT DROP AS
    SELECT DISTINCT ON (id)
      id, finding_id, author, text, created_at
    FROM qa_comments
    ORDER BY id, created_at DESC;

    CREATE TEMP TABLE _qa_screenshots_best ON COMMIT DROP AS
    SELECT DISTINCT ON (id)
      id, finding_id, name, data_url, created_at
    FROM qa_screenshots
    ORDER BY id, created_at DESC;

    INSERT INTO qa_sessions (workspace_id, id, name, created_at)
    SELECT ae, id, name, created_at
    FROM _qa_sessions_best
    ON CONFLICT (workspace_id, id) DO UPDATE
    SET
      name = EXCLUDED.name,
      created_at = LEAST(qa_sessions.created_at, EXCLUDED.created_at);

    INSERT INTO qa_findings (
      workspace_id, id, session_id, title, description, tags, priority, status, environment, categories,
      figma_link, ticket_link, assignee, reporter, created_at, updated_at
    )
    SELECT
      ae, f.id, f.session_id, f.title, f.description, f.tags, f.priority, f.status, f.environment, f.categories,
      f.figma_link, f.ticket_link, f.assignee, f.reporter, f.created_at, f.updated_at
    FROM _qa_findings_best f
    WHERE EXISTS (SELECT 1 FROM _qa_sessions_best s WHERE s.id = f.session_id)
    ON CONFLICT (workspace_id, id) DO UPDATE
    SET
      session_id = EXCLUDED.session_id,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      tags = EXCLUDED.tags,
      priority = EXCLUDED.priority,
      status = EXCLUDED.status,
      environment = EXCLUDED.environment,
      categories = EXCLUDED.categories,
      figma_link = EXCLUDED.figma_link,
      ticket_link = EXCLUDED.ticket_link,
      assignee = EXCLUDED.assignee,
      reporter = EXCLUDED.reporter,
      created_at = LEAST(qa_findings.created_at, EXCLUDED.created_at),
      updated_at = GREATEST(qa_findings.updated_at, EXCLUDED.updated_at);

    INSERT INTO qa_comments (workspace_id, id, finding_id, author, text, created_at)
    SELECT ae, c.id, c.finding_id, c.author, c.text, c.created_at
    FROM _qa_comments_best c
    WHERE EXISTS (SELECT 1 FROM _qa_findings_best f WHERE f.id = c.finding_id)
    ON CONFLICT (workspace_id, id) DO UPDATE
    SET
      finding_id = EXCLUDED.finding_id,
      author = EXCLUDED.author,
      text = EXCLUDED.text,
      created_at = LEAST(qa_comments.created_at, EXCLUDED.created_at);

    INSERT INTO qa_screenshots (workspace_id, id, finding_id, name, data_url, created_at)
    SELECT ae, s.id, s.finding_id, s.name, s.data_url, s.created_at
    FROM _qa_screenshots_best s
    WHERE EXISTS (SELECT 1 FROM _qa_findings_best f WHERE f.id = s.finding_id)
    ON CONFLICT (workspace_id, id) DO UPDATE
    SET
      finding_id = EXCLUDED.finding_id,
      name = EXCLUDED.name,
      data_url = EXCLUDED.data_url,
      created_at = LEAST(qa_screenshots.created_at, EXCLUDED.created_at);
  END IF;
END $$;

