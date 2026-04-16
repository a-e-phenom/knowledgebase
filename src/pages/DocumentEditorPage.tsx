import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { SHARED_WORKSPACE_USER_ID } from '@/lib/sharedWorkspace'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BlockEditor } from '@/components/BlockEditor'
import { TagManagementDialog } from '@/components/TagManagementDialog'
import { AppHeader } from '@/components/AppHeader'
import { Save, Tag as TagIcon } from 'lucide-react'
import { toast } from 'sonner'

type Tag = {
  id: string
  name: string
  color: string
  created_at: string
  user_id: string
}

export function DocumentEditorPage() {
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
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .eq('user_id', SHARED_WORKSPACE_USER_ID)
        .maybeSingle()

      if (docError) throw docError
      if (!docData) { toast.error('Document not found'); navigate('/documents'); return }
      if (docData.file_url) { toast.error('Cannot edit uploaded files'); navigate('/documents'); return }

      setTitle(docData.title)
      setContent(docData.content || '')

      const { data: tagData, error: tagError } = await supabase
        .from('document_tags').select('tag_id, tags(*)').eq('document_id', id)

      if (!tagError && tagData) setTags(tagData.map((dt: any) => dt.tags))
    } catch (error: any) {
      toast.error(error.message)
      navigate('/documents')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Please enter a title'); return }
    setSaving(true)
    try {
      if (id) {
        const { error } = await supabase.from('documents')
          .update({ title: title.trim(), content })
          .eq('id', id)
          .eq('user_id', SHARED_WORKSPACE_USER_ID)
        if (error) throw error
        toast.success('Saved')
      } else {
        const insertPayload: Record<string, any> = {
          title: title.trim(),
          content,
          user_id: SHARED_WORKSPACE_USER_ID,
        }
        if (folderId) insertPayload.folder_id = folderId
        const { data, error } = await supabase.from('documents')
          .insert(insertPayload)
          .select().single()
        if (error) throw error
        toast.success('Document created')
        navigate(`/documents/${data.id}/edit`)
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [title, content])

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
