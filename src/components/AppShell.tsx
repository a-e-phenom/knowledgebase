import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  DEFAULT_WORKSPACE_ID,
  basePathWithoutWorkspaceSlug,
  createWorkspace,
  deleteWorkspace,
  ensureDefaultWorkspaceRow,
  fetchWorkspaces,
  getActiveWorkspaceId,
  pathForWorkspace,
  renameWorkspace,
  setActiveWorkspaceId,
  workspaceIdFromPath,
  type Workspace,
} from '@/lib/workspaces'
import { ChevronDown, ChevronsLeft, ChevronsRight, FileText, LayoutGrid, Pencil, Plus, ShieldCheck, Sparkles, Trash2, Users2 } from 'lucide-react'
import { toast } from 'sonner'

const SIDEBAR_COLLAPSED_KEY = 'docHub-sidebar-collapsed'

const navItems = [
  { label: 'Modules', to: '/', icon: Sparkles, match: (p: string) => p === '/' || p.startsWith('/modules') },
  { label: 'Documents', to: '/documents', icon: FileText, match: (p: string) => p.startsWith('/documents') },
  { label: 'QA', to: '/qa', icon: ShieldCheck, match: (p: string) => p.startsWith('/qa') },
  { label: 'Team updates', to: '/product', icon: Users2, match: (p: string) => p.startsWith('/product') },
  { label: 'Apps', to: '/apps', icon: LayoutGrid, match: (p: string) => p.startsWith('/apps') },
]

function workspaceInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  }
  const single = parts[0] ?? ''
  return single.slice(0, 2).toUpperCase() || 'WS'
}

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState(() => getActiveWorkspaceId())
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [manageWorkspaceOpen, setManageWorkspaceOpen] = useState(false)
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null)
  const [editingWorkspaceName, setEditingWorkspaceName] = useState('')
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [savingWorkspaceId, setSavingWorkspaceId] = useState<string | null>(null)
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null)
  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null,
    [workspaces, activeWorkspaceId],
  )
  const basePath = useMemo(
    () => basePathWithoutWorkspaceSlug(location.pathname, workspaces),
    [location.pathname, workspaces],
  )
  useEffect(() => {
    void (async () => {
      await ensureDefaultWorkspaceRow()
      const rows = await fetchWorkspaces()
      setWorkspaces(rows)
      const fromPath = workspaceIdFromPath(location.pathname, rows)
      const defaultId = rows.some((w) => w.id === DEFAULT_WORKSPACE_ID) ? DEFAULT_WORKSPACE_ID : rows[0]?.id
      // Unprefixed URLs always map to AE/default workspace.
      const initialId = fromPath ?? defaultId
      if (initialId) {
        setActiveWorkspaceId(initialId)
        setActiveWorkspaceIdState(initialId)
      }
    })()
  }, [location.pathname])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  const selectWorkspace = (workspaceId: string) => {
    const workspace = workspaces.find((w) => w.id === workspaceId)
    if (!workspace) return
    setActiveWorkspaceId(workspaceId)
    setActiveWorkspaceIdState(workspaceId)
    const desiredPath = pathForWorkspace(basePath, workspace)
    if (desiredPath !== location.pathname) {
      navigate(`${desiredPath}${location.search}${location.hash}`, { replace: true })
    }
  }

  useEffect(() => {
    if (!activeWorkspace) return
    const desiredPath = pathForWorkspace(basePath, activeWorkspace)
    if (desiredPath !== location.pathname) {
      navigate(`${desiredPath}${location.search}${location.hash}`, { replace: true })
    }
  }, [activeWorkspace, basePath, location.pathname, location.search, location.hash, navigate])

  const onCreateWorkspace = async () => {
    const name = newWorkspaceName.trim()
    if (!name) {
      toast.error('Workspace name is required')
      return
    }
    try {
      const created = await createWorkspace(name)
      setWorkspaces((prev) => [...prev, created])
      selectWorkspace(created.id)
      setNewWorkspaceOpen(false)
      setNewWorkspaceName('')
      toast.success('Workspace created')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create workspace'
      toast.error(message)
    }
  }

  const startRenameWorkspace = (workspace: Workspace) => {
    setDeleteCandidateId(null)
    setDeleteConfirmText('')
    setEditingWorkspaceId(workspace.id)
    setEditingWorkspaceName(workspace.name)
  }

  const cancelRenameWorkspace = () => {
    setEditingWorkspaceId(null)
    setEditingWorkspaceName('')
  }

  const onRenameWorkspace = async (workspaceId: string) => {
    const name = editingWorkspaceName.trim()
    if (!name) {
      toast.error('Workspace name is required')
      return
    }
    try {
      setSavingWorkspaceId(workspaceId)
      const updated = await renameWorkspace(workspaceId, name)
      setWorkspaces((prev) => prev.map((w) => (w.id === workspaceId ? updated : w)))
      cancelRenameWorkspace()
      toast.success('Workspace renamed')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not rename workspace'
      toast.error(message)
    } finally {
      setSavingWorkspaceId(null)
    }
  }

  const onDeleteWorkspace = async (workspace: Workspace) => {
    try {
      setDeletingWorkspaceId(workspace.id)
      await deleteWorkspace(workspace.id)
      const nextWorkspaces = workspaces.filter((w) => w.id !== workspace.id)
      setWorkspaces(nextWorkspaces)
      setDeleteCandidateId(null)
      setDeleteConfirmText('')
      setEditingWorkspaceId(null)
      setEditingWorkspaceName('')

      if (workspace.id === activeWorkspaceId) {
        const fallback =
          nextWorkspaces.find((w) => w.id === DEFAULT_WORKSPACE_ID) ??
          nextWorkspaces[0] ??
          null
        if (fallback) selectWorkspace(fallback.id)
      }
      toast.success('Workspace deleted')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete workspace'
      toast.error(message)
    } finally {
      setDeletingWorkspaceId(null)
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          'sticky top-0 z-40 h-screen shrink-0 border-r bg-card/40 transition-[width] duration-200',
          collapsed ? 'w-[56px]' : 'w-[280px]',
        )}
      >
        <div className="flex h-full flex-col">
          <div className={cn('flex h-14 items-center gap-2 border-b px-3', collapsed && 'justify-center px-2')}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn('h-8 w-8 shrink-0', collapsed && 'mx-auto')}
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? 'Expand side navigation' : 'Collapse side navigation'}
            >
              {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </Button>
            {!collapsed ? <p className="truncate text-sm font-semibold">DocHub</p> : null}
          </div>

          <div className={cn('p-3', collapsed && 'flex justify-center px-2')}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('w-full justify-between gap-2', collapsed && 'h-9 w-9 justify-center px-0')}
                >
                  {!collapsed ? (
                    <>
                      <span className="truncate">{activeWorkspace?.name ?? 'Workspace'}</span>
                      <ChevronDown className="h-4 w-4 opacity-70" />
                    </>
                  ) : (
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-foreground">
                      {workspaceInitials(activeWorkspace?.name ?? 'Workspace')}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                {workspaces.map((workspace) => (
                  <DropdownMenuItem key={workspace.id} onClick={() => selectWorkspace(workspace.id)} className="justify-between">
                    <span className="truncate">{workspace.name}</span>
                    {workspace.id === activeWorkspaceId ? <Badge variant="secondary">Current</Badge> : null}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setManageWorkspaceOpen(true)}>
                  Manage workspaces
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setNewWorkspaceOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add workspace
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <nav className={cn('flex-1 space-y-1 px-2 pb-3', collapsed && 'px-1')}>
            {navItems.map((item) => {
              const active = item.match(basePath)
              const Icon = item.icon
              const to = pathForWorkspace(item.to, activeWorkspace)
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    active && 'bg-muted text-foreground',
                    collapsed && 'h-9 justify-center rounded-sm px-0',
                  )}
                  title={item.label}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>

      <main key={activeWorkspaceId} className="min-w-0 flex-1">
        <Outlet />
      </main>

      <Dialog open={newWorkspaceOpen} onOpenChange={setNewWorkspaceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="workspace-name">Name</Label>
            <Input
              id="workspace-name"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCreateWorkspace()}
              placeholder="e.g. Automation Engine"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setNewWorkspaceOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={onCreateWorkspace}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={manageWorkspaceOpen}
        onOpenChange={(open) => {
          setManageWorkspaceOpen(open)
          if (!open) {
            setEditingWorkspaceId(null)
            setEditingWorkspaceName('')
            setDeleteCandidateId(null)
            setDeleteConfirmText('')
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage workspaces</DialogTitle>
            <DialogDescription>Rename a workspace or permanently delete it.</DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto py-1">
            {workspaces.map((workspace) => {
              const isEditing = editingWorkspaceId === workspace.id
              const deleteArmed = deleteCandidateId === workspace.id
              const isDefault = workspace.id === DEFAULT_WORKSPACE_ID
              const deleteEnabled = deleteConfirmText.trim() === workspace.name
              return (
                <div key={workspace.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    {isEditing ? (
                      <Input
                        value={editingWorkspaceName}
                        onChange={(e) => setEditingWorkspaceName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void onRenameWorkspace(workspace.id)
                        }}
                        autoFocus
                      />
                    ) : (
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-medium">{workspace.name}</p>
                        {workspace.id === activeWorkspaceId ? <Badge variant="secondary">Current</Badge> : null}
                        {isDefault ? <Badge variant="outline">Default</Badge> : null}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => void onRenameWorkspace(workspace.id)}
                            disabled={savingWorkspaceId === workspace.id}
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelRenameWorkspace}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => startRenameWorkspace(workspace)}>
                          <Pencil className="h-4 w-4" />
                          Rename
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant={deleteArmed ? 'destructive' : 'outline'}
                        onClick={() => {
                          setEditingWorkspaceId(null)
                          setEditingWorkspaceName('')
                          if (deleteArmed) {
                            setDeleteCandidateId(null)
                            setDeleteConfirmText('')
                          } else {
                            setDeleteCandidateId(workspace.id)
                            setDeleteConfirmText('')
                          }
                        }}
                        disabled={isDefault || deletingWorkspaceId === workspace.id}
                      >
                        <Trash2 className="h-4 w-4" />
                        {deleteArmed ? 'Cancel delete' : 'Delete'}
                      </Button>
                    </div>
                  </div>

                  {deleteArmed ? (
                    <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                      <p className="text-sm text-muted-foreground">
                        Type <span className="font-medium text-foreground">{workspace.name}</span> to confirm deletion.
                      </p>
                      <div className="flex items-center gap-2">
                        <Input
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          placeholder={workspace.name}
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void onDeleteWorkspace(workspace)}
                          disabled={!deleteEnabled || deletingWorkspaceId === workspace.id}
                        >
                          Confirm delete
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setManageWorkspaceOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

