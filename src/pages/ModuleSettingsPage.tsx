import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Trash2, FileText, PenLine, Check, ChevronsUpDown, MessageSquare, LayoutGrid, Folder } from 'lucide-react'
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
  type ModuleKnowledge,
} from '@/lib/moduleSettings'
import { STRUCTURED_OUTPUT_JSON_EXAMPLE } from '@/lib/structuredModuleOutput'
import { CREATE_PROTOTYPE_MODULE_ID } from '@/lib/createPrototypeSchema'
import { ModuleIconComponent } from '@/components/ModuleIconComponent'
import { AppHeader } from '@/components/AppHeader'
import { SHARED_WORKSPACE_USER_ID } from '@/lib/sharedWorkspace'

const DEFAULT_INSTRUCTIONS = 'You are a helpful AI assistant. Answer questions clearly and concisely.'
const DEFAULT_KNOWLEDGE: ModuleKnowledge = { allFiles: true, documentIds: [], folderIds: [] }

type DocOption = { id: string; title: string; folder_id: string | null; file_name: string | null }
type FolderOption = { id: string; name: string; parent_id: string | null }
type SettingsTab = 'persona' | 'knowledge' | 'output'

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

  const [instructionDocuments, setInstructionDocuments] = useState<DocOption[]>([])
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<DocOption[]>([])
  const [knowledgeFolders, setKnowledgeFolders] = useState<FolderOption[]>([])
  const [docPickerOpen, setDocPickerOpen] = useState(false)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [knowledgeFolderPickerOpen, setKnowledgeFolderPickerOpen] = useState(false)
  const [knowledgeDocPickerOpen, setKnowledgeDocPickerOpen] = useState(false)
  const [knowledge, setKnowledge] = useState<ModuleKnowledge>(DEFAULT_KNOWLEDGE)
  const [activeTab, setActiveTab] = useState<SettingsTab>('persona')

  const selectedDoc = instructionDocuments.find(d => d.id === instructionsDocId)

  const folderPathMap = useMemo(() => {
    const folderById = new Map(knowledgeFolders.map((folder) => [folder.id, folder]))
    const visited = new Set<string>()

    const getFolderPath = (folderId: string | null): string => {
      if (!folderId) return 'Root'
      if (visited.has(folderId)) return folderById.get(folderId)?.name ?? 'Folder'
      const folder = folderById.get(folderId)
      if (!folder) return 'Folder'
      visited.add(folderId)
      const parentPath = getFolderPath(folder.parent_id)
      visited.delete(folderId)
      return parentPath === 'Root' ? folder.name : `${parentPath} / ${folder.name}`
    }

    const result = new Map<string, string>()
    knowledgeFolders.forEach((folder) => {
      result.set(folder.id, getFolderPath(folder.id))
    })
    return result
  }, [knowledgeFolders])

  const selectedKnowledgeFolders = useMemo(
    () => knowledgeFolders.filter((folder) => knowledge.folderIds.includes(folder.id)),
    [knowledge.folderIds, knowledgeFolders],
  )

  const selectedKnowledgeDocuments = useMemo(
    () => knowledgeDocuments.filter((doc) => knowledge.documentIds.includes(doc.id)),
    [knowledge.documentIds, knowledgeDocuments],
  )

  const tabOrder: SettingsTab[] = ['persona', 'knowledge', 'output']
  const activeTabIndex = tabOrder.indexOf(activeTab)
  const closePath = isNew ? '/' : `/modules/${id}`

  const tabMeta: Record<SettingsTab, { label: string }> = {
    persona: {
      label: 'Persona',
    },
    knowledge: {
      label: 'Knowledge',
    },
    output: {
      label: 'Output',
    },
  }

  useEffect(() => {
    if (!isNew && id === CREATE_PROTOTYPE_MODULE_ID) {
      navigate('/modules/create-prototype', { replace: true })
    }
  }, [id, isNew, navigate])

  const fetchDocuments = useCallback(async () => {
    const [folderRes, docRes] = await Promise.all([
      supabase
        .from('folders')
        .select('id, name, parent_id')
        .eq('user_id', SHARED_WORKSPACE_USER_ID)
        .order('name'),
      supabase
        .from('documents')
        .select('id, title, folder_id, file_name')
        .eq('user_id', SHARED_WORKSPACE_USER_ID)
        .order('title'),
    ])

    const folders = folderRes.data || []
    const documents = docRes.data || []
    const skillsFolder = folders.find((folder) => folder.name.toLowerCase() === 'skills')

    setKnowledgeFolders(folders)
    setKnowledgeDocuments(documents)
    setInstructionDocuments(
      skillsFolder
        ? documents.filter((doc) => doc.folder_id === skillsFolder.id)
        : [],
    )
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
      setKnowledge(mod.knowledge ?? DEFAULT_KNOWLEDGE)
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
      knowledge,
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

  const toggleKnowledgeFolder = (folderId: string) => {
    setKnowledge((prev) => ({
      ...prev,
      folderIds: prev.folderIds.includes(folderId)
        ? prev.folderIds.filter((id) => id !== folderId)
        : [...prev.folderIds, folderId],
    }))
  }

  const toggleKnowledgeDocument = (documentId: string) => {
    setKnowledge((prev) => ({
      ...prev,
      documentIds: prev.documentIds.includes(documentId)
        ? prev.documentIds.filter((id) => id !== documentId)
        : [...prev.documentIds, documentId],
    }))
  }

  const goBack = () => {
    setActiveTab(tabOrder[Math.max(activeTabIndex - 1, 0)])
  }

  const goForward = () => {
    setActiveTab(tabOrder[Math.min(activeTabIndex + 1, tabOrder.length - 1)])
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <Dialog open onOpenChange={(open) => !open && navigate(closePath)}>
        <DialogContent
          showCloseButton
          className="w-[min(96vw,72rem)] max-w-2xl overflow-hidden p-0 sm:max-w-2xl"
        >
          <div className="flex max-h-[88vh] flex-col">
            <DialogHeader className="border-b px-6 py-5 pr-14">
              <DialogTitle>Module Configuration</DialogTitle>
            </DialogHeader>

            <div className="px-6 py-4">
              <div className="flex flex-wrap gap-2">
                {tabOrder.map((tab, index) => (
                  <Button
                    key={tab}
                    type="button"
                    variant={activeTab === tab ? 'secondary' : 'outline'}
                    className="rounded-full px-3 shadow-none"
                    onClick={() => setActiveTab(tab)}
                  >
                    <span className="inline-flex w-full items-center justify-center gap-2 text-center">
                      <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-zinc-400 text-[10px] font-semibold leading-none text-white">
                        {index + 1}
                      </span>
                      <span>{tabMeta[tab].label}</span>
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              {activeTab === 'persona' && (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-2">
                        <Label htmlFor="label">Name</Label>
                        <Input
                          id="label"
                          value={label}
                          onChange={(e) => setLabel(e.target.value)}
                          placeholder="New module"
                          className="h-auto border-0 bg-transparent px-0 py-0 text-4xl font-medium tracking-tight text-foreground shadow-none placeholder:text-zinc-400 focus-visible:border-0 focus-visible:ring-0 md:text-4xl"
                        />
                      </div>

                      <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="mt-5 inline-flex h-11 items-center gap-1 rounded-xl border border-border bg-muted/60 px-2.5 text-foreground transition-colors hover:bg-muted"
                            aria-label="Select icon"
                          >
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg">
                              <ModuleIconComponent icon={icon} className={`h-4 w-4 ${color}`} />
                            </span>
                            <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72 p-3">
                          <div className="space-y-2">
                            <p className="text-sm font-medium">Icon</p>
                            <div className="flex flex-wrap gap-1">
                              {MODULE_ICON_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => setIcon(opt.value)}
                                  title={opt.label}
                                  className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${icon === opt.value ? 'border-primary bg-primary/5' : 'border-transparent bg-muted hover:border-muted-foreground/30'}`}
                                >
                                  <ModuleIconComponent icon={opt.value} className="h-4 w-4" />
                                </button>
                              ))}
                            </div>

                            <p className="text-sm font-medium">Color</p>
                            <div className="grid grid-cols-7 gap-1.5">
                              {MODULE_COLOR_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => setColor(opt.value)}
                                  title={opt.label}
                                  className={`flex h-8 items-center justify-center rounded-md border transition-colors ${color === opt.value ? 'border-primary bg-primary/5' : 'border-border bg-muted/40 hover:border-muted-foreground/30'}`}
                                >
                                  <span className="h-4 w-4 rounded-sm" style={{ backgroundColor: opt.swatch }} />
                                </button>
                              ))}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="description">Description</Label>
                      <p className="text-xs text-muted-foreground">Describe what this agent will help your team with</p>
                      <textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className="w-full mt-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder='Like "I help with resource heavy and manual work like instantly producing contract reviews, analyzing large volumes of data, and uncovering new insights."'
                      />
                    </div>

                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <h2 className="text-sm font-medium">Agent Instructions</h2>
                      <p className="text-xs text-muted-foreground">The system prompt sent to the AI at the start of every conversation.</p>
                    </div>

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
                          className="w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                              className="h-auto min-h-10 w-full justify-between py-2 font-normal"
                            >
                              {selectedDoc ? (
                                <span className="flex items-center gap-2 truncate">
                                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  {selectedDoc.title}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Select a document…</span>
                              )}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search documents…" />
                              <CommandList>
                                <CommandEmpty>No documents found.</CommandEmpty>
                                <CommandGroup>
                                  {instructionDocuments.map((doc) => (
                                    <CommandItem
                                      key={doc.id}
                                      value={doc.title}
                                      onSelect={() => {
                                        setInstructionsDocId(doc.id)
                                        setDocPickerOpen(false)
                                      }}
                                    >
                                      <FileText className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                                      <span className="truncate">{doc.title}</span>
                                      {doc.id === instructionsDocId && (
                                        <Check className="ml-auto h-4 w-4 shrink-0" />
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
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="flex-1 truncate text-sm">{selectedDoc.title}</span>
                            <Badge variant="secondary" className="shrink-0 text-xs">Linked</Badge>
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground">
                          Only documents in the <span className="font-medium text-foreground">Skills</span> folder are shown.
                          The document&apos;s content will be used as the system prompt and updates automatically when that file changes.
                        </p>
                      </TabsContent>
                    </Tabs>
                  </div>
                </div>
              )}

              {activeTab === 'knowledge' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold">Knowledge</h2>
                    <p className="text-sm text-muted-foreground">Control which files and folders this module can use when users reference or select documents.</p>
                  </div>

                    <label className="flex items-start gap-3 rounded-lg border px-3 py-3">
                      <Checkbox
                        checked={knowledge.allFiles}
                        onCheckedChange={(checked) =>
                          setKnowledge((prev) => ({ ...prev, allFiles: checked === true }))
                        }
                        className="mt-0.5"
                      />
                      <span className="space-y-1">
                        <span className="text-sm font-medium leading-none">All files</span>
                        <span className="block text-sm text-muted-foreground">
                          Enabled by default. Turn this off to limit the module to specific folders and files.
                        </span>
                      </span>
                    </label>

                    <div className={knowledge.allFiles ? 'pointer-events-none space-y-4 opacity-60' : 'space-y-4'}>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Folders</Label>
                          <Popover open={knowledgeFolderPickerOpen} onOpenChange={setKnowledgeFolderPickerOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="h-auto min-h-10 w-full justify-between py-2 font-normal">
                                <span className="flex items-center gap-2 truncate">
                                  <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  {selectedKnowledgeFolders.length > 0
                                    ? `${selectedKnowledgeFolders.length} folder${selectedKnowledgeFolders.length === 1 ? '' : 's'} selected`
                                    : 'Select folders…'}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Search folders…" />
                                <CommandList>
                                  <CommandEmpty>No folders found.</CommandEmpty>
                                  <CommandGroup>
                                    {knowledgeFolders.map((folder) => (
                                      <CommandItem
                                        key={folder.id}
                                        value={`${folder.name} ${folderPathMap.get(folder.id) ?? ''}`}
                                        onSelect={() => toggleKnowledgeFolder(folder.id)}
                                      >
                                        <Folder className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                                        <span className="min-w-0 flex-1 truncate">{folderPathMap.get(folder.id) ?? folder.name}</span>
                                        {knowledge.folderIds.includes(folder.id) ? (
                                          <Check className="ml-2 h-4 w-4 shrink-0" />
                                        ) : null}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>

                        <div className="space-y-2">
                          <Label>Files</Label>
                          <Popover open={knowledgeDocPickerOpen} onOpenChange={setKnowledgeDocPickerOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="h-auto min-h-10 w-full justify-between py-2 font-normal">
                                <span className="flex items-center gap-2 truncate">
                                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  {selectedKnowledgeDocuments.length > 0
                                    ? `${selectedKnowledgeDocuments.length} file${selectedKnowledgeDocuments.length === 1 ? '' : 's'} selected`
                                    : 'Select files…'}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Search files…" />
                                <CommandList>
                                  <CommandEmpty>No files found.</CommandEmpty>
                                  <CommandGroup>
                                    {knowledgeDocuments.map((doc) => (
                                      <CommandItem
                                        key={doc.id}
                                        value={`${doc.title} ${doc.file_name ?? ''} ${doc.folder_id ? folderPathMap.get(doc.folder_id) ?? '' : 'Root'}`}
                                        onSelect={() => toggleKnowledgeDocument(doc.id)}
                                      >
                                        <FileText className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                                        <span className="min-w-0 flex-1">
                                          <span className="block truncate">{doc.title}</span>
                                          <span className="block truncate text-xs text-muted-foreground">
                                            {doc.folder_id ? folderPathMap.get(doc.folder_id) ?? 'Folder' : 'Root'}
                                          </span>
                                        </span>
                                        {knowledge.documentIds.includes(doc.id) ? (
                                          <Check className="ml-2 h-4 w-4 shrink-0" />
                                        ) : null}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>

                      {(selectedKnowledgeFolders.length > 0 || selectedKnowledgeDocuments.length > 0) && (
                        <div className="space-y-2">
                          <Label>Selected knowledge</Label>
                          <div className="flex flex-wrap gap-2">
                            {selectedKnowledgeFolders.map((folder) => (
                              <Badge key={folder.id} variant="secondary" className="gap-1.5">
                                <Folder className="h-3.5 w-3.5" />
                                {folderPathMap.get(folder.id) ?? folder.name}
                              </Badge>
                            ))}
                            {selectedKnowledgeDocuments.map((doc) => (
                              <Badge key={doc.id} variant="secondary" className="gap-1.5">
                                <FileText className="h-3.5 w-3.5" />
                                {doc.title}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <p className="text-xs text-muted-foreground">
                        Selected folders include nested subfolders. Selected files are still included even when they sit outside those folders.
                      </p>
                    </div>
                </div>
              )}

              {activeTab === 'output' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold">Output</h2>
                    <p className="text-sm text-muted-foreground">Choose whether the module behaves like chat or produces structured card output.</p>
                  </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setOutputMode('chat')}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          outputMode === 'chat'
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-background hover:border-muted-foreground/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              outputMode === 'chat' ? 'bg-background ring-1 ring-border/60' : 'bg-muted'
                            }`}
                          >
                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                          </span>
                          <span className="space-y-1">
                            <span className="block text-sm font-medium">Chat</span>
                           
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setOutputMode('structured')}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          outputMode === 'structured'
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-background hover:border-muted-foreground/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              outputMode === 'structured' ? 'bg-background ring-1 ring-border/60' : 'bg-muted'
                            }`}
                          >
                            <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                          </span>
                          <span className="space-y-1">
                            <span className="block text-sm font-medium">Structured output</span>
                           
                          </span>
                        </div>
                      </button>
                    </div>

                    {outputMode === 'chat' ? (
                      <p className="text-sm text-muted-foreground">
                        Replies appear as a normal conversation with markdown support.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          The module page shows sources on the left and generated cards on the right. Users pick documents and click Generate, with behavior driven by the instructions below.
                        </p>
                        <div className="space-y-2">
                          <Label htmlFor="structured-prompt">What to show on each card</Label>
                          <p className="text-xs text-muted-foreground">
                            Describe the fields, tone, and what each card should represent, for example:
                            &nbsp;&quot;Card per finding: title = summary, body = evidence and next steps&quot;.
                          </p>
                          <textarea
                            id="structured-prompt"
                            value={structuredOutputPrompt}
                            onChange={(e) => setStructuredOutputPrompt(e.target.value)}
                            rows={8}
                            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2.5 font-mono text-sm leading-relaxed shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            placeholder="Example: For each requirement in the docs, one card: title = requirement name, body = status, owner, and notes."
                          />
                        </div>
                        <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                          The model is required to answer with JSON only, shaped like{' '}
                          <code className="break-all text-[11px]">{STRUCTURED_OUTPUT_JSON_EXAMPLE}</code>.
                          Each entry in <code className="text-[11px]">cards</code> renders as one card, and{' '}
                          <code className="text-[11px]">body</code> supports markdown.
                        </p>
                      </div>
                    )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
              <div>
                {!isNew && !isBuiltin && activeTab === 'output' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
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

              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={activeTabIndex === 0 ? () => navigate(closePath) : goBack}>
                  Back
                </Button>
                {activeTab === 'output' ? (
                  <Button type="button" onClick={handleSave}>
                    {isNew ? 'Create module' : 'Save changes'}
                  </Button>
                ) : (
                  <Button type="button" onClick={goForward}>
                    Continue
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
