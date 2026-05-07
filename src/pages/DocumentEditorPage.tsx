import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getActiveWorkspaceId } from '@/lib/workspaces'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BlockEditor } from '@/components/BlockEditor'
import { TagManagementDialog } from '@/components/TagManagementDialog'
import { AppHeader } from '@/components/AppHeader'
import { Download, Save, Tag as TagIcon } from 'lucide-react'
import { toast } from 'sonner'
import { firstOrNull, isLikelyDatabaseUuid } from '@/lib/supabaseQuery'
import {
  buildMarkdownDownload,
  markdownDownloadFilename,
  triggerDownloadTextFile,
} from '@/lib/markdown'

type Tag = {
  id: string
  name: string
  color: string
  created_at: string
  user_id: string
}

export function DocumentEditorPage() {
  const workspaceId = getActiveWorkspaceId()
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const folderId = searchParams.get('folder')
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tagDialogOpen, setTagDialogOpen] = useState(false)
  const titleRef = useRef<HTMLTextAreaElement>(null)

  const resizeTitle = useCallback(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [])

  useEffect(() => { resizeTitle() }, [title, resizeTitle])

  useEffect(() => {
    if (id) {
      fetchDocument()
    } else {
      setLoading(false)
      setTimeout(() => titleRef.current?.focus(), 50)
    }
  }, [id])

  const fetchDocument = async () => {
    try {
      if (!id || !isLikelyDatabaseUuid(id)) {
        toast.error('Invalid document link')
        navigate('/documents')
        return
      }

      const { data: docRows, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .eq('user_id', workspaceId)
        .limit(1)

      if (docError) throw docError
      const docData = firstOrNull(docRows)
      if (!docData) { toast.error('Document not found'); navigate('/documents'); return }
      if (docData.file_url) { toast.error('Cannot edit uploaded files'); navigate('/documents'); return }

      setTitle(docData.title)
      setContent(docData.content || '')

      const { data: linkRows, error: linkErr } = await supabase
        .from('document_tags')
        .select('tag_id')
        .eq('document_id', id)

      if (linkErr) {
        setTags([])
      } else {
        const tagIds = [...new Set((linkRows ?? []).map((r) => r.tag_id))]
        if (tagIds.length === 0) {
          setTags([])
        } else {
          const { data: tagRows, error: tagsErr } = await supabase
            .from('tags')
            .select('*')
            .in('id', tagIds)
          setTags(tagsErr ? [] : ((tagRows ?? []) as Tag[]))
        }
      }
    } catch (error: any) {
      toast.error(error.message)
      navigate('/documents')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = useCallback(async () => {
    if (!title.trim()) { toast.error('Please enter a title'); return }
    setSaving(true)
    try {
      const contentToSave = content
      if (id) {
        const { error } = await supabase.from('documents')
          .update({ title: title.trim(), content: contentToSave })
          .eq('id', id)
          .eq('user_id', workspaceId)
        if (error) throw error
        toast.success('Saved')
      } else {
        const insertPayload: Record<string, any> = {
          title: title.trim(),
          content: contentToSave,
          user_id: workspaceId,
        }
        if (folderId) insertPayload.folder_id = folderId
        const { data: createdRows, error } = await supabase.from('documents')
          .insert(insertPayload)
          .select()
        if (error) throw error
        const created = firstOrNull(createdRows)
        if (!created?.id) throw new Error('Document was created but could not be read back (check RLS).')
        toast.success('Document created')
        navigate(`/documents/${created.id}/edit`)
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }, [title, content, id, folderId, navigate, workspaceId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void handleSave()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleSave])

  const handleDownloadMarkdown = () => {
    const name = markdownDownloadFilename(title)
    const md = buildMarkdownDownload(title, content)
    triggerDownloadTextFile(name, md)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        crumbs={[
          { label: 'Documents', to: '/documents' },
          { label: title || 'New Document' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {tags.length > 0 && (
              <div className="hidden sm:flex flex-wrap gap-1.5 mr-2">
                {tags.map((tag) => (
                  <Badge key={tag.id} variant="outline" className="text-xs font-normal gap-1.5">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}
            {id && (
              <Button variant="ghost" size="sm" onClick={() => setTagDialogOpen(true)} className="gap-1.5 text-muted-foreground">
                <TagIcon className="h-3.5 w-3.5" />
                Tags
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleDownloadMarkdown}>
              <Download className="h-3.5 w-3.5" />
              Download .md
            </Button>
            <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        }
      />

      <div className="mx-auto max-w-3xl px-16 pt-12 pb-32">
        <textarea
          ref={titleRef}
          value={title}
          onChange={(e) => { setTitle(e.target.value); resizeTitle() }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              document.querySelector<HTMLElement>('.docmost-editor')?.focus()
            }
          }}
          placeholder="Untitled"
          className="docmost-title"
          rows={1}
        />

        <BlockEditor
          key={id}
          content={content}
          onUpdate={setContent}
          placeholder="Write something, or type '/' for commands…"
        />
      </div>

      {id && (
        <TagManagementDialog
          open={tagDialogOpen}
          onOpenChange={setTagDialogOpen}
          documentId={id}
          currentTags={tags}
          onTagsUpdated={fetchDocument}
        />
      )}
    </div>
  )
}
