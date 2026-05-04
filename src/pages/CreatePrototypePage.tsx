import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Send, Sparkles, FilePlus } from 'lucide-react'
import { toast } from 'sonner'
import { marked } from 'marked'
import { CreatePrototypePreview } from '@/components/CreatePrototypePreview'
import { CREATE_PROTOTYPE_SYSTEM_PROMPT } from '@/lib/createPrototypeSystemPrompt'
import {
  extractProtoJsonFromAssistant,
  chatTextWithoutJsonFence,
  parseProtoPage,
  type ProtoPage,
} from '@/lib/createPrototypeSchema'
import { insertMarkdownDocument, suggestedMarkdownTitle } from '@/lib/insertMarkdownDocument'
import { requestOpenAIChatCompletion } from '@/lib/openaiChat'

marked.use({ breaks: true })

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export function CreatePrototypePage() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<ProtoPage | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [saveDocOpen, setSaveDocOpen] = useState(false)
  const [saveDocTitle, setSaveDocTitle] = useState('')
  const [saveDocMarkdown, setSaveDocMarkdown] = useState('')
  const [saveDocLoading, setSaveDocLoading] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

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
      navigate(`/documents/${result.id}/edit`)
    } finally {
      setSaveDocLoading(false)
    }
  }

  const send = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    const now = new Date()
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: now,
    }
    setMessages((m) => [...m, userMsg])
    setInput('')
    setLoading(true)

    const history = [...messages, userMsg].map((x) => ({
      role: x.role as 'user' | 'assistant',
      content: x.content,
    }))

    try {
      const json = await requestOpenAIChatCompletion({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: CREATE_PROTOTYPE_SYSTEM_PROMPT },
          ...history,
        ],
        temperature: 0.45,
        max_tokens: 4096,
      })
      const rawAssistant = (json.choices?.[0]?.message?.content ?? '') as string

      const jsonStr = extractProtoJsonFromAssistant(rawAssistant)
      let nextPreview: ProtoPage | null = null
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr) as unknown
          const result = parseProtoPage(parsed)
          if (result.ok) {
            nextPreview = result.page
          } else {
            toast.error(result.error)
          }
        } catch {
          toast.error('Model returned invalid JSON.')
        }
      } else {
        toast.error('No JSON block found in the reply. Ask the model to include ```json.')
      }

      if (nextPreview) {
        setPreview(nextPreview)
      }

      const chatVisible = chatTextWithoutJsonFence(rawAssistant) || 'Preview updated.'
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: chatVisible,
          timestamp: new Date(),
        },
      ])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Request failed'
      toast.error(msg)
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: `Sorry — ${msg}`,
          timestamp: new Date(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages])

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
          <Label htmlFor="create-prototype-save-title">Title</Label>
          <Input
            id="create-prototype-save-title"
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

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur-sm supports-backdrop-filter:bg-background/60">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link to="/" aria-label="Back to home">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-violet-500" />
          <h1 className="truncate text-sm font-semibold tracking-tight">Create Prototype</h1>
          <Badge variant="outline" className="shrink-0 font-mono text-[10px] tracking-wide">
            DEMO
          </Badge>
        </div>
        <span className="hidden text-xs text-muted-foreground sm:inline">Chat · Preview</span>
        <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-xs font-medium" asChild>
          <Link to="/qa">QA</Link>
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          data-ai-chat-layout
          className="flex min-h-[min(40vh,22rem)] w-full min-w-0 shrink-0 flex-col border-b lg:min-h-0 lg:max-w-xl lg:border-b-0 lg:border-r"
        >
          <ScrollArea className="min-h-0 flex-1">
            <div
              id="create-prototype-messages-thread"
              className="ai-chat-thread mx-auto w-full max-w-3xl px-4 py-6 space-y-6"
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <p className="mb-1 text-center font-medium">Describe your prototype</p>
                  <p className="max-w-sm text-center text-sm text-muted-foreground">
                    Example: a pricing page with three tiers, a hero title, and a callout about annual billing. The
                    preview updates on the right.
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`flex max-w-[80%] flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <Card
                        className={
                          msg.role === 'user'
                            ? 'border-primary bg-primary py-1 text-primary-foreground'
                            : 'gap-2 border-0 bg-card py-3 shadow-none'
                        }
                      >
                        <CardContent className="px-2 py-1">
                          {msg.role === 'assistant' ? (
                            <div
                              className="prose prose-sm max-w-none leading-relaxed"
                              dangerouslySetInnerHTML={{
                                __html: marked.parse(msg.content) as string,
                              }}
                            />
                          ) : (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
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
                              openSaveMarkdownDialog('Create Prototype — Assistant', msg.content)
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
              {loading && (
                <div className="flex justify-start">
                  <Card>
                    <CardContent className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {[0, 150, 300].map((d) => (
                          <div
                            key={d}
                            className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
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

          <div className="shrink-0 border-t bg-background/95 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-3xl px-4 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                  placeholder="Describe your prototype…"
                  disabled={loading}
                  className="max-h-40 min-h-10 flex-1 resize-none overflow-y-auto rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                  style={{ minHeight: '2.5rem', height: 'auto' }}
                  onInput={(e) => {
                    const el = e.currentTarget
                    el.style.height = 'auto'
                    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  disabled={loading || !input.trim()}
                  onClick={() => void send()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-auto bg-muted/15 p-4 lg:p-6">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Preview</h2>
            <CreatePrototypePreview page={preview} />
          </div>
        </section>
      </div>

      {saveMarkdownDialog}
    </div>
  )
}
