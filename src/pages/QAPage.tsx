import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import { Link, Navigate, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { AppHeader } from '@/components/AppHeader'
import { BlockEditor } from '@/components/BlockEditor'
import { Badge, badgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  defaultQaState,
  saveQaState,
  readStoredState,
  fetchQaStateFromSupabase,
  persistQaStateToSupabase,
  newId,
  normalizeTag,
  compressImageFileToDataUrl,
  qaDescriptionAsEditorHtml,
  qaFindingBodyPlain,
  qaScreenshotLimits,
  QA_ENVIRONMENTS,
  QA_CATEGORIES,
  QA_EFFORTS,
  QA_STATUSES,
  qaStatusLabel,
  type QaCategory,
  type QaComment,
  type QaEffort,
  type QaEnvironment,
  type QaFinding,
  type QaPriority,
  type QaScreenshot,
  type QaSession,
  type QaState,
  type QaStatus,
} from '@/lib/qaStorage'
import { CategoryRow } from '@/lib/qaCategoryUi'
import type { AppShellOutletContext } from '@/components/AppShell'
import { pathForWorkspace } from '@/lib/workspaces'
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  CircleDot,
  Clock,
  Flag,
  Gauge,
  Globe,
  Hash,
  ImagePlus,
  Layers,
  LayoutGrid,
  Link2,
  MessageSquare,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Ticket,
  Trash2,
  User,
  UserCircle,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const LAST_AUTHOR_KEY = 'docHub-qa-last-comment-author'

/** Filter key for findings with no assignee */
const UNASSIGNED = '__unassigned__'

/** Filter key for findings with no reporter set */
const NO_REPORTER = '__no_reporter__'

/** Slightly rounded chips on finding cards (override badge `rounded-full`). */
const cardChipRounded = 'rounded-md'

/** Borderless field styling for Notion-like property values in the finding dialog. */
const notionModalValueInput =
  'h-7 w-full rounded-md border-0 bg-transparent px-1.5 py-0 text-sm shadow-none outline-none transition-colors placeholder:text-muted-foreground/55 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-0'

const notionModalPropControl =
  'flex h-7 w-full max-w-lg items-center rounded-md px-1.5 py-0 text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function formatNotionDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message || fallback
  if (typeof error === 'string') return error || fallback
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>
    const message = typeof obj.message === 'string' ? obj.message : ''
    const details = typeof obj.details === 'string' ? obj.details : ''
    const hint = typeof obj.hint === 'string' ? obj.hint : ''
    const combined = [message, details, hint].filter(Boolean).join(' - ')
    if (combined) return combined
  }
  return fallback
}

function NotionEmpty() {
  return <span className="text-sm text-muted-foreground/80">+ Add</span>
}

function NotionPropRow({
  icon: Icon,
  label,
  children,
  dense,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  children: ReactNode
  /** Tighter row height for the finding dialog property list. */
  dense?: boolean
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 items-start sm:grid-cols-[minmax(0,11.25rem)_minmax(0,1fr)] sm:items-center',
        dense ? 'gap-0 py-0 sm:gap-x-3' : 'gap-0.5 py-0 sm:gap-x-4',
      )}
    >
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0 opacity-85" aria-hidden />
        <span>{label}</span>
      </div>
      <div className={cn('min-w-0 pl-7 sm:pl-0', dense ? 'text-[13px] leading-snug' : 'text-sm')}>{children}</div>
    </div>
  )
}

type FindingInlinePatch = Partial<
  Pick<
    QaFinding,
    | 'status'
    | 'priority'
    | 'effort'
    | 'environment'
    | 'categories'
    | 'assignee'
    | 'tags'
    | 'title'
    | 'description'
    | 'screenshots'
    | 'figmaLink'
    | 'ticketLink'
    | 'reporter'
  >
>

function loadLastAuthor(): string {
  try {
    return localStorage.getItem(LAST_AUTHOR_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveLastAuthor(name: string) {
  try {
    localStorage.setItem(LAST_AUTHOR_KEY, name)
  } catch {
    /* ignore */
  }
}

function normalizeLink(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

/** Filled circle color for status chips (chip itself is white + gray outline). */
function statusDotClass(s: QaStatus): string {
  switch (s) {
    case 'not_started':
      return 'bg-neutral-400 dark:bg-neutral-500'
    case 'in_progress':
      return 'bg-indigo-600 dark:bg-indigo-500'
    case 'blocked':
      return 'bg-red-500'
    case 'solved':
      return 'bg-emerald-600 dark:bg-emerald-500'
    default:
      return 'bg-muted-foreground'
  }
}

function StatusRow({ status }: { status: QaStatus }) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDotClass(status))} aria-hidden />
      <span>{qaStatusLabel(status)}</span>
    </span>
  )
}

function CategorySelectionPreview({ categories }: { categories: QaCategory[] }) {
  if (categories.length === 0) return <NotionEmpty />
  const [first, ...rest] = categories
  if (!first) return <NotionEmpty />
  return (
    <span className="flex min-w-0 items-center gap-2">
      <CategoryRow category={first} />
      {rest.length > 0 ? <span className="shrink-0 text-xs text-muted-foreground">+{rest.length}</span> : null}
    </span>
  )
}

/** Three ascending bars for card chips: low (1 green), medium (2 orange), high/critical (3 red). */
function QaCardLevelBars({ level }: { level: 'low' | 'medium' | 'high' | 'critical' }) {
  const inactive = 'bg-neutral-200 dark:bg-neutral-600'
  const nActive = level === 'low' ? 1 : level === 'medium' ? 2 : 3
  const activeClass =
    level === 'low'
      ? 'bg-emerald-500 dark:bg-emerald-400'
      : level === 'medium'
        ? 'bg-orange-500 dark:bg-orange-400'
        : level === 'critical'
          ? 'bg-red-600 dark:bg-red-500'
          : 'bg-red-500 dark:bg-red-400'

  return (
    <span className="inline-flex h-3 shrink-0 items-end gap-px" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'w-[3px] rounded-sm',
            i === 0 && 'h-1',
            i === 1 && 'h-2',
            i === 2 && 'h-3',
            i < nActive ? activeClass : inactive,
          )}
        />
      ))}
    </span>
  )
}

function qaMatrixHighPriority(p: QaPriority): boolean {
  return p === 'high' || p === 'critical'
}

function qaMatrixHighEffort(e: QaEffort): boolean {
  return e === 'medium' || e === 'high'
}

