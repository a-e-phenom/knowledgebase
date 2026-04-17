import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getDocumentTextForAi } from '@/lib/documentTextForAi'
import { buildStructuredOutputSystemSuffix } from '@/lib/structuredModuleOutput'
import { fetchModules, getModule, type Module } from '@/lib/moduleSettings'
import { AiChat } from '@/components/AiChat'
import { ModuleIconComponent } from '@/components/ModuleIconComponent'

type Props = {
  id?: string
}

export function DynamicModulePage({ id: propId }: Props) {
  const params = useParams<{ id: string }>()
  const id = propId ?? params.id
  const navigate = useNavigate()
  const [mod, setMod] = useState<Module | null>(null)
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      navigate('/')
      return
    }
    let alive = true

    const loadDocInstructions = async (docId: string, fallback: string) => {
      try {
        const { data, error } = await supabase
          .from('documents')
          .select('title, content, file_url, file_type, file_name')
          .eq('id', docId)
          .maybeSingle()

        if (!alive) return
        if (error || !data) {
          setSystemPrompt(fallback)
          return
        }
        const text = (await getDocumentTextForAi({
          title: data.title,
          content: data.content,
          file_url: data.file_url,
          file_type: data.file_type,
          file_name: data.file_name,
        })).trim()
        const useFallback =
          !text ||
          text.startsWith('(Could not read') ||
          text === '(empty document)' ||
          text.startsWith('(PDF has no extractable') ||
          (text.startsWith('(Uploaded file') && text.includes('not supported'))
        setSystemPrompt(useFallback ? fallback : text)
      } catch {
        if (alive) setSystemPrompt(fallback)
      }
    }

    ;(async () => {
      setMod(null)
      setSystemPrompt(null)
      await fetchModules()
      if (!alive) return
      const found = getModule(id)
      if (!found) {
        navigate('/')
        return
      }
      setMod(found)
      if (found.instructionsDocId) {
        await loadDocInstructions(found.instructionsDocId, found.instructions)
      } else if (alive) {
        setSystemPrompt(found.instructions)
      }
    })()

    return () => {
      alive = false
    }
  }, [id, navigate])

  const effectiveSystemPrompt = useMemo(() => {
    if (systemPrompt === null || !mod) return ''
    if (mod.outputMode === 'structured') {
      return systemPrompt + buildStructuredOutputSystemSuffix(mod.structuredOutputPrompt ?? '')
    }
    return systemPrompt
  }, [mod, systemPrompt])

  if (!mod || systemPrompt === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    )
  }

  const outputMode = mod.outputMode ?? 'chat'

  return (
    <AiChat
      backTo="/"
      title={mod.label}
      settingsPath={`/modules/${mod.id}/settings`}
      assistantIcon={<ModuleIconComponent icon={mod.icon} className="h-4 w-4" />}
      systemPrompt={effectiveSystemPrompt}
      outputMode={outputMode}
      knowledge={mod.knowledge}
      emptyTitle={`Ask me anything — ${mod.label}`}
      emptySubtitle={
        outputMode === 'structured'
          ? 'Select documents, then Generate. Instructions live in module settings.'
          : 'Type @ to attach a document as context'
      }
      inputPlaceholder="Ask a question… type @ to reference a document"
    />
  )
}
