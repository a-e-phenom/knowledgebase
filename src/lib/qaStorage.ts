import {
  WORKSPACE_APP_DATA_QA,
  fetchWorkspaceAppDataJson,
  upsertWorkspaceAppDataJson,
} from '@/lib/workspaceAppData'

const STORAGE_KEY = 'docHub-qa-v2'

const LEGACY_KEY = 'docHub-qa-v1'

export type QaPriority = 'low' | 'medium' | 'high' | 'critical'

export type QaEnvironment = 'STG' | 'STGIR' | 'INTQA' | 'PROD'

export const QA_ENVIRONMENTS: QaEnvironment[] = ['STG', 'STGIR', 'INTQA', 'PROD']

export type QaStatus = 'open' | 'triaged' | 'in_progress' | 'blocked' | 'verified' | 'wont_fix'

export const QA_STATUSES: QaStatus[] = [
  'open',
  'triaged',
  'in_progress',
  'blocked',
  'verified',
  'wont_fix',
]

export function qaStatusLabel(s: QaStatus): string {
  switch (s) {
    case 'open':
      return 'Open'
    case 'triaged':
      return 'Triaged'
    case 'in_progress':
      return 'In progress'
    case 'blocked':
      return 'Blocked'
    case 'verified':
      return 'Verified'
    case 'wont_fix':
      return "Won't fix"
    default:
      return s
  }
}

export type QaComment = {
  id: string
  author: string
  text: string
  createdAt: string
}

export type QaScreenshot = {
  id: string
  name: string
  dataUrl: string
  createdAt: string
}

export type QaFinding = {
  id: string
  title: string
  description: string
  tags: string[]
  priority: QaPriority
  status: QaStatus
  environment: QaEnvironment
  comments: QaComment[]
  /** PNG/JPEG data URLs (compressed client-side) */
  screenshots: QaScreenshot[]
  figmaLink: string
  ticketLink: string
  assignee: string
  createdAt: string
  updatedAt: string
}

export type QaSession = {
  id: string
  name: string
  createdAt: string
  findings: QaFinding[]
}

export type QaState = {
  sessions: QaSession[]
}

export function defaultQaState(): QaState {
  return { sessions: [] }
}

function isPriority(x: unknown): x is QaPriority {
  return x === 'low' || x === 'medium' || x === 'high' || x === 'critical'
}

function isStatus(x: unknown): x is QaStatus {
  return (
    x === 'open' ||
    x === 'triaged' ||
    x === 'in_progress' ||
    x === 'blocked' ||
    x === 'verified' ||
    x === 'wont_fix'
  )
}

function isEnvironment(x: unknown): x is QaEnvironment {
  return x === 'STG' || x === 'STGIR' || x === 'INTQA' || x === 'PROD'
}

function parseComment(raw: unknown): QaComment | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.author !== 'string' || typeof o.text !== 'string') return null
  const createdAt = typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString()
  return { id: o.id, author: o.author, text: o.text, createdAt }
}

function parseScreenshot(raw: unknown): QaScreenshot | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.dataUrl !== 'string') return null
  const name = typeof o.name === 'string' ? o.name : 'screenshot'
  const createdAt = typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString()
  if (!o.dataUrl.startsWith('data:image/')) return null
  return { id: o.id, name, dataUrl: o.dataUrl, createdAt }
}

function parseFinding(raw: unknown): QaFinding | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.title !== 'string') return null
  const description = typeof o.description === 'string' ? o.description : ''
  const tags = Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : []
  const priority = isPriority(o.priority) ? o.priority : 'medium'
  const status = isStatus(o.status) ? o.status : 'open'
  const environment = isEnvironment(o.environment) ? o.environment : 'STG'
  const commentsRaw = Array.isArray(o.comments) ? o.comments : []
  const comments = commentsRaw.map(parseComment).filter((c): c is QaComment => c !== null)
  const createdAt = typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString()
  const updatedAt = typeof o.updatedAt === 'string' ? o.updatedAt : createdAt
  const screenshotsRaw = Array.isArray(o.screenshots) ? o.screenshots : []
  const screenshots = screenshotsRaw.map(parseScreenshot).filter((s): s is QaScreenshot => s !== null)
  const figmaLink = typeof o.figmaLink === 'string' ? o.figmaLink : ''
  const ticketLink = typeof o.ticketLink === 'string' ? o.ticketLink : ''
  const assignee = typeof o.assignee === 'string' ? o.assignee : ''
  return {
    id: o.id,
    title: o.title,
    description,
    tags,
    priority,
    status,
    environment,
    comments,
    screenshots,
    figmaLink,
    ticketLink,
    assignee,
    createdAt,
    updatedAt,
  }
}

function parseSession(raw: unknown): QaSession | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null
  const createdAt = typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString()
  const findingsRaw = Array.isArray(o.findings) ? o.findings : []
  const findings = findingsRaw.map(parseFinding).filter((f): f is QaFinding => f !== null)
  return { id: o.id, name: o.name, createdAt, findings }
}

export function parseQaStatePayload(parsed: unknown): QaState | null {
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  const sessionsRaw = Array.isArray(o.sessions) ? o.sessions : []
  const sessions = sessionsRaw.map(parseSession).filter((s): s is QaSession => s !== null)
  return { sessions }
}

function readStoredState(): QaState | null {
  try {
    let raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      raw = localStorage.getItem(LEGACY_KEY)
      if (!raw) return null
    }
    return parseQaStatePayload(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function loadQaState(): QaState {
  const loaded = readStoredState()
  if (loaded) return loaded
  return defaultQaState()
}

export function saveQaState(state: QaState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    try {
      localStorage.removeItem(LEGACY_KEY)
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore quota */
  }
}

/** Load QA state from Supabase (empty object if missing or invalid). */
export async function fetchQaStateFromSupabase(): Promise<QaState> {
  const raw = await fetchWorkspaceAppDataJson(WORKSPACE_APP_DATA_QA)
  return parseQaStatePayload(raw) ?? defaultQaState()
}

export async function persistQaStateToSupabase(state: QaState): Promise<void> {
  await upsertWorkspaceAppDataJson(WORKSPACE_APP_DATA_QA, state as unknown as Record<string, unknown>)
}

/**
 * If the remote row is empty but this browser still has v1/v2 localStorage QA data,
 * upload once and remove local keys so Supabase becomes the source of truth.
 */
export async function migrateQaLocalStorageToSupabaseOnce(): Promise<void> {
  const remote = await fetchQaStateFromSupabase()
  if (remote.sessions.length > 0) return
  const local = readStoredState()
  if (!local || local.sessions.length === 0) return
  await persistQaStateToSupabase(local)
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    /* ignore */
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, ' ')
}

const MAX_SCREENSHOTS = 8
const MAX_DATA_URL_CHARS = 1_200_000

/** Resize image in-browser for localStorage-friendly data URLs. */
export async function compressImageFileToDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const maxDim = 1600
  const ratio = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * ratio))
  const h = Math.max(1, Math.round(bmp.height * ratio))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No canvas context')
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  let quality = 0.82
  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  while (dataUrl.length > MAX_DATA_URL_CHARS && quality > 0.45) {
    quality -= 0.08
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error('Image is still too large after compression. Try a smaller image.')
  }
  return dataUrl
}

export const qaScreenshotLimits = { maxCount: MAX_SCREENSHOTS, maxDataUrlChars: MAX_DATA_URL_CHARS }
