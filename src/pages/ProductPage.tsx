import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
} from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar, CalendarDayButton } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import {
  defaultProductStandupState,
  loadProductStandupState,
  saveProductStandupState,
  fetchProductStandupFromSupabase,
  persistProductStandupToSupabase,
  dateKeyFromDate,
  parseDateKey,
  PRODUCT_TEAMS,
  type ProductMember,
  type ProductStandupState,
  type ProductTeam,
} from '@/lib/productStandupStorage'

const STANDUP_SAVE_DEBOUNCE_MS = 200
import { Check, ChevronLeft, ChevronRight, MoreVertical, Pencil, Plus, Search, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return '?'
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

/**
 * Distinct, modern fills (indigo / sky / teal / rose, etc.) — tuned for white initials.
 * While roster length ≤ this list, each member gets a unique color (by name order).
 * Beyond that, colors cycle with minimal palette size.
 */
const MODERN_AVATAR_BACKGROUNDS = [
  '#6366f1',
  '#0ea5e9',
  '#14b8a6',
  '#22c55e',
  '#a855f7',
  '#ec4899',
  '#f97316',
  '#3b82f6',
  '#8b5cf6',
  '#06b6d4',
  '#d946ef',
  '#ef4444',
  '#10b981',
  '#f43f5e',
  '#7c3aed',
  '#0891b2',
  '#4f46e5',
  '#0d9488',
  '#db2777',
  '#ea580c',
] as const

function sortedMemberIdsByDisplayName(members: ProductMember[]): string[] {
  return [...members]
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      if (byName !== 0) return byName
      return a.id.localeCompare(b.id)
    })
    .map((m) => m.id)
}

function avatarBackgroundColor(memberId: string, sortedMemberIds: string[]): string {
  const idx = sortedMemberIds.indexOf(memberId)
  const palette = MODERN_AVATAR_BACKGROUNDS
  const n = sortedMemberIds.length
  let colorIndex: number
  if (idx >= 0) {
    colorIndex = n <= palette.length ? idx : idx % palette.length
  } else {
    let h = 0
    for (let i = 0; i < memberId.length; i++) h += memberId.charCodeAt(i)
    colorIndex = h % palette.length
  }
  return palette[colorIndex] ?? palette[0]
}

function avatarStyle(memberId: string, sortedMemberIds: string[]): CSSProperties {
  return {
    backgroundColor: avatarBackgroundColor(memberId, sortedMemberIds),
    color: '#fff',
  }
}

