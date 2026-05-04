import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppHeader } from '@/components/AppHeader'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  loadQaState,
  saveQaState,
  fetchQaStateFromSupabase,
  persistQaStateToSupabase,
  migrateQaLocalStorageToSupabaseOnce,
  newId,
  normalizeTag,
  compressImageFileToDataUrl,
  qaScreenshotLimits,
  QA_ENVIRONMENTS,
  QA_STATUSES,
  qaStatusLabel,
  type QaComment,
  type QaEnvironment,
  type QaFinding,
  type QaPriority,
  type QaScreenshot,
  type QaSession,
  type QaState,
  type QaStatus,
} from '@/lib/qaStorage'
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  Frame,
  ImagePlus,
  MessageSquare,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Ticket,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const LAST_AUTHOR_KEY = 'docHub-qa-last-comment-author'

/** Filter key for findings with no assignee */
const UNASSIGNED = '__unassigned__'

/** Slightly rounded chips on finding cards (override badge `rounded-full`). */
const cardChipRounded = 'rounded-md'

type FindingInlinePatch = Partial<
  Pick<QaFinding, 'status' | 'priority' | 'environment' | 'assignee' | 'tags'>
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

function statusBadgeClass(s: QaStatus): string {
  switch (s) {
    case 'open':
      return 'border-slate-500/30 bg-slate-500/10 text-slate-800 dark:text-slate-200'
    case 'triaged':
      return 'border-violet-500/30 bg-violet-500/10 text-violet-900 dark:text-violet-200'
    case 'in_progress':
      return 'border-blue-500/30 bg-blue-500/10 text-blue-800 dark:text-blue-200'
    case 'blocked':
      return 'border-destructive/40 bg-destructive/10 text-destructive'
    case 'verified':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
    case 'wont_fix':
      return 'border-muted-foreground/40 bg-muted text-muted-foreground'
    default:
      return ''
  }
}

function priorityBadgeClass(p: QaPriority): string {
  switch (p) {
    case 'low':
      return 'border-muted-foreground/30 bg-muted/50 text-muted-foreground'
    case 'medium':
      return 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
    case 'high':
      return 'border-amber-500/40 bg-amber-500/15 text-amber-900 dark:text-amber-200'
    case 'critical':
      return ''
    default:
      return ''
  }
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

function LinkRow({ href, label, icon: Icon }: { href: string; label: string; icon: ComponentType<{ className?: string }> }) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
    </a>
  )
}

