import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Trash2, FileText, PenLine, Check, ChevronsUpDown, MessageSquare, LayoutGrid } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { toast } from 'sonner'
import {
  fetchModules,
  getModule,
  saveModule,
  deleteModule,
  createModule,
  MODULE_ICON_OPTIONS,
  MODULE_COLOR_OPTIONS,
  type ModuleIcon,
  type ModuleOutputMode,
} from '@/lib/moduleSettings'
import { STRUCTURED_OUTPUT_JSON_EXAMPLE } from '@/lib/structuredModuleOutput'
import { CREATE_PROTOTYPE_MODULE_ID } from '@/lib/createPrototypeSchema'
import { ModuleIconComponent } from '@/components/ModuleIconComponent'
import { AppHeader } from '@/components/AppHeader'
import { SHARED_WORKSPACE_USER_ID } from '@/lib/sharedWorkspace'

const DEFAULT_INSTRUCTIONS = 'You are a helpful AI assistant. Answer questions clearly and concisely.'

type DocOption = { id: string; title: string }

export function ModuleSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState<ModuleIcon>('sparkles')
  const [color, setColor] = useState('text-violet-500')
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS)
  const [useDocMode, setUseDocMode] = useState(false)
  const [instructionsDocId, setInstructionsDocId] = useState<string | null>(null)
  const [isBuiltin, setIsBuiltin] = useState(false)
  const [outputMode, setOutputMode] = useState<ModuleOutputMode>('chat')
  const [structuredOutputPrompt, setStructuredOutputPrompt] = useState('')

  const [documents, setDocuments] = useState<DocOption[]>([])
  const [docPickerOpen, setDocPickerOpen] = useState(false)

  const selectedDoc = documents.find(d => d.id === instructionsDocId)

  useEffect(() => {
    if (!isNew && id === CREATE_PROTOTYPE_MODULE_ID) {
      navigate('/modules/create-prototype', { replace: true })
    }
  }, [id, isNew, navigate])

  const fetchDocuments = useCallback(async () => {
    const { data: skillsFolder } = await supabase
      .from('folders')
      .select('id')
      .eq('user_id', SHARED_WORKSPACE_USER_ID)
      .ilike('name', 'Skills')
      .maybeSingle()

    if (!skillsFolder) { setDocuments([]); return }

    const { data } = await supabase
      .from('documents')
      .select('id, title')
      .eq('user_id', SHARED_WORKSPACE_USER_ID)
      .eq('folder_id', skillsFolder.id)
      .is('file_url', null)
      .order('title')
    setDocuments(data || [])
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await fetchModules()
      await fetchDocuments()
      if (cancelled) return
      if (isNew) return
      const mod = getModule(id!)
      if (!mod) {
        navigate('/')
        return
      }
      setLabel(mod.label)
      setDescription(mod.description)
      setIcon(mod.icon)
      setColor(mod.color)
      setInstructions(mod.instructions)
      if (mod.instructionsDocId) {
        setUseDocMode(true)
        setInstructionsDocId(mod.instructionsDocId)
      }
      setIsBuiltin(!!mod.builtin)
      setOutputMode(mod.outputMode ?? 'chat')
      setStructuredOutputPrompt(mod.structuredOutputPrompt ?? '')
    })()
    return () => {
      cancelled = true
    }
  }, [id, isNew, navigate, fetchDocuments])

  const handleSave = async () => {
    if (!label.trim()) { toast.error('Module name is required'); return }
    if (!useDocMode && !instructions.trim()) { toast.error('Instructions are required'); return }
    if (useDocMode && !instructionsDocId) { toast.error('Please select a document for instructions'); return }

    const payload = {
      label: label.trim(),
      description: description.trim(),
      icon,
      color,
      instructions: useDocMode ? instructions.trim() || '(loaded from document)' : instructions.trim(),
      instructionsDocId: useDocMode ? instructionsDocId : null,
      outputMode,
      structuredOutputPrompt: outputMode === 'structured' ? structuredOutputPrompt.trim() : '',
    }

    try {
      if (isNew) {
        const mod = await createModule(payload)
        toast.success('Module created')
        navigate(`/modules/${mod.id}`)
      } else {
        const existing = getModule(id!)!
        await saveModule({ ...existing, ...payload })
        toast.success('Settings saved')
        navigate(`/modules/${id}`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not save module'
      toast.error(message)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteModule(id!)
      toast.success('Module deleted')
      navigate('/')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not delete module'
      toast.error(message)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        crumbs={
          isNew
            ? [{ label: 'New Module' }]
            : [{ label: label || 'Module', to: `/modules/${id}` }, { label: 'Settings' }]
        }
      />

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {isNew ? 'New Module' : 'Module Settings'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure this AI module's identity and agent instructions.
          </p>
        </div>

        <Separator />

        {/* Identity card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identity</CardTitle>
            <CardDescription>The name, icon, and description shown on the home screen.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="label">Name</Label>
              <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Release Notes Writer" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description shown on the home screen" />
            </div>

            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2">
                {MODULE_ICON_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setIcon(opt.value)}
                    title={opt.label}
                    className={`flex items-center justify-center h-10 w-10 rounded-lg border-2 transition-colors ${icon === opt.value ? 'border-primary bg-primary/5' : 'border-transparent hover:border-muted-foreground/30 bg-muted'}`}
                  >
                    <ModuleIconComponent icon={opt.value} className="h-5 w-5" />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {MODULE_COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setColor(opt.value)}
                    title={opt.label}
                    className={`flex items-center justify-center h-10 w-10 rounded-lg border-2 transition-colors ${color === opt.value ? 'border-primary bg-primary/5' : 'border-transparent hover:border-muted-foreground/30 bg-muted'}`}
                  >
                    <ModuleIconComponent icon={icon} className={`h-5 w-5 ${opt.value}`} />
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Agent Instructions card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agent Instructions</CardTitle>
            <CardDescription>
              The system prompt sent to the AI at the start of every conversation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              value={useDocMode ? 'document' : 'write'}
              onValueChange={(v) => {
                const docMode = v === 'document'
                setUseDocMode(docMode)
                if (!docMode) setInstructionsDocId(null)
              }}
            >
              <TabsList className="mb-4 w-full">
                <TabsTrigger value="write" className="gap-1.5">
                  <PenLine className="h-3.5 w-3.5" />
                  Write
                </TabsTrigger>
                <TabsTrigger value="document" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Choose document
                </TabsTrigger>
              </TabsList>

              <TabsContent value="write">
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={12}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y font-mono leading-relaxed"
                  placeholder="You are a helpful assistant…"
                />
              </TabsContent>

              <TabsContent value="document" className="space-y-3">
                <Popover open={docPickerOpen} onOpenChange={setDocPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={docPickerOpen}
                      className="w-full justify-between font-normal h-auto min-h-10 py-2"
                    >
                      {selectedDoc ? (
                        <span className="flex items-center gap-2 truncate">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          {selectedDoc.title}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Select a document…</span>
                      )}
                      <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search documents…" />
                      <CommandList>
                        <CommandEmpty>No documents found.</CommandEmpty>
                        <CommandGroup>
                          {documents.map((doc) => (
                            <CommandItem
                              key={doc.id}
                              value={doc.title}
                              onSelect={() => {
                                setInstructionsDocId(doc.id)
                                setDocPickerOpen(false)
                              }}
                            >
                              <FileText className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
                              <span className="truncate">{doc.title}</span>
                              {doc.id === instructionsDocId && (
                                <Check className="h-4 w-4 ml-auto shrink-0" />
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {selectedDoc && (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate flex-1">{selectedDoc.title}</span>
                    <Badge variant="secondary" className="text-xs shrink-0">Linked</Badge>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Only documents in the <span className="font-medium text-foreground">Skills</span> folder are shown.
                  The document's content will be used as the system prompt — edit it anytime to update instructions.
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Output card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Output</CardTitle>
            <CardDescription>
              Chat mode uses a conversation. Structured mode opens a side-by-side workspace: pick documents,
              generate, and view card output (instructions are configured here, not per run).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              value={outputMode}
              onValueChange={(v) => setOutputMode(v as ModuleOutputMode)}
            >
              <TabsList className="mb-4 w-full">
                <TabsTrigger value="chat" className="gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Chat
                </TabsTrigger>
                <TabsTrigger value="structured" className="gap-1.5">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Structured output
                </TabsTrigger>
              </TabsList>

              <TabsContent value="chat" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Replies appear as a normal conversation — markdown formatting is supported.
                </p>
              </TabsContent>

              <TabsContent value="structured" className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  The module page shows sources on the left and generated cards on the right. Users pick documents and
                  click Generate — no per-run task field; behavior comes from agent instructions and the card prompt
                  below.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="structured-prompt">What to show on each card</Label>
                  <p className="text-xs text-muted-foreground">
                    Instructions for the model: describe the fields, tone, and what each card should represent (e.g.
                    &quot;Card per finding: title = summary, body = evidence and next steps&quot;).
                  </p>
                  <textarea
                    id="structured-prompt"
                    value={structuredOutputPrompt}
                    onChange={(e) => setStructuredOutputPrompt(e.target.value)}
                    rows={8}
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y font-mono leading-relaxed"
                    placeholder="Example: For each requirement in the docs, one card: title = requirement name, body = status, owner, and notes."
                  />
                </div>
                <p className="text-xs text-muted-foreground rounded-md border bg-muted/40 px-3 py-2">
                  The model is required to answer with JSON only, shaped like{' '}
                  <code className="text-[11px] break-all">{STRUCTURED_OUTPUT_JSON_EXAMPLE}</code>
                  . Each entry in <code className="text-[11px]">cards</code> is rendered as a card;{' '}
                  <code className="text-[11px]">body</code> supports markdown.
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Save / Cancel / Delete */}
        <div className="flex items-center gap-3 pt-2 pb-12">
          <Button onClick={handleSave}>{isNew ? 'Create module' : 'Save changes'}</Button>
          <Button variant="ghost" onClick={() => navigate(isNew ? '/' : `/modules/${id}`)}>Cancel</Button>

          {!isNew && !isBuiltin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="ml-auto text-destructive hover:text-destructive hover:bg-destructive/10" title="Delete module">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{label}"?</AlertDialogTitle>
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
          )}
        </div>
      </div>
    </div>
  )
}
