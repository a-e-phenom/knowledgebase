import { supabase } from '@/lib/supabase'

/** Row id for QA workspace state (`sessions` JSON). */
export const WORKSPACE_APP_DATA_QA = 'qa'

/** Row id for Product standup state (`members`, `submissions` JSON). */
export const WORKSPACE_APP_DATA_PRODUCT_STANDUP = 'product-standup'

export async function fetchWorkspaceAppDataJson(id: string): Promise<unknown | null> {
  const { data, error } = await supabase.from('workspace_app_data').select('data').eq('id', id).maybeSingle()
  if (error) {
    console.error('[workspaceAppData] fetch', id, error.message)
    return null
  }
  return data?.data ?? null
}

export async function upsertWorkspaceAppDataJson(id: string, data: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('workspace_app_data').upsert({
    id,
    data,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}