function FindingTagsPopover({
  tags,
  tagPool,
  onSetTags,
}: {
  tags: string[]
  tagPool: string[]
  onSetTags: (next: string[]) => void
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex max-w-full flex-wrap items-center gap-1.5 rounded-md border border-dashed border-transparent px-0.5 py-0.5 text-left transition-colors hover:border-border hover:bg-muted/30"
        >
          {tags.length === 0 ? (
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
}: {
  assignee: string
  suggestions: string[]
  onSet: (value: string) => void
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            badgeVariants({ variant: 'secondary' }),
            cardChipRounded,
            'inline-flex h-auto max-w-[11rem] cursor-pointer items-center gap-1 truncate border px-2 py-0.5 text-xs font-normal transition-opacity hover:opacity-90',
          )}
        >
          <User className="h-3 w-3 shrink-0 opacity-70" />
          <span className="truncate">{assignee.trim() || 'Assignee…'}</span>
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

  /** Prefer params; also parse pathname so `/qa/:id` works even if param typing/matching glitches. */
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
    const m = /^\/qa\/([^/]+)\/?$/.exec(location.pathname)
    return m?.[1] ? safeDecode(m[1]) : undefined
  }, [params.sessionId, location.pathname])

  const [state, setState] = useState<QaState>(() => loadQaState())
  const [qaRemoteReady, setQaRemoteReady] = useState(false)
  const remoteSaveEnabledRef = useRef(true)

  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [sessionName, setSessionName] = useState('')

  const [findingDialogOpen, setFindingDialogOpen] = useState(false)
  const [editingFindingId, setEditingFindingId] = useState<string | null>(null)
  const [findingTitle, setFindingTitle] = useState('')
  const [findingDescription, setFindingDescription] = useState('')
  const [findingPriority, setFindingPriority] = useState<QaPriority>('medium')
  const [findingStatus, setFindingStatus] = useState<QaStatus>('open')
  const [findingEnvironment, setFindingEnvironment] = useState<QaEnvironment>('STG')
  const [findingTags, setFindingTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [findingAssignee, setFindingAssignee] = useState('')
  const [findingFigmaLink, setFindingFigmaLink] = useState('')
  const [findingTicketLink, setFindingTicketLink] = useState('')
  const [findingScreenshots, setFindingScreenshots] = useState<QaScreenshot[]>([])
  const [screenshotBusy, setScreenshotBusy] = useState(false)
  const [screenshotLightbox, setScreenshotLightbox] = useState<{ dataUrl: string; name: string } | null>(null)

  const [commentsFindingId, setCommentsFindingId] = useState<string | null>(null)
  const [commentAuthor, setCommentAuthor] = useState(() => loadLastAuthor())
  const [commentText, setCommentText] = useState('')

  const [sessionToDelete, setSessionToDelete] = useState<QaSession | null>(null)
  const [findingToDelete, setFindingToDelete] = useState<{ sessionId: string; findingId: string } | null>(null)

  const [filterSearch, setFilterSearch] = useState('')
  const [filterStatuses, setFilterStatuses] = useState<QaStatus[]>([])
  const [filterPriorities, setFilterPriorities] = useState<QaPriority[]>([])
  const [filterAssignees, setFilterAssignees] = useState<string[]>([])
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [filterEnvironments, setFilterEnvironments] = useState<QaEnvironment[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await migrateQaLocalStorageToSupabaseOnce()
        const s = await fetchQaStateFromSupabase()
        if (!cancelled) {
          setState(s)
          remoteSaveEnabledRef.current = true
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        toast.error('Could not load QA from workspace', { description: msg })
        if (!cancelled) {
          setState(loadQaState())
          remoteSaveEnabledRef.current = false
        }
      } finally {
        if (!cancelled) setQaRemoteReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!qaRemoteReady) return
    const t = window.setTimeout(() => {
      if (remoteSaveEnabledRef.current) {
        void persistQaStateToSupabase(state).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          toast.error('QA sync failed', { description: msg })
          saveQaState(state)
        })
      } else {
        saveQaState(state)
      }
    }, 500)
    return () => window.clearTimeout(t)
  }, [state, qaRemoteReady])

  useEffect(() => {
    setFilterSearch('')
    setFilterStatuses([])
    setFilterPriorities([])
    setFilterAssignees([])
    setFilterTags([])
    setFilterEnvironments([])
  }, [sessionIdParam])

  const activeSession = useMemo(
    () => (sessionIdParam ? state.sessions.find((s) => s.id === sessionIdParam) ?? null : null),
    [state.sessions, sessionIdParam],
  )

  const commentsFinding = useMemo(() => {
    if (!activeSession || !commentsFindingId) return null
    return activeSession.findings.find((f) => f.id === commentsFindingId) ?? null
  }, [activeSession, commentsFindingId])

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
        const hay = `${f.title}\n${f.description}\n${f.environment}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filterStatuses.length > 0 && !filterStatuses.includes(f.status)) return false
      if (filterPriorities.length > 0 && !filterPriorities.includes(f.priority)) return false
      if (filterAssignees.length > 0) {
        const key = f.assignee.trim() || UNASSIGNED
        if (!filterAssignees.includes(key)) return false
      }
      if (filterTags.length > 0) {
        const any = filterTags.some((t) => f.tags.includes(t))
        if (!any) return false
      }
      if (filterEnvironments.length > 0 && !filterEnvironments.includes(f.environment)) return false
      return true
    })
  }, [
    activeSession,
    filterSearch,
    filterStatuses,
    filterPriorities,
    filterAssignees,
    filterTags,
    filterEnvironments,
  ])

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

  const filtersActive = useMemo(() => {
    return (
      filterSearch.trim().length > 0 ||
      filterStatuses.length > 0 ||
      filterPriorities.length > 0 ||
      filterAssignees.length > 0 ||
      filterTags.length > 0 ||
      filterEnvironments.length > 0
    )
  }, [filterSearch, filterStatuses, filterPriorities, filterAssignees, filterTags, filterEnvironments])

  const clearFilters = () => {
    setFilterSearch('')
    setFilterStatuses([])
    setFilterPriorities([])
    setFilterAssignees([])
    setFilterTags([])
    setFilterEnvironments([])
  }

  const addTagFromInput = useCallback(() => {
    const t = normalizeTag(tagInput)
    if (!t) return
    setFindingTags((prev) => (prev.includes(t) ? prev : [...prev, t]))
    setTagInput('')
  }, [tagInput])

  const openNewSession = () => {
    setSessionName('')
    setSessionDialogOpen(true)
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
    navigate(`/qa/${id}`)
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
      navigate('/qa', { replace: true })
    }
  }

  const openNewFinding = () => {
    if (!sessionIdParam) return
    setEditingFindingId(null)
    setFindingTitle('')
    setFindingDescription('')
    setFindingPriority('medium')
    setFindingStatus('open')
    setFindingEnvironment('STG')
    setFindingTags([])
    setTagInput('')
    setFindingAssignee('')
    setFindingFigmaLink('')
    setFindingTicketLink('')
    setFindingScreenshots([])
    setFindingDialogOpen(true)
  }

  const openEditFinding = (f: QaFinding) => {
    setEditingFindingId(f.id)
    setFindingTitle(f.title)
    setFindingDescription(f.description)
    setFindingPriority(f.priority)
    setFindingStatus(f.status)
    setFindingEnvironment(f.environment)
    setFindingTags([...f.tags])
    setTagInput('')
    setFindingAssignee(f.assignee)
    setFindingFigmaLink(f.figmaLink)
    setFindingTicketLink(f.ticketLink)
    setFindingScreenshots([...f.screenshots])
    setFindingDialogOpen(true)
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
          const msg = e instanceof Error ? e.message : 'Could not add image'
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
    const title = findingTitle.trim()
    if (!title) {
      toast.error('Title is required')
      return
    }
    const now = new Date().toISOString()
    const figmaLink = normalizeLink(findingFigmaLink)
    const ticketLink = normalizeLink(findingTicketLink)
    const assignee = findingAssignee.trim()

    if (editingFindingId) {
      setState((prev) => ({
        ...prev,
        sessions: prev.sessions.map((s) => {
          if (s.id !== sessionIdParam) return s
          return {
            ...s,
            findings: s.findings.map((f) =>
              f.id === editingFindingId
                ? {
                    ...f,
                    title,
                    description: findingDescription.trim(),
                    tags: findingTags,
                    priority: findingPriority,
                    status: findingStatus,
                    environment: findingEnvironment,
                    screenshots: findingScreenshots,
                    figmaLink,
                    ticketLink,
                    assignee,
                    updatedAt: now,
                  }
                : f,
            ),
          }
        }),
      }))
      toast.success('Finding updated')
    } else {
      const id = newId()
      const finding: QaFinding = {
        id,
        title,
        description: findingDescription.trim(),
        tags: findingTags,
        priority: findingPriority,
        status: findingStatus,
        environment: findingEnvironment,
        comments: [],
        screenshots: findingScreenshots,
        figmaLink,
        ticketLink,
        assignee,
        createdAt: now,
        updatedAt: now,
      }
      setState((prev) => ({
        ...prev,
        sessions: prev.sessions.map((s) =>
          s.id === sessionIdParam ? { ...s, findings: [finding, ...s.findings] } : s,
        ),
      }))
      toast.success('Finding added')
    }
    setFindingDialogOpen(false)
  }

  const confirmDeleteFinding = () => {
    if (!findingToDelete) return
    const { sessionId, findingId } = findingToDelete
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === sessionId ? { ...s, findings: s.findings.filter((f) => f.id !== findingId) } : s,
      ),
    }))
    if (commentsFindingId === findingId) setCommentsFindingId(null)
    setFindingToDelete(null)
    toast.success('Finding removed')
  }

  const addComment = () => {
    if (!sessionIdParam || !commentsFindingId) return
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
            f.id === commentsFindingId
              ? { ...f, comments: [...f.comments, comment], updatedAt: comment.createdAt }
              : f,
          ),
        }
      }),
    }))
    setCommentText('')
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

      <Dialog open={findingDialogOpen} onOpenChange={setFindingDialogOpen}>
        <DialogContent className="flex max-h-[min(92vh,44rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14 text-left">
            <DialogTitle>{editingFindingId ? 'Edit QA item' : 'Add QA item'}</DialogTitle>
            <DialogDescription>
              Details, links, assignee, and screenshots. Saved to your shared workspace (Supabase).
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="qa-finding-title">Title</Label>
              <Input
                id="qa-finding-title"
                value={findingTitle}
                onChange={(e) => setFindingTitle(e.target.value)}
                placeholder="Short summary"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="qa-assignee">Assignee</Label>
                <div className="relative">
                  <User className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="qa-assignee"
                    className="pl-8"
                    value={findingAssignee}
                    onChange={(e) => setFindingAssignee(e.target.value)}
                    placeholder="Owner or triage assignee"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={findingPriority} onValueChange={(v) => setFindingPriority(v as QaPriority)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={findingStatus} onValueChange={(v) => setFindingStatus(v as QaStatus)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QA_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {qaStatusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Environment</Label>
              <Select value={findingEnvironment} onValueChange={(v) => setFindingEnvironment(v as QaEnvironment)}>
                <SelectTrigger className="w-full sm:max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QA_ENVIRONMENTS.map((env) => (
                    <SelectItem key={env} value={env}>
                      {env}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-finding-desc">Details</Label>
              <Textarea
                id="qa-finding-desc"
                value={findingDescription}
                onChange={(e) => setFindingDescription(e.target.value)}
                placeholder="Steps, expected vs actual…"
                rows={3}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="qa-figma">Figma link</Label>
                <Input
                  id="qa-figma"
                  value={findingFigmaLink}
                  onChange={(e) => setFindingFigmaLink(e.target.value)}
                  placeholder="figma.com/…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qa-ticket">Ticket link</Label>
                <Input
                  id="qa-ticket"
                  value={findingTicketLink}
                  onChange={(e) => setFindingTicketLink(e.target.value)}
                  placeholder="jira… or linear…"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Screenshots</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" size="sm" className="gap-1.5" disabled={screenshotBusy} asChild>
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
                  Up to {qaScreenshotLimits.maxCount}, resized for storage
                </span>
              </div>
              {findingScreenshots.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {findingScreenshots.map((s) => (
                    <div key={s.id} className="group relative h-20 w-28 overflow-hidden rounded-md border bg-muted">
                      <img src={s.dataUrl} alt="" className="pointer-events-none h-full w-full object-cover" />
                      <button
                        type="button"
                        className="absolute inset-0 z-0 rounded-md ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setScreenshotLightbox({ dataUrl: s.dataUrl, name: s.name })}
                        aria-label={`View ${s.name} full screen`}
                      />
                      <button
                        type="button"
                        className="absolute right-1 top-1 z-10 rounded bg-background/90 p-0.5 opacity-0 shadow transition-opacity group-hover:opacity-100"
                        aria-label="Remove screenshot"
                        onClick={() => removeScreenshot(s.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-tags">Tags</Label>
              <div className="flex gap-2">
                <Input
                  id="qa-tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault()
                      addTagFromInput()
                    }
                  }}
                  placeholder="Type a tag, press Enter"
                />
                <Button type="button" variant="secondary" onClick={addTagFromInput}>
                  Add
                </Button>
              </div>
              {findingTags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {findingTags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1 pr-1 font-normal">
                      {t}
                      <button
                        type="button"
                        className="rounded-full p-0.5 hover:bg-background/80"
                        aria-label={`Remove tag ${t}`}
                        onClick={() => setFindingTags((prev) => prev.filter((x) => x !== t))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => setFindingDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveFinding}>
              {editingFindingId ? 'Save' : 'Add QA item'}
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
        open={!!commentsFindingId && !!commentsFinding}
        onOpenChange={(open) => {
          if (!open) setCommentsFindingId(null)
        }}
      >
        <DialogContent className="flex max-h-[min(90vh,32rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b px-6 py-4 text-left">
            <DialogTitle>Comments</DialogTitle>
            <DialogDescription className="line-clamp-2">
              {commentsFinding?.title ?? ''}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-[12rem] max-h-[40vh] flex-1 px-6">
            <div className="space-y-4 py-4 pr-3">
              {!commentsFinding?.comments.length ? (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              ) : (
                commentsFinding.comments.map((c) => (
                  <div key={c.id} className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{c.author}</p>
                      <p className="text-xs text-muted-foreground">{formatTime(c.createdAt)}</p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{c.text}</p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          <Separator />
          <div className="shrink-0 space-y-3 px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="qa-comment-author">Your name</Label>
              <Input
                id="qa-comment-author"
                value={commentAuthor}
                onChange={(e) => setCommentAuthor(e.target.value)}
                placeholder="Author name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-comment-text">Comment</Label>
              <Textarea
                id="qa-comment-text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a note or reply…"
                rows={3}
              />
            </div>
            <Button type="button" className="w-full sm:w-auto" onClick={addComment}>
              Add comment
            </Button>
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
          <p className="max-w-sm text-xs text-muted-foreground">Syncing with your shared Supabase workspace.</p>
        </div>
      </div>
    )
  }

  if (sessionIdParam) {
    if (!activeSession) {
      return <Navigate to="/qa" replace />
    }

    return (
      <div className="flex h-[100dvh] min-h-0 flex-col bg-background">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 sm:px-5">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5 px-2" asChild>
            <Link to="/qa">
              <ArrowLeft className="h-4 w-4" />
              All QA pages
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
          <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={openNewFinding}>
            <Plus className="h-4 w-4" />
            Add QA item
          </Button>
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
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setSessionToDelete(activeSession)}
              >
                <Trash2 className="h-4 w-4" />
                Delete this QA page
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {activeSession.findings.length > 0 ? (
          <div className="shrink-0 border-b bg-muted/25 px-4 py-3 sm:px-5">
            <div className="mx-auto flex min-w-0 max-w-4xl flex-nowrap items-center gap-2 overflow-x-auto pb-0.5">
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
          <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
            {activeSession.findings.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/20 p-10 text-center">
                <p className="font-medium">No findings yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add a QA item with screenshots, Figma, ticket, and assignee.
                </p>
                <Button type="button" variant="secondary" className="mt-4 gap-1.5" onClick={openNewFinding}>
                  <Plus className="h-4 w-4" />
                  Add QA item
                </Button>
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
              <ul className="space-y-4">
                {filteredFindings.map((f) => (
                  <li key={f.id} className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-sm font-semibold leading-snug sm:text-base">{f.title}</h2>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className={cn(
                                  badgeVariants({ variant: 'outline' }),
                                  cardChipRounded,
                                  'h-auto max-w-[9rem] shrink-0 cursor-pointer truncate border px-2.5 py-0.5 text-xs font-medium transition-opacity hover:opacity-90',
                                  statusBadgeClass(f.status),
                                )}
                              >
                                {qaStatusLabel(f.status)}
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
                                    {qaStatusLabel(s)}
                                  </DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className={cn(
                                  badgeVariants({ variant: f.priority === 'critical' ? 'destructive' : 'outline' }),
                                  cardChipRounded,
                                  'h-auto shrink-0 cursor-pointer border px-2.5 py-0.5 text-xs font-medium capitalize transition-opacity hover:opacity-90',
                                  f.priority !== 'critical' && priorityBadgeClass(f.priority),
                                )}
                              >
                                {f.priority}
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
                                className={cn(
                                  badgeVariants({ variant: 'secondary' }),
                                  cardChipRounded,
                                  'h-auto shrink-0 cursor-pointer border px-2.5 py-0.5 font-mono text-xs transition-opacity hover:opacity-90',
                                )}
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
                          <FindingAssigneePopover
                            assignee={f.assignee}
                            suggestions={assigneeFilterOptions}
                            onSet={(value) => patchFinding(f.id, { assignee: value })}
                          />
                        </div>
                        {f.description ? (
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{f.description}</p>
                        ) : null}
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1">
                          <LinkRow href={f.figmaLink} label="Open Figma" icon={Frame} />
                          <LinkRow href={f.ticketLink} label="Open ticket" icon={Ticket} />
                        </div>
                        {f.screenshots.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {f.screenshots.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                className="block h-28 w-40 overflow-hidden rounded-lg border bg-muted text-left ring-offset-2 outline-none transition-shadow hover:ring-2 hover:ring-ring focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => setScreenshotLightbox({ dataUrl: s.dataUrl, name: s.name })}
                                aria-label={`View screenshot ${s.name} full screen`}
                              >
                                <img src={s.dataUrl} alt="" className="h-full w-full object-cover" />
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <FindingTagsPopover
                          tags={f.tags}
                          tagPool={tagFilterOptions}
                          onSetTags={(next) => patchFinding(f.id, { tags: next })}
                        />
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-start">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 shrink-0 gap-1 px-2 text-muted-foreground hover:text-foreground"
                          aria-label={
                            f.comments.length > 0
                              ? `Comments, ${f.comments.length}`
                              : 'Comments'
                          }
                          onClick={() => {
                            setCommentsFindingId(f.id)
                            setCommentAuthor((a) => a || loadLastAuthor())
                            setCommentText('')
                          }}
                        >
                          <MessageSquare className="h-4 w-4 shrink-0" />
                          {f.comments.length > 0 ? (
                            <span className="text-xs font-semibold tabular-nums">{f.comments.length}</span>
                          ) : null}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground"
                              aria-label="Finding actions"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => openEditFinding(f)}>
                              <Pencil className="h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() =>
                                setFindingToDelete({ sessionId: activeSession.id, findingId: f.id })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
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
                        <Link to={`/qa/${s.id}`} className="min-w-0 flex-1">
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
                        <Link to={`/qa/${s.id}`}>Open</Link>
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
