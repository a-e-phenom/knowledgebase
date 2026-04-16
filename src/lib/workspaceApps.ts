import { supabase } from '@/lib/supabase'

export type WorkspaceApp = {
  id: string
  title: string
  description: string
  link: string
  created_at: string
}

/** Ensure URL has a scheme so window.open / <a href> work. */
export function normalizeAppLink(raw: string): string {
  const t = raw.trim()
  if (!t) return t
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

export async function fetchWorkspaceApps(): Promise<WorkspaceApp[]> {
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
  const link = normalizeAppLink(input.link)
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
  const link = normalizeAppLink(input.link)
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
  const { error } = await supabase.from('workspace_apps').delete().eq('id', id)
  if (error) throw error
}
