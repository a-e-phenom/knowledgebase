import {
  WORKSPACE_APP_DATA_QA,
  fetchWorkspaceAppDataJson,
  upsertWorkspaceAppDataJson,
} from '@/lib/workspaceAppData'
import { supabase } from '@/lib/supabase'
import { DEFAULT_WORKSPACE_ID, getActiveWorkspaceId } from '@/lib/workspaces'

const STORAGE_KEY = 'docHub-qa-v2'

const LEGACY_KEY = 'docHub-qa-v1'

/** AE keeps legacy key; other workspaces are isolated in localStorage. */
function scopedQaStorageKey(): string {
  const id = getActiveWorkspaceId()
  if (id === DEFAULT_WORKSPACE_ID) return STORAGE_KEY
  return `${STORAGE_KEY}:${id}`
}

export type QaPriority = 'low' | 'medium' | 'high' | 'critical'

export type QaEnvironment = 'STG' | 'STGIR' | 'INTQA' | 'PROD'

export const QA_ENVIRONMENTS: QaEnvironment[] = ['STG', 'STGIR', 'INTQA', 'PROD']

export type QaCategory = 'bugs' | 'UI' | 'Usability' | 'Logic' | 'missing functionality' | 'Improvement'

export const QA_CATEGORIES: QaCategory[] = [
  'bugs',
  'UI',
  'Usability',
  'Logic',
  'missing functionality',
  'Improvement',
]

export type QaStatus = 'not_started' | 'in_progress' | 'blocked' | 'solved'

export const QA_STATUSES: QaStatus[] = ['not_started', 'in_progress', 'blocked', 'solved']

export function qaStatusLabel(s: QaStatus): string {
  switch (s) {
    case 'not_started':
      return 'Not started'
    case 'in_progress':
      return 'In progress'
    case 'blocked':
      return 'Blocked'
    case 'solved':
      return 'Solved'
    default:
      return s
  }
}

/** Human-readable category label (persisted values stay snake/lowercase keys). */
export function qaCategoryLabel(c: QaCategory): string {
  switch (c) {
    case 'bugs':
      return 'Bug'
    case 'UI':
      return 'UI'
    case 'Usability':
      return 'Usability'
    case 'Logic':
      return 'Logic'
    case 'missing functionality':
      return 'Missing Functionality'
    case 'Improvement':
      return 'Improvement'
    default:
      return c
  }
}

