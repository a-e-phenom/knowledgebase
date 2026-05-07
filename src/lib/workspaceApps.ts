import { supabase } from '@/lib/supabase'
import { getActiveWorkspaceId } from '@/lib/workspaces'

export type WorkspaceApp = {
  id: string
  title: string
  description: string
  link: string
  created_at: string
}

let useScopedWorkspaceApps: boolean | null = null

/** Ensure URL has a scheme so window.open / <a href> work. */
export function normalizeAppLink(raw: string): string {
  const t = raw.trim()
  if (!t) return t
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

export async function fetchWorkspaceApps(): Promise<WorkspaceApp[]> {
  const workspaceId = getActiveWorkspaceId()
  if (useScopedWorkspaceApps !== false) {
    const { data, error } = await supabase
      .from('workspace_apps')
      .select('id, title, description, link, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
    if (!error) {
      useScopedWorkspaceApps = true
      return (data ?? []) as WorkspaceApp[]
    }
    if (error.message.includes('workspace_id')) {
      useScopedWorkspaceApps = false
    } else {
      throw error
    }
  }
  const { data, error } = await supabase
    .from('workspace_apps')
    .select('id, title, description, link, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as WorkspaceApp[]
}

export async function insertWorkspaceApp(input: {
  title: string
  description: string
  link: string
}): Promise<WorkspaceApp> {
  const workspaceId = getActiveWorkspaceId()
  const link = normalizeAppLink(input.link)
  if (useScopedWorkspaceApps !== false) {
    const { data, error } = await supabase
      .from('workspace_apps')
      .insert({
        workspace_id: workspaceId,
        title: input.title.trim(),
        description: input.description.trim(),
        link,
      })
      .select('id, title, description, link, created_at')
      .single()
    if (!error) {
      useScopedWorkspaceApps = true
      return data as WorkspaceApp
    }
    if (!error.message.includes('workspace_id')) throw error
    useScopedWorkspaceApps = false
  }
  const { data, error } = await supabase
    .from('workspace_apps')
    .insert({
      title: input.title.trim(),
      description: input.description.trim(),
      link,
    })
    .select('id, title, description, link, created_at')
    .single()
  if (error) throw error
  return data as WorkspaceApp
}

export async function updateWorkspaceApp(
  id: string,
  input: { title: string; description: string; link: string },
): Promise<WorkspaceApp> {
  const workspaceId = getActiveWorkspaceId()
  const link = normalizeAppLink(input.link)
  if (useScopedWorkspaceApps !== false) {
    const { data, error } = await supabase
      .from('workspace_apps')
      .update({
        title: input.title.trim(),
        description: input.description.trim(),
        link,
      })
      .eq('workspace_id', workspaceId)
      .eq('id', id)
      .select('id, title, description, link, created_at')
      .single()
    if (!error) {
      useScopedWorkspaceApps = true
      return data as WorkspaceApp
    }
    if (!error.message.includes('workspace_id')) throw error
    useScopedWorkspaceApps = false
  }
  const { data, error } = await supabase
    .from('workspace_apps')
    .update({
      title: input.title.trim(),
      description: input.description.trim(),
      link,
    })
    .eq('id', id)
    .select('id, title, description, link, created_at')
    .single()
  if (error) throw error
  return data as WorkspaceApp
}

export async function deleteWorkspaceApp(id: string): Promise<void> {
  const workspaceId = getActiveWorkspaceId()
  if (useScopedWorkspaceApps !== false) {
    const { error } = await supabase.from('workspace_apps').delete().eq('workspace_id', workspaceId).eq('id', id)
    if (!error) {
      useScopedWorkspaceApps = true
      return
    }
    if (!error.message.includes('workspace_id')) throw error
    useScopedWorkspaceApps = false
  }
  const { error } = await supabase.from('workspace_apps').delete().eq('id', id)
  if (error) throw error
}
