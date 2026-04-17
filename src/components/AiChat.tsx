import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  Send,
  Library,
  X,
  FileText,
  Settings,
  Loader2,
  LayoutPanelLeft,
  FilePlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { marked } from 'marked'
import { getDocumentTextForAi } from '@/lib/documentTextForAi'
import { parseStructuredAssistantResponse } from '@/lib/structuredModuleOutput'
import type { ModuleKnowledge, ModuleOutputMode } from '@/lib/moduleSettings'
import {
  insertMarkdownDocument,
  structuredCardsToMarkdown,
  suggestedMarkdownTitle,
} from '@/lib/insertMarkdownDocument'
import { SHARED_WORKSPACE_USER_ID } from '@/lib/sharedWorkspace'
import { requestOpenAIChatCompletion } from '@/lib/openaiChat'
import { filterDocumentsByKnowledge } from '@/lib/moduleKnowledge'

marked.use({ breaks: true })

export type Document = {
  id: string
  title: string
  content: string | null
  file_name: string | null
  file_url: string | null
  file_type: string | null
  folder_id: string | null
}

type FolderItem = {
  id: string
  parent_id: string | null
}

type AttachedDoc = { id: string; title: string }

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachedDocs?: AttachedDoc[]
  timestamp: Date
}

export type AiChatProps = {
  backTo?: string
  title: string
  subtitle?: string
  systemPrompt: string
  settingsPath?: string
  emptyTitle?: string
  emptySubtitle?: string
  inputPlaceholder?: string
  /** Structured mode uses a side-by-side sources + output workspace instead of chat */
  outputMode?: ModuleOutputMode
  /** Optional icon shown next to the module title in the header */
  assistantIcon?: ReactNode
  knowledge?: ModuleKnowledge
}