/** Map persisted / legacy status strings to the current four statuses. */
export function normalizeQaStatus(raw: unknown): QaStatus {
  if (raw === 'not_started' || raw === 'in_progress' || raw === 'blocked' || raw === 'solved') {
    return raw
  }
  if (typeof raw !== 'string') return 'not_started'
  if (raw === 'verified') return 'solved'
  return 'not_started'
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
  /** Rich page body (TipTap HTML). Card shows a plain-text preview. */
  description: string
  tags: string[]
  priority: QaPriority
  status: QaStatus
  environment: QaEnvironment
  categories: QaCategory[]
  comments: QaComment[]
  /** PNG/JPEG data URLs (compressed client-side) */
  screenshots: QaScreenshot[]
  figmaLink: string
  ticketLink: string
  assignee: string
  /** Optional person who filed the item (shown in card footer). */
  reporter: string
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

function isEnvironment(x: unknown): x is QaEnvironment {
  return x === 'STG' || x === 'STGIR' || x === 'INTQA' || x === 'PROD'
}

function isCategory(x: unknown): x is QaCategory {
  return (
    x === 'bugs' ||
    x === 'UI' ||
    x === 'Usability' ||
    x === 'Logic' ||
    x === 'missing functionality' ||
    x === 'Improvement'
  )
}

function parseCategories(raw: unknown): QaCategory[] {
  if (Array.isArray(raw)) {
    const parsed = raw.filter(isCategory)
    return parsed.length > 0 ? [...new Set(parsed)] : ['bugs']
  }
  if (isCategory(raw)) return [raw]
  return ['bugs']
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
  const status = normalizeQaStatus(o.status)
  const environment = isEnvironment(o.environment) ? o.environment : 'STG'
  // Support both new `categories` array and legacy single `category`.
  const categories = parseCategories(Array.isArray(o.categories) ? o.categories : o.category)
  const commentsRaw = Array.isArray(o.comments) ? o.comments : []
  const comments = commentsRaw.map(parseComment).filter((c): c is QaComment => c !== null)
  const createdAt = typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString()
  const updatedAt = typeof o.updatedAt === 'string' ? o.updatedAt : createdAt
  const screenshotsRaw = Array.isArray(o.screenshots) ? o.screenshots : []
  const screenshots = screenshotsRaw.map(parseScreenshot).filter((s): s is QaScreenshot => s !== null)
  const figmaLink = typeof o.figmaLink === 'string' ? o.figmaLink : ''
  const ticketLink = typeof o.ticketLink === 'string' ? o.ticketLink : ''
  const assignee = typeof o.assignee === 'string' ? o.assignee : ''
  const reporter = typeof o.reporter === 'string' ? o.reporter : ''
  return {
    id: o.id,
    title: o.title,
    description,
    tags,
    priority,
    status,
    environment,
    categories,
    comments,
    screenshots,
    figmaLink,
    ticketLink,
    assignee,
    reporter,
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
    const key = scopedQaStorageKey()
    let raw = localStorage.getItem(key)
    if (!raw && key === STORAGE_KEY) {
      raw = localStorage.getItem(LEGACY_KEY)
      if (!raw) return null
    }
    if (!raw) return null
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
    const key = scopedQaStorageKey()
    localStorage.setItem(key, JSON.stringify(state))
    if (key === STORAGE_KEY) {
      try {
        localStorage.removeItem(LEGACY_KEY)
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore quota */
  }
}

/** Load QA state from Supabase (empty object if missing or invalid). */
export async function fetchQaStateFromSupabase(): Promise<QaState> {
  const normalized = await fetchQaStateFromNormalizedTables()
  if (normalized && normalized.sessions.length > 0) {
    return mergeCommentsAndScreenshotsFromWorkspaceBlob(normalized)
  }
  let raw: unknown | null = null
  try {
    raw = await fetchWorkspaceAppDataJson(WORKSPACE_APP_DATA_QA)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.warn('[qaStorage] workspace_app_data fetch failed:', message)
  }
  const blobState = parseQaStatePayload(raw) ?? defaultQaState()

  // Recovery path: if normalized tables are empty but QA blob still has data,
  // return blob data and opportunistically rehydrate normalized tables.
  if (blobState.sessions.length > 0 && (!normalized || normalized.sessions.length === 0)) {
    try {
      await persistQaStateToNormalizedTables(blobState)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[qaStorage] normalized rehydrate failed:', message)
    }
    return blobState
  }

  // Last-resort recovery: browser backup for this workspace only (scoped key).
  // Never read the AE legacy key when viewing another workspace — that caused AE items to appear in CRM.
  const localBackup = readStoredState()
  if (localBackup && localBackup.sessions.length > 0) {
    try {
      await persistQaStateToNormalizedTables(localBackup)
      await upsertWorkspaceAppDataJson(WORKSPACE_APP_DATA_QA, localBackup as unknown as Record<string, unknown>)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[qaStorage] local backup rehydrate failed:', message)
    }
    return localBackup
  }

  if (normalized) return normalized
  return blobState
}

export async function persistQaStateToSupabase(state: QaState): Promise<void> {
  const countMedia = (s: QaState): { comments: number; screenshots: number } => {
    let comments = 0
    let screenshots = 0
    for (const session of s.sessions) {
      for (const finding of session.findings) {
        comments += finding.comments.length
        screenshots += finding.screenshots.length
      }
    }
    return { comments, screenshots }
  }

  const mergeMissingMediaFromBackup = (
    target: QaState,
    backup: QaState,
    recoverComments: boolean,
    recoverScreenshots: boolean,
  ): QaState => {
    if (!recoverComments && !recoverScreenshots) return target
    const backupFindings = new Map<string, QaFinding>()
    for (const session of backup.sessions) {
      for (const finding of session.findings) {
        backupFindings.set(finding.id, finding)
      }
    }
    let changed = false
    const sessions = target.sessions.map((session) => ({
      ...session,
      findings: session.findings.map((finding) => {
        const backupFinding = backupFindings.get(finding.id)
        if (!backupFinding) return finding

        let comments = finding.comments
        if (recoverComments && comments.length === 0 && backupFinding.comments.length > 0) {
          comments = backupFinding.comments
          changed = true
        }

        let screenshots = finding.screenshots
        if (recoverScreenshots && screenshots.length === 0 && backupFinding.screenshots.length > 0) {
          screenshots = backupFinding.screenshots
          changed = true
        }

        if (comments === finding.comments && screenshots === finding.screenshots) return finding
        return { ...finding, comments, screenshots }
      }),
    }))
    return changed ? { sessions } : target
  }

  const baselineCandidates: QaState[] = []
  try {
    const normalized = await fetchQaStateFromNormalizedTables()
    if (normalized) baselineCandidates.push(normalized)
  } catch {
    /* best effort guard */
  }
  try {
    const raw = await fetchWorkspaceAppDataJson(WORKSPACE_APP_DATA_QA)
    const blob = parseQaStatePayload(raw)
    if (blob) baselineCandidates.push(blob)
  } catch {
    /* best effort guard */
  }

  let safeState = state
  const nextCounts = countMedia(state)
  for (const baseline of baselineCandidates) {
    const baselineCounts = countMedia(baseline)
    const recoverComments = baselineCounts.comments >= 3 && nextCounts.comments === 0
    const recoverScreenshots = baselineCounts.screenshots >= 3 && nextCounts.screenshots === 0
    safeState = mergeMissingMediaFromBackup(safeState, baseline, recoverComments, recoverScreenshots)
  }

  await persistQaStateToNormalizedTables(safeState)
  await upsertWorkspaceAppDataJson(WORKSPACE_APP_DATA_QA, safeState as unknown as Record<string, unknown>)
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
    localStorage.removeItem(scopedQaStorageKey())
    if (scopedQaStorageKey() === STORAGE_KEY) {
      localStorage.removeItem(LEGACY_KEY)
    }
  } catch {
    /* ignore */
  }
}

type QaSessionRow = {
  workspace_id: string
  id: string
  name: string
  created_at: string
}

type QaFindingRow = {
  workspace_id: string
  id: string
  session_id: string
  title: string
  description: string
  tags: string[] | null
  priority: string
  status: string
  environment: string
  categories: string[] | null
  figma_link: string
  ticket_link: string
  assignee: string
  reporter: string
  created_at: string
  updated_at: string
}

type QaCommentRow = {
  workspace_id: string
  id: string
  finding_id: string
  author: string
  text: string
  created_at: string
}

type QaScreenshotRow = {
  workspace_id: string
  id: string
  finding_id: string
  name: string
  data_url: string
  created_at: string
}

function isMissingQaTablesError(message: string): boolean {
  return /qa_sessions|qa_findings|qa_comments|qa_screenshots/i.test(message)
}

function compareIsoDescThenIdDesc(
  a: { created_at: string; id: string },
  b: { created_at: string; id: string },
): number {
  const byCreatedAt = b.created_at.localeCompare(a.created_at)
  if (byCreatedAt !== 0) return byCreatedAt
  return b.id.localeCompare(a.id)
}

function compareIsoAscThenIdAsc(
  a: { created_at: string; id: string },
  b: { created_at: string; id: string },
): number {
  const byCreatedAt = a.created_at.localeCompare(b.created_at)
  if (byCreatedAt !== 0) return byCreatedAt
  return a.id.localeCompare(b.id)
}

const MAX_SCREENSHOT_INSERT_PAYLOAD_CHARS = 2_000_000

/** PostgREST `.in()` with huge id lists can truncate requests or omit rows; keep batches small. */
const FINDING_ID_IN_CHUNK = 80

function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [arr]
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += chunkSize) {
    out.push(arr.slice(i, i + chunkSize))
  }
  return out.length > 0 ? out : [[]]
}

