/*
  JSON blobs for app features (QA workspace, Product standup, etc.).
  Same shared-workspace RLS model as workspace_modules.
*/

CREATE TABLE IF NOT EXISTS workspace_app_data (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_app_data_updated_at ON workspace_app_data (updated_at DESC);

ALTER TABLE workspace_app_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shared workspace select workspace_app_data"
  ON workspace_app_data FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared workspace insert workspace_app_data"
  ON workspace_app_data FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Shared workspace update workspace_app_data"
  ON workspace_app_data FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Shared workspace delete workspace_app_data"
  ON workspace_app_data FOR DELETE TO anon, authenticated USING (true);
