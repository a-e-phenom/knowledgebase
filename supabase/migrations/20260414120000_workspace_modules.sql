/*
  Shared AI module definitions (replaces per-browser localStorage).

  Each row is one module or builtin override; `data` holds the full Module JSON (id matches row id).
*/

CREATE TABLE IF NOT EXISTS workspace_modules (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_modules_updated_at ON workspace_modules (updated_at DESC);

ALTER TABLE workspace_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shared workspace select workspace_modules"
  ON workspace_modules FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared workspace insert workspace_modules"
  ON workspace_modules FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Shared workspace update workspace_modules"
  ON workspace_modules FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Shared workspace delete workspace_modules"
  ON workspace_modules FOR DELETE TO anon, authenticated USING (true);