function chunkRowsByEstimatedJsonSize<T>(
  rows: T[],
  estimateSize: (row: T) => number,
  maxChunkSize: number,
): T[][] {
  const chunks: T[][] = []
  let current: T[] = []
  let currentSize = 0

  for (const row of rows) {
    const rowSize = estimateSize(row)
    if (current.length > 0 && currentSize + rowSize > maxChunkSize) {
      chunks.push(current)
      current = []
      currentSize = 0
    }
    current.push(row)
    currentSize += rowSize
  }

  if (current.length > 0) chunks.push(current)
  return chunks
}

function mapQaRowsToState(
  sessions: QaSessionRow[],
  findings: QaFindingRow[],
  comments: QaCommentRow[],
  screenshots: QaScreenshotRow[],
): QaState {
  const stableSessions = [...sessions].sort(compareIsoDescThenIdDesc)
  const stableFindings = [...findings].sort(compareIsoDescThenIdDesc)
  const stableComments = [...comments].sort(compareIsoAscThenIdAsc)
  const stableScreenshots = [...screenshots].sort(compareIsoAscThenIdAsc)

  const commentsByFinding = new Map<string, QaComment[]>()
  stableComments.forEach((c) => {
    const list = commentsByFinding.get(c.finding_id) ?? []
    list.push({
      id: c.id,
      author: c.author,
      text: c.text,
      createdAt: c.created_at,
    })
    commentsByFinding.set(c.finding_id, list)
  })

  const screenshotsByFinding = new Map<string, QaScreenshot[]>()
  stableScreenshots.forEach((s) => {
    const list = screenshotsByFinding.get(s.finding_id) ?? []
    list.push({
      id: s.id,
      name: s.name,
      dataUrl: s.data_url,
      createdAt: s.created_at,
    })
    screenshotsByFinding.set(s.finding_id, list)
  })

  const findingsBySession = new Map<string, QaFinding[]>()
  stableFindings.forEach((f) => {
    const list = findingsBySession.get(f.session_id) ?? []
    list.push({
      id: f.id,
      title: f.title,
      description: f.description ?? '',
      tags: Array.isArray(f.tags) ? f.tags : [],
      priority: isPriority(f.priority) ? f.priority : 'medium',
      status: normalizeQaStatus(f.status),
      environment: isEnvironment(f.environment) ? f.environment : 'STG',
      categories: parseCategories(f.categories),
      comments: commentsByFinding.get(f.id) ?? [],
      screenshots: screenshotsByFinding.get(f.id) ?? [],
      figmaLink: f.figma_link ?? '',
      ticketLink: f.ticket_link ?? '',
      assignee: f.assignee ?? '',
      reporter: f.reporter ?? '',
      createdAt: f.created_at,
      updatedAt: f.updated_at,
    })
    findingsBySession.set(f.session_id, list)
  })

  return {
    sessions: stableSessions.map((s) => ({
      id: s.id,
      name: s.name,
      createdAt: s.created_at,
      findings: findingsBySession.get(s.id) ?? [],
    })),
  }
}

