import { useState, useEffect, useCallback } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ExternalLink, LayoutGrid, Loader2, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  fetchWorkspaceApps,
  insertWorkspaceApp,
  updateWorkspaceApp,
  deleteWorkspaceApp,
  type WorkspaceApp,
} from '@/lib/workspaceApps'

export function AppsPage() {
  const [apps, setApps] = useState<WorkspaceApp[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingApp, setEditingApp] = useState<WorkspaceApp | null>(null)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [link, setLink] = useState('')
  const [appToDelete, setAppToDelete] = useState<WorkspaceApp | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchWorkspaceApps()
      setApps(rows)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not load apps'
      toast.error(message)
      setApps([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const resetForm = () => {
    setEditingApp(null)
    setTitle('')
    setDescription('')
    setLink('')
  }

  const openAddDialog = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEditDialog = (app: WorkspaceApp) => {
    setEditingApp(app)
    setTitle(app.title)
    setDescription(app.description ?? '')
    setLink(app.link)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }
    if (!link.trim()) {
      toast.error('Link is required')
      return
    }
    setSaving(true)
    try {
      if (editingApp) {
        await updateWorkspaceApp(editingApp.id, {
          title: title.trim(),
          description: description.trim(),
          link: link.trim(),
        })
        toast.success('App updated')
      } else {
        await insertWorkspaceApp({
          title: title.trim(),
          description: description.trim(),
          link: link.trim(),
        })
        toast.success('App added')
      }
      setDialogOpen(false)
      resetForm()
      await load()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not save app'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!appToDelete) return
    try {
      await deleteWorkspaceApp(appToDelete.id)
      toast.success('App removed')
      setAppToDelete(null)
      await load()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not delete app'
      toast.error(message)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader crumbs={[{ label: 'Apps' }]} />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <LayoutGrid className="h-7 w-7 text-muted-foreground" />
              Apps
            </h1>
            
          </div>
          <Button type="button" className="gap-2 shrink-0" onClick={openAddDialog}>
            <Plus className="h-4 w-4" />
            Add app
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : apps.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8">
            No apps yet. Use <span className="font-medium text-foreground">Add app</span> to create one. If the list
            stays empty, apply the migration{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">20260414130000_workspace_apps.sql</code> in
            Supabase.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((app) => (
              <Card key={app.id} className="flex flex-col overflow-hidden">
                <CardHeader className="flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug">{app.title}</CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          title="More actions"
                          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                          }}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          onClick={() => {
                            openEditDialog(app)
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setAppToDelete(app)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {app.description ? (
                    <CardDescription className="text-sm leading-relaxed line-clamp-4">
                      {app.description}
                    </CardDescription>
                  ) : null}
                  <div className="pt-2 flex flex-wrap gap-2">
                    <Button type="button" size="sm" className="gap-1.5" asChild>
                      <a href={app.link} target="_blank" rel="noopener noreferrer">
                        Visit
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) resetForm()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingApp ? 'Edit app' : 'Add app'}</DialogTitle>
            <DialogDescription>
              {editingApp
                ? 'Update the title, description, or link. Visiting still opens in a new tab.'
                : 'Name it, describe it, and paste the URL. Links open in a new tab.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="app-title">Title</Label>
              <Input
                id="app-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Design system"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="app-description">Description</Label>
              <Textarea
                id="app-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this app for?"
                rows={3}
                className="resize-y min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="app-link">Link</Label>
              <Input
                id="app-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://…"
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editingApp ? 'Save changes' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!appToDelete} onOpenChange={(open) => !open && setAppToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove &quot;{appToDelete?.title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the shortcut from DocHub. It does not delete the external site.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