export function AiChat({
  backTo = '/',
  title,
  subtitle,
  systemPrompt,
  settingsPath,
  emptyTitle = 'Ask me anything about your documents',
  emptySubtitle = "Type @ to attach a specific document as context",
  inputPlaceholder = 'Ask a question… type @ to reference a document',
  outputMode = 'chat',
  assistantIcon,
  knowledge,
}: AiChatProps) {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [documents, setDocuments] = useState<Document[]>([])
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerIndex, setPickerIndex] = useState(0)
  const [attachedDocs, setAttachedDocs] = useState<AttachedDoc[]>([])
  const [atCursorPos, setAtCursorPos] = useState<number | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const chatLayoutRef = useRef<HTMLDivElement>(null)

  const hideInjectedChatAvatars = useCallback(() => {
    const appRoot = document.getElementById('root')
    if (!appRoot) return
    const selector = [
      '[data-slot="avatar"]',
      '[data-slot="avatar-fallback"]',
      '[data-slot="avatar-image"]',
      '[data-slot="avatar-badge"]',
      '[data-slot="avatar-group"]',
      '[data-slot="avatar-group-count"]',
    ].join(', ')
    appRoot.querySelectorAll(selector).forEach((el) => {
      const node = el as HTMLElement
      node.style.setProperty('display', 'none', 'important')
      node.style.setProperty('visibility', 'hidden', 'important')
    })
    const thread =
      document.getElementById('ai-chat-messages-thread') ??
      appRoot.querySelector('.mx-auto.max-w-3xl.space-y-6')
    if (thread) {
      thread.querySelectorAll('.flex.gap-3').forEach((row) => {
        row.querySelectorAll(':scope > span').forEach((el) => {
          const node = el as HTMLElement
          node.style.setProperty('display', 'none', 'important')
        })
      })
    }
  }, [])

  useLayoutEffect(() => {
    hideInjectedChatAvatars()
  }, [hideInjectedChatAvatars, messages, isLoading])

  useEffect(() => {
    hideInjectedChatAvatars()
    const appRoot = document.getElementById('root')
    if (!appRoot) return
    const mo = new MutationObserver(() => hideInjectedChatAvatars())
    mo.observe(appRoot, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [hideInjectedChatAvatars, messages, isLoading])

  const [sourceQuery, setSourceQuery] = useState('')
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([])
  const [structuredOutput, setStructuredOutput] = useState<{
    cards: { title: string; body: string }[] | null
    raw: string
    parseFailed: boolean
  } | null>(null)

  const [saveDocOpen, setSaveDocOpen] = useState(false)
  const [saveDocTitle, setSaveDocTitle] = useState('')
  const [saveDocMarkdown, setSaveDocMarkdown] = useState('')
  const [saveDocLoading, setSaveDocLoading] = useState(false)

  const availableDocuments: Document[] = useMemo(
    () => filterDocumentsByKnowledge(documents, folders, knowledge),
    [documents, folders, knowledge],
  )

  const openSaveMarkdownDialog = (suggestedTitle: string, markdown: string) => {
    setSaveDocTitle(suggestedMarkdownTitle(suggestedTitle))
    setSaveDocMarkdown(markdown)
    setSaveDocOpen(true)
  }

  const handleConfirmSaveMarkdownDocument = async () => {
    const t = saveDocTitle.trim()
    if (!t) {
      toast.error('Enter a document title')
      return
    }
    setSaveDocLoading(true)
    try {
      const result = await insertMarkdownDocument(t, saveDocMarkdown)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Document created')
      setSaveDocOpen(false)
      fetchDocuments()
      navigate(`/documents/${result.id}/edit`)
    } finally {
      setSaveDocLoading(false)
    }
  }

  const saveMarkdownDialog = (
    <Dialog open={saveDocOpen} onOpenChange={setSaveDocOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as markdown document</DialogTitle>
          <DialogDescription>
            Creates a new text document in your library. You can edit it in the document editor.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="save-md-title">Title</Label>
          <Input
            id="save-md-title"
            value={saveDocTitle}
            onChange={(e) => setSaveDocTitle(e.target.value)}
            placeholder="Document title"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => setSaveDocOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirmSaveMarkdownDocument} disabled={saveDocLoading}>
            {saveDocLoading ? 'Creating…' : 'Create document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  useEffect(() => {
    fetchDocuments()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const fetchDocuments = async () => {
    const [docRes, folderRes] = await Promise.all([
      supabase
        .from('documents')
        .select('id, title, content, file_name, file_url, file_type, folder_id')
        .eq('user_id', SHARED_WORKSPACE_USER_ID)
        .order('updated_at', { ascending: false }),
      supabase
        .from('folders')
        .select('id, parent_id')
        .eq('user_id', SHARED_WORKSPACE_USER_ID),
    ])
    setDocuments(docRes.data || [])
    setFolders(folderRes.data || [])
  }

  const filteredDocs = availableDocuments.filter(
    (d) =>
      !attachedDocs.find((a) => a.id === d.id) &&
      d.title.toLowerCase().includes(pickerQuery.toLowerCase()),
  )

  const filteredSources = availableDocuments.filter((d) => {
    const q = sourceQuery.trim().toLowerCase()
    if (!q) return true
    return (
      d.title.toLowerCase().includes(q) ||
      (d.file_name?.toLowerCase().includes(q) ?? false)
    )
  })

  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  useEffect(() => {
    const allowedIds = new Set(availableDocuments.map((doc) => doc.id))
    setSelectedSourceIds((prev) => prev.filter((id) => allowedIds.has(id)))
    setAttachedDocs((prev) => prev.filter((doc) => allowedIds.has(doc.id)))
  }, [availableDocuments])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    const cursor = e.target.selectionStart ?? val.length
    setInput(val)
    const textUpToCursor = val.slice(0, cursor)
    const atIdx = textUpToCursor.lastIndexOf('@')
    if (atIdx !== -1) {
      const after = textUpToCursor.slice(atIdx + 1)
      if (!after.includes(' ')) {
        setAtCursorPos(atIdx)
        setPickerQuery(after)
        setPickerIndex(0)
        setShowPicker(true)
        return
      }
    }
    setShowPicker(false)
    setAtCursorPos(null)
  }

  const selectDoc = useCallback(
    (doc: Document) => {
      if (!inputRef.current || atCursorPos === null) return
      const before = input.slice(0, atCursorPos)
      const cursor = inputRef.current.selectionStart ?? input.length
      const after = input.slice(cursor)
      setInput(before + after)
      setAttachedDocs((prev) => [...prev, { id: doc.id, title: doc.title }])
      setShowPicker(false)
      setAtCursorPos(null)
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.setSelectionRange(before.length, before.length)
        }
      }, 0)
    },
    [input, atCursorPos],
  )

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showPicker) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setPickerIndex((i) => Math.min(i + 1, filteredDocs.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setPickerIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (filteredDocs[pickerIndex]) selectDoc(filteredDocs[pickerIndex])
        return
      }
      if (e.key === 'Escape') {
        setShowPicker(false)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const buildContextFromDocRows = async (
    refDocs: {
      title: string
      content: string | null
      file_url: string | null
      file_type: string | null
      file_name: string | null
    }[],
    sectionTitle: string,
  ) => {
    if (!refDocs.length) return ''
    const blocks = await Promise.all(
      refDocs.map(async (d) => {
        const text = await getDocumentTextForAi({
          title: d.title,
          content: d.content,
          file_url: d.file_url,
          file_type: d.file_type,
          file_name: d.file_name,
        })
        return `## ${d.title}\n${text}`
      }),
    )
    return `\n\n---\n${sectionTitle}\n` + blocks.join('\n\n')
  }

  const handleStructuredGenerate = async () => {
    if (selectedSourceIds.length === 0) {
      toast.error('Select at least one document.')
      return
    }

    setIsLoading(true)
    setStructuredOutput(null)

    try {
      const { data: refDocs, error } = await supabase
        .from('documents')
        .select('title, content, file_url, file_type, file_name')
        .in('id', selectedSourceIds)
        .eq('user_id', SHARED_WORKSPACE_USER_ID)

      if (error || !refDocs?.length) {
        toast.error('Could not load selected documents')
        return
      }

      const contextBlock = await buildContextFromDocRows(refDocs, 'Source documents:')

      const userContent =
        'Follow your system instructions and structured output requirements. Use only the documents below as context and respond with the required JSON only.' +
        contextBlock

      const json = await requestOpenAIChatCompletion({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.35,
        max_tokens: 2048,
      })
      const rawAssistant = json.choices?.[0]?.message?.content ?? 'No response.'
      const parsed = parseStructuredAssistantResponse(rawAssistant)
      setStructuredOutput({
        cards: parsed,
        raw: rawAssistant,
        parseFailed: !parsed,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed && attachedDocs.length === 0) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
      attachedDocs: attachedDocs.length > 0 ? [...attachedDocs] : undefined,
      timestamp: new Date(),
    }
    setMessages((p) => [...p, userMsg])
    setInput('')
    setAttachedDocs([])
    setIsLoading(true)

    try {
      let contextBlock = ''
      if (userMsg.attachedDocs?.length) {
        const { data: refDocs } = await supabase
          .from('documents')
          .select('title, content, file_url, file_type, file_name')
          .in('id', userMsg.attachedDocs.map((d) => d.id))
          .eq('user_id', SHARED_WORKSPACE_USER_ID)
        if (refDocs?.length) {
          contextBlock = await buildContextFromDocRows(refDocs, 'Referenced documents:')
        }
      }

      const history = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      const json = await requestOpenAIChatCompletion({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: trimmed + contextBlock },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      })
      setMessages((p) => [
        ...p,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: json.choices?.[0]?.message?.content ?? 'No response.',
          timestamp: new Date(),
        },
      ])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(message)
      setMessages((p) => [
        ...p,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, I encountered an error.',
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const headerSubtitle = subtitle ? (
    <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
  ) : outputMode === 'structured' ? (
    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
      <LayoutPanelLeft className="h-3 w-3 shrink-0" />
      Sources and structured output
    </p>
  ) : (
    <p className="text-xs text-muted-foreground flex items-center gap-1">
      <Library className="h-3 w-3" />
      {availableDocuments.length} doc{availableDocuments.length !== 1 ? 's' : ''} available · type{' '}
      <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px] font-mono">@</kbd> to reference
    </p>
  )

  if (outputMode === 'structured') {
    const canGenerate = selectedSourceIds.length > 0 && !isLoading

    const saveStructuredOutputAsDocument = () => {
      if (!structuredOutput) return
      let md: string
      if (structuredOutput.parseFailed) {
        md = `# ${title} — output\n\n${structuredOutput.raw}`
      } else if (structuredOutput.cards?.length) {
        md = structuredCardsToMarkdown(structuredOutput.cards, `${title} — output`)
      } else {
        md = `# ${title} — output\n\n_(No content)_\n`
      }
      openSaveMarkdownDialog(`${title} — Output`, md)
    }

    return (
      <>
      <div
        ref={chatLayoutRef}
        data-ai-chat-layout
        className="flex h-screen flex-col bg-background"
      >
        <header className="sticky top-0 z-50 w-full shrink-0 border-b bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/60">
          <div className="flex h-14 items-center gap-3 px-4">
            <Link to={backTo}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex min-w-0 flex-1 items-start gap-2">
              {assistantIcon ? (
                <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:block">{assistantIcon}</span>
              ) : null}
              <div className="min-w-0 flex-1">
                <h1 className="text-sm font-semibold tracking-tight truncate">{title}</h1>
                {headerSubtitle}
              </div>
            </div>
            {settingsPath && (
              <Link to={settingsPath}>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <Settings className="h-4 w-4" />
                </Button>
              </Link>
            )}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* Sources */}
          <aside className="flex max-h-[min(42vh,22rem)] min-h-0 w-full shrink-0 flex-col border-b bg-muted/20 md:max-h-none md:max-w-md md:border-b-0 md:border-r">
            <div className="shrink-0 space-y-3 border-b bg-background/80 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Sources</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose documents to include as context for this run.
                </p>
              </div>
              <Input
                placeholder="Search documents…"
                value={sourceQuery}
                onChange={(e) => setSourceQuery(e.target.value)}
                className="h-9"
              />
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-0.5 p-2">
                {filteredSources.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                    No documents match your search.
                  </p>
                ) : (
                  filteredSources.map((doc) => {
                    const checked = selectedSourceIds.includes(doc.id)
                    return (
                      <label
                        key={doc.id}
                        className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2.5 text-left text-sm transition-colors hover:bg-accent/60"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleSource(doc.id)}
                          className="mt-0.5"
                          aria-label={`Select ${doc.title}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start gap-2">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                            <span className="leading-snug break-words">{doc.title}</span>
                          </span>
                          {doc.file_name ? (
                            <span className="mt-0.5 block text-xs text-muted-foreground truncate pl-6">
                              {doc.file_name}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    )
                  })
                )}
              </div>
            </ScrollArea>
            <div className="shrink-0 space-y-3 border-t bg-background p-4">
              <p className="text-xs text-muted-foreground">
                What to extract and how cards are shaped is defined in{' '}
                {settingsPath ? (
                  <Link
                    to={settingsPath}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    module settings
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">module settings</span>
                )}{' '}
                (agent instructions and structured output).
              </p>
              <Button
                className="w-full"
                disabled={!canGenerate}
                onClick={handleStructuredGenerate}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : (
                  'Generate'
                )}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                {selectedSourceIds.length} selected · {availableDocuments.length} total
              </p>
            </div>
          </aside>

          {/* Output */}
          <main className="flex min-w-0 flex-1 flex-col bg-background">
            <div className="shrink-0 flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">Output</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Structured cards from the model (JSON format from module settings).
                </p>
              </div>
              {structuredOutput ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={saveStructuredOutputAsDocument}
                >
                  <FilePlus className="h-4 w-4" />
                  Save as document
                </Button>
              ) : null}
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="p-4 md:p-6">
                {isLoading && !structuredOutput ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin opacity-60" />
                    <p className="text-sm">Generating structured output…</p>
                  </div>
                ) : !structuredOutput ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center max-w-sm mx-auto">
                    <p className="font-medium mb-1">{emptyTitle}</p>
                    <p className="text-sm text-muted-foreground">{emptySubtitle}</p>
                  </div>
                ) : structuredOutput.parseFailed ? (
                  <div className="space-y-3 max-w-3xl">
                    <Badge
                      variant="outline"
                      className="text-amber-800 border-amber-600/40 bg-amber-500/10 dark:text-amber-200"
                    >
                      Couldn&apos;t parse structured output — showing raw reply
                    </Badge>
                    <Card>
                      <CardContent className="py-4 px-4">
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: marked.parse(structuredOutput.raw) as string,
                          }}
                        />
                      </CardContent>
                    </Card>
                  </div>
                ) : structuredOutput.cards && structuredOutput.cards.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {structuredOutput.cards.map((c, i) => (
                      <Card key={`out-${i}`} className="overflow-hidden">
                        <CardHeader className="py-3 pb-2 space-y-0">
                          <CardTitle className="text-base font-semibold leading-snug">
                            {c.title}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 pb-4">
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none leading-relaxed text-card-foreground"
                            dangerouslySetInnerHTML={{
                              __html: marked.parse(c.body) as string,
                            }}
                          />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No cards returned.</p>
                )}
              </div>
            </ScrollArea>
          </main>
        </div>
      </div>
      {saveMarkdownDialog}
      </>
    )
  }

  return (
    <>
    <div
      ref={chatLayoutRef}
      data-ai-chat-layout
      className="flex h-screen flex-col bg-background"
    >
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/60">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link to={backTo}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <Separator orientation="vertical" className="h-4" />
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {assistantIcon ? (
              <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:block">{assistantIcon}</span>
            ) : null}
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-semibold tracking-tight truncate">{title}</h1>
              {headerSubtitle}
            </div>
          </div>
          {settingsPath && (
            <Link to={settingsPath}>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div
          id="ai-chat-messages-thread"
          className="ai-chat-thread mx-auto max-w-3xl px-4 py-6 space-y-6"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="font-medium text-center mb-1">{emptyTitle}</p>
              <p className="text-sm text-muted-foreground text-center">{emptySubtitle}</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`flex flex-col gap-1 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  {msg.attachedDocs?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {msg.attachedDocs.map((d) => (
                        <Badge key={d.id} variant="secondary" className="text-xs font-normal gap-1">
                          <FileText className="h-3 w-3" />
                          {d.title}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <Card
                    className={
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground border-primary py-1'
                        : 'bg-card border-0 shadow-none gap-2 py-3'
                    }
                  >
                    <CardContent className="py-1 px-2">
                      {msg.role === 'assistant' ? (
                        <div
                          className="prose prose-sm max-w-none leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: marked.parse(msg.content) as string,
                          }}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                      )}
                    </CardContent>
                  </Card>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
                    {msg.role === 'assistant' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-1 text-xs text-[#4a4b4f]"
                        onClick={() => {
                          openSaveMarkdownDialog(`${title} — Assistant`, msg.content)
                        }}
                      >
                        <FilePlus className="h-3.5 w-3.5" />
                        Save as document
                      </Button>
                    ) : null}
                    <span className="text-[11px] text-muted-foreground">
                      {msg.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <Card>
                <CardContent className="py-3 px-4">
                  <div className="flex gap-1 items-center">
                    {[0, 150, 300].map((d) => (
                      <div
                        key={d}
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
                        style={{ animationDelay: `${d}ms` }}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t bg-background/95 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-4 py-3">
          {attachedDocs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {attachedDocs.map((d) => (
                <Badge key={d.id} variant="secondary" className="gap-1 text-xs font-normal pr-1">
                  <FileText className="h-3 w-3" />
                  {d.title}
                  <button
                    type="button"
                    onClick={() => setAttachedDocs((p) => p.filter((x) => x.id !== d.id))}
                    className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {showPicker && (
            <div className="mb-2 rounded-lg border bg-popover text-popover-foreground shadow-md overflow-hidden">
              {filteredDocs.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">No documents found</div>
              ) : (
                <ul>
                  {filteredDocs.slice(0, 8).map((doc, idx) => (
                    <li key={doc.id}>
                      <button
                        type="button"
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${idx === pickerIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          selectDoc(doc)
                        }}
                        onMouseEnter={() => setPickerIndex(idx)}
                      >
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{doc.title}</span>
                        {doc.file_name && (
                          <span className="ml-auto text-xs text-muted-foreground shrink-0">
                            {doc.file_name}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              rows={1}
              placeholder={inputPlaceholder}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              disabled={isLoading}
              className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 max-h-40 overflow-y-auto"
              style={{ minHeight: '2.5rem', height: 'auto' }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`
              }}
            />
            <Button
              onClick={handleSend}
              disabled={isLoading || (!input.trim() && attachedDocs.length === 0)}
              size="icon"
              className="shrink-0 h-10 w-10"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

        </div>
      </div>
    </div>
    {saveMarkdownDialog}
    </>
  )
}