function PrioritizationQuadrant({
  title,
  hint,
  findings,
  onPickFinding,
  accent,
}: {
  title: string
  hint: string
  findings: QaFinding[]
  onPickFinding: (f: QaFinding) => void
  accent: 'emerald' | 'amber' | 'slate' | 'rose'
}) {
  const shell = {
    emerald: 'border-emerald-500/25 bg-emerald-500/[0.06]',
    amber: 'border-amber-500/25 bg-amber-500/[0.06]',
    slate: 'border-border bg-muted/40',
    rose: 'border-rose-500/25 bg-rose-500/[0.06]',
  }[accent]

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border p-2.5 sm:p-3',
        shell,
      )}
    >
      <div className="mb-1.5 shrink-0">
        <p className="text-xs font-semibold leading-tight text-foreground">{title}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
        {findings.length === 0 ? (
          <li className="text-[11px] text-muted-foreground">No items</li>
        ) : (
          findings.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className="w-full truncate rounded px-1 py-0.5 text-left text-[11px] text-foreground transition-colors hover:bg-background/80"
                title={f.title}
                onClick={() => onPickFinding(f)}
              >
                {f.title}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

/** e.g. `4 May, 17:15` for card footers */
function formatReportedFooterTime(iso: string) {
  try {
    const d = new Date(iso)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
    const mon = months[d.getMonth()] ?? ''
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return `${d.getDate()} ${mon}, ${hm}`
  } catch {
    return ''
  }
}

function FindingTagsPopover({
  tags,
  tagPool,
  onSetTags,
  appearance = 'chip',
  dense,
}: {
  tags: string[]
  tagPool: string[]
  onSetTags: (next: string[]) => void
  appearance?: 'chip' | 'notion'
  /** Shorter trigger row (finding dialog). */
  dense?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')

  const suggestions = useMemo(
    () => tagPool.filter((t) => !tags.includes(t)).sort((a, b) => a.localeCompare(b)),
    [tagPool, tags],
  )

  const addNormalized = (raw: string) => {
    const t = normalizeTag(raw)
    if (!t || tags.includes(t)) return
    onSetTags([...tags, t])
    setInput('')
  }

  const triggerClass =
    appearance === 'notion'
      ? dense
        ? 'flex min-h-7 w-full max-w-full flex-wrap items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-[13px] leading-snug transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        : 'flex min-h-9 w-full max-w-full flex-wrap items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      : 'group flex max-w-full flex-wrap items-center gap-1.5 rounded-md border border-dashed border-transparent px-0.5 py-0.5 text-left transition-colors hover:border-border hover:bg-muted/30'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" onClick={(e) => e.stopPropagation()} className={triggerClass}>
          {appearance === 'notion' ? (
            tags.length === 0 ? (
              <NotionEmpty />
            ) : (
              tags.map((t) => (
                <span key={t} className={cn(badgeVariants({ variant: 'outline' }), cardChipRounded, 'font-normal')}>
                  {t}
                </span>
              ))
            )
          ) : tags.length === 0 ? (
            <span
              className={cn(badgeVariants({ variant: 'outline' }), cardChipRounded, 'text-muted-foreground')}
            >
              Tags…
            </span>
          ) : (
            tags.map((t) => (
              <span key={t} className={cn(badgeVariants({ variant: 'outline' }), cardChipRounded, 'font-normal')}>
                {t}
              </span>
            ))
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Edit tags for this finding</p>
        {tags.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1 pr-1 font-normal">
                {t}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-background/80"
                  aria-label={`Remove ${t}`}
                  onClick={() => onSetTags(tags.filter((x) => x !== t))}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}
        {suggestions.length > 0 ? (
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Add from this QA page</p>
            <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
              {suggestions.map((t) => (
                <Button key={t} type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => addNormalized(t)}>
                  + {t}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex gap-2">
          <Input
            placeholder="New tag…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addNormalized(input))}
            className="h-8"
          />
          <Button type="button" size="sm" className="h-8 shrink-0" onClick={() => addNormalized(input)}>
            Add
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function FindingAssigneePopover({
  assignee,
  suggestions,
  onSet,
  appearance = 'chip',
  dense,
}: {
  assignee: string
  suggestions: string[]
  onSet: (value: string) => void
  appearance?: 'chip' | 'notion'
  dense?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(assignee)

  useEffect(() => {
    if (open) setDraft(assignee)
  }, [open, assignee])

  const apply = () => {
    onSet(draft.trim())
    setOpen(false)
  }

  const picks = suggestions.filter((n) => n !== assignee.trim())
  const trimmed = assignee.trim()
  const initial = trimmed ? trimmed.slice(0, 1).toUpperCase() : ''

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={
            appearance === 'notion'
              ? dense
                ? 'flex h-7 w-full max-w-full items-center gap-1.5 rounded-md px-1.5 py-0 text-left text-[13px] leading-snug transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                : 'flex min-h-9 w-full max-w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              : cn(
                  badgeVariants({ variant: 'secondary' }),
                  cardChipRounded,
                  'inline-flex h-auto max-w-[11rem] cursor-pointer items-center gap-1 truncate border px-2 py-0.5 text-xs font-normal transition-opacity hover:opacity-90',
                )
          }
        >
          {appearance === 'notion' ? (
            trimmed ? (
              <>
                <span
                  className={cn(
                    'flex shrink-0 items-center justify-center rounded-full bg-violet-600 font-semibold text-white',
                    dense ? 'h-6 w-6 text-[10px]' : 'h-7 w-7 text-xs',
                  )}
                >
                  {initial}
                </span>
                <span className="min-w-0 truncate text-foreground">{trimmed}</span>
              </>
            ) : (
              <NotionEmpty />
            )
          ) : (
            <>
              <User className="h-3 w-3 shrink-0 opacity-70" />
              <span className="truncate">{trimmed || 'No assignee'}</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Assignee</p>
        {picks.length > 0 ? (
          <div className="mb-3 flex max-h-28 flex-wrap gap-1 overflow-y-auto">
            {picks.map((name) => (
              <Button
                key={name}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  onSet(name)
                  setOpen(false)
                }}
              >
                {name}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="space-y-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Name" className="h-8" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), apply())} />
          <div className="flex gap-2">
            <Button type="button" size="sm" className="h-8" onClick={apply}>
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => {
                onSet('')
                setOpen(false)
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function QAPage() {
  const params = useParams<{ sessionId?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { activeWorkspace, workspaceRouteReady } = useOutletContext<AppShellOutletContext>()

  const qaListPath = useMemo(() => pathForWorkspace('/qa', activeWorkspace), [activeWorkspace])
  const qaSessionPath = useCallback(
    (sessionId: string) => pathForWorkspace(`/qa/${sessionId}`, activeWorkspace),
    [activeWorkspace],
  )

  /** Prefer params; also parse pathname so `/qa/:id` and `/<slug>/qa/:id` work. */
  const sessionIdParam = useMemo(() => {
    const safeDecode = (s: string) => {
      try {
        return decodeURIComponent(s)
      } catch {
        return s
      }
    }
    const fromParams = params.sessionId?.trim()
    if (fromParams) return safeDecode(fromParams)
    const m = /\/qa\/([^/]+)\/?$/.exec(location.pathname)
    return m?.[1] ? safeDecode(m[1]) : undefined
  }, [params.sessionId, location.pathname])

  const [state, setState] = useState<QaState>(() => defaultQaState())
  const [qaRemoteReady, setQaRemoteReady] = useState(false)
  const remoteSaveEnabledRef = useRef(true)

  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [sessionName, setSessionName] = useState('')
  const [renameSessionDialogOpen, setRenameSessionDialogOpen] = useState(false)
  const [renameSessionName, setRenameSessionName] = useState('')

  const [findingDialogOpen, setFindingDialogOpen] = useState(false)
  const [editingFindingId, setEditingFindingId] = useState<string | null>(null)
  const [findingTitle, setFindingTitle] = useState('')
  const [findingDocHtml, setFindingDocHtml] = useState('')
  const [findingPriority, setFindingPriority] = useState<QaPriority>('medium')
  const [findingEffort, setFindingEffort] = useState<QaEffort>('medium')
  const [findingStatus, setFindingStatus] = useState<QaStatus>('not_started')
  const [findingEnvironment, setFindingEnvironment] = useState<QaEnvironment>('STG')
  const [findingCategories, setFindingCategories] = useState<QaCategory[]>(['bugs'])
  const [findingTags, setFindingTags] = useState<string[]>([])
  const [findingAssignee, setFindingAssignee] = useState('')
  const [findingReporter, setFindingReporter] = useState('')
  const [findingFigmaLink, setFindingFigmaLink] = useState('')
  const [findingTicketLink, setFindingTicketLink] = useState('')
  const [findingScreenshots, setFindingScreenshots] = useState<QaScreenshot[]>([])
  const [screenshotBusy, setScreenshotBusy] = useState(false)
  const [screenshotLightbox, setScreenshotLightbox] = useState<{ dataUrl: string; name: string } | null>(null)

  const [commentAuthor, setCommentAuthor] = useState(() => loadLastAuthor())
  const [commentText, setCommentText] = useState('')
  const [commentComposeOpen, setCommentComposeOpen] = useState(false)

  const [sessionToDelete, setSessionToDelete] = useState<QaSession | null>(null)
  const [findingToDelete, setFindingToDelete] = useState<{ sessionId: string; findingId: string } | null>(null)
  const [prioritizationSchemeOpen, setPrioritizationSchemeOpen] = useState(false)

  const [docModalTitle, setDocModalTitle] = useState('')
  const [docModalHtml, setDocModalHtml] = useState('')
  const documentFindingIdRef = useRef<string | null>(null)
  const docDraftTitleRef = useRef('')
  const docDraftHtmlRef = useRef('')
  const docSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docTitleRef = useRef<HTMLTextAreaElement>(null)

  const [filterSearch, setFilterSearch] = useState('')
  const [filterStatuses, setFilterStatuses] = useState<QaStatus[]>([])
  const [filterPriorities, setFilterPriorities] = useState<QaPriority[]>([])
  const [filterAssignees, setFilterAssignees] = useState<string[]>([])
  const [filterReporters, setFilterReporters] = useState<string[]>([])
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [filterEnvironments, setFilterEnvironments] = useState<QaEnvironment[]>([])
  const [filterCategories, setFilterCategories] = useState<QaCategory[]>([])
  const skipNextAutosaveRef = useRef(true)
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve())
  /** Supabase scope for this page instance (never follow global id changes mid-unmount). */
  const qaWorkspaceScopeRef = useRef<string | null>(null)

  const enqueueQaPersist = useCallback(
    (nextState: QaState) => {
      if (!qaRemoteReady) return
      const wsId = qaWorkspaceScopeRef.current
      if (!wsId) return
      if (!remoteSaveEnabledRef.current) {
        saveQaState(nextState, wsId)
        return
      }

      persistQueueRef.current = persistQueueRef.current
        .catch(() => {
          // Keep queue alive after a failed persist.
        })
        .then(async () => {
          try {
            await persistQaStateToSupabase(nextState, wsId)
            saveQaState(nextState, wsId)
          } catch (err) {
            const msg = describeError(err, 'Unknown error')
            toast.error('QA sync failed', { description: msg })
            saveQaState(nextState, wsId)
          }
        })
    },
    [qaRemoteReady],
  )

  useEffect(() => {
    if (!workspaceRouteReady || !activeWorkspace) {
      setQaRemoteReady(false)
      setState(defaultQaState())
      qaWorkspaceScopeRef.current = null
      return
    }
    const scopeId = activeWorkspace.id
    qaWorkspaceScopeRef.current = scopeId
    setQaRemoteReady(false)
    skipNextAutosaveRef.current = true
    let cancelled = false
    void (async () => {
      try {
        const s = await fetchQaStateFromSupabase(scopeId)
        if (!cancelled) {
          setState(s)
          saveQaState(s, scopeId)
          remoteSaveEnabledRef.current = true
        }
      } catch (e) {
        const msg = describeError(e, 'Unknown error')
        toast.error('Could not load QA from workspace', { description: msg })
        if (!cancelled) {
          const local = readStoredState(scopeId)
          setState(local && local.sessions.length > 0 ? local : defaultQaState())
          remoteSaveEnabledRef.current = false
        }
      } finally {
        if (!cancelled) setQaRemoteReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceRouteReady, activeWorkspace?.id])

  useEffect(() => {
    if (!qaRemoteReady) return
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false
      return
    }
    const t = window.setTimeout(() => {
      enqueueQaPersist(state)
    }, 500)
    return () => window.clearTimeout(t)
  }, [state, qaRemoteReady, enqueueQaPersist])

  useEffect(() => {
    setFilterSearch('')
    setFilterStatuses([])
    setFilterPriorities([])
    setFilterAssignees([])
    setFilterReporters([])
    setFilterTags([])
    setFilterEnvironments([])
    setFilterCategories([])
    if (docSaveTimerRef.current) {
      window.clearTimeout(docSaveTimerRef.current)
      docSaveTimerRef.current = null
    }
    setFindingDialogOpen(false)
    setEditingFindingId(null)
    documentFindingIdRef.current = null
  }, [sessionIdParam])

  const activeSession = useMemo(
    () => (sessionIdParam ? state.sessions.find((s) => s.id === sessionIdParam) ?? null : null),
    [state.sessions, sessionIdParam],
  )

  const modalFinding = useMemo(() => {
    if (!activeSession || !editingFindingId || !findingDialogOpen) return null
    return activeSession.findings.find((f) => f.id === editingFindingId) ?? null
  }, [activeSession, editingFindingId, findingDialogOpen])

  const assigneeFilterOptions = useMemo(() => {
    if (!activeSession) return []
    const names = new Set<string>()
    for (const f of activeSession.findings) {
      const a = f.assignee.trim()
      if (a) names.add(a)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [activeSession])

  const hasUnassignedFindings = useMemo(
    () => !!activeSession?.findings.some((f) => !f.assignee.trim()),
    [activeSession],
  )

  const reporterFilterOptions = useMemo(() => {
    if (!activeSession) return []
    const names = new Set<string>()
    for (const f of activeSession.findings) {
      const r = (f.reporter ?? '').trim()
      if (r) names.add(r)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [activeSession])

  const hasNoReporterFindings = useMemo(
    () => !!activeSession?.findings.some((f) => !(f.reporter ?? '').trim()),
    [activeSession],
  )

  const tagFilterOptions = useMemo(() => {
    if (!activeSession) return []
    const tags = new Set<string>()
    for (const f of activeSession.findings) {
      f.tags.forEach((t) => tags.add(t))
    }
    return [...tags].sort((a, b) => a.localeCompare(b))
  }, [activeSession])

  const filteredFindings = useMemo(() => {
    if (!activeSession) return []
    const q = filterSearch.trim().toLowerCase()
    return activeSession.findings.filter((f) => {
      if (q) {
        const hay =
          `${f.title}\n${qaFindingBodyPlain(f.description)}\n${f.environment}\n${f.categories.join('\n')}\n${f.assignee}\n${f.reporter ?? ''}\n${f.tags.join('\n')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filterStatuses.length > 0 && !filterStatuses.includes(f.status)) return false
      if (filterPriorities.length > 0 && !filterPriorities.includes(f.priority)) return false
      if (filterAssignees.length > 0) {
        const key = f.assignee.trim() || UNASSIGNED
        if (!filterAssignees.includes(key)) return false
      }
      if (filterReporters.length > 0) {
        const key = (f.reporter ?? '').trim() || NO_REPORTER
        if (!filterReporters.includes(key)) return false
      }
      if (filterTags.length > 0) {
        const any = filterTags.some((t) => f.tags.includes(t))
        if (!any) return false
      }
      if (filterEnvironments.length > 0 && !filterEnvironments.includes(f.environment)) return false
      if (filterCategories.length > 0 && !f.categories.some((c) => filterCategories.includes(c))) return false
      return true
    })
  }, [
    activeSession,
    filterSearch,
    filterStatuses,
    filterPriorities,
    filterAssignees,
    filterReporters,
    filterTags,
    filterEnvironments,
    filterCategories,
  ])

  const prioritizationBuckets = useMemo(() => {
    const quickWins: QaFinding[] = []
    const strategic: QaFinding[] = []
    const fillIn: QaFinding[] = []
    const reconsider: QaFinding[] = []
    if (!activeSession) {
      return { quickWins, strategic, fillIn, reconsider }
    }
    for (const f of activeSession.findings) {
      const hiP = qaMatrixHighPriority(f.priority)
      const hiE = qaMatrixHighEffort(f.effort)
      if (hiP && !hiE) quickWins.push(f)
      else if (hiP && hiE) strategic.push(f)
      else if (!hiP && !hiE) fillIn.push(f)
      else reconsider.push(f)
    }
    return { quickWins, strategic, fillIn, reconsider }
  }, [activeSession])

  const patchFinding = useCallback(
    (findingId: string, patch: FindingInlinePatch) => {
      if (!sessionIdParam) return
      const now = new Date().toISOString()
      setState((prev) => ({
        ...prev,
        sessions: prev.sessions.map((s) => {
          if (s.id !== sessionIdParam) return s
          return {
            ...s,
            findings: s.findings.map((f) => (f.id === findingId ? { ...f, ...patch, updatedAt: now } : f)),
          }
        }),
      }))
    },
    [sessionIdParam],
  )

  const resizeDocTitle = useCallback(() => {
    const el = docTitleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => {
    resizeDocTitle()
  }, [docModalTitle, resizeDocTitle, findingDialogOpen, editingFindingId])

  const scheduleDocSave = useCallback(() => {
    const id = documentFindingIdRef.current
    if (!id) return
    if (docSaveTimerRef.current) window.clearTimeout(docSaveTimerRef.current)
    docSaveTimerRef.current = window.setTimeout(() => {
      patchFinding(id, {
        title: docDraftTitleRef.current.trim(),
        description: docDraftHtmlRef.current,
      })
    }, 550)
  }, [patchFinding])

  const flushDocDraftOnly = useCallback(() => {
    if (docSaveTimerRef.current) {
      window.clearTimeout(docSaveTimerRef.current)
      docSaveTimerRef.current = null
    }
    const id = documentFindingIdRef.current
    if (id) {
      patchFinding(id, {
        title: docDraftTitleRef.current.trim(),
        description: docDraftHtmlRef.current,
      })
    }
  }, [patchFinding])

  const closeFindingModal = useCallback(() => {
    flushDocDraftOnly()
    setFindingDialogOpen(false)
    setEditingFindingId(null)
    documentFindingIdRef.current = null
    setCommentComposeOpen(false)
  }, [flushDocDraftOnly])

  const openFindingModal = useCallback(
    (f: QaFinding) => {
      const prev = documentFindingIdRef.current
      if (prev) {
        if (docSaveTimerRef.current) {
          window.clearTimeout(docSaveTimerRef.current)
          docSaveTimerRef.current = null
        }
        patchFinding(prev, {
          title: docDraftTitleRef.current.trim(),
          description: docDraftHtmlRef.current,
        })
      }
      const html = qaDescriptionAsEditorHtml(f.description)
      documentFindingIdRef.current = f.id
      docDraftTitleRef.current = f.title
      docDraftHtmlRef.current = html
      setEditingFindingId(f.id)
      setDocModalTitle(f.title)
      setDocModalHtml(html)
      setCommentComposeOpen(false)
      setFindingDialogOpen(true)
    },
    [patchFinding],
  )

  const openNewFindingModal = useCallback(() => {
    if (!sessionIdParam) return
    flushDocDraftOnly()
    documentFindingIdRef.current = null
    if (docSaveTimerRef.current) {
      window.clearTimeout(docSaveTimerRef.current)
      docSaveTimerRef.current = null
    }
    setEditingFindingId(null)
    setFindingTitle('')
    setFindingDocHtml('')
    setFindingPriority('medium')
    setFindingEffort('medium')
    setFindingStatus('not_started')
    setFindingEnvironment('STG')
    setFindingCategories(['bugs'])
    setFindingTags([])
    setFindingAssignee('')
    setFindingReporter('')
    setFindingFigmaLink('')
    setFindingTicketLink('')
    setFindingScreenshots([])
    setCommentComposeOpen(false)
    setFindingDialogOpen(true)
  }, [flushDocDraftOnly, sessionIdParam])

  useEffect(() => {
    if (!sessionIdParam) setPrioritizationSchemeOpen(false)
  }, [sessionIdParam])

  const filtersActive = useMemo(() => {
    return (
      filterSearch.trim().length > 0 ||
      filterStatuses.length > 0 ||
      filterPriorities.length > 0 ||
      filterAssignees.length > 0 ||
      filterReporters.length > 0 ||
      filterTags.length > 0 ||
      filterEnvironments.length > 0 ||
      filterCategories.length > 0
    )
  }, [
    filterSearch,
    filterStatuses,
    filterPriorities,
    filterAssignees,
    filterReporters,
    filterTags,
    filterEnvironments,
    filterCategories,
  ])

  const clearFilters = () => {
    setFilterSearch('')
    setFilterStatuses([])
    setFilterPriorities([])
    setFilterAssignees([])
    setFilterReporters([])
    setFilterTags([])
    setFilterEnvironments([])
    setFilterCategories([])
  }

  const openNewSession = () => {
    setSessionName('')
    setSessionDialogOpen(true)
  }

  const openRenameSessionDialog = () => {
    if (!activeSession) return
    setRenameSessionName(activeSession.name)
    setRenameSessionDialogOpen(true)
  }

  const createSession = () => {
    const name = sessionName.trim()
    if (!name) {
      toast.error('Enter a name for this QA page')
      return
    }
    const id = newId()
    const createdAt = new Date().toISOString()
    const session: QaSession = { id, name, createdAt, findings: [] }
    setState((prev) => ({ ...prev, sessions: [session, ...prev.sessions] }))
    setSessionDialogOpen(false)
    toast.success('QA page started')
    navigate(qaSessionPath(id))
  }

  const renameSession = () => {
    if (!activeSession) return
    const name = renameSessionName.trim()
    if (!name) {
      toast.error('Enter a name for this QA page')
      return
    }
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === activeSession.id ? { ...s, name } : s)),
    }))
    setRenameSessionDialogOpen(false)
    toast.success('QA page renamed')
  }

  const confirmDeleteSession = () => {
    if (!sessionToDelete) return
    const deletedId = sessionToDelete.id
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.filter((s) => s.id !== deletedId),
    }))
    setSessionToDelete(null)
    toast.success('QA page removed')
    if (sessionIdParam === deletedId) {
      navigate(qaListPath, { replace: true })
    }
  }

  const onPickScreenshots = async (files: FileList | null) => {
    if (!files?.length) return
    setScreenshotBusy(true)
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} is not an image`)
          continue
        }
        if (findingScreenshots.length >= qaScreenshotLimits.maxCount) {
          toast.error(`At most ${qaScreenshotLimits.maxCount} screenshots per finding`)
          break
        }
        try {
          const dataUrl = await compressImageFileToDataUrl(file)
          const shot: QaScreenshot = {
            id: newId(),
            name: file.name || 'screenshot.jpg',
            dataUrl,
            createdAt: new Date().toISOString(),
          }
          setFindingScreenshots((prev) => [...prev, shot])
        } catch (e) {
          const msg = describeError(e, 'Could not add image')
          toast.error(msg)
        }
      }
    } finally {
      setScreenshotBusy(false)
    }
  }

  const removeScreenshot = (id: string) => {
    setFindingScreenshots((prev) => prev.filter((s) => s.id !== id))
  }

  const saveFinding = () => {
    if (!sessionIdParam) return

    if (editingFindingId) {
      const title = docDraftTitleRef.current.trim()
      if (!title) {
        toast.error('Title is required')
        return
      }
      flushDocDraftOnly()
      toast.success('Finding updated')
      closeFindingModal()
      return
    }

    const now = new Date().toISOString()
    const figmaLink = normalizeLink(findingFigmaLink)
    const ticketLink = normalizeLink(findingTicketLink)
    const assignee = findingAssignee.trim()
    const reporter = findingReporter.trim()

    const pushPersist = (next: QaState) => {
      queueMicrotask(() => {
        enqueueQaPersist(next)
      })
    }

    const title = findingTitle.trim()
    if (!title) {
      toast.error('Title is required')
      return
    }
    const id = newId()
    const finding: QaFinding = {
      id,
      title,
      description: findingDocHtml,
      tags: findingTags,
      priority: findingPriority,
      effort: findingEffort,
      status: findingStatus,
      environment: findingEnvironment,
      categories: findingCategories,
      comments: [],
      screenshots: findingScreenshots,
      figmaLink,
      ticketLink,
      assignee,
      reporter,
      createdAt: now,
      updatedAt: now,
    }
    setState((prev) => {
      const next: QaState = {
        ...prev,
        sessions: prev.sessions.map((s) =>
          s.id === sessionIdParam ? { ...s, findings: [finding, ...s.findings] } : s,
        ),
      }
      pushPersist(next)
      return next
    })
    toast.success('Finding added')
    closeFindingModal()
  }

  const onPickScreenshotsForFinding = async (findingId: string, files: FileList | null) => {
    if (!files?.length || !sessionIdParam) return
    setScreenshotBusy(true)
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} is not an image`)
          continue
        }
        try {
          const dataUrl = await compressImageFileToDataUrl(file)
          const shot: QaScreenshot = {
            id: newId(),
            name: file.name || 'screenshot.jpg',
            dataUrl,
            createdAt: new Date().toISOString(),
          }
          let atLimit = false
          setState((prev) => {
            const sid = sessionIdParam
            const session = prev.sessions.find((s) => s.id === sid)
            const f = session?.findings.find((x) => x.id === findingId)
            if (!f || f.screenshots.length >= qaScreenshotLimits.maxCount) {
              atLimit = true
              return prev
            }
            return {
              ...prev,
              sessions: prev.sessions.map((s) => {
                if (s.id !== sid) return s
                return {
                  ...s,
                  findings: s.findings.map((x) =>
                    x.id === findingId
                      ? { ...x, screenshots: [...x.screenshots, shot], updatedAt: shot.createdAt }
                      : x,
                  ),
                }
              }),
            }
          })
          if (atLimit) {
            toast.error(`At most ${qaScreenshotLimits.maxCount} screenshots per finding`)
            break
          }
        } catch (e) {
          const msg = describeError(e, 'Could not add image')
          toast.error(msg)
        }
      }
    } finally {
      setScreenshotBusy(false)
    }
  }

  const removeScreenshotFromFinding = (findingId: string, shotId: string) => {
    if (!sessionIdParam) return
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => {
        if (s.id !== sessionIdParam) return s
        return {
          ...s,
          findings: s.findings.map((f) =>
            f.id === findingId
              ? { ...f, screenshots: f.screenshots.filter((sh) => sh.id !== shotId), updatedAt: new Date().toISOString() }
              : f,
          ),
        }
      }),
    }))
  }

  useEffect(() => {
    if (!findingDialogOpen || !editingFindingId || !activeSession) return
    if (!activeSession.findings.some((f) => f.id === editingFindingId)) {
      if (docSaveTimerRef.current) {
        window.clearTimeout(docSaveTimerRef.current)
        docSaveTimerRef.current = null
      }
      closeFindingModal()
    }
  }, [activeSession, editingFindingId, findingDialogOpen, closeFindingModal])

  const confirmDeleteFinding = () => {
    if (!findingToDelete) return
    const { sessionId, findingId } = findingToDelete
    if (editingFindingId === findingId) {
      closeFindingModal()
    }
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === sessionId ? { ...s, findings: s.findings.filter((f) => f.id !== findingId) } : s,
      ),
    }))
    setFindingToDelete(null)
    toast.success('Finding removed')
  }

  const addComment = () => {
    if (!sessionIdParam || !editingFindingId || !findingDialogOpen) return
    const author = commentAuthor.trim()
    const text = commentText.trim()
    if (!author) {
      toast.error('Enter your name')
      return
    }
    if (!text) {
      toast.error('Enter a comment')
      return
    }
    saveLastAuthor(author)
    const comment: QaComment = {
      id: newId(),
      author,
      text,
      createdAt: new Date().toISOString(),
    }
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => {
        if (s.id !== sessionIdParam) return s
        return {
          ...s,
          findings: s.findings.map((f) =>
            f.id === editingFindingId
              ? { ...f, comments: [...f.comments, comment], updatedAt: comment.createdAt }
              : f,
          ),
        }
      }),
    }))
    setCommentText('')
    setCommentComposeOpen(false)
    toast.success('Comment added')
  }

  const sharedDialogs = (
    <>
      <Dialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start QA page</DialogTitle>
            <DialogDescription>
              Name this run (for example a release, feature, or test pass). You will open the full-page workspace next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="qa-session-name">Page name</Label>
            <Input
              id="qa-session-name"
              placeholder="e.g. v2.4 regression — checkout"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createSession()}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSessionDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={createSession}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameSessionDialogOpen} onOpenChange={setRenameSessionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename QA page</DialogTitle>
            <DialogDescription>Update the name of this QA page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="qa-session-rename-name">Page name</Label>
            <Input
              id="qa-session-rename-name"
              placeholder="e.g. v2.4 regression — checkout"
              value={renameSessionName}
              onChange={(e) => setRenameSessionName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && renameSession()}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRenameSessionDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={renameSession}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!screenshotLightbox} onOpenChange={(open) => !open && setScreenshotLightbox(null)}>
        <DialogContent
          showCloseButton
          className={cn(
            'flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 border-0 bg-background/95 p-0 shadow-none backdrop-blur-sm sm:max-w-full sm:rounded-none',
            'top-0 left-0 translate-x-0 translate-y-0',
          )}
        >
          <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-14 sm:p-8 sm:pt-16">
            {screenshotLightbox ? (
              <img
                src={screenshotLightbox.dataUrl}
                alt={screenshotLightbox.name}
                className="max-h-[min(calc(100dvh-6rem),100%)] max-w-full object-contain"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={findingDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeFindingModal()
        }}
      >
        <DialogContent className="qa-finding-modal flex max-h-[96vh] w-[calc(100vw-0.5rem)] max-w-[1000px] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="sr-only shrink-0">
            <DialogTitle>{editingFindingId ? 'Edit QA item' : 'Add QA item'}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[calc(96vh-5.5rem)] space-y-4 overflow-y-auto overscroll-contain px-6 py-5 sm:px-8">
            {editingFindingId && modalFinding ? (
              <>
                <div className="space-y-6" onClick={(e) => e.stopPropagation()}>
                  <textarea
                    ref={docTitleRef}
                    value={docModalTitle}
                    onChange={(e) => {
                      const v = e.target.value
                      setDocModalTitle(v)
                      docDraftTitleRef.current = v
                      scheduleDocSave()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        document.querySelector<HTMLElement>('.docmost-editor')?.focus()
                      }
                    }}
                    className="docmost-title w-full resize-none border-0 bg-transparent p-0 !text-[1.2rem] font-semibold leading-snug tracking-tight text-foreground placeholder:text-muted-foreground/45 outline-none focus-visible:ring-0 sm:!text-[1.05rem]"
                    placeholder="Untitled"
                    rows={1}
                    aria-label="Title"
                  />
                  <div className="pt-0.5">
                    <NotionPropRow dense icon={CircleDot} label="Status">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(notionModalPropControl, 'gap-2 text-left text-foreground')}
                          >
                            <span
                              className={cn('h-2 w-2 shrink-0 rounded-full', statusDotClass(modalFinding.status))}
                              aria-hidden
                            />
                            <span className="truncate">{qaStatusLabel(modalFinding.status)}</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-52">
                          <DropdownMenuLabel>Status</DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={modalFinding.status}
                            onValueChange={(v) => patchFinding(modalFinding.id, { status: v as QaStatus })}
                          >
                            {QA_STATUSES.map((s) => (
                              <DropdownMenuRadioItem key={s} value={s}>
                                <StatusRow status={s} />
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </NotionPropRow>
                    <NotionPropRow dense icon={Flag} label="Priority">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              notionModalPropControl,
                              'text-left capitalize',
                              modalFinding.priority === 'critical' ? 'font-medium text-destructive' : 'text-foreground',
                            )}
                          >
                            {modalFinding.priority}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-44">
                          <DropdownMenuLabel>Priority</DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={modalFinding.priority}
                            onValueChange={(v) => patchFinding(modalFinding.id, { priority: v as QaPriority })}
                          >
                            {(['low', 'medium', 'high', 'critical'] as const).map((p) => (
                              <DropdownMenuRadioItem key={p} value={p} className="capitalize">
                                {p}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </NotionPropRow>
                    <NotionPropRow dense icon={Gauge} label="Effort">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(notionModalPropControl, 'text-left capitalize text-foreground')}
                          >
                            {modalFinding.effort}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-44">
                          <DropdownMenuLabel>Effort</DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={modalFinding.effort}
                            onValueChange={(v) => patchFinding(modalFinding.id, { effort: v as QaEffort })}
                          >
                            {QA_EFFORTS.map((e) => (
                              <DropdownMenuRadioItem key={e} value={e} className="capitalize">
                                {e}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </NotionPropRow>
                    <NotionPropRow dense icon={User} label="Assignee">
                      <FindingAssigneePopover
                        appearance="notion"
                        dense
                        assignee={modalFinding.assignee}
                        suggestions={assigneeFilterOptions}
                        onSet={(value) => patchFinding(modalFinding.id, { assignee: value })}
                      />
                    </NotionPropRow>
                    <NotionPropRow dense icon={UserCircle} label="Reporter">
                      <Input
                        id="qa-modal-reporter"
                        value={modalFinding.reporter ?? ''}
                        onChange={(e) => patchFinding(modalFinding.id, { reporter: e.target.value })}
                        placeholder="+ Add"
                        className={notionModalValueInput}
                        aria-label="Reporter"
                      />
                    </NotionPropRow>
                    <NotionPropRow dense icon={Globe} label="Environment">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(notionModalPropControl, 'gap-2 text-left font-mono text-foreground')}
                          >
                            {modalFinding.environment}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-40">
                          <DropdownMenuLabel>Environment</DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={modalFinding.environment}
                            onValueChange={(v) => patchFinding(modalFinding.id, { environment: v as QaEnvironment })}
                          >
                            {QA_ENVIRONMENTS.map((env) => (
                              <DropdownMenuRadioItem key={env} value={env} className="font-mono text-xs">
                                {env}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </NotionPropRow>
                    <NotionPropRow dense icon={Layers} label="Category">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(notionModalPropControl, 'gap-2 text-foreground')}
                          >
                            <CategorySelectionPreview categories={modalFinding.categories} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                          <DropdownMenuLabel>Category</DropdownMenuLabel>
                          {QA_CATEGORIES.map((category) => (
                            <DropdownMenuCheckboxItem
                              key={category}
                              checked={modalFinding.categories.includes(category)}
                              onCheckedChange={() =>
                                patchFinding(modalFinding.id, {
                                  categories: modalFinding.categories.includes(category)
                                    ? modalFinding.categories.length > 1
                                      ? modalFinding.categories.filter((c) => c !== category)
                                      : modalFinding.categories
                                    : [...modalFinding.categories, category],
                                })
                              }
                            >
                              <CategoryRow category={category} iconSize="sm" />
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </NotionPropRow>
                    <NotionPropRow dense icon={Link2} label="Figma link">
                      <Input
                        id="qa-modal-figma"
                        value={modalFinding.figmaLink}
                        onChange={(e) => patchFinding(modalFinding.id, { figmaLink: e.target.value })}
                        onBlur={(e) => patchFinding(modalFinding.id, { figmaLink: normalizeLink(e.target.value) })}
                        placeholder="+ Add"
                        className={notionModalValueInput}
                        aria-label="Figma link"
                      />
                    </NotionPropRow>
                    <NotionPropRow dense icon={Ticket} label="Ticket link">
                      <Input
                        id="qa-modal-ticket"
                        value={modalFinding.ticketLink}
                        onChange={(e) => patchFinding(modalFinding.id, { ticketLink: e.target.value })}
                        onBlur={(e) => patchFinding(modalFinding.id, { ticketLink: normalizeLink(e.target.value) })}
                        placeholder="+ Add"
                        className={notionModalValueInput}
                        aria-label="Ticket link"
                      />
                    </NotionPropRow>
                    <NotionPropRow dense icon={Hash} label="Tags">
                      <FindingTagsPopover
                        appearance="notion"
                        dense
                        tags={modalFinding.tags}
                        tagPool={tagFilterOptions}
                        onSetTags={(next) => patchFinding(modalFinding.id, { tags: next })}
                      />
                    </NotionPropRow>
                    <NotionPropRow dense icon={Calendar} label="Created">
                      <span className="flex h-7 items-center pl-2 text-[13px] leading-snug text-foreground">
                        {formatNotionDateTime(modalFinding.createdAt)}
                      </span>
                    </NotionPropRow>
                    <NotionPropRow dense icon={Clock} label="Last updated">
                      <span className="flex h-7 items-center pl-2 text-[13px] leading-snug text-foreground">
                        {formatNotionDateTime(modalFinding.updatedAt)}
                      </span>
                    </NotionPropRow>
                  </div>
                </div>
                <div className="mt-6" onClick={(e) => e.stopPropagation()}>
                  <BlockEditor
                    key={modalFinding.id}
                    content={docModalHtml}
                    onUpdate={(html) => {
                      setDocModalHtml(html)
                      docDraftHtmlRef.current = html
                      scheduleDocSave()
                    }}
                    placeholder="Write details, or type '/' for blocks…"
                  />
                </div>
                <Separator className="mt-4" />
                <div className="space-y-4 pb-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <ImagePlus className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-semibold">Screenshots</p>
                    {modalFinding.screenshots.length > 0 ? (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        ({modalFinding.screenshots.length})
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-0" disabled={screenshotBusy} asChild>
                      <label className="cursor-pointer">
                        <Plus className="h-4 w-4" />
                        {screenshotBusy ? 'Processing…' : 'Add images'}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="sr-only"
                          onChange={(e) => {
                            void onPickScreenshotsForFinding(modalFinding.id, e.target.files)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    </Button>
                    {/* <span className="text-xs text-muted-foreground">
                      Up to {qaScreenshotLimits.maxCount}, resized
                    </span> */}
                  </div>
                  {modalFinding.screenshots.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {modalFinding.screenshots.map((s) => (
                        <div
                          key={s.id}
                          className="group relative w-full overflow-hidden rounded-lg border bg-muted sm:max-h-[min(52vh,480px)]"
                        >
                          <img
                            src={s.dataUrl}
                            alt=""
                            className="pointer-events-none max-h-[min(52vh,480px)] w-full object-contain"
                          />
                          <button
                            type="button"
                            className="absolute inset-0 z-0 rounded-lg ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setScreenshotLightbox({ dataUrl: s.dataUrl, name: s.name })}
                            aria-label={`View ${s.name} full screen`}
                          />
                          <button
                            type="button"
                            className="absolute right-2 top-2 z-10 rounded-md bg-background/90 p-1 opacity-0 shadow transition-opacity group-hover:opacity-100"
                            aria-label="Remove screenshot"
                            onClick={() => removeScreenshotFromFinding(modalFinding.id, s.id)}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <NotionEmpty />
                  )}
                </div>
                <Separator />
                <div className="space-y-4 pb-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-semibold">Comments</p>
                    {modalFinding.comments.length > 0 ? (
                      <span className="text-xs tabular-nums text-muted-foreground">({modalFinding.comments.length})</span>
                    ) : null}
                  </div>
                  {!modalFinding.comments.length ? (
                    <p className="text-sm text-muted-foreground">No comments yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {modalFinding.comments.map((c) => (
                        <div key={c.id} className="rounded-lg border bg-muted/30 p-3">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-sm font-semibold text-foreground">{c.author}</p>
                            <p className="text-xs text-muted-foreground">{formatTime(c.createdAt)}</p>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{c.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {commentComposeOpen ? (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="qa-modal-comment-author">Your name</Label>
                        <Input
                          id="qa-modal-comment-author"
                          value={commentAuthor}
                          onChange={(e) => setCommentAuthor(e.target.value)}
                          placeholder="Author name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="qa-modal-comment-text">Comment</Label>
                        <Textarea
                          id="qa-modal-comment-text"
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder="Add a note or reply…"
                          rows={3}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" className="w-full sm:w-auto" onClick={addComment}>
                          Post comment
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full sm:w-auto"
                          onClick={() => {
                            setCommentComposeOpen(false)
                            setCommentText('')
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setCommentComposeOpen(true)}>
                      Add comment
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="space-y-6" onClick={(e) => e.stopPropagation()}>
                  <textarea
                    id="qa-new-title"
                    value={findingTitle}
                    onChange={(e) => setFindingTitle(e.target.value)}
                    className="w-full resize-none border-0 bg-transparent p-0 !text-[0.95rem] font-semibold leading-snug tracking-tight text-foreground placeholder:text-muted-foreground/45 outline-none focus-visible:ring-0 sm:!text-[1.05rem]"
                    placeholder="Untitled"
                    rows={1}
                    aria-label="Title"
                  />
                  <div className="pt-0.5">
                    <NotionPropRow dense icon={CircleDot} label="Status">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(notionModalPropControl, 'gap-2 text-left text-foreground')}
                          >
                            <span
                              className={cn('h-2 w-2 shrink-0 rounded-full', statusDotClass(findingStatus))}
                              aria-hidden
                            />
                            <span className="truncate">{qaStatusLabel(findingStatus)}</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-52">
                          <DropdownMenuLabel>Status</DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={findingStatus}
                            onValueChange={(v) => setFindingStatus(v as QaStatus)}
                          >
                            {QA_STATUSES.map((s) => (
                              <DropdownMenuRadioItem key={s} value={s}>
                                <StatusRow status={s} />
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </NotionPropRow>
                    <NotionPropRow dense icon={Flag} label="Priority">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              notionModalPropControl,
                              'text-left capitalize',
                              findingPriority === 'critical' ? 'font-medium text-destructive' : 'text-foreground',
                            )}
                          >
                            {findingPriority}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-44">
                          <DropdownMenuLabel>Priority</DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={findingPriority}
                            onValueChange={(v) => setFindingPriority(v as QaPriority)}
                          >
                            {(['low', 'medium', 'high', 'critical'] as const).map((p) => (
                              <DropdownMenuRadioItem key={p} value={p} className="capitalize">
                                {p}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </NotionPropRow>
                    <NotionPropRow dense icon={Gauge} label="Effort">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(notionModalPropControl, 'text-left capitalize text-foreground')}
                          >
                            {findingEffort}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-44">
                          <DropdownMenuLabel>Effort</DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={findingEffort}
                            onValueChange={(v) => setFindingEffort(v as QaEffort)}
                          >
                            {QA_EFFORTS.map((e) => (
                              <DropdownMenuRadioItem key={e} value={e} className="capitalize">
                                {e}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </NotionPropRow>
                    <NotionPropRow dense icon={User} label="Assignee">
                      <FindingAssigneePopover
                        appearance="notion"
                        dense
                        assignee={findingAssignee}
                        suggestions={assigneeFilterOptions}
                        onSet={(value) => setFindingAssignee(value)}
                      />
                    </NotionPropRow>
                    <NotionPropRow dense icon={UserCircle} label="Reporter">
                      <Input
                        id="qa-new-reporter"
                        value={findingReporter}
                        onChange={(e) => setFindingReporter(e.target.value)}
                        placeholder="+ Add"
                        className={notionModalValueInput}
                        aria-label="Reporter"
                      />
                    </NotionPropRow>
                    <NotionPropRow dense icon={Globe} label="Environment">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(notionModalPropControl, 'gap-2 text-left font-mono text-foreground')}
                          >
                            {findingEnvironment}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-40">
                          <DropdownMenuLabel>Environment</DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={findingEnvironment}
                            onValueChange={(v) => setFindingEnvironment(v as QaEnvironment)}
                          >
                            {QA_ENVIRONMENTS.map((env) => (
                              <DropdownMenuRadioItem key={env} value={env} className="font-mono text-xs">
                                {env}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </NotionPropRow>
                    <NotionPropRow dense icon={Layers} label="Category">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(notionModalPropControl, 'gap-2 text-foreground')}
                          >
                            <CategorySelectionPreview categories={findingCategories} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                          <DropdownMenuLabel>Category</DropdownMenuLabel>
                          {QA_CATEGORIES.map((category) => (
                            <DropdownMenuCheckboxItem
                              key={category}
                              checked={findingCategories.includes(category)}
                              onCheckedChange={() =>
                                setFindingCategories((prev) =>
                                  prev.includes(category)
                                    ? prev.length > 1
                                      ? prev.filter((c) => c !== category)
                                      : prev
                                    : [...prev, category],
                                )
                              }
                            >
                              <CategoryRow category={category} iconSize="sm" />
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </NotionPropRow>
                    <NotionPropRow dense icon={Link2} label="Figma link">
                      <Input
                        id="qa-new-figma"
                        value={findingFigmaLink}
                        onChange={(e) => setFindingFigmaLink(e.target.value)}
                        placeholder="+ Add"
                        className={notionModalValueInput}
                        aria-label="Figma link"
                      />
                    </NotionPropRow>
                    <NotionPropRow dense icon={Ticket} label="Ticket link">
                      <Input
                        id="qa-new-ticket"
                        value={findingTicketLink}
                        onChange={(e) => setFindingTicketLink(e.target.value)}
                        placeholder="+ Add"
                        className={notionModalValueInput}
                        aria-label="Ticket link"
                      />
                    </NotionPropRow>
                    <NotionPropRow dense icon={Hash} label="Tags">
                      <FindingTagsPopover
                        appearance="notion"
                        dense
                        tags={findingTags}
                        tagPool={tagFilterOptions}
                        onSetTags={setFindingTags}
                      />
                    </NotionPropRow>
                  </div>
                </div>
                <div className="mt-6" onClick={(e) => e.stopPropagation()}>
                  <BlockEditor
                    content={findingDocHtml}
                    onUpdate={setFindingDocHtml}
                    placeholder="Write details, or type '/' for blocks…"
                  />
                </div>
                <Separator className="mt-4" />
                <div className="space-y-4 pb-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <ImagePlus className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-semibold">Screenshots</p>
                    {findingScreenshots.length > 0 ? (
                      <span className="text-xs tabular-nums text-muted-foreground">({findingScreenshots.length})</span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2" disabled={screenshotBusy} asChild>
                      <label className="cursor-pointer">
                        <ImagePlus className="h-4 w-4" />
                        {screenshotBusy ? 'Processing…' : 'Add images'}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="sr-only"
                          onChange={(e) => {
                            void onPickScreenshots(e.target.files)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Up to {qaScreenshotLimits.maxCount}, resized
                    </span>
                  </div>
                  {findingScreenshots.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {findingScreenshots.map((s) => (
                        <div
                          key={s.id}
                          className="group relative w-full overflow-hidden rounded-lg border bg-muted sm:max-h-[min(52vh,480px)]"
                        >
                          <img
                            src={s.dataUrl}
                            alt=""
                            className="pointer-events-none max-h-[min(52vh,480px)] w-full object-contain"
                          />
                          <button
                            type="button"
                            className="absolute inset-0 z-0 rounded-lg ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setScreenshotLightbox({ dataUrl: s.dataUrl, name: s.name })}
                            aria-label={`View ${s.name} full screen`}
                          />
                          <button
                            type="button"
                            className="absolute right-2 top-2 z-10 rounded-md bg-background/90 p-1 opacity-0 shadow transition-opacity group-hover:opacity-100"
                            aria-label="Remove screenshot"
                            onClick={() => removeScreenshot(s.id)}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <NotionEmpty />
                  )}
                </div>
                <Separator />
                <p className="pb-2 text-sm text-muted-foreground">Save this item to add comments.</p>
              </>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4 sm:px-8">
            <Button type="button" variant="ghost" onClick={() => closeFindingModal()}>
              Cancel
            </Button>
            <Button type="button" onClick={saveFinding}>
              {editingFindingId ? 'Done' : 'Add QA item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={prioritizationSchemeOpen} onOpenChange={setPrioritizationSchemeOpen}>
        <DialogContent
          showCloseButton
          className={cn(
            'flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 border-0 bg-background p-0 shadow-none backdrop-blur-sm sm:rounded-none',
            'top-0 left-0 translate-x-0 translate-y-0',
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DialogHeader className="shrink-0 space-y-2 border-b bg-background px-4 pb-4 pt-12 sm:px-8 sm:pt-14">
              <DialogTitle>Prioritization scheme</DialogTitle>
              <DialogDescription>
                {activeSession
                  ? `“${activeSession.name}” — all findings on this page, grouped by priority (vertical) and effort (horizontal). Click a title to open that item.`
                  : 'Open a QA page to use this view.'}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-8 sm:py-6">
              <div className="mx-auto flex h-full min-h-0 max-w-6xl flex-col gap-4">
                <p className="shrink-0 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">Priority:</span> bottom rows are low/medium; top rows
                  are high/critical.
                  <span className="mx-1.5 inline-block h-3 w-px translate-y-0.5 bg-border" aria-hidden />
                  <span className="font-medium text-foreground">Effort:</span> left column is low effort; right column
                  is medium or high effort.
                </p>
                <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-muted/15 p-3 sm:p-5">
                  <div className="mb-2 grid shrink-0 grid-cols-2 gap-2 pl-12 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:pl-16">
                    <span>Low effort</span>
                    <span>Medium / high effort</span>
                  </div>
                  <div className="flex min-h-0 flex-1 gap-2 sm:gap-3">
                    <div className="flex w-11 shrink-0 flex-col justify-between gap-8 py-1 text-[10px] font-medium leading-tight text-muted-foreground sm:w-14 sm:text-[11px]">
                      <span className="text-right">High / critical priority</span>
                      <span className="text-right">Low / medium priority</span>
                    </div>
                    <div className="grid min-h-[min(52vh,420px)] flex-1 grid-cols-2 grid-rows-2 gap-2 sm:min-h-[min(56vh,480px)] sm:gap-3">
                      <PrioritizationQuadrant
                        title="Quick wins"
                        hint="High priority, low effort — ship soon."
                        findings={prioritizationBuckets.quickWins}
                        accent="emerald"
                        onPickFinding={(f) => {
                          setPrioritizationSchemeOpen(false)
                          openFindingModal(f)
                        }}
                      />
                      <PrioritizationQuadrant
                        title="Major initiatives"
                        hint="High priority, higher effort — plan capacity."
                        findings={prioritizationBuckets.strategic}
                        accent="amber"
                        onPickFinding={(f) => {
                          setPrioritizationSchemeOpen(false)
                          openFindingModal(f)
                        }}
                      />
                      <PrioritizationQuadrant
                        title="Fill-ins"
                        hint="Lower priority, low effort — when you have spare time."
                        findings={prioritizationBuckets.fillIn}
                        accent="slate"
                        onPickFinding={(f) => {
                          setPrioritizationSchemeOpen(false)
                          openFindingModal(f)
                        }}
                      />
                      <PrioritizationQuadrant
                        title="Reconsider"
                        hint="Lower priority, higher effort — deprioritize or rescope."
                        findings={prioritizationBuckets.reconsider}
                        accent="rose"
                        onPickFinding={(f) => {
                          setPrioritizationSchemeOpen(false)
                          openFindingModal(f)
                        }}
                      />
                    </div>
                  </div>
                  <p className="mt-3 shrink-0 text-center text-[11px] text-muted-foreground">
                    Effort increases to the right · Priority increases upward
                  </p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!sessionToDelete} onOpenChange={(o) => !o && setSessionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete QA page?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes “{sessionToDelete?.name}” and all of its findings and comments. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteSession}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!findingToDelete} onOpenChange={(o) => !o && setFindingToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete finding?</AlertDialogTitle>
            <AlertDialogDescription>
              This finding and its comments will be removed permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteFinding}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  if (!qaRemoteReady) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">Loading QA workspace…</p>
          <p className="max-w-sm text-xs text-muted-foreground">Syncing with database....</p>
        </div>
      </div>
    )
  }

  if (sessionIdParam) {
    if (!activeSession) {
      return <Navigate to={qaListPath} replace />
    }

    return (
      <div className="flex h-[100dvh] min-h-0 flex-col bg-background">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 sm:px-5">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5 px-2" asChild>
            <Link to={qaListPath}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold sm:text-base">{activeSession.name}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {filtersActive && activeSession.findings.length > 0
                ? `Showing ${filteredFindings.length} of ${activeSession.findings.length} finding${
                    activeSession.findings.length === 1 ? '' : 's'
                  }`
                : `${activeSession.findings.length} finding${activeSession.findings.length === 1 ? '' : 's'}`}
              {' · '}
              {formatTime(activeSession.createdAt)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden gap-1.5 sm:inline-flex"
              onClick={() => setPrioritizationSchemeOpen(true)}
            >
              <LayoutGrid className="h-4 w-4" />
              Prioritization Scheme
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0 sm:hidden"
              onClick={() => setPrioritizationSchemeOpen(true)}
              aria-label="Prioritization scheme"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={openNewFindingModal}>
              <Plus className="h-4 w-4" />
              Add QA item
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="QA page actions"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={openRenameSessionDialog}>
                <Pencil className="h-4 w-4" />
                Rename page
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setSessionToDelete(activeSession)}
              >
                <Trash2 className="h-4 w-4" />
                Delete page
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {activeSession.findings.length > 0 ? (
          <div className="shrink-0 border-b bg-muted/25 px-4 py-3 sm:px-5">
            <div className="mx-auto flex min-w-0 max-w-6xl flex-nowrap items-center gap-2 overflow-x-auto pb-0.5">
              <div className="relative min-h-9 min-w-[10rem] flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search title or details…"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="h-9 w-full min-w-0 pl-8"
                  aria-label="Search findings"
                />
              </div>
              <div className="flex shrink-0 flex-nowrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1">
                      Status
                      {filterStatuses.length > 0 ? (
                        <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px]">
                          {filterStatuses.length}
                        </Badge>
                      ) : null}
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    <DropdownMenuLabel>Status</DropdownMenuLabel>
                    {QA_STATUSES.map((s) => (
                      <DropdownMenuCheckboxItem
                        key={s}
                        checked={filterStatuses.includes(s)}
                        onCheckedChange={() =>
                          setFilterStatuses((prev) =>
                            prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                          )
                        }
                      >
                        {qaStatusLabel(s)}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1">
                      Priority
                      {filterPriorities.length > 0 ? (
                        <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px]">
                          {filterPriorities.length}
                        </Badge>
                      ) : null}
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-44">
                    <DropdownMenuLabel>Priority</DropdownMenuLabel>
                    {(['low', 'medium', 'high', 'critical'] as const).map((p) => (
                      <DropdownMenuCheckboxItem
                        key={p}
                        checked={filterPriorities.includes(p)}
                        onCheckedChange={() =>
                          setFilterPriorities((prev) =>
                            prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                          )
                        }
                        className="capitalize"
                      >
                        {p}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1">
                      Environment
                      {filterEnvironments.length > 0 ? (
                        <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px]">
                          {filterEnvironments.length}
                        </Badge>
                      ) : null}
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-44">
                    <DropdownMenuLabel>Environment</DropdownMenuLabel>
                    {QA_ENVIRONMENTS.map((env) => (
                      <DropdownMenuCheckboxItem
                        key={env}
                        checked={filterEnvironments.includes(env)}
                        onCheckedChange={() =>
                          setFilterEnvironments((prev) =>
                            prev.includes(env) ? prev.filter((x) => x !== env) : [...prev, env],
                          )
                        }
                        className="font-mono text-xs"
                      >
                        {env}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1">
                      Category
                      {filterCategories.length > 0 ? (
                        <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px]">
                          {filterCategories.length}
                        </Badge>
                      ) : null}
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel>Category</DropdownMenuLabel>
                    {QA_CATEGORIES.map((category) => (
                      <DropdownMenuCheckboxItem
                        key={category}
                        checked={filterCategories.includes(category)}
                        onCheckedChange={() =>
                          setFilterCategories((prev) =>
                            prev.includes(category) ? prev.filter((x) => x !== category) : [...prev, category],
                          )
                        }
                      >
                        <CategoryRow category={category} iconSize="sm" />
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1">
                      Assignee
                      {filterAssignees.length > 0 ? (
                        <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px]">
                          {filterAssignees.length}
                        </Badge>
                      ) : null}
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
                    <DropdownMenuLabel>Assignee</DropdownMenuLabel>
                    {hasUnassignedFindings ? (
                      <DropdownMenuCheckboxItem
                        checked={filterAssignees.includes(UNASSIGNED)}
                        onCheckedChange={() =>
                          setFilterAssignees((prev) =>
                            prev.includes(UNASSIGNED) ? prev.filter((x) => x !== UNASSIGNED) : [...prev, UNASSIGNED],
                          )
                        }
                      >
                        Unassigned
                      </DropdownMenuCheckboxItem>
                    ) : null}
                    {assigneeFilterOptions.map((name) => (
                      <DropdownMenuCheckboxItem
                        key={name}
                        checked={filterAssignees.includes(name)}
                        onCheckedChange={() =>
                          setFilterAssignees((prev) =>
                            prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
                          )
                        }
                      >
                        {name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1"
                      disabled={reporterFilterOptions.length === 0 && !hasNoReporterFindings}
                    >
                      Reporter
                      {filterReporters.length > 0 ? (
                        <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px]">
                          {filterReporters.length}
                        </Badge>
                      ) : null}
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
                    <DropdownMenuLabel>Reporter</DropdownMenuLabel>
                    {hasNoReporterFindings ? (
                      <DropdownMenuCheckboxItem
                        checked={filterReporters.includes(NO_REPORTER)}
                        onCheckedChange={() =>
                          setFilterReporters((prev) =>
                            prev.includes(NO_REPORTER) ? prev.filter((x) => x !== NO_REPORTER) : [...prev, NO_REPORTER],
                          )
                        }
                      >
                        No reporter
                      </DropdownMenuCheckboxItem>
                    ) : null}
                    {reporterFilterOptions.map((name) => (
                      <DropdownMenuCheckboxItem
                        key={name}
                        checked={filterReporters.includes(name)}
                        onCheckedChange={() =>
                          setFilterReporters((prev) =>
                            prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
                          )
                        }
                      >
                        {name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1" disabled={tagFilterOptions.length === 0}>
                      Tags
                      {filterTags.length > 0 ? (
                        <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px]">
                          {filterTags.length}
                        </Badge>
                      ) : null}
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
                    <DropdownMenuLabel>Tags (match any)</DropdownMenuLabel>
                    {tagFilterOptions.map((t) => (
                      <DropdownMenuCheckboxItem
                        key={t}
                        checked={filterTags.includes(t)}
                        onCheckedChange={() =>
                          setFilterTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
                        }
                      >
                        {t}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {filtersActive ? (
                  <Button type="button" variant="ghost" size="sm" className="h-8" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
            {activeSession.findings.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/20 p-10 text-center">
                <p className="font-medium">No findings yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add a QA item with screenshots, Figma, ticket, and assignee.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setPrioritizationSchemeOpen(true)}
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Prioritization Scheme
                  </Button>
                  <Button type="button" variant="secondary" className="gap-1.5" onClick={openNewFindingModal}>
                    <Plus className="h-4 w-4" />
                    Add QA item
                  </Button>
                </div>
              </div>
            ) : filteredFindings.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/20 p-10 text-center">
                <p className="font-medium">No findings match your filters</p>
                <p className="mt-1 text-sm text-muted-foreground">Try clearing filters or changing search.</p>
                <Button type="button" variant="secondary" className="mt-4" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            ) : (
              <ul className="space-y-3">
                {filteredFindings.map((f) => (
                  <li
                    key={f.id}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      const target = e.target as HTMLElement
                      if (
                        target.closest(
                          'button, input, textarea, select, a, [role^="menuitem"], [contenteditable="true"], [data-slot="dropdown-menu-trigger"]',
                        )
                      ) {
                        return
                      }
                      openFindingModal(f)
                    }}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openFindingModal(f)
                      }
                    }}
                    className="overflow-hidden rounded-xl border bg-card shadow-sm outline-none transition-colors hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 p-3 sm:px-4 sm:pt-4 sm:pb-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <h2 className="text-sm font-semibold leading-snug sm:text-base">{f.title}</h2>
                        {f.description?.trim() ? (
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {qaFindingBodyPlain(f.description)}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className={cn(
                                  cardChipRounded,
                                  'inline-flex h-auto max-w-[11rem] shrink-0 cursor-pointer items-center gap-1.5 truncate border border-neutral-300 bg-white px-2.5 py-0.5 text-xs font-medium text-foreground shadow-none transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-neutral-900',
                                )}
                              >
                                <span
                                  className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDotClass(f.status))}
                                  aria-hidden
                                />
                                <span className="truncate">{qaStatusLabel(f.status)}</span>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-52">
                              <DropdownMenuLabel>Status</DropdownMenuLabel>
                              <DropdownMenuRadioGroup
                                value={f.status}
                                onValueChange={(v) => patchFinding(f.id, { status: v as QaStatus })}
                              >
                                {QA_STATUSES.map((s) => (
                                  <DropdownMenuRadioItem key={s} value={s}>
                                    <StatusRow status={s} />
                                  </DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className={cn(
                                  cardChipRounded,
                                  'inline-flex h-auto max-w-[14rem] shrink-0 cursor-pointer items-center gap-1.5 border border-neutral-300 bg-white px-2.5 py-0.5 text-xs font-medium text-foreground shadow-none transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-neutral-900',
                                )}
                              >
                                <span className="shrink-0 text-muted-foreground">Priority</span>
                                <QaCardLevelBars level={f.priority} />
                                <span
                                  className={cn(
                                    'truncate capitalize',
                                    f.priority === 'critical' && 'font-medium text-destructive',
                                  )}
                                >
                                  {f.priority}
                                </span>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-44">
                              <DropdownMenuLabel>Priority</DropdownMenuLabel>
                              <DropdownMenuRadioGroup
                                value={f.priority}
                                onValueChange={(v) => patchFinding(f.id, { priority: v as QaPriority })}
                              >
                                {(['low', 'medium', 'high', 'critical'] as const).map((p) => (
                                  <DropdownMenuRadioItem key={p} value={p} className="capitalize">
                                    {p}
                                  </DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className={cn(
                                  cardChipRounded,
                                  'inline-flex h-auto max-w-[14rem] shrink-0 cursor-pointer items-center gap-1.5 border border-neutral-300 bg-white px-2.5 py-0.5 text-xs font-medium text-foreground shadow-none transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-neutral-900',
                                )}
                              >
                                <span className="shrink-0 text-muted-foreground">Effort</span>
                                <QaCardLevelBars level={f.effort} />
                                <span className="truncate capitalize">{f.effort}</span>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-44">
                              <DropdownMenuLabel>Effort</DropdownMenuLabel>
                              <DropdownMenuRadioGroup
                                value={f.effort}
                                onValueChange={(v) => patchFinding(f.id, { effort: v as QaEffort })}
                              >
                                {QA_EFFORTS.map((e) => (
                                  <DropdownMenuRadioItem key={e} value={e} className="capitalize">
                                    {e}
                                  </DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className={cn(
                                  badgeVariants({ variant: 'outline' }),
                                  cardChipRounded,
                                  'h-auto min-w-0 max-w-[12rem] shrink-0 cursor-pointer border px-2.5 py-0.5 text-xs font-medium transition-opacity hover:opacity-90',
                                )}
                              >
                                <CategorySelectionPreview categories={f.categories} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-56">
                              <DropdownMenuLabel>Category</DropdownMenuLabel>
                              {QA_CATEGORIES.map((category) => (
                                <DropdownMenuCheckboxItem
                                  key={category}
                                  checked={f.categories.includes(category)}
                                  onCheckedChange={() =>
                                    patchFinding(f.id, {
                                      categories: f.categories.includes(category)
                                        ? f.categories.length > 1
                                          ? f.categories.filter((c) => c !== category)
                                          : f.categories
                                        : [...f.categories, category],
                                    })
                                  }
                                >
                                  <CategoryRow category={category} iconSize="sm" />
                                </DropdownMenuCheckboxItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <FindingAssigneePopover
                            assignee={f.assignee}
                            suggestions={assigneeFilterOptions}
                            onSet={(value) => patchFinding(f.id, { assignee: value })}
                          />
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-start">
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 shrink-0 gap-1 px-2 text-muted-foreground hover:text-foreground"
                            aria-label={
                              f.comments.length > 0
                                ? `Comments, ${f.comments.length}`
                                : 'Comments'
                            }
                            onClick={(e) => {
                              e.stopPropagation()
                              setCommentAuthor((a) => a || loadLastAuthor())
                              setCommentText('')
                              openFindingModal(f)
                            }}
                          >
                            <MessageSquare className="h-4 w-4 shrink-0" />
                            {f.comments.length > 0 ? (
                              <span className="text-xs font-semibold tabular-nums">{f.comments.length}</span>
                            ) : null}
                          </Button>
                          {f.screenshots.length > 0 ? (
                            <span
                              className="inline-flex h-8 shrink-0 items-center gap-1 px-1.5 text-muted-foreground"
                              aria-label={`Screenshots, ${f.screenshots.length}`}
                            >
                              <ImagePlus className="h-4 w-4 shrink-0" />
                              <span className="text-xs font-semibold tabular-nums">{f.screenshots.length}</span>
                            </span>
                          ) : null}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground"
                              aria-label="Finding actions"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                openFindingModal(f)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                setFindingToDelete({ sessionId: activeSession.id, findingId: f.id })
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <footer className="border-t bg-muted/50 px-3 py-1 sm:px-4">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                        <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                          {f.reporter?.trim() ? (
                            <>
                              Reported{' '}
                              <time dateTime={f.createdAt}>{formatReportedFooterTime(f.createdAt)}</time>
                              {' by '}
                              <span className="font-medium text-foreground/90">{f.reporter.trim()}</span>
                              {' on '}
                            </>
                          ) : (
                            <>
                              Added <time dateTime={f.createdAt}>{formatReportedFooterTime(f.createdAt)}</time>
                              {' on '}
                            </>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className="inline rounded px-0 font-mono text-xs text-muted-foreground"
                                aria-label="Environment"
                              >
                                {f.environment}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-40">
                              <DropdownMenuLabel>Environment</DropdownMenuLabel>
                              <DropdownMenuRadioGroup
                                value={f.environment}
                                onValueChange={(v) => patchFinding(f.id, { environment: v as QaEnvironment })}
                              >
                                {QA_ENVIRONMENTS.map((env) => (
                                  <DropdownMenuRadioItem key={env} value={env} className="font-mono text-xs">
                                    {env}
                                  </DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
                          <FindingTagsPopover
                            tags={f.tags}
                            tagPool={tagFilterOptions}
                            onSetTags={(next) => patchFinding(f.id, { tags: next })}
                          />
                        </div>
                      </div>
                    </footer>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>

        {sharedDialogs}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />

      <div className="flex-1 border-b bg-muted/15 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">QA</h1>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Each QA page is a full-screen workspace for findings, screenshots, links, and assignees. Open a card to
                continue.
              </p>
            </div>
            <Button type="button" onClick={openNewSession} className="gap-1.5">
              <Plus className="h-4 w-4" />
              New QA page
            </Button>
          </div>

          {state.sessions.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-background p-12 text-center">
              <p className="font-medium">No QA pages yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Create one for a release, feature, or exploratory pass. Pages sync across your workspace.
              </p>
              <Button type="button" className="mt-6" onClick={openNewSession}>
                Start QA page
              </Button>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {state.sessions.map((s) => (
                <li key={s.id}>
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <Link to={qaSessionPath(s.id)} className="min-w-0 flex-1">
                          <CardTitle className="line-clamp-2 text-base leading-snug hover:underline">
                            {s.name}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {s.findings.length} finding{s.findings.length === 1 ? '' : 's'} ·{' '}
                            {formatTime(s.createdAt)}
                          </CardDescription>
                        </Link>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Delete ${s.name}`}
                          onClick={() => setSessionToDelete(s)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Button variant="secondary" size="sm" className="w-full" asChild>
                        <Link to={qaSessionPath(s.id)}>Open</Link>
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {sharedDialogs}
    </div>
  )
}
