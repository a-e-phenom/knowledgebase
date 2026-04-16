import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { SHARED_WORKSPACE_USER_ID } from '@/lib/sharedWorkspace'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Plus, Check, Tag } from 'lucide-react'

const PRESET_COLORS = [
  { label: 'Slate',    value: '#64748b' },
  { label: 'Red',      value: '#ef4444' },
  { label: 'Orange',   value: '#f97316' },
  { label: 'Amber',    value: '#f59e0b' },
  { label: 'Yellow',   value: '#eab308' },
  { label: 'Lime',     value: '#84cc16' },
  { label: 'Green',    value: '#22c55e' },
  { label: 'Teal',     value: '#14b8a6' },
  { label: 'Cyan',     value: '#06b6d4' },
  { label: 'Blue',     value: '#3b82f6' },
  { label: 'Indigo',   value: '#6366f1' },
  { label: 'Violet',   value: '#8b5cf6' },
  { label: 'Purple',   value: '#a855f7' },
  { label: 'Pink',     value: '#ec4899' },
  { label: 'Rose',     value: '#f43f5e' },
]

type TagItem = {
  id: string
  name: string
  color: string
  created_at: string
  user_id: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId: string
  currentTags: TagItem[]
  onTagsUpdated: () => void
}

export function TagManagementDialog({ open, onOpenChange, documentId, currentTags, onTagsUpdated }: Props) {
  const [allTags, setAllTags] = useState<TagItem[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[9].value) // Blue default
  const [isCreating, setIsCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) fetchAllTags()
  }, [open])

  useEffect(() => {
    if (isCreating) setTimeout(() => inputRef.current?.focus(), 50)
  }, [isCreating])

  const fetchAllTags = async () => {
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .eq('user_id', SHARED_WORKSPACE_USER_ID)
      .order('name')
    if (error) { toast.error(error.message); return }
    setAllTags(data || [])
  }

  const createTag = async () => {
    if (!newTagName.trim()) { toast.error('Enter a tag name'); return }
    const { error } = await supabase
      .from('tags')
      .insert({
        name: newTagName.trim(),
        color: newTagColor,
        user_id: SHARED_WORKSPACE_USER_ID,
      })
    if (error) { toast.error(error.message); return }
    setNewTagName('')
    setNewTagColor(PRESET_COLORS[9].value)
    setIsCreating(false)
    fetchAllTags()
  }

  const toggleTag = async (tag: TagItem) => {
    const isAttached = currentTags.some(t => t.id === tag.id)
    if (isAttached) {
      const { error } = await supabase.from('document_tags').delete().eq('document_id', documentId).eq('tag_id', tag.id)
      if (error) { toast.error(error.message); return }
    } else {
      const { error } = await supabase.from('document_tags').insert({ document_id: documentId, tag_id: tag.id })
      if (error) { toast.error(error.message); return }
    }
    onTagsUpdated()
    fetchAllTags()
  }

  const currentTagIds = new Set(currentTags.map(t => t.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 border-b">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            Tags
          </DialogTitle>
        </DialogHeader>

        <div className="px-3 py-2 border-b">
          <Input
            placeholder="Search or create tags…"
            className="h-8 text-sm border-0 bg-muted/40 focus-visible:ring-0 px-3"
            readOnly
            onClick={() => setIsCreating(true)}
          />
        </div>

        {/* Selected tags preview */}
        {currentTags.length > 0 && (
          <div className="px-4 py-2.5 border-b flex flex-wrap gap-1.5">
            {currentTags.map((tag) => (
              <span key={tag.id} className="tag-chip">
                <span className="tag-chip-dot" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {/* All tags list */}
        <div className="max-h-56 overflow-y-auto py-1">
          {allTags.length === 0 && !isCreating ? (
            <p className="text-sm text-muted-foreground text-center py-6">No tags yet</p>
          ) : (
            allTags.map((tag) => {
              const active = currentTagIds.has(tag.id)
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors text-left ${active ? 'bg-muted/40' : 'hover:bg-muted/30'}`}
                >
                  <span className="h-3 w-3 rounded-full shrink-0 ring-1 ring-black/10" style={{ backgroundColor: tag.color }} />
                  <span className="flex-1 truncate text-gray-700">{tag.name}</span>
                  <span className={`h-4 w-4 rounded flex items-center justify-center shrink-0 border transition-colors ${active ? 'bg-primary border-primary' : 'border-gray-300'}`}>
                    {active && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                  </span>
                </button>
              )
            })
          )}
        </div>

        {/* Create new tag */}
        <div className="border-t">
          {isCreating ? (
            <div className="px-4 py-3 space-y-3">
              <Input
                ref={inputRef}
                placeholder="Tag name"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createTag()
                  if (e.key === 'Escape') { setIsCreating(false); setNewTagName('') }
                }}
                className="h-8 text-sm"
              />

              {/* Color swatches */}
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.value}
                    title={c.label}
                    onClick={() => setNewTagColor(c.value)}
                    className="h-6 w-6 rounded-full transition-transform hover:scale-110 focus:outline-none"
                    style={{ backgroundColor: c.value, outline: newTagColor === c.value ? `2px solid ${c.value}` : 'none', outlineOffset: 2 }}
                  >
                    {newTagColor === c.value && (
                      <span className="flex items-center justify-center w-full h-full">
                        <Check className="h-3 w-3 text-white" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Preview */}
              {newTagName && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Preview:</span>
                  <span className="tag-chip">
                    <span className="tag-chip-dot" style={{ backgroundColor: newTagColor }} />
                    {newTagName}
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <Button size="sm" onClick={createTag} className="flex-1 h-8">
                  Create
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setIsCreating(false); setNewTagName('') }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create a tag
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
