import {
  WORKSPACE_APP_DATA_PRODUCT_STANDUP,
  fetchWorkspaceAppDataJson,
  upsertWorkspaceAppDataJson,
} from '@/lib/workspaceAppData'
import { DEFAULT_WORKSPACE_ID, getActiveWorkspaceId } from '@/lib/workspaces'

const STORAGE_KEY = 'docHub-product-standup-v1'

function scopedStorageKeyFor(workspaceId: string): string {
  return workspaceId === DEFAULT_WORKSPACE_ID ? STORAGE_KEY : `${STORAGE_KEY}:${workspaceId}`
}

export const PRODUCT_TEAMS = ['Product', 'UX', 'Engineering'] as const
export type ProductTeam = (typeof PRODUCT_TEAMS)[number]

export type ProductMember = {
  id: string
  name: string
  /** Discipline / squad for standups and roster */
  team: ProductTeam
}

export type StandupSubmission = {
  id: string
  memberId: string
  /** Local calendar day YYYY-MM-DD */
  dateKey: string
  yesterday: string
  today: string
  blockers: string
  createdAt: string
}

export type ProductStandupState = {
  members: ProductMember[]
  submissions: StandupSubmission[]
}

export function defaultProductStandupState(): ProductStandupState {
  return { members: [], submissions: [] }
}

function parseProductTeam(value: unknown): ProductTeam {
  if (value === 'Product' || value === 'UX' || value === 'Engineering') return value
  return 'Product'
}

export function parseProductStandupPayload(parsed: unknown): ProductStandupState | null {
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  const members = Array.isArray(o.members) ? o.members : []
  const submissions = Array.isArray(o.submissions) ? o.submissions : []
  return {
    members: members
      .filter(
        (m): m is Record<string, unknown> =>
          !!m && typeof m === 'object' && typeof (m as ProductMember).id === 'string' && typeof (m as ProductMember).name === 'string',
      )
      .map((m) => ({
        id: m.id as string,
        name: m.name as string,
        team: parseProductTeam(m.team),
      })),
    submissions: submissions
      .filter(
        (s): s is Record<string, unknown> =>
          !!s && typeof s === 'object' && typeof (s as StandupSubmission).id === 'string',
      )
      .map((raw) => {
        const s = raw as Record<string, unknown>
        const yesterday = typeof s.yesterday === 'string' ? s.yesterday : ''
        const today = typeof s.today === 'string' ? s.today : ''
        const blockers = typeof s.blockers === 'string' ? s.blockers : ''
        const createdAt = typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString()
        if (typeof s.memberId !== 'string' || typeof s.dateKey !== 'string') return null
        return {
          id: s.id as string,
          memberId: s.memberId,
          dateKey: s.dateKey,
          yesterday,
          today,
          blockers,
          createdAt,
        } as StandupSubmission
      })
      .filter((s): s is StandupSubmission => s !== null),
  }
}

function readProductStandupFromLocalStorage(workspaceId: string): ProductStandupState | null {
  try {
    const raw = localStorage.getItem(scopedStorageKeyFor(workspaceId))
    if (!raw) return null
    return parseProductStandupPayload(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

/** Load from local backup for a specific workspace (defaults to active workspace). */
export function loadProductStandupState(workspaceId: string = getActiveWorkspaceId()): ProductStandupState {
  return readProductStandupFromLocalStorage(workspaceId) ?? defaultProductStandupState()
}

export function saveProductStandupState(
  state: ProductStandupState,
  workspaceId: string = getActiveWorkspaceId(),
) {
  try {
    localStorage.setItem(scopedStorageKeyFor(workspaceId), JSON.stringify(state))
  } catch {
    /* ignore quota */
  }
}

/** Non-null only if this browser has a saved standup blob for the given workspace. */
export function peekProductStandupLocalBackup(workspaceId: string = getActiveWorkspaceId()): ProductStandupState | null {
  return readProductStandupFromLocalStorage(workspaceId)
}

function isStandupNonEmpty(s: ProductStandupState | null | undefined): boolean {
  return !!(s && (s.members.length > 0 || s.submissions.length > 0))
}

/**
 * Load standup for `workspaceId` (defaults to active workspace).
 * If Supabase has no row or an empty payload but this browser has a non-empty backup for that
 * workspace, the backup is used.
 */
export async function fetchProductStandupFromSupabase(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<ProductStandupState> {
  const local = readProductStandupFromLocalStorage(workspaceId)
  const localRich = isStandupNonEmpty(local)

  try {
    const raw = await fetchWorkspaceAppDataJson(WORKSPACE_APP_DATA_PRODUCT_STANDUP, workspaceId)

    if (raw === null) {
      return localRich && local ? local : defaultProductStandupState()
    }

    const parsed = parseProductStandupPayload(raw)
    if (!parsed) {
      return localRich && local ? local : defaultProductStandupState()
    }

    if (isStandupNonEmpty(parsed)) {
      return parsed
    }

    if (localRich && local) {
      return local
    }

    return parsed
  } catch {
    return localRich && local ? local : defaultProductStandupState()
  }
}

export async function persistProductStandupToSupabase(
  state: ProductStandupState,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  await upsertWorkspaceAppDataJson(
    WORKSPACE_APP_DATA_PRODUCT_STANDUP,
    state as unknown as Record<string, unknown>,
    workspaceId,
  )
}

export async function migrateProductStandupLocalToSupabaseOnce(): Promise<void> {
  const id = getActiveWorkspaceId()
  const remote = await fetchProductStandupFromSupabase(id)
  if (remote.members.length > 0 || remote.submissions.length > 0) return
  const local = readProductStandupFromLocalStorage(id)
  if (!local || (local.members.length === 0 && local.submissions.length === 0)) return
  await persistProductStandupToSupabase(local, id)
  try {
    localStorage.removeItem(scopedStorageKeyFor(id))
  } catch {
    /* ignore */
  }
}

export function dateKeyFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