const MAX_COMMENT_INSERT_PAYLOAD_CHARS = 1_500_000

/** If normalized `qa_comments` / `qa_screenshots` rows are missing or incomplete, fill from last good `workspace_app_data` blob. */
async function mergeCommentsAndScreenshotsFromWorkspaceBlob(state: QaState): Promise<QaState> {
  let raw: unknown
  try {
    raw = await fetchWorkspaceAppDataJson(WORKSPACE_APP_DATA_QA)
  } catch {
    return state
  }
  const blob = parseQaStatePayload(raw)
  if (!blob?.sessions?.length) return state

  const blobFindings = new Map<string, QaFinding>()
  for (const s of blob.sessions) {
    for (const f of s.findings) {
      blobFindings.set(f.id, f)
    }
  }

  let changed = false
  const sessions = state.sessions.map((s) => ({
    ...s,
    findings: s.findings.map((f) => {
      const blobF = blobFindings.get(f.id)
      if (!blobF) return f

      const commentMap = new Map<string, QaComment>()
      for (const c of f.comments) {
        if (c?.id) commentMap.set(c.id, c)
      }
      for (const c of blobF.comments ?? []) {
        if (c?.id && !commentMap.has(c.id)) commentMap.set(c.id, c)
      }
      const comments = Array.from(commentMap.values()).sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      )

      const shotMap = new Map<string, QaScreenshot>()
      for (const sh of f.screenshots) {
        if (sh?.id && sh?.dataUrl?.startsWith('data:image/')) shotMap.set(sh.id, sh)
      }
      for (const sh of blobF.screenshots ?? []) {
        if (!sh?.dataUrl?.startsWith('data:image/')) continue
        if (!shotMap.has(sh.id)) shotMap.set(sh.id, sh)
      }
      const screenshots = Array.from(shotMap.values()).sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      )

      if (comments.length === f.comments.length && screenshots.length === f.screenshots.length) {
        return f
      }
      changed = true
      return { ...f, comments, screenshots }
    }),
  }))
  return changed ? { sessions } : state
}

