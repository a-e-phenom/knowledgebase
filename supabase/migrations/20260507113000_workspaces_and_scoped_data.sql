/*
  Add first-class workspaces and scope shared tables by workspace_id.
*/

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_created_at ON workspaces (created_at DESC);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shared workspace select workspaces" ON workspaces;
DROP POLICY IF EXISTS "Shared workspace insert workspaces" ON workspaces;
DROP POLICY IF EXISTS "Shared workspace update workspaces" ON workspaces;
DROP POLICY IF EXISTS "Shared workspace delete workspaces" ON workspaces;

CREATE POLICY "Shared workspace select workspaces"
  ON workspaces FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared workspace insert workspaces"
  ON workspaces FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Shared workspace update workspaces"
  ON workspaces FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Shared workspace delete workspaces"
  ON workspaces FOR DELETE TO anon, authenticated USING (true);

INSERT INTO workspaces (id, name)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'Automation Engine')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE workspace_modules ADD COLUMN IF NOT EXISTS workspace_id uuid;
UPDATE workspace_modules
SET workspace_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE workspace_id IS NULL;
ALTER TABLE workspace_modules ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE workspace_modules ALTER COLUMN workspace_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_modules_pkey'
  ) THEN
    ALTER TABLE workspace_modules DROP CONSTRAINT workspace_modules_pkey;
  END IF;
END $$;

ALTER TABLE workspace_modules ADD CONSTRAINT workspace_modules_pkey PRIMARY KEY (workspace_id, id);
CREATE INDEX IF NOT EXISTS idx_workspace_modules_workspace_id ON workspace_modules (workspace_id);

ALTER TABLE workspace_app_data ADD COLUMN IF NOT EXISTS workspace_id uuid;
UPDATE workspace_app_data
SET workspace_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE workspace_id IS NULL;
ALTER TABLE workspace_app_data ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE workspace_app_data ALTER COLUMN workspace_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_app_data_pkey'
  ) THEN
    ALTER TABLE workspace_app_data DROP CONSTRAINT workspace_app_data_pkey;
  END IF;
END $$;

ALTER TABLE workspace_app_data ADD CONSTRAINT workspace_app_data_pkey PRIMARY KEY (workspace_id, id);
CREATE INDEX IF NOT EXISTS idx_workspace_app_data_workspace_id ON workspace_app_data (workspace_id);

ALTER TABLE workspace_apps ADD COLUMN IF NOT EXISTS workspace_id uuid;
UPDATE workspace_apps
SET workspace_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE workspace_id IS NULL;
ALTER TABLE workspace_apps ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE workspace_apps ALTER COLUMN workspace_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
CREATE INDEX IF NOT EXISTS idx_workspace_apps_workspace_id ON workspace_apps (workspace_id);

