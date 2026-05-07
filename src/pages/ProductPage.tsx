import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { Button } from '@/components/ui/button'
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
  defaultProductStandupState,
  saveProductStandupState,
  fetchProductStandupFromSupabase,
  persistProductStandupToSupabase,
  dateKeyFromDate,
  parseDateKey,
  type ProductMember,
  type ProductStandupState,
} from '@/lib/productStandupStorage'
import { Check, ChevronLeft, ChevronRight, Plus, Search, Send } from 'lucide-react'
import { toast } from 'sonner'

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return '?'
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

function avatarStyle(memberId: string): CSSProperties {
  const hues = [262, 200, 330, 145, 25, 170, 310, 220]
  let h = 0
  for (let i = 0; i < memberId.length; i++) h += memberId.charCodeAt(i)
  const hue = hues[h % hues.length]
  return {
    backgroundColor: `hsl(${hue} 45% 46%)`,
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

export function ProductPage() {
  const [state, setState] = useState<ProductStandupState>(() => defaultProductStandupState())
  const [standupRemoteReady, setStandupRemoteReady] = useState(false)
  const remoteSaveEnabledRef = useRef(true)
  const [selectedDayKey, setSelectedDayKey] = useState(() => dateKeyFromDate(new Date()))
  const [search, setSearch] = useState('')
  const [newMemberName, setNewMemberName] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [formMemberId, setFormMemberId] = useState('')
  const [formYesterday, setFormYesterday] = useState('')
  const [formToday, setFormToday] = useState('')
  const [formBlockers, setFormBlockers] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const s = await fetchProductStandupFromSupabase()
        if (!cancelled) {
          setState(s)
          remoteSaveEnabledRef.current = true
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        toast.error('Could not load Product standup', { description: msg })
        if (!cancelled) {
          setState(defaultProductStandupState())
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
      if (remoteSaveEnabledRef.current) {
        void persistProductStandupToSupabase(state).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          toast.error('Standup sync failed', { description: msg })
          saveProductStandupState(state)
        })
      } else {
        saveProductStandupState(state)
      }
    }, 500)
    return () => window.clearTimeout(t)
  }, [state, standupRemoteReady])

  const memberById = useMemo(() => {
    const m = new Map<string, ProductMember>()
    state.members.forEach((x) => m.set(x.id, x))
    return m
  }, [state.members])

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

  const addMember = useCallback(() => {
    const name = newMemberName.trim()
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
      members: [...prev.members, { id, name }],
    }))
    setNewMemberName('')
    toast.success('Member added')
  }, [newMemberName])

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
        <AppHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">Loading Product standup…</p>
          <p className="max-w-sm text-xs text-muted-foreground">Syncing with database....</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />

      <div className="flex min-h-0 flex-1 flex-col border-b bg-muted/15">
        <div className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight">Product</h1>
            <p className="text-xs text-muted-foreground">Async standups · synced with your workspace (Supabase)</p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border bg-background px-1 py-0.5 shadow-sm">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftDay(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[10rem] px-2 text-center text-sm font-medium tabular-nums">
              {formatDayHeading(selectedDayKey)}
            </span>
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
            <div className="space-y-3 border-b p-4">
              <h2 className="text-sm font-semibold">Team</h2>
              <div className="flex gap-2">
                <Input
                  placeholder="New member name"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addMember()}
                  className="h-9"
                />
                <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={addMember} aria-label="Add member">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
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
                        <li
                          key={m.id}
                          className="flex items-center gap-2 rounded-md py-1.5 text-sm"
                        >
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                            style={avatarStyle(m.id)}
                          >
                            {initials(m.name)}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
                          <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        </li>
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
                        <li key={m.id} className="flex items-center gap-2 rounded-md py-1.5 text-sm">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                            style={avatarStyle(m.id)}
                          >
                            {initials(m.name)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">{m.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </ScrollArea>
          </aside>

          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-muted/20">
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
              <p className="mb-6 text-center text-sm font-medium text-muted-foreground">{formatDayHeading(selectedDayKey)}</p>
              {state.members.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-background p-10 text-center">
                  <p className="font-medium">Add team members</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use the sidebar to add people, then submit async standups for the selected day.
                  </p>
                </div>
              ) : filteredSubmissions.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-background p-10 text-center text-sm text-muted-foreground">
                  {search.trim()
                    ? 'No submissions match your search.'
                    : 'No standups for this day yet. Click Submit update.'}
                </div>
              ) : (
                <ul className="space-y-8">
                  {filteredSubmissions.map((s) => {
                    const member = memberById.get(s.memberId)
                    const name = member?.name ?? 'Unknown'
                    return (
                      <li key={s.id} className="rounded-xl border bg-background p-5 shadow-sm">
                        <div className="mb-4 flex items-center gap-3">
                          <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                            style={avatarStyle(s.memberId)}
                          >
                            {initials(name)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold leading-tight">{name}</p>
                            <p className="text-xs text-muted-foreground">{formatSubmissionTime(s.createdAt)}</p>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <section className="border-l-4 border-l-blue-500 pl-4">
                            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              What did you complete yesterday?
                            </h3>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                              {s.yesterday || '—'}
                            </p>
                          </section>
                          <section className="border-l-4 border-l-emerald-500 pl-4">
                            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              What are you working on today?
                            </h3>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                              {s.today || '—'}
                            </p>
                          </section>
                          <section className="border-l-4 border-l-amber-500 pl-4">
                            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                      {m.name}
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
    </div>
  )
}
