import { supabase } from '@/lib/supabase'
import { getActiveWorkspaceId } from '@/lib/workspaces'

/** Row id for QA workspace state (`sessions` JSON). */
export const WORKSPACE_APP_DATA_QA = 'qa'

/** Row id for Product standup state (`members`, `submissions` JSON). */
export const WORKSPACE_APP_DATA_PRODUCT_STANDUP = 'product-standup'

let useScopedWorkspaceAppData: boolean | null = null

export async function fetchWorkspaceAppDataJson(id: string): Promise<unknown | null> {
  const workspaceId = getActiveWorkspaceId()
  if (useScopedWorkspaceAppData !== false) {
    const { data, error } = await supabase
      .from('workspace_app_data')
      .select('data')
      .eq('workspace_id', workspaceId)
      .eq('id', id)
      .maybeSingle()
    if (!error) {
      useScopedWorkspaceAppData = true
      return data?.data ?? null
    }
    if (error.message.includes('workspace_id')) {
      useScopedWorkspaceAppData = false
    } else {
      console.error('[workspaceAppData] fetch scoped', id, error.message)
      return null
    }
  }

  const { data, error } = await supabase
    .from('workspace_app_data')
    .select('data')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[workspaceAppData] fetch legacy', id, error.message)
    return null
  }
  return data?.data ?? null
}

export async function upsertWorkspaceAppDataJson(id: string, data: Record<string, unknown>): Promise<void> {
  const workspaceId = getActiveWorkspaceId()
  if (useScopedWorkspaceAppData !== false) {
    const { error } = await supabase.from('workspace_app_data').upsert(
      {
        workspace_id: workspaceId,
        id,
        data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,id' },
    )
    if (!error) {
      useScopedWorkspaceAppData = true
      return
    }
    if (error.message.includes('workspace_id')) {
      useScopedWorkspaceAppData = false
    } else {
      throw error
    }
  }

  const { error } = await supabase.from('workspace_app_data').upsert({
    id,
    data,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}
