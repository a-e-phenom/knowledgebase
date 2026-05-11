import { supabase } from '@/lib/supabase'
import { getActiveWorkspaceId } from '@/lib/workspaces'

/** Row id for QA workspace state (`sessions` JSON). */
export const WORKSPACE_APP_DATA_QA = 'qa'

/** Row id for Product standup state (`members`, `submissions` JSON). */
export const WORKSPACE_APP_DATA_PRODUCT_STANDUP = 'product-standup'

/**
 * Load JSON from `workspace_app_data` for the active workspace.
 * Returns `null` when no row exists. Throws on real DB/network errors (callers may catch).
 */
export async function fetchWorkspaceAppDataJson(id: string): Promise<unknown | null> {
  const workspaceId = getActiveWorkspaceId()
  const { data, error } = await supabase
    .from('workspace_app_data')
    .select('data')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[workspaceAppData] fetch', id, workspaceId, error.message, error.code)
    throw new Error(error.message)
  }
  return data?.data ?? null
}

/**
 * Upsert JSON for `(active workspace, id)`. Always sends `workspace_id` so the composite
 * primary key `(workspace_id, id)` matches migrations — legacy id-only upserts were unsafe.
 */
export async function upsertWorkspaceAppDataJson(id: string, data: Record<string, unknown>): Promise<void> {
  const workspaceId = getActiveWorkspaceId()
  const row = {
    workspace_id: workspaceId,
    id,
    data,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('workspace_app_data').upsert(row, {
    onConflict: 'workspace_id,id',
  })
  if (error) {
    console.error('[workspaceAppData] upsert', id, workspaceId, error.message, error.code)
    throw new Error(error.message)
  }
}
