/*
  External apps directory (title, description, link).
  Same RLS model as other shared workspace tables: anon + authenticated full access.
*/

CREATE TABLE IF NOT EXISTS workspace_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  link text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_apps_created_at ON workspace_apps (created_at DESC);

ALTER TABLE workspace_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shared workspace select workspace_apps"
  ON workspace_apps FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared workspace insert workspace_apps"
  ON workspace_apps FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Shared workspace update workspace_apps"
  ON workspace_apps FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Shared workspace delete workspace_apps"
  ON workspace_apps FOR DELETE TO anon, authenticated USING (true);