function formatDayHeading(dateKey: string) {
  const d = parseDateKey(dateKey)
  const todayKey = dateKeyFromDate(new Date())
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }
  if (dateKey === todayKey) {
    return `Today, ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
  }
  return d.toLocaleDateString(undefined, opts)
}

function formatSubmissionTime(iso: string) {
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

function createStandupCalendarDayButton(
  submissionMemberIdsByDateKey: Map<string, string[]>,
  sortedMemberIdsForAvatars: string[],
  memberById: Map<string, ProductMember>,
) {
  return function StandupCalendarDayButton(props: ComponentProps<typeof CalendarDayButton>) {
    const { className, children, day, modifiers, ...rest } = props
    const dateKey = dateKeyFromDate(day.date)
    const memberIds = submissionMemberIdsByDateKey.get(dateKey) ?? []
    return (
      <CalendarDayButton
        day={day}
        modifiers={modifiers}
        {...rest}
        className={cn(className, memberIds.length > 0 && 'pb-px')}
      >
        {children}
        {memberIds.length > 0 ? (
          <span
            className="pointer-events-none flex w-full max-w-[calc(var(--cell-size)-6px)] flex-wrap content-center justify-center gap-px px-0.5"
            aria-hidden
          >
            {memberIds.map((id) => (
              <span
                key={id}
                title={memberById.get(id)?.name ?? 'Former teammate'}
                className="size-1 shrink-0 rounded-full ring-1 ring-background/90 dark:ring-foreground/20"
                style={{ backgroundColor: avatarBackgroundColor(id, sortedMemberIdsForAvatars) }}
              />
            ))}
          </span>
        ) : null}
      </CalendarDayButton>
    )
  }
}

function TeamMemberRow({
  member,
  submitted,
  sortedMemberIdsForAvatars,
  onEdit,
  onDelete,
}: {
  member: ProductMember
  submitted: boolean
  sortedMemberIdsForAvatars: string[]
  onEdit: () => void
  onDelete: () => void
}) {
  const teamCaps = member.team.toUpperCase()

  return (
    <li className="flex items-start gap-2 rounded-md py-1.5 pr-0.5 text-sm">
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
        style={avatarStyle(member.id, sortedMemberIdsForAvatars)}
      >
        {initials(member.name)}
      </span>
      <div className="min-w-0 flex-1 pt-0.5" title={member.name}>
        <p
          className={`truncate leading-tight ${submitted ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
        >
          {member.name}
        </p>
        <p className="mt-0.5 text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">{teamCaps}</p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 self-center">
        {submitted ? (
          <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        ) : (
          <span className="inline-block w-4 shrink-0" aria-hidden />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={`Actions for ${member.name}`}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={() => {
                onEdit()
              }}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                onDelete()
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

export function ProductPage() {
  const [state, setState] = useState<ProductStandupState>(() => defaultProductStandupState())
  const [standupRemoteReady, setStandupRemoteReady] = useState(false)
  const remoteSaveEnabledRef = useRef(true)
  const stateRef = useRef<ProductStandupState>(state)
  const standupRemoteReadyRef = useRef(false)
  const [selectedDayKey, setSelectedDayKey] = useState(() => dateKeyFromDate(new Date()))
  const [search, setSearch] = useState('')
  const [memberAddOpen, setMemberAddOpen] = useState(false)
  const [memberAddName, setMemberAddName] = useState('')
  const [memberAddTeam, setMemberAddTeam] = useState<ProductTeam>('Product')
  const [modalOpen, setModalOpen] = useState(false)
  const [formMemberId, setFormMemberId] = useState('')
  const [formYesterday, setFormYesterday] = useState('')
  const [formToday, setFormToday] = useState('')
  const [formBlockers, setFormBlockers] = useState('')
  const [memberEditOpen, setMemberEditOpen] = useState(false)
  const [memberEditId, setMemberEditId] = useState<string | null>(null)
  const [memberEditName, setMemberEditName] = useState('')
  const [memberEditTeam, setMemberEditTeam] = useState<ProductTeam>('Product')
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => parseDateKey(dateKeyFromDate(new Date())))

  stateRef.current = state
  standupRemoteReadyRef.current = standupRemoteReady

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const s = await fetchProductStandupFromSupabase()
        if (!cancelled) {
          setState(s)
          saveProductStandupState(s)
          remoteSaveEnabledRef.current = true
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        toast.error('Could not load Product standup', { description: msg })
        if (!cancelled) {
          const local = loadProductStandupState()
          if (local.members.length > 0 || local.submissions.length > 0) {
            setState(local)
          } else {
            setState(defaultProductStandupState())
          }
          remoteSaveEnabledRef.current = false
        }
      } finally {
        if (!cancelled) setStandupRemoteReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!standupRemoteReady) return
    const t = window.setTimeout(() => {
      const snap = stateRef.current
      if (remoteSaveEnabledRef.current) {
        void persistProductStandupToSupabase(snap)
          .then(() => {
            saveProductStandupState(snap)
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'Unknown error'
            toast.error('Standup sync failed', { description: msg })
            saveProductStandupState(snap)
          })
      } else {
        saveProductStandupState(snap)
      }
    }, STANDUP_SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [state, standupRemoteReady])

  /** Flush latest standup when leaving the page so a pending debounce cannot drop edits. */
  useEffect(() => {
    return () => {
      if (!standupRemoteReadyRef.current) return
      const snap = stateRef.current
      if (remoteSaveEnabledRef.current) {
        void persistProductStandupToSupabase(snap)
          .then(() => saveProductStandupState(snap))
          .catch(() => saveProductStandupState(snap))
      } else {
        saveProductStandupState(snap)
      }
    }
  }, [])

  /** Sync backup when the tab is hidden or closed (async Supabase may not finish in time). */
  useEffect(() => {
    const onPageHide = () => {
      if (!standupRemoteReadyRef.current) return
      saveProductStandupState(stateRef.current)
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [])

  useEffect(() => {
    if (datePickerOpen) setCalendarMonth(parseDateKey(selectedDayKey))
  }, [datePickerOpen, selectedDayKey])

  const memberById = useMemo(() => {
    const m = new Map<string, ProductMember>()
    state.members.forEach((x) => m.set(x.id, x))
    return m
  }, [state.members])

  const sortedMemberIdsForAvatars = useMemo(
    () => sortedMemberIdsByDisplayName(state.members),
    [state.members],
  )

  /** dateKey → unique submitter ids, ordered like the roster (then unknown ids). */
  const submissionMemberIdsByDateKey = useMemo(() => {
    const byDay = new Map<string, Set<string>>()
    for (const s of state.submissions) {
      let set = byDay.get(s.dateKey)
      if (!set) {
        set = new Set()
        byDay.set(s.dateKey, set)
      }
      set.add(s.memberId)
    }
    const ordered = new Map<string, string[]>()
    for (const [dateKey, idSet] of byDay) {
      const rosterOrder = sortedMemberIdsForAvatars.filter((id) => idSet.has(id))
      const unknown = [...idSet].filter((id) => !sortedMemberIdsForAvatars.includes(id)).sort()
      ordered.set(dateKey, [...rosterOrder, ...unknown])
    }
    return ordered
  }, [state.submissions, sortedMemberIdsForAvatars])

  const standupCalendarComponents = useMemo(
    () => ({
      DayButton: createStandupCalendarDayButton(
        submissionMemberIdsByDateKey,
        sortedMemberIdsForAvatars,
        memberById,
      ),
    }),
    [submissionMemberIdsByDateKey, sortedMemberIdsForAvatars, memberById],
  )

  const selectedCalendarDate = useMemo(() => parseDateKey(selectedDayKey), [selectedDayKey])

  const submissionsForDay = useMemo(
    () => state.submissions.filter((s) => s.dateKey === selectedDayKey),
    [state.submissions, selectedDayKey],
  )

  const submittedIds = useMemo(() => new Set(submissionsForDay.map((s) => s.memberId)), [submissionsForDay])

  const submittedMembers = useMemo(
    () => state.members.filter((m) => submittedIds.has(m.id)),
    [state.members, submittedIds],
  )

  const notSubmittedMembers = useMemo(
    () => state.members.filter((m) => !submittedIds.has(m.id)),
    [state.members, submittedIds],
  )

  const filteredSubmissions = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = [...submissionsForDay].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    if (!q) return list
    list = list.filter((s) => {
      const name = memberById.get(s.memberId)?.name ?? ''
      return (
        name.toLowerCase().includes(q) ||
        s.yesterday.toLowerCase().includes(q) ||
        s.today.toLowerCase().includes(q) ||
        s.blockers.toLowerCase().includes(q)
      )
    })
    return list
  }, [submissionsForDay, search, memberById])

  const openMemberAdd = useCallback(() => {
    setMemberAddName('')
    setMemberAddTeam('Product')
    setMemberAddOpen(true)
  }, [])

  const saveMemberAdd = useCallback(() => {
    const name = memberAddName.trim()
    if (!name) {
      toast.error('Enter a name')
      return
    }
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `m-${Date.now()}`
    setState((prev) => ({
      ...prev,
      members: [...prev.members, { id, name, team: memberAddTeam }],
    }))
    setMemberAddOpen(false)
    setMemberAddName('')
    toast.success('Member added')
  }, [memberAddName, memberAddTeam])

  const openMemberEdit = useCallback((m: ProductMember) => {
    setMemberEditId(m.id)
    setMemberEditName(m.name)
    setMemberEditTeam(m.team)
    setMemberEditOpen(true)
  }, [])

  const saveMemberEdit = useCallback(() => {
    const name = memberEditName.trim()
    if (!name) {
      toast.error('Enter a name')
      return
    }
    if (!memberEditId) return
    setState((prev) => ({
      ...prev,
      members: prev.members.map((m) =>
        m.id === memberEditId ? { ...m, name, team: memberEditTeam } : m,
      ),
    }))
    setMemberEditOpen(false)
    setMemberEditId(null)
    toast.success('Member updated')
  }, [memberEditId, memberEditName, memberEditTeam])

  const removeMember = useCallback((memberId: string) => {
    setState((prev) => ({
      ...prev,
      members: prev.members.filter((m) => m.id !== memberId),
      submissions: prev.submissions.filter((s) => s.memberId !== memberId),
    }))
    setFormMemberId((id) => (id === memberId ? '' : id))
    toast.success('Member removed')
  }, [])

  const shiftDay = (delta: number) => {
    const d = parseDateKey(selectedDayKey)
    d.setDate(d.getDate() + delta)
    setSelectedDayKey(dateKeyFromDate(d))
  }

  const openModal = () => {
    const firstPending = state.members.find((m) => !submittedIds.has(m.id))
    setFormMemberId(firstPending?.id ?? state.members[0]?.id ?? '')
    setFormYesterday('')
    setFormToday('')
    setFormBlockers('')
    setModalOpen(true)
  }

  const submitStandup = () => {
    if (!formMemberId) {
      toast.error('Choose who you are from the team.')
      return
    }
    if (!formYesterday.trim() && !formToday.trim() && !formBlockers.trim()) {
      toast.error('Fill in at least one answer.')
      return
    }
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `s-${Date.now()}`
    const createdAt = new Date().toISOString()
    setState((prev) => ({
      ...prev,
      submissions: [
        ...prev.submissions.filter(
          (s) => !(s.memberId === formMemberId && s.dateKey === selectedDayKey),
        ),
        {
          id,
          memberId: formMemberId,
          dateKey: selectedDayKey,
          yesterday: formYesterday.trim(),
          today: formToday.trim(),
          blockers: formBlockers.trim(),
          createdAt,
        },
      ],
    }))
    setModalOpen(false)
    toast.success('Standup saved')
  }

  if (!standupRemoteReady) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">Loading Product standup…</p>
          <p className="max-w-sm text-xs text-muted-foreground">Syncing with database....</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex min-h-0 flex-1 flex-col border-b bg-muted/15">
        <div className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight">Team updates</h1>
            <p className="text-xs text-muted-foreground">Async standups</p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border bg-background px-1 py-0.5 shadow-sm">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftDay(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="min-w-[10rem] shrink-0 rounded-md px-2 py-1 text-center text-sm font-medium tabular-nums text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label="Open calendar"
                >
                  {formatDayHeading(selectedDayKey)}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center" sideOffset={6}>
                <Calendar
                  mode="single"
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  selected={selectedCalendarDate}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDayKey(dateKeyFromDate(date))
                      setDatePickerOpen(false)
                    }
                  }}
                  components={standupCalendarComponents}
                />
              </PopoverContent>
            </Popover>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftDay(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search submissions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8"
            />
          </div>
          <Button type="button" onClick={openModal} disabled={state.members.length === 0} className="gap-1.5">
            <Send className="h-4 w-4" />
            Submit update
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="flex w-full shrink-0 flex-col border-b bg-background md:w-72 md:border-b-0 md:border-r">
            <div className="flex items-center justify-between gap-2 border-b p-4">
              <h2 className="text-sm font-semibold">Team</h2>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={openMemberAdd}>
                <Plus className="h-4 w-4" />
                Add member
              </Button>
            </div>
            <ScrollArea className="min-h-[200px] max-h-[40vh] flex-1 md:max-h-none">
              <div className="space-y-4 p-4">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Submitted</p>
                  {submittedMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No one yet for this day.</p>
                  ) : (
                    <ul className="space-y-1">
                      {submittedMembers.map((m) => (
                        <TeamMemberRow
                          key={m.id}
                          member={m}
                          submitted
                          sortedMemberIdsForAvatars={sortedMemberIdsForAvatars}
                          onEdit={() => openMemberEdit(m)}
                          onDelete={() => removeMember(m.id)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
                <Separator />
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Not submitted</p>
                  {notSubmittedMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Everyone has submitted.</p>
                  ) : (
                    <ul className="space-y-1">
                      {notSubmittedMembers.map((m) => (
                        <TeamMemberRow
                          key={m.id}
                          member={m}
                          submitted={false}
                          sortedMemberIdsForAvatars={sortedMemberIdsForAvatars}
                          onEdit={() => openMemberEdit(m)}
                          onDelete={() => removeMember(m.id)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </ScrollArea>
          </aside>

          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-muted/20">
            <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
              <p className="mb-5 text-center text-sm font-medium text-muted-foreground">{formatDayHeading(selectedDayKey)}</p>
              {state.members.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-background p-10 text-center">
                  <p className="font-medium">Add team members</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add people to the roster, then submit standups for the selected day.
                  </p>
                  <Button type="button" className="mt-4 gap-1.5" onClick={openMemberAdd}>
                    <Plus className="h-4 w-4" />
                    Add member
                  </Button>
                </div>
              ) : filteredSubmissions.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-background p-10 text-center text-sm text-muted-foreground">
                  {search.trim()
                    ? 'No submissions match your search.'
                    : 'No standups for this day yet. Click Submit update.'}
                </div>
              ) : (
                <ul className="space-y-5">
                  {filteredSubmissions.map((s) => {
                    const member = memberById.get(s.memberId)
                    const name = member?.name ?? 'Unknown'
                    const team = member?.team
                    return (
                      <li
                        key={s.id}
                        className="rounded-lg border border-border bg-background p-4 shadow-sm sm:p-5"
                      >
                        <div className="mb-3 flex items-center gap-3">
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold sm:h-10 sm:w-10 sm:text-sm"
                            style={avatarStyle(s.memberId, sortedMemberIdsForAvatars)}
                          >
                            {initials(name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold leading-tight">{name}</p>
                              {team ? (
                                <Badge variant="secondary" className="text-xs font-normal">
                                  {team}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{formatSubmissionTime(s.createdAt)}</p>
                          </div>
                        </div>
                        <div className="space-y-3.5">
                          <section className="border-l border-muted-foreground/30 pl-3">
                            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              What did you complete yesterday?
                            </h3>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                              {s.yesterday || '—'}
                            </p>
                          </section>
                          <section className="border-l border-muted-foreground/30 pl-3">
                            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              What are you working on today?
                            </h3>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                              {s.today || '—'}
                            </p>
                          </section>
                          <section className="border-l border-muted-foreground/30 pl-3">
                            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              What blockers do you have?
                            </h3>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                              {s.blockers || '—'}
                            </p>
                          </section>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </main>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[min(90vh,40rem)] gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="space-y-1 border-b px-6 py-4 text-left">
            <DialogTitle>Add submission</DialogTitle>
            <DialogDescription>
              {parseDateKey(selectedDayKey).toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="standup-member">Who are you?</Label>
              <Select value={formMemberId} onValueChange={setFormMemberId}>
                <SelectTrigger id="standup-member" className="w-full">
                  <SelectValue placeholder="Select a team member" />
                </SelectTrigger>
                <SelectContent>
                  {state.members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex items-center gap-2">
                        <span>{m.name}</span>
                        <span className="text-xs text-muted-foreground">({m.team})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Pick yourself (or whoever you are submitting for).</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="standup-yesterday">What did you complete yesterday?</Label>
              <Textarea
                id="standup-yesterday"
                placeholder="Answer here…"
                value={formYesterday}
                onChange={(e) => setFormYesterday(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="standup-today">What are you working on today?</Label>
              <Textarea
                id="standup-today"
                placeholder="Answer here…"
                value={formToday}
                onChange={(e) => setFormToday(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="standup-blockers">What blockers do you have?</Label>
              <Textarea
                id="standup-blockers"
                placeholder="Answer here…"
                value={formBlockers}
                onChange={(e) => setFormBlockers(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="border-t px-6 py-4 sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitStandup}>
              Submit update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={memberAddOpen}
        onOpenChange={(open) => {
          setMemberAddOpen(open)
          if (!open) setMemberAddName('')
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
            <DialogDescription>Add someone to the roster with a name and team.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="member-add-name">Name</Label>
              <Input
                id="member-add-name"
                value={memberAddName}
                onChange={(e) => setMemberAddName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveMemberAdd()
                }}
                className="h-9"
                placeholder="Full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-add-team">Team</Label>
              <Select value={memberAddTeam} onValueChange={(v) => setMemberAddTeam(v as ProductTeam)}>
                <SelectTrigger id="member-add-team" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_TEAMS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setMemberAddOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveMemberAdd}>
              Add member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={memberEditOpen}
        onOpenChange={(open) => {
          setMemberEditOpen(open)
          if (!open) setMemberEditId(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit team member</DialogTitle>
            <DialogDescription>Change their name and team (Product, UX, or Engineering).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="member-edit-name">Name</Label>
              <Input
                id="member-edit-name"
                value={memberEditName}
                onChange={(e) => setMemberEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveMemberEdit()
                }}
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-edit-team">Team</Label>
              <Select value={memberEditTeam} onValueChange={(v) => setMemberEditTeam(v as ProductTeam)}>
                <SelectTrigger id="member-edit-team" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_TEAMS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setMemberEditOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveMemberEdit}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