async function fetchQaStateFromNormalizedTables(): Promise<QaState | null> {
  const workspaceId = getActiveWorkspaceId()
  const { data: sessionRows, error: sessionsError } = await supabase
    .from('qa_sessions')
    .select('workspace_id, id, name, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (sessionsError) {
    if (isMissingQaTablesError(sessionsError.message)) return null
    throw sessionsError
  }
  const sessions = (sessionRows ?? []) as QaSessionRow[]
  if (sessions.length === 0) return { sessions: [] }

  const sessionIds = sessions.map((s) => s.id)
  const { data: findingRows, error: findingsError } = await supabase
    .from('qa_findings')
    .select(
      'workspace_id, id, session_id, title, description, tags, priority, status, environment, categories, figma_link, ticket_link, assignee, reporter, created_at, updated_at',
    )
    .eq('workspace_id', workspaceId)
    .in('session_id', sessionIds)
    .order('created_at', { ascending: false })
  if (findingsError) {
    if (isMissingQaTablesError(findingsError.message)) return null
    throw findingsError
  }
  const findings = (findingRows ?? []) as QaFindingRow[]
  const findingIds = findings.map((f) => f.id)

  let comments: QaCommentRow[] = []
  let screenshots: QaScreenshotRow[] = []
  if (findingIds.length > 0) {
    for (const idChunk of chunkArray(findingIds, FINDING_ID_IN_CHUNK)) {
      if (idChunk.length === 0) continue
      const [{ data: commentRows, error: commentsError }, { data: screenshotRows, error: screenshotsError }] =
        await Promise.all([
          supabase
            .from('qa_comments')
            .select('workspace_id, id, finding_id, author, text, created_at')
            .eq('workspace_id', workspaceId)
            .in('finding_id', idChunk)
            .order('created_at', { ascending: true }),
          supabase
            .from('qa_screenshots')
            .select('workspace_id, id, finding_id, name, data_url, created_at')
            .eq('workspace_id', workspaceId)
            .in('finding_id', idChunk)
            .order('created_at', { ascending: true }),
        ])
      if (commentsError) {
        if (isMissingQaTablesError(commentsError.message)) return null
        throw commentsError
      }
      if (screenshotsError) {
        if (isMissingQaTablesError(screenshotsError.message)) return null
        throw screenshotsError
      }
      comments.push(...((commentRows ?? []) as QaCommentRow[]))
      screenshots.push(...((screenshotRows ?? []) as QaScreenshotRow[]))
    }
  }

  return mapQaRowsToState(sessions, findings, comments, screenshots)
}

