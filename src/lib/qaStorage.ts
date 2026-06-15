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
function scopedQaStorageKey(workspaceId: string = getActiveWorkspaceId()): string {
  if (workspaceId === DEFAULT_WORKSPACE_ID) return STORAGE_KEY
  return `${STORAGE_KEY}:${workspaceId}`
}

function countQaFindings(state: QaState): number {
  let n = 0
  for (const s of state.sessions) n += s.findings.length
  return n
}

export type QaPriority = 'low' | 'medium' | 'high' | 'critical'

/** Estimated implementation effort (distinct from priority / severity). */
export type QaEffort = 'low' | 'medium' | 'high'

export const QA_EFFORTS: QaEffort[] = ['low', 'medium', 'high']

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
  effort: QaEffort
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

function isEffort(x: unknown): x is QaEffort {
  return x === 'low' || x === 'medium' || x === 'high'
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
  const effort = isEffort(o.effort) ? o.effort : 'medium'
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
    effort,
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

export function readStoredState(workspaceId: string = getActiveWorkspaceId()): QaState | null {
  try {
    const key = scopedQaStorageKey(workspaceId)
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

export function saveQaState(state: QaState, workspaceId: string = getActiveWorkspaceId()) {
  try {
    const key = scopedQaStorageKey(workspaceId)
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

/** Load QA state from Supabase for a specific workspace (defaults to active workspace). */
export async function fetchQaStateFromSupabase(workspaceId: string = getActiveWorkspaceId()): Promise<QaState> {
  const normalized = await fetchQaStateFromNormalizedTables(workspaceId)
  const normalizedFindings = normalized ? countQaFindings(normalized) : 0
  if (normalized && normalizedFindings > 0) {
    return mergeCommentsAndScreenshotsFromWorkspaceBlob(normalized, workspaceId)
  }
  let raw: unknown | null = null
  try {
    raw = await fetchWorkspaceAppDataJson(WORKSPACE_APP_DATA_QA, workspaceId)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.warn('[qaStorage] workspace_app_data fetch failed:', message)
  }
  const blobState = parseQaStatePayload(raw) ?? defaultQaState()

  // Recovery path: if normalized tables are empty but QA blob still has data,
  // return blob data and opportunistically rehydrate normalized tables.
  if (blobState.sessions.length > 0 && (!normalized || normalized.sessions.length === 0)) {
    try {
      await persistQaStateToNormalizedTables(blobState, workspaceId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[qaStorage] normalized rehydrate failed:', message)
    }
    return blobState
  }

  // Last-resort recovery: browser backup for this workspace only (scoped key).
  // Never read the AE legacy key when viewing another workspace — that caused AE items to appear in CRM.
  const localBackup = readStoredState(workspaceId)
  if (localBackup && localBackup.sessions.length > 0) {
    try {
      await persistQaStateToNormalizedTables(localBackup, workspaceId)
      await upsertWorkspaceAppDataJson(
        WORKSPACE_APP_DATA_QA,
        localBackup as unknown as Record<string, unknown>,
        workspaceId,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[qaStorage] local backup rehydrate failed:', message)
    }
    return localBackup
  }

  if (normalized && normalizedFindings > 0) return normalized

  const afterBlob = blobState
  if (countQaFindings(afterBlob) > 0) return afterBlob

  return recoverEmptyWorkspaceQaFromDatabase(workspaceId, afterBlob)
}

export async function persistQaStateToSupabase(
  state: QaState,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
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
    const normalized = await fetchQaStateFromNormalizedTables(workspaceId)
    if (normalized) baselineCandidates.push(normalized)
  } catch {
    /* best effort guard */
  }
  try {
    const raw = await fetchWorkspaceAppDataJson(WORKSPACE_APP_DATA_QA, workspaceId)
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

  const incomingFindings = countQaFindings(safeState)
  let remoteFindings = 0
  for (const b of baselineCandidates) {
    remoteFindings = Math.max(remoteFindings, countQaFindings(b))
  }
  if (incomingFindings === 0 && remoteFindings > 0) {
    const remoteSessionCount = Math.max(0, ...baselineCandidates.map((b) => b.sessions.length))
    const addingSessions = safeState.sessions.length > remoteSessionCount
    if (addingSessions) {
      safeState = mergeFindingsFromRichestBaseline(safeState, baselineCandidates)
    }
    if (countQaFindings(safeState) === 0) {
      const err = new Error(
        `Refusing to save QA: would delete ${remoteFindings} remote finding(s) in this workspace with an empty local state. Reload the page; if this persists, restore from a Supabase backup.`,
      )
      console.error('[qaStorage]', err.message)
      throw err
    }
  }

  await persistQaStateToNormalizedTables(safeState, workspaceId)
  await upsertWorkspaceAppDataJson(
    WORKSPACE_APP_DATA_QA,
    safeState as unknown as Record<string, unknown>,
    workspaceId,
  )
}

async function loadWorkspaceQaBlobState(workspaceId: string): Promise<QaState> {
  const fromBlob = parseQaStatePayload(await fetchWorkspaceAppDataJson(WORKSPACE_APP_DATA_QA, workspaceId))
  if (fromBlob) return fromBlob
  try {
    const normalized = await fetchQaStateFromNormalizedTables(workspaceId)
    if (normalized) return normalized
  } catch {
    /* ignore */
  }
  return defaultQaState()
}

/** Append one comment to a finding in the JSON blob (preserves other nested data). */
async function appendCommentToWorkspaceBlob(
  workspaceId: string,
  findingId: string,
  comment: QaComment,
): Promise<void> {
  const current = await loadWorkspaceQaBlobState(workspaceId)
  let found = false
  const sessions = current.sessions.map((s) => ({
    ...s,
    findings: s.findings.map((f) => {
      if (f.id !== findingId) return f
      found = true
      if (f.comments.some((c) => c.id === comment.id)) return f
      const comments = [...f.comments, comment].sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      )
      return { ...f, comments }
    }),
  }))
  if (!found) return
  await upsertWorkspaceAppDataJson(
    WORKSPACE_APP_DATA_QA,
    { sessions } as unknown as Record<string, unknown>,
    workspaceId,
  )
}

/** Add one comment for a finding — upsert row only; never deletes other comments. */
export async function insertQaCommentToSupabase(
  findingId: string,
  comment: QaComment,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const findingIdTrimmed = findingId.trim()
  if (!findingIdTrimmed) return

  const { error } = await supabase.from('qa_comments').upsert(
    {
      workspace_id: workspaceId,
      id: comment.id,
      finding_id: findingIdTrimmed,
      author: comment.author,
      text: comment.text,
      created_at: comment.createdAt,
    },
    { onConflict: 'workspace_id,id' },
  )
  if (error) {
    if (isMissingQaTablesError(error.message)) return
    throw error
  }

  await appendCommentToWorkspaceBlob(workspaceId, findingIdTrimmed, comment)
}

/** Remove one comment from the JSON blob for a finding. */
async function removeCommentFromWorkspaceBlob(
  workspaceId: string,
  findingId: string,
  commentId: string,
): Promise<void> {
  const current = await loadWorkspaceQaBlobState(workspaceId)
  let found = false
  const sessions = current.sessions.map((s) => ({
    ...s,
    findings: s.findings.map((f) => {
      if (f.id !== findingId) return f
      const nextComments = f.comments.filter((c) => c.id !== commentId)
      if (nextComments.length === f.comments.length) return f
      found = true
      return { ...f, comments: nextComments }
    }),
  }))
  if (!found) return
  await upsertWorkspaceAppDataJson(
    WORKSPACE_APP_DATA_QA,
    { sessions } as unknown as Record<string, unknown>,
    workspaceId,
  )
}

/** Delete one comment — scoped to workspace + comment id only. */
export async function deleteQaCommentFromSupabase(
  findingId: string,
  commentId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const commentIdTrimmed = commentId.trim()
  if (!commentIdTrimmed) return

  const { error } = await supabase
    .from('qa_comments')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', commentIdTrimmed)
  if (error) {
    if (isMissingQaTablesError(error.message)) return
    throw error
  }

  await removeCommentFromWorkspaceBlob(workspaceId, findingId.trim(), commentIdTrimmed)
}

/** Add one QA page (collection) without wiping existing findings in normalized tables. */
export async function insertQaSessionToSupabase(
  session: QaSession,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const { error: sessionError } = await supabase.from('qa_sessions').upsert(
    {
      workspace_id: workspaceId,
      id: session.id,
      name: session.name,
      created_at: session.createdAt,
    },
    { onConflict: 'workspace_id,id' },
  )
  if (sessionError) {
    if (isMissingQaTablesError(sessionError.message)) return
    throw sessionError
  }

  const current = await loadWorkspaceQaBlobState(workspaceId)
  if (current.sessions.some((s) => s.id === session.id)) return
  const next: QaState = { sessions: [session, ...current.sessions] }
  await upsertWorkspaceAppDataJson(
    WORKSPACE_APP_DATA_QA,
    next as unknown as Record<string, unknown>,
    workspaceId,
  )
}

/**
 * Remove one QA page (collection) from this workspace only.
 * Does not touch other workspaces or other sessions. Child rows are deleted before the session row.
 */
export async function deleteQaSessionFromSupabase(
  sessionId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const sessionIdTrimmed = sessionId.trim()
  if (!sessionIdTrimmed) return

  const { data: findingRows, error: findingsSelectError } = await supabase
    .from('qa_findings')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('session_id', sessionIdTrimmed)
  if (findingsSelectError) {
    if (isMissingQaTablesError(findingsSelectError.message)) return
    throw findingsSelectError
  }

  const findingIds = (findingRows ?? []).map((r) => r.id as string)
  for (const idChunk of chunkArray(findingIds, FINDING_ID_IN_CHUNK)) {
    if (idChunk.length === 0) continue
    const { error: commentsError } = await supabase
      .from('qa_comments')
      .delete()
      .eq('workspace_id', workspaceId)
      .in('finding_id', idChunk)
    if (commentsError) {
      if (isMissingQaTablesError(commentsError.message)) return
      throw commentsError
    }
    const { error: screenshotsError } = await supabase
      .from('qa_screenshots')
      .delete()
      .eq('workspace_id', workspaceId)
      .in('finding_id', idChunk)
    if (screenshotsError) throw screenshotsError
  }

  const { error: findingsDeleteError } = await supabase
    .from('qa_findings')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('session_id', sessionIdTrimmed)
  if (findingsDeleteError) {
    if (isMissingQaTablesError(findingsDeleteError.message)) return
    throw findingsDeleteError
  }

  const { error: sessionError } = await supabase
    .from('qa_sessions')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', sessionIdTrimmed)
  if (sessionError) {
    if (isMissingQaTablesError(sessionError.message)) return
    throw sessionError
  }

  const raw = await fetchWorkspaceAppDataJson(WORKSPACE_APP_DATA_QA, workspaceId)
  const parsed = parseQaStatePayload(raw)
  if (parsed) {
    const next: QaState = {
      sessions: parsed.sessions.filter((s) => s.id !== sessionIdTrimmed),
    }
    await upsertWorkspaceAppDataJson(
      WORKSPACE_APP_DATA_QA,
      next as unknown as Record<string, unknown>,
      workspaceId,
    )
  }
}

function mergeFindingsFromRichestBaseline(target: QaState, baselines: QaState[]): QaState {
  let best: QaState | null = null
  let bestCount = 0
  for (const b of baselines) {
    const c = countQaFindings(b)
    if (c > bestCount) {
      best = b
      bestCount = c
    }
  }
  if (!best || bestCount === 0) return target
  const findingsBySession = new Map(best.sessions.map((s) => [s.id, s.findings]))
  return {
    sessions: target.sessions.map((s) => ({
      ...s,
      findings: findingsBySession.get(s.id) ?? s.findings,
    })),
  }
}

/**
 * If the remote row is empty but this browser still has v1/v2 localStorage QA data,
 * upload once and remove local keys so Supabase becomes the source of truth.
 */
export async function migrateQaLocalStorageToSupabaseOnce(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const remote = await fetchQaStateFromSupabase(workspaceId)
  if (remote.sessions.length > 0) return
  const local = readStoredState(workspaceId)
  if (!local || local.sessions.length === 0) return
  await persistQaStateToSupabase(local, workspaceId)
  try {
    localStorage.removeItem(scopedQaStorageKey(workspaceId))
    if (scopedQaStorageKey(workspaceId) === STORAGE_KEY) {
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
  effort: string
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
      effort: isEffort(f.effort) ? f.effort : 'medium',
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

/**
 * No cross-workspace QA import. Each workspace only uses its own blob, normalized rows,
 * and localStorage backup (see fetchQaStateFromSupabase). Importing another workspace's
 * data caused AE/CRM bleed and destructive overwrites after the Supabase move.
 */
async function recoverEmptyWorkspaceQaFromDatabase(
  _workspaceId: string,
  current: QaState,
): Promise<QaState> {
  return current
}

/** If normalized `qa_comments` / `qa_screenshots` rows are missing or incomplete, fill from last good `workspace_app_data` blob. */
async function mergeCommentsAndScreenshotsFromWorkspaceBlob(
  state: QaState,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<QaState> {
  let raw: unknown
  try {
    raw = await fetchWorkspaceAppDataJson(WORKSPACE_APP_DATA_QA, workspaceId)
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

const QA_FINDINGS_SELECT_WITH_EFFORT =
  'workspace_id, id, session_id, title, description, tags, priority, effort, status, environment, categories, figma_link, ticket_link, assignee, reporter, created_at, updated_at'

const QA_FINDINGS_SELECT_LEGACY =
  'workspace_id, id, session_id, title, description, tags, priority, status, environment, categories, figma_link, ticket_link, assignee, reporter, created_at, updated_at'

async function fetchAllQaFindingRowsForWorkspace(workspaceId: string): Promise<QaFindingRow[]> {
  const runSelect = async (columns: string) => {
    const { data, error } = await supabase
      .from('qa_findings')
      .select(columns)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
    return { data, error }
  }

  let { data, error } = await runSelect(QA_FINDINGS_SELECT_WITH_EFFORT)
  if (error && /effort/i.test(error.message)) {
    const legacy = await runSelect(QA_FINDINGS_SELECT_LEGACY)
    data = legacy.data
    error = legacy.error
  }
  if (error) throw error
  return ((data ?? []) as unknown) as QaFindingRow[]
}

/** Rebuild session rows when findings exist but qa_sessions rows are missing for this workspace. */
async function reconcileQaSessionsWithFindings(
  workspaceId: string,
  sessionRows: QaSessionRow[],
  findings: QaFindingRow[],
): Promise<QaSessionRow[]> {
  if (findings.length === 0) return sessionRows

  const byId = new Map(sessionRows.map((s) => [s.id, s]))
  const missingSessionIds = [...new Set(findings.map((f) => f.session_id).filter(Boolean))].filter(
    (id) => !byId.has(id),
  )
  if (missingSessionIds.length === 0) return sessionRows

  const { data: globalSessionRows, error } = await supabase
    .from('qa_sessions')
    .select('workspace_id, id, name, created_at')
    .in('id', missingSessionIds)

  if (!error && globalSessionRows?.length) {
    for (const row of globalSessionRows as QaSessionRow[]) {
      if (!byId.has(row.id)) {
        byId.set(row.id, {
          workspace_id: workspaceId,
          id: row.id,
          name: row.name,
          created_at: row.created_at,
        })
      }
    }
  }

  for (const sessionId of missingSessionIds) {
    if (byId.has(sessionId)) continue
    const linked = findings.filter((f) => f.session_id === sessionId)
    const oldest = linked.reduce(
      (min, f) => (f.created_at < min ? f.created_at : min),
      linked[0]?.created_at ?? new Date().toISOString(),
    )
    console.warn(
      `[qaStorage] Recovered QA page "${sessionId}" from ${linked.length} finding(s) (session row was missing for workspace ${workspaceId})`,
    )
    byId.set(sessionId, {
      workspace_id: workspaceId,
      id: sessionId,
      name: 'Recovered QA page',
      created_at: oldest,
    })
  }

  return [...byId.values()].sort(compareIsoDescThenIdDesc)
}

async function fetchQaStateFromNormalizedTables(workspaceId: string = getActiveWorkspaceId()): Promise<QaState | null> {
  const { data: sessionRows, error: sessionsError } = await supabase
    .from('qa_sessions')
    .select('workspace_id, id, name, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (sessionsError) {
    if (isMissingQaTablesError(sessionsError.message)) return null
    throw sessionsError
  }

  let findings: QaFindingRow[]
  try {
    findings = await fetchAllQaFindingRowsForWorkspace(workspaceId)
  } catch (findingsError) {
    const message = findingsError instanceof Error ? findingsError.message : String(findingsError)
    if (isMissingQaTablesError(message)) return null
    throw findingsError
  }

  const sessions = await reconcileQaSessionsWithFindings(
    workspaceId,
    (sessionRows ?? []) as QaSessionRow[],
    findings,
  )

  if (sessions.length === 0 && findings.length === 0) return { sessions: [] }

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

async function persistQaStateToNormalizedTables(
  state: QaState,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
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
      effort: f.effort,
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

  // Full replace for findings/sessions/screenshots. Comments are never bulk-deleted; stash before finding replace.
  const { data: stashedCommentRows, error: stashCommentsError } = await supabase
    .from('qa_comments')
    .select('workspace_id, id, finding_id, author, text, created_at')
    .eq('workspace_id', workspaceId)
  if (stashCommentsError) {
    if (isMissingQaTablesError(stashCommentsError.message)) return
    throw stashCommentsError
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
    let { error } = await supabase.from('qa_findings').insert(findingsPayload)
    if (error && /effort/i.test(error.message)) {
      const legacy = findingsPayload.map(({ effort: _effort, ...row }) => row)
      ;({ error } = await supabase.from('qa_findings').insert(legacy))
    }
    if (error) throw error
  }
  if (commentsPayload.length > 0 || (stashedCommentRows?.length ?? 0) > 0) {
    const validFindingIds = new Set(findingsPayload.map((f) => f.id))
    const commentRowById = new Map<
      string,
      {
        workspace_id: string
        id: string
        finding_id: string
        author: string
        text: string
        created_at: string
      }
    >()
    for (const row of stashedCommentRows ?? []) {
      const findingId = row.finding_id as string
      if (!validFindingIds.has(findingId)) continue
      commentRowById.set(row.id as string, {
        workspace_id: workspaceId,
        id: row.id as string,
        finding_id: findingId,
        author: row.author as string,
        text: row.text as string,
        created_at: row.created_at as string,
      })
    }
    for (const row of commentsPayload) {
      commentRowById.set(row.id, row)
    }
    const mergedComments = [...commentRowById.values()]
    const commentChunks = chunkRowsByEstimatedJsonSize(
      mergedComments,
      (row) => (row.text?.length ?? 0) + (row.author?.length ?? 0) + 256,
      MAX_COMMENT_INSERT_PAYLOAD_CHARS,
    )
    for (const chunk of commentChunks) {
      const { error } = await supabase.from('qa_comments').upsert(chunk, { onConflict: 'workspace_id,id' })
      if (error) throw error
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
