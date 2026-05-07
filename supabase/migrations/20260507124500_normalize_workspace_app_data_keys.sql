/*
  Normalize legacy workspace_app_data rows that encoded workspace in `id`:
    id = 'ws:<workspace_uuid>:<item_id>'

  Moves data into proper columns:
    workspace_id = <workspace_uuid>
    id           = <item_id>
*/

DO $$
BEGIN
  -- Only run when scoped schema exists.
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workspace_app_data'
      AND column_name = 'workspace_id'
  ) THEN
    RETURN;
  END IF;

  -- Upsert normalized rows from encoded ids.
  INSERT INTO workspace_app_data (workspace_id, id, data, updated_at)
  SELECT
    split_part(id, ':', 2)::uuid AS workspace_id,
    split_part(id, ':', 3) AS id,
    data,
    updated_at
  FROM workspace_app_data
  WHERE id LIKE 'ws:%:%'
    AND split_part(id, ':', 2) ~* '^[0-9a-f-]{36}$'
    AND split_part(id, ':', 3) <> ''
  ON CONFLICT (workspace_id, id) DO UPDATE
  SET
    data = EXCLUDED.data,
    updated_at = GREATEST(workspace_app_data.updated_at, EXCLUDED.updated_at);

END $$;

