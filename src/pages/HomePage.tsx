import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { MoreVertical, Settings, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { fetchModules, getAllModules, deleteModule, type Module } from '@/lib/moduleSettings'
import { ModuleIconComponent } from '@/components/ModuleIconComponent'
import { AppHeader } from '@/components/AppHeader'
import { CREATE_PROTOTYPE_MODULE_ID } from '@/lib/createPrototypeSchema'

export function HomePage() {
  const [modules, setModules] = useState<Module[]>([])
  const [moduleToDelete, setModuleToDelete] = useState<Module | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    fetchModules()
      .then((list) => {
        if (!cancelled) setModules(list)
      })
      .catch(() => {
        if (!cancelled) setModules(getAllModules())
      })
    return () => {
      cancelled = true
    }
  }, [])

  const openSettings = (mod: Module, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigate(`/modules/${mod.id}/settings`)
  }

  const confirmDelete = (mod: Module, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setModuleToDelete(mod)
  }

  const handleDelete = async () => {
    if (!moduleToDelete) return
    try {
      await deleteModule(moduleToDelete.id)
      setModules(getAllModules())
      setModuleToDelete(null)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not delete module'
      toast.error(message)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader crumbs={[{ label: 'Home' }]} />

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="space-y-1 mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Product Documentation Hub
          </h1>
          <p className="text-muted-foreground">
            Manage documents and create AI Modules to automate workflows.
          </p>
        </div>

        <Separator className="mb-8" />

        <div>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold tracking-tight">AI Modules</h2>
              <Badge variant="secondary">{modules.length}</Badge>
            </div>
            <Link to="/modules/new/settings">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                New module
              </Button>
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((mod) => (
              <div key={mod.id} className="relative group">
                <Link to={`/modules/${mod.id}`}>
                  <Card className="h-full transition-all duration-200 hover:shadow-md hover:border-primary/30 cursor-pointer">
                    <CardHeader>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          <ModuleIconComponent icon={mod.icon} className={`h-5 w-5 ${mod.color}`} />
                        </div>
                        {mod.id === CREATE_PROTOTYPE_MODULE_ID ? (
                          <div className="h-8 w-8 shrink-0" aria-hidden />
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity rounded-md p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
                              <DropdownMenuItem onClick={(e) => openSettings(mod, e)}>
                                <Settings className="h-4 w-4 mr-2" />
                                Settings
                              </DropdownMenuItem>
                              {!mod.builtin && (
                                <DropdownMenuItem
                                  onClick={(e) => confirmDelete(mod, e)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                      <CardTitle className="text-base flex flex-wrap items-center gap-2">
                        <span>{mod.label}</span>
                        {mod.id === CREATE_PROTOTYPE_MODULE_ID && (
                          <Badge variant="outline" className="font-mono text-[10px] tracking-wide">
                            DEMO
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="text-sm leading-relaxed">{mod.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AlertDialog open={!!moduleToDelete} onOpenChange={(open) => !open && setModuleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{moduleToDelete?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this module and all its settings. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
