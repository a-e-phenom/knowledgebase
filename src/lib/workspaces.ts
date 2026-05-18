import { supabase } from '@/lib/supabase'

export type Workspace = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'
export const DEFAULT_WORKSPACE_NAME = 'Automation Engine'
const ACTIVE_WORKSPACE_STORAGE_KEY = 'docHub-active-workspace-id'
const RESERVED_ROUTE_SEGMENTS = new Set([
  'documents',
  'apps',
  'product',
  'qa',
  'modules',
  'ai-assistant',
  'help-center',
])

let activeWorkspaceId =
  (typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY) : null) ||
  DEFAULT_WORKSPACE_ID

export function getActiveWorkspaceId(): string {
  return activeWorkspaceId || DEFAULT_WORKSPACE_ID
}

export function setActiveWorkspaceId(workspaceId: string): void {
  activeWorkspaceId = workspaceId || DEFAULT_WORKSPACE_ID
  try {
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, activeWorkspaceId)
  } catch {
    /* ignore */
  }
}

export function defaultWorkspace(): Workspace {
  const now = new Date().toISOString()
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: DEFAULT_WORKSPACE_NAME,
    created_at: now,
    updated_at: now,
  }
}

export async function ensureDefaultWorkspaceRow(): Promise<void> {
  const ws = defaultWorkspace()
  const { error } = await supabase.from('workspaces').upsert(ws).select('id').limit(1)
  if (error) {
    // Keep app functional even if migration is not yet applied.
    console.warn('[workspaces] ensure default row skipped:', error.message)
  }
}

export async function fetchWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await supabase.from('workspaces').select('*').order('created_at', { ascending: true })
  if (error) {
    console.warn('[workspaces] fetch failed, using fallback:', error.message)
    return [defaultWorkspace()]
  }
  const rows = (data ?? []) as Workspace[]
  if (rows.length === 0) return [defaultWorkspace()]
  // Unprefixed routes always target AE; missing row caused CRM to be treated as "default".
  if (!rows.some((w) => w.id === DEFAULT_WORKSPACE_ID)) {
    return [defaultWorkspace(), ...rows]
  }
  return rows
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Workspace name is required')
  const { data, error } = await supabase
    .from('workspaces')
    .insert({ name: trimmed })
    .select('*')
    .single()
  if (error) throw error
  return data as Workspace
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<Workspace> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Workspace name is required')
  const { data, error } = await supabase
    .from('workspaces')
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', workspaceId)
    .select('*')
    .single()
  if (error) throw error
  return data as Workspace
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  if (workspaceId === DEFAULT_WORKSPACE_ID) {
    throw new Error('Automation Engine cannot be deleted')
  }

  const tableDeletes = [
    supabase.from('qa_comments').delete().eq('workspace_id', workspaceId),
    supabase.from('qa_screenshots').delete().eq('workspace_id', workspaceId),
    supabase.from('qa_findings').delete().eq('workspace_id', workspaceId),
    supabase.from('qa_sessions').delete().eq('workspace_id', workspaceId),
    supabase.from('workspace_modules').delete().eq('workspace_id', workspaceId),
    supabase.from('workspace_app_data').delete().eq('workspace_id', workspaceId),
    supabase.from('workspace_apps').delete().eq('workspace_id', workspaceId),
    supabase.from('documents').delete().eq('user_id', workspaceId),
    supabase.from('folders').delete().eq('user_id', workspaceId),
    supabase.from('tags').delete().eq('user_id', workspaceId),
  ]

  for (const op of tableDeletes) {
    const { error } = await op
    if (error) throw error
  }

  const { error } = await supabase.from('workspaces').delete().eq('id', workspaceId)
  if (error) throw error
}

export function workspaceSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'workspace'
}

export function basePathWithoutWorkspaceSlug(pathname: string, workspaces: Workspace[]): string {
  const parts = pathname.split('/').filter(Boolean)
  const first = parts[0]
  if (!first) return '/'
  if (RESERVED_ROUTE_SEGMENTS.has(first)) return pathname
  const slugSet = new Set(
    workspaces
      .filter((w) => w.id !== DEFAULT_WORKSPACE_ID)
      .map((w) => workspaceSlug(w.name)),
  )
  if (!slugSet.has(first)) return pathname
  const rest = parts.slice(1).join('/')
  return rest ? `/${rest}` : '/'
}

export function workspaceIdFromPath(pathname: string, workspaces: Workspace[]): string | null {
  const parts = pathname.split('/').filter(Boolean)
  const first = parts[0]
  if (!first || RESERVED_ROUTE_SEGMENTS.has(first)) return null
  const match = workspaces.find((w) => w.id !== DEFAULT_WORKSPACE_ID && workspaceSlug(w.name) === first)
  return match?.id ?? null
}

export function pathForWorkspace(basePath: string, workspace: Workspace | null | undefined): string {
  const clean = basePath.startsWith('/') ? basePath : `/${basePath}`
  if (!workspace || workspace.id === DEFAULT_WORKSPACE_ID) return clean
  const slug = workspaceSlug(workspace.name)
  return clean === '/' ? `/${slug}` : `/${slug}${clean}`
}

