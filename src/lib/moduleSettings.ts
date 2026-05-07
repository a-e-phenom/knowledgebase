// ─── Types ───────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase'
import { getActiveWorkspaceId } from '@/lib/workspaces'

export type ModuleIcon = 'bot' | 'file-text' | 'sparkles' | 'book-open' | 'zap' | 'message-square' | 'search'

export type ModuleOutputMode = 'chat' | 'structured'

/** When outputMode is structured: grid of cards vs one markdown document. */
export type ModuleStructuredLayout = 'cards' | 'single_document'

export type ModuleKnowledge = {
  allFiles: boolean
  documentIds: string[]
  folderIds: string[]
}

export type Module = {
  id: string
  /** Human-readable name */
  label: string
  description: string
  icon: ModuleIcon
  /** Tailwind text-color class */
  color: string
  instructions: string
  /** If set, the document's content is used as instructions instead of the free-text field */
  instructionsDocId?: string | null
  /** How assistant replies are shown; default chat */
  outputMode?: ModuleOutputMode
  /**
   * When outputMode is structured: extra instructions for cards or for the single document.
   * Cards: JSON `{ cards: [{ title, body }] }`. Single document: JSON `{ document: "markdown" }`.
   */
  structuredOutputPrompt?: string
  /** Structured mode only; default cards. */
  structuredLayout?: ModuleStructuredLayout
  /** Which documents/folders the module can use as knowledge. */
  knowledge?: ModuleKnowledge
  /** built-in modules can't be deleted */
  builtin?: boolean
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const BUILTIN_MODULES: Module[] = [
  {
    id: 'ai-assistant',
    label: 'AI Assistant',
    description: 'Chat with an AI assistant that has access to all your product documents. Reference any document with @.',
    icon: 'bot',
    color: 'text-blue-500',
    instructions:
      'You are a helpful AI assistant for a document management app. When documents are shared with you, analyze them and answer questions based on their content. Be concise and accurate.',
    builtin: true,
  },
  {
    id: 'help-center',
    label: 'Help Center Generator',
    description: 'Generate polished help center articles from your documents. Reference docs with @ for precise context.',
    icon: 'file-text',
    color: 'text-emerald-500',
    instructions:
      'You are an expert technical writer who creates clear, friendly help center articles. When given a topic or document, produce a well-structured article with a brief overview, numbered steps where relevant, tips, and a short FAQ. Use plain language suitable for end users.',
    builtin: true,
  },
  {
    id: 'create-prototype',
    label: 'Create Prototype',
    description:
      'Describe a UI in chat; a live preview builds on the right using Card, Badge, Button, Alert, and more (shadcn-style).',
    icon: 'sparkles',
    color: 'text-violet-500',
    instructions:
      'Custom module: UI is generated as structured JSON and rendered in-app. Not used as a chat system prompt.',
    builtin: true,
  },
]

const LEGACY_STORAGE_KEY = 'modules_v2'

/** Rows from Supabase: overrides + custom modules (not the code-only builtins). */
let remoteCustom: Module[] = []
let useScopedWorkspaceModules: boolean | null = null

function normalizeKnowledge(knowledge?: Partial<ModuleKnowledge> | null): ModuleKnowledge {
  return {
    allFiles: knowledge?.allFiles ?? true,
    documentIds: Array.from(new Set(knowledge?.documentIds ?? [])),
    folderIds: Array.from(new Set(knowledge?.folderIds ?? [])),
  }
}

function normalizeModule(module: Module): Module {
  const structuredLayout: ModuleStructuredLayout =
    module.structuredLayout === 'single_document' ? 'single_document' : 'cards'
  return {
    ...module,
    structuredLayout: module.outputMode === 'structured' ? structuredLayout : undefined,
    knowledge: normalizeKnowledge(module.knowledge),
  }
}

function rowToModule(row: { id: string; data: unknown }): Module {
  const d = row.data as Partial<Module>
  return normalizeModule({ ...d, id: row.id } as Module)
}

async function reloadFromDatabase(): Promise<void> {
  const workspaceId = getActiveWorkspaceId()
  if (useScopedWorkspaceModules !== false) {
    const { data, error } = await supabase
      .from('workspace_modules')
      .select('id, data')
      .eq('workspace_id', workspaceId)
      .order('id')
    if (!error) {
      useScopedWorkspaceModules = true
      remoteCustom = (data ?? []).map(rowToModule)
      return
    }
    if (error.message.includes('workspace_id')) {
      useScopedWorkspaceModules = false
    } else {
      console.error('[moduleSettings] scoped load failed', error.message)
      remoteCustom = []
      return
    }
  }
  const { data, error } = await supabase.from('workspace_modules').select('id, data').order('id')
  if (error) {
    console.error('[moduleSettings] legacy load failed', error.message)
    remoteCustom = []
    return
  }
  remoteCustom = (data ?? []).map(rowToModule)
}

async function migrateLegacyLocalStorageOnce(): Promise<void> {
  try {
    const workspaceId = getActiveWorkspaceId()
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return
    const rows = parsed
      .filter((m): m is Module => m && typeof (m as Module).id === 'string')
      .map((m) => ({ workspace_id: workspaceId, id: m.id, data: m as unknown as Record<string, unknown> }))
    if (rows.length === 0) return
    const { error } =
      useScopedWorkspaceModules === false
        ? await supabase
            .from('workspace_modules')
            .upsert(rows.map(({ id, data }) => ({ id, data })))
        : await supabase.from('workspace_modules').upsert(rows)
    if (!error) localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Load shared modules from Supabase (and once migrate legacy localStorage if the table was empty).
 * Call after app mount and whenever you need the latest list.
 */
export async function fetchModules(): Promise<Module[]> {
  await reloadFromDatabase()
  if (remoteCustom.length === 0) {
    await migrateLegacyLocalStorageOnce()
    await reloadFromDatabase()
  }
  return getAllModules()
}

function loadCustom(): Module[] {
  return remoteCustom
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Returns all modules: builtins (possibly overridden) + custom. Requires {@link fetchModules} first for shared data. */
export function getAllModules(): Module[] {
  const custom = loadCustom()
  return BUILTIN_MODULES.map((b) => {
    const override = custom.find((c) => c.id === b.id)
    return normalizeModule(override ? { ...b, ...override, builtin: true } : b)
  }).concat(custom.filter((c) => !BUILTIN_MODULES.find((b) => b.id === c.id)).map(normalizeModule))
}

export function getModule(id: string): Module | undefined {
  return getAllModules().find((m) => m.id === id)
}

/** Save (create or update) a module. Builtin flag is preserved for builtins. */
export async function saveModule(module: Module): Promise<void> {
  const workspaceId = getActiveWorkspaceId()
  if (useScopedWorkspaceModules !== false) {
    const { error } = await supabase.from('workspace_modules').upsert(
      {
        workspace_id: workspaceId,
        id: module.id,
        data: module as unknown as Record<string, unknown>,
      },
      { onConflict: 'workspace_id,id' },
    )
    if (!error) {
      useScopedWorkspaceModules = true
      await reloadFromDatabase()
      return
    }
    if (!error.message.includes('workspace_id')) throw error
    useScopedWorkspaceModules = false
  }

  const { error } = await supabase.from('workspace_modules').upsert({
    id: module.id,
    data: module as unknown as Record<string, unknown>,
  })
  if (error) throw error
  await reloadFromDatabase()
}

/** Delete a module row by id (custom modules; removing a builtin id deletes a stored override only). */
export async function deleteModule(id: string): Promise<void> {
  const workspaceId = getActiveWorkspaceId()
  if (useScopedWorkspaceModules !== false) {
    const { error } = await supabase
      .from('workspace_modules')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('id', id)
    if (!error) {
      useScopedWorkspaceModules = true
      await reloadFromDatabase()
      return
    }
    if (!error.message.includes('workspace_id')) throw error
    useScopedWorkspaceModules = false
  }

  const { error } = await supabase.from('workspace_modules').delete().eq('id', id)
  if (error) throw error
  await reloadFromDatabase()
}

export async function createModule(partial: Omit<Module, 'id' | 'builtin'>): Promise<Module> {
  const id = `module-${Date.now()}`
  const module: Module = normalizeModule({ ...partial, id })
  await saveModule(module)
  return module
}

// ─── Icon helpers (used by UI) ────────────────────────────────────────────────

export const MODULE_ICON_OPTIONS: { value: ModuleIcon; label: string }[] = [
  { value: 'bot', label: 'Bot' },
  { value: 'file-text', label: 'File' },
  { value: 'sparkles', label: 'Sparkles' },
  { value: 'book-open', label: 'Book' },
  { value: 'zap', label: 'Zap' },
  { value: 'message-square', label: 'Chat' },
  { value: 'search', label: 'Search' },
]

export const MODULE_COLOR_OPTIONS: { value: string; label: string; swatch: string }[] = [
  { value: 'text-blue-500', label: 'Blue', swatch: '#3b82f6' },
  { value: 'text-emerald-500', label: 'Green', swatch: '#10b981' },
  { value: 'text-violet-500', label: 'Purple', swatch: '#8b5cf6' },
  { value: 'text-orange-500', label: 'Orange', swatch: '#f97316' },
  { value: 'text-rose-500', label: 'Rose', swatch: '#f43f5e' },
  { value: 'text-amber-500', label: 'Amber', swatch: '#f59e0b' },
  { value: 'text-cyan-500', label: 'Cyan', swatch: '#06b6d4' },
]
