/*
  Ensure Product standup rows are workspace-scoped in practice:
  - Keep AE (`workspace_id` default) data as canonical baseline.
  - For non-AE workspaces, clear rows only when they are exact duplicates of AE.
    (Preserves any truly distinct workspace data.)
*/

DO $$
DECLARE
  ae uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workspace_app_data'
      AND column_name = 'workspace_id'
  ) THEN
    RETURN;
  END IF;

  -- Ensure AE row exists (prefer most recently updated row if AE is missing).
  INSERT INTO workspace_app_data (workspace_id, id, data, updated_at)
  SELECT
    ae,
    'product-standup',
    src.data,
    now()
  FROM (
    SELECT data
    FROM workspace_app_data
    WHERE id = 'product-standup'
    ORDER BY updated_at DESC
    LIMIT 1
  ) src
  WHERE NOT EXISTS (
    SELECT 1
    FROM workspace_app_data
    WHERE workspace_id = ae AND id = 'product-standup'
  )
  ON CONFLICT (workspace_id, id) DO NOTHING;

  -- Clear only cloned rows: non-AE rows that exactly match AE payload.
  UPDATE workspace_app_data non_ae
  SET
    data = '{"members":[],"submissions":[]}'::jsonb,
    updated_at = now()
  FROM workspace_app_data ae_row
  WHERE ae_row.workspace_id = ae
    AND ae_row.id = 'product-standup'
    AND non_ae.id = 'product-standup'
    AND non_ae.workspace_id <> ae
    AND non_ae.data = ae_row.data;
END $$;

