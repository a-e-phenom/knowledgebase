import {
  WORKSPACE_APP_DATA_PRODUCT_STANDUP,
  fetchWorkspaceAppDataJson,
  upsertWorkspaceAppDataJson,
} from '@/lib/workspaceAppData'
import { DEFAULT_WORKSPACE_ID, getActiveWorkspaceId } from '@/lib/workspaces'

const STORAGE_KEY = 'docHub-product-standup-v1'

function scopedStorageKey(): string {
  const workspaceId = getActiveWorkspaceId()
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

function readProductStandupFromLocalStorage(): ProductStandupState | null {
  try {
    const raw = localStorage.getItem(scopedStorageKey())
    if (!raw) return null
    return parseProductStandupPayload(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function loadProductStandupState(): ProductStandupState {
  return readProductStandupFromLocalStorage() ?? defaultProductStandupState()
}

export function saveProductStandupState(state: ProductStandupState) {
  try {
    localStorage.setItem(scopedStorageKey(), JSON.stringify(state))
  } catch {
    /* ignore quota */
  }
}

export async function fetchProductStandupFromSupabase(): Promise<ProductStandupState> {
  try {
    const raw = await fetchWorkspaceAppDataJson(WORKSPACE_APP_DATA_PRODUCT_STANDUP)
    const parsed = parseProductStandupPayload(raw)
    if (parsed) return parsed
  } catch {
    /* network / RLS / missing table — fall back to browser cache */
  }
  return readProductStandupFromLocalStorage() ?? defaultProductStandupState()
}

export async function persistProductStandupToSupabase(state: ProductStandupState): Promise<void> {
  await upsertWorkspaceAppDataJson(
    WORKSPACE_APP_DATA_PRODUCT_STANDUP,
    state as unknown as Record<string, unknown>,
  )
}

export async function migrateProductStandupLocalToSupabaseOnce(): Promise<void> {
  const remote = await fetchProductStandupFromSupabase()
  if (remote.members.length > 0 || remote.submissions.length > 0) return
  const local = readProductStandupFromLocalStorage()
  if (!local || (local.members.length === 0 && local.submissions.length === 0)) return
  await persistProductStandupToSupabase(local)
  try {
    localStorage.removeItem(scopedStorageKey())
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