async function persistQaStateToNormalizedTables(state: QaState): Promise<void> {
  const workspaceId = getActiveWorkspaceId()
  const sessionsPayload = state.sessions.map((s) => ({
    workspace_id: workspaceId,
    id: s.id,
    name: s.name,
    created_at: s.createdAt,
  }))
  const findingsPayload = state.sessions.flatMap((s) =>
    s.findings.map((f) => ({
      workspace_id: workspaceId,
      id: f.id,
      session_id: s.id,
      title: f.title,
      description: f.description,
      tags: f.tags,
      priority: f.priority,
      status: f.status,
      environment: f.environment,
      categories: f.categories,
      figma_link: f.figmaLink,
      ticket_link: f.ticketLink,
      assignee: f.assignee,
      reporter: f.reporter,
      created_at: f.createdAt,
      updated_at: f.updatedAt,
    })),
  )
  const commentsPayload = state.sessions.flatMap((s) =>
    s.findings.flatMap((f) =>
      f.comments.map((c) => ({
        workspace_id: workspaceId,
        id: c.id,
        finding_id: f.id,
        author: c.author,
        text: c.text,
        created_at: c.createdAt,
      })),
    ),
  )
  const screenshotsPayload = state.sessions.flatMap((s) =>
    s.findings.flatMap((f) =>
      f.screenshots.map((sh) => ({
        workspace_id: workspaceId,
        id: sh.id,
        finding_id: f.id,
        name: sh.name,
        data_url: sh.dataUrl,
        created_at: sh.createdAt,
      })),
    ),
  )

  // Full replace for deterministic persistence.
  const { error: delCommentsError } = await supabase.from('qa_comments').delete().eq('workspace_id', workspaceId)
  if (delCommentsError) {
    if (isMissingQaTablesError(delCommentsError.message)) return
    throw delCommentsError
  }
  const { error: delScreenshotsError } = await supabase
    .from('qa_screenshots')
    .delete()
    .eq('workspace_id', workspaceId)
  if (delScreenshotsError) throw delScreenshotsError
  const { error: delFindingsError } = await supabase.from('qa_findings').delete().eq('workspace_id', workspaceId)
  if (delFindingsError) throw delFindingsError
  const { error: delSessionsError } = await supabase.from('qa_sessions').delete().eq('workspace_id', workspaceId)
  if (delSessionsError) throw delSessionsError

  if (sessionsPayload.length > 0) {
    const { error } = await supabase.from('qa_sessions').insert(sessionsPayload)
    if (error) throw error
  }
  if (findingsPayload.length > 0) {
    const { error } = await supabase.from('qa_findings').insert(findingsPayload)
    if (error) throw error
  }
  if (commentsPayload.length > 0) {
    const commentChunks = chunkRowsByEstimatedJsonSize(
      commentsPayload,
      (row) => (row.text?.length ?? 0) + (row.author?.length ?? 0) + 256,
      MAX_COMMENT_INSERT_PAYLOAD_CHARS,
    )
    for (const chunk of commentChunks) {
      const { error } = await supabase.from('qa_comments').insert(chunk)
      if (error) throw error
    }
    const { count, error: countError } = await supabase
      .from('qa_comments')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
    if (countError) throw countError
    if ((count ?? 0) !== commentsPayload.length) {
      throw new Error(`QA comment save incomplete: stored ${count ?? 0} of ${commentsPayload.length}`)
    }
  }
  if (screenshotsPayload.length > 0) {
    const screenshotChunks = chunkRowsByEstimatedJsonSize(
      screenshotsPayload,
      (row) => (row.data_url?.length ?? 0) + 256,
      MAX_SCREENSHOT_INSERT_PAYLOAD_CHARS,
    )
    for (const chunk of screenshotChunks) {
      const { error } = await supabase.from('qa_screenshots').insert(chunk)
      if (error) throw error
    }
    const { count, error: countError } = await supabase
      .from('qa_screenshots')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
    if (countError) throw countError
    if ((count ?? 0) !== screenshotsPayload.length) {
      throw new Error(`QA screenshot save incomplete: stored ${count ?? 0} of ${screenshotsPayload.length}`)
    }
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, ' ')
}

function stripHtmlToPlainText(html: string): string {
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]+>/gi, ' ').replace(/\s+/g, ' ').trim()
  }
  const d = document.createElement('div')
  d.innerHTML = html
  return (d.textContent || '').replace(/\s+/g, ' ').trim()
}

/** Plain text for search / filters (handles legacy plain descriptions and TipTap HTML). */
export function qaFindingBodyPlain(raw: string): string {
  if (!raw.trim()) return ''
  if (/<\s*[a-z]/i.test(raw)) return stripHtmlToPlainText(raw)
  return raw.replace(/\s+/g, ' ').trim()
}

/** Short excerpt for the QA card (Notion-style snippet). */
export function qaDescriptionPreview(raw: string, maxLen = 200): string {
  const plain = qaFindingBodyPlain(raw)
  if (!plain) return ''
  return plain.length <= maxLen ? plain : `${plain.slice(0, maxLen - 1).trim()}…`
}

/** Normalize stored description for BlockEditor `content` (HTML or legacy plain / markdown-ish). */
export function qaDescriptionAsEditorHtml(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  if (/<\s*p[\s>/]/i.test(t) || /<\s*div[\s>/]/i.test(t) || /class="[^"]*docmost/i.test(t)) {
    return raw
  }
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return t
    .split(/\n\n+/)
    .map((block) => `<p>${escape(block).replace(/\n/g, '<br />')}</p>`)
    .join('')
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
