import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Plus, FileText, Upload, Tag as TagIcon, MoreVertical,
  Folder, FolderPlus, FolderInput, Pencil, Trash2,
  ChevronRight, ChevronDown, File, Save, Download, ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { BlockEditor } from '@/components/BlockEditor'
import { TagManagementDialog } from '@/components/TagManagementDialog'
import { AppHeader } from '@/components/AppHeader'
import { DOCUMENTS_STORAGE_BUCKET } from '@/lib/storage'
import { getActiveWorkspaceId } from '@/lib/workspaces'
import { storageObjectPathFromPublicUrl } from '@/lib/storagePath'
import { UploadedFileViewer } from '@/components/UploadedFileViewer'
import { ExplorerTruncatedLabel } from '@/components/ExplorerTruncatedLabel'
import { DocumentFileIcon, isPdfDocument } from '@/components/DocumentFileIcon'
import { firstOrNull } from '@/lib/supabaseQuery'
import {
  buildMarkdownDownload,
  markdownDownloadFilename,
  triggerDownloadTextFile,
} from '@/lib/markdown'

type Document = {
  id: string
  title: string
  content: string | null
  file_url: string | null
  file_type: string | null
  file_name: string | null
  folder_id: string | null
  created_at: string
  updated_at: string
  user_id: string
}

type FolderItem = {
  id: string
  name: string
  parent_id: string | null
  created_at: string
  user_id: string
}

type Tag = {
  id: string
  name: string
  color: string
  created_at: string
  user_id: string
}

export function DocumentsPage() {
  const workspaceId = getActiveWorkspaceId()
  const [allDocuments, setAllDocuments] = useState<Document[]>([])
  const [allFolders, setAllFolders] = useState<FolderItem[]>([])
  const [documentTags, setDocumentTags] = useState<Record<string, Tag[]>>({})
  const [loading, setLoading] = useState(true)

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const uploadFileInputRef = useRef<HTMLInputElement>(null)

  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null)
  const [tagDialogOpen, setTagDialogOpen] = useState(false)

  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null)

  const [renameFolderOpen, setRenameFolderOpen] = useState(false)
  const [renameFolderTarget, setRenameFolderTarget] = useState<FolderItem | null>(null)
  const [renameFolderName, setRenameFolderName] = useState('')

  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderItem | null>(null)
  const [deleteDocTarget, setDeleteDocTarget] = useState<Document | null>(null)

  const [moveDocOpen, setMoveDocOpen] = useState(false)
  const [moveDocTarget, setMoveDocTarget] = useState<Document | null>(null)

  const selectedDoc = allDocuments.find(d => d.id === selectedDocId) ?? null

  const fetchData = useCallback(async () => {
    try {
      const [folderRes, docRes] = await Promise.all([
        supabase.from('folders').select('*').eq('user_id', workspaceId).order('name'),
        supabase.from('documents').select('*').eq('user_id', workspaceId).order('title'),
      ])

      if (folderRes.error) throw folderRes.error
      if (docRes.error) throw docRes.error

      const folderRows: FolderItem[] = folderRes.data || []
      setAllFolders(folderRows)
      setAllDocuments(docRes.data || [])

      // Auto-select first doc if none selected
      if (docRes.data && docRes.data.length > 0) {
        setSelectedDocId((prev) => prev ?? docRes.data[0].id)
      }

      // Fetch tags (two queries — avoids PostgREST embed edge cases / PGRST116)
      if (docRes.data && docRes.data.length > 0) {
        const docIds = docRes.data.map(d => d.id)
        const { data: linkRows, error: linkErr } = await supabase
          .from('document_tags')
          .select('document_id, tag_id')
          .in('document_id', docIds)

        if (!linkErr && linkRows?.length) {
          const tagIds = [...new Set(linkRows.map((r) => r.tag_id))]
          const { data: tagRows, error: tagsErr } = await supabase
            .from('tags')
            .select('*')
            .in('id', tagIds)

          if (!tagsErr && tagRows) {
            const tagById = new Map(tagRows.map((t) => [t.id, t as Tag]))
            const tagsByDoc: Record<string, Tag[]> = {}
            linkRows.forEach((row) => {
              const tag = tagById.get(row.tag_id)
              if (!tag) return
              if (!tagsByDoc[row.document_id]) tagsByDoc[row.document_id] = []
              tagsByDoc[row.document_id].push(tag)
            })
            setDocumentTags(tagsByDoc)
          }
        } else if (!linkErr) {
          setDocumentTags({})
        }
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { fetchData() }, [fetchData])

  // Load selected doc into editor
  useEffect(() => {
    if (!selectedDocId) return
    const doc = allDocuments.find(d => d.id === selectedDocId)
    if (!doc) return
    setEditTitle(doc.title)
    setEditContent(doc.content || '')
  }, [selectedDocId, allDocuments])

  // Auto-resize title
  const resizeTitle = useCallback(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [])
  useEffect(() => { resizeTitle() }, [editTitle, resizeTitle])

  const handleDownloadMarkdown = useCallback(() => {
    if (!selectedDoc || selectedDoc.file_url) return
    const name = markdownDownloadFilename(editTitle || selectedDoc.title)
    const md = buildMarkdownDownload(editTitle || selectedDoc.title, editContent)
    triggerDownloadTextFile(name, md)
  }, [selectedDoc, editTitle, editContent])

  const handleSave = useCallback(async () => {
    if (!selectedDocId || !editTitle.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      const contentToSave = editContent
      const { error } = await supabase.from('documents')
        .update({ title: editTitle.trim(), content: contentToSave })
        .eq('id', selectedDocId)
      if (error) throw error
      toast.success('Saved')
      // Update local state so sidebar reflects title change
      setAllDocuments(prev => prev.map(d => d.id === selectedDocId ? { ...d, title: editTitle.trim(), content: contentToSave } : d))
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }, [selectedDocId, editTitle, editContent])

  // Cmd/Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleSave])

  const handleNewDocument = async (folderId: string | null = null) => {
    try {
      const payload: Record<string, any> = {
        title: 'Untitled',
        content: '',
        user_id: workspaceId,
      }
      if (folderId) payload.folder_id = folderId
      const { data: rows, error } = await supabase.from('documents').insert(payload).select()
      if (error) throw error
      const data = firstOrNull(rows)
      if (!data?.id) throw new Error('Document was created but could not be read back (check RLS).')
      await fetchData()
      setSelectedDocId(data.id)
      if (folderId) setExpandedFolders(prev => new Set(prev).add(folderId))
      setTimeout(() => titleRef.current?.focus(), 100)
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  // Build tree structure
  const folderChildren = useMemo(() => {
    const map: Record<string, FolderItem[]> = { root: [] }
    allFolders.forEach(f => {
      const key = f.parent_id ?? 'root'
      if (!map[key]) map[key] = []
      map[key].push(f)
    })
    return map
  }, [allFolders])

  const docsByFolder = useMemo(() => {
    const map: Record<string, Document[]> = { root: [] }
    allDocuments.forEach(d => {
      const key = d.folder_id ?? 'root'
      if (!map[key]) map[key] = []
      map[key].push(d)
    })
    return map
  }, [allDocuments])

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  // Expand folder containing selected doc
  useEffect(() => {
    if (!selectedDocId) return
    const doc = allDocuments.find(d => d.id === selectedDocId)
    if (!doc?.folder_id) return
    setExpandedFolders(prev => {
      const next = new Set(prev)
      let cursor: string | null = doc.folder_id
      const folderMap = new Map(allFolders.map(f => [f.id, f]))
      while (cursor) {
        next.add(cursor)
        const f = folderMap.get(cursor)
        cursor = f?.parent_id ?? null
      }
      return next
    })
  }, [selectedDocId, allDocuments, allFolders])

  // CRUD handlers
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) { toast.error('Folder name is required'); return }
    const { error } = await supabase.from('folders').insert({
      name: newFolderName.trim(),
      parent_id: newFolderParentId,
      user_id: workspaceId,
    })
    if (error) { toast.error(error.message); return }
    toast.success('Folder created')
    setNewFolderOpen(false); setNewFolderName(''); setNewFolderParentId(null)
    if (newFolderParentId) setExpandedFolders(prev => new Set(prev).add(newFolderParentId!))
    fetchData()
  }

  const handleRenameFolder = async () => {
    if (!renameFolderTarget || !renameFolderName.trim()) return
    const { error } = await supabase.from('folders').update({ name: renameFolderName.trim() }).eq('id', renameFolderTarget.id)
    if (error) { toast.error(error.message); return }
    toast.success('Folder renamed')
    setRenameFolderOpen(false); setRenameFolderTarget(null); fetchData()
  }

  const handleDeleteFolder = async () => {
    if (!deleteFolderTarget) return
    const { error } = await supabase.from('folders').delete().eq('id', deleteFolderTarget.id)
    if (error) { toast.error(error.message); return }
    toast.success('Folder deleted'); setDeleteFolderTarget(null); fetchData()
  }

  const handleMoveDoc = async (targetFolderId: string | null) => {
    if (!moveDocTarget) return
    const { error } = await supabase.from('documents').update({ folder_id: targetFolderId }).eq('id', moveDocTarget.id)
    if (error) { toast.error(error.message); return }
    toast.success('Document moved'); setMoveDocOpen(false); setMoveDocTarget(null); fetchData()
  }

  const handleConfirmDeleteDocument = async () => {
    if (!deleteDocTarget) return
    const doc = deleteDocTarget
    const bucket = DOCUMENTS_STORAGE_BUCKET

    if (doc.file_url) {
      const path = storageObjectPathFromPublicUrl(doc.file_url, bucket)
      if (path) {
        const { error: storageError } = await supabase.storage.from(bucket).remove([path])
        if (storageError) {
          toast.error(`Could not remove file from storage: ${storageError.message}`)
          return
        }
      }
    }

    const { error } = await supabase.from('documents').delete().eq('id', doc.id)
    if (error) { toast.error(error.message); return }

    toast.success('Document deleted')
    setDeleteDocTarget(null)
    if (selectedDocId === doc.id) {
      const remaining = allDocuments.filter(d => d.id !== doc.id)
      setSelectedDocId(remaining[0]?.id ?? null)
    }
    fetchData()
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fileExt = file.name.includes('.') ? file.name.split('.').pop() : ''
    const safeExt = fileExt ? `.${fileExt}` : ''
    const fileName = `${workspaceId}/${Date.now()}${safeExt}`
    const bucket = DOCUMENTS_STORAGE_BUCKET
    const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, file)
    if (uploadError) {
      const msg = uploadError.message || ''
      if (/bucket not found|does not exist|not found/i.test(msg)) {
        toast.error(
          `Storage bucket "${bucket}" is missing. In Supabase: Storage → New bucket → name "${bucket}" (enable public). Or run the SQL in supabase/migrations/20260401120000_create_storage_bucket.sql`,
          { duration: 12_000 },
        )
      } else if (/row-level security|violates.*policy|permission denied|not authorized/i.test(msg)) {
        toast.error(
          `Storage RLS blocked the upload. In Supabase → SQL: run supabase/migrations/20260414100000_public_shared_workspace.sql (shared workspace + storage policies).`,
          { duration: 14_000 },
        )
      } else {
        toast.error(msg)
      }
      return
    }
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName)
    const { data: insertedRows, error: dbError } = await supabase.from('documents').insert({
      title: file.name,
      file_url: publicUrl,
      file_type: file.type || 'application/octet-stream',
      file_name: file.name,
      folder_id: uploadFolderId,
      user_id: workspaceId,
    }).select()
    if (dbError) { toast.error(dbError.message); return }
    const inserted = firstOrNull(insertedRows)
    if (!inserted?.id) {
      toast.error('Upload saved but the document row could not be read back (check RLS).')
      return
    }
    toast.success('File uploaded')
    setSelectedDocId(inserted.id)
    e.target.value = ''
    setIsUploadDialogOpen(false)
    setUploadFolderId(null)
    fetchData()
  }

  // Recursive tree node renderer
  function renderFolder(folder: FolderItem, depth: number) {
    const isOpen = expandedFolders.has(folder.id)
    const children = folderChildren[folder.id] || []
    const docs = docsByFolder[folder.id] || []

    return (
      <div key={folder.id} className="min-w-0">
        <Collapsible open={isOpen} onOpenChange={() => toggleFolder(folder.id)}>
          <div className="group grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-0.5 pr-0.5">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="grid min-h-0 min-w-0 grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-1.5 overflow-hidden rounded-md py-1.5 pl-2 pr-1 text-left text-sm hover:bg-accent transition-colors"
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
              >
                {isOpen
                  ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                }
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                <ExplorerTruncatedLabel text={folder.name} />
              </button>
            </CollapsibleTrigger>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label="Folder actions"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="right">
                <DropdownMenuItem onClick={() => { setNewFolderParentId(folder.id); setNewFolderOpen(true) }}>
                  <FolderPlus className="h-4 w-4 mr-2" />
                  New subfolder
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleNewDocument(folder.id)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New document here
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setRenameFolderTarget(folder); setRenameFolderName(folder.name); setRenameFolderOpen(true) }}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDeleteFolderTarget(folder)} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <CollapsibleContent className="min-w-0">
            {children.map(child => renderFolder(child, depth + 1))}
            {docs.map(doc => renderDocItem(doc, depth + 1))}
          </CollapsibleContent>
        </Collapsible>
      </div>
    )
  }

  function renderDocItem(doc: Document, depth: number) {
    const isSelected = doc.id === selectedDocId
    return (
      <div key={doc.id} className="group grid min-w-0 max-w-full w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-0.5 pr-0.5">
        <button
          type="button"
          onClick={() => setSelectedDocId(doc.id)}
          className={`grid min-h-0 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 overflow-hidden rounded-md py-1.5 pl-2 pr-1 text-left text-sm transition-colors ${isSelected ? 'bg-accent text-accent-foreground font-medium' : 'hover:bg-accent/50'}`}
          style={{ paddingLeft: `${depth * 12 + 8 + 20}px` }}
        >
          {doc.file_url ? (
            <DocumentFileIcon
              fileType={doc.file_type}
              fileName={doc.file_name}
              titleFallback={doc.title}
            />
          ) : (
            <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <ExplorerTruncatedLabel text={doc.title} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
              aria-label="Document actions"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="right">
            <DropdownMenuItem onClick={() => { setMoveDocTarget(doc); setMoveDocOpen(true) }}>
              <FolderInput className="h-4 w-4 mr-2" />
              Move to folder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setSelectedDocId(doc.id); setTagDialogOpen(true) }}>
              <TagIcon className="h-4 w-4 mr-2" />
              Manage tags
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => { setSelectedDocId(doc.id); setDeleteDocTarget(doc) }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  const rootFolders = folderChildren['root'] || []
  const rootDocs = docsByFolder['root'] || []
  const isEmpty = allFolders.length === 0 && allDocuments.length === 0

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading documents...</div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <AppHeader crumbs={[{ label: 'Documents' }]} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* File tree sidebar */}
        <div className="flex min-h-0 min-w-0 w-72 max-w-72 shrink-0 flex-col overflow-x-hidden border-r">
          <div className="flex items-center px-3 py-2.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">
              Explorer
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <Plus className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleNewDocument(null)}>
                  <FileText className="h-4 w-4 mr-2" />
                  New document
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setNewFolderParentId(null); setNewFolderOpen(true) }}>
                  <FolderPlus className="h-4 w-4 mr-2" />
                  New folder
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIsUploadDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload file
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Separator />

          {/* Upload dialog */}
          <Dialog
            open={isUploadDialogOpen}
            onOpenChange={(open) => {
              setIsUploadDialogOpen(open)
              if (!open && uploadFileInputRef.current) uploadFileInputRef.current.value = ''
            }}
          >
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Upload File</DialogTitle>
                <DialogDescription>
                  Choose a file. The document title will match the file name.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="doc-upload-file">File</Label>
                <Input
                  id="doc-upload-file"
                  ref={uploadFileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                />
              </div>
            </DialogContent>
          </Dialog>
          <ScrollArea className="min-h-0 min-w-0 flex-1">
            <div className="min-w-0 max-w-full overflow-x-hidden px-1 py-1">
              {isEmpty ? (
                <div className="px-4 py-8 text-center">
                  <Folder className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No documents yet</p>
                </div>
              ) : (
                <>
                  {rootFolders.map(f => renderFolder(f, 0))}
                  {rootDocs.map(d => renderDocItem(d, 0))}
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Document preview */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {selectedDoc ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* Editor toolbar */}
              <div className="flex items-center gap-3 border-b px-6 py-2 shrink-0">
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  {selectedDoc.file_url && (
                    <ExplorerTruncatedLabel
                      text={selectedDoc.file_name ?? selectedDoc.title}
                      className="text-sm font-medium"
                    />
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    {documentTags[selectedDoc.id]?.map(tag => (
                      <Badge key={tag.id} variant="outline" className="text-xs font-normal gap-1.5">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                        {tag.name}
                      </Badge>
                    ))}
                    <span className="text-xs text-muted-foreground">
                      {new Date(selectedDoc.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground shrink-0" onClick={() => setTagDialogOpen(true)}>
                  <TagIcon className="h-3.5 w-3.5" />
                  Tags
                </Button>
                {selectedDoc.file_url && (
                  <>
                    <Button size="sm" variant="outline" className="gap-1.5 shrink-0" asChild>
                      <a href={selectedDoc.file_url} download={selectedDoc.file_name ?? selectedDoc.title}>
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </a>
                    </Button>
                    {isPdfDocument(
                      selectedDoc.file_type,
                      selectedDoc.file_name,
                      selectedDoc.title
                    ) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 shrink-0"
                        onClick={() =>
                          window.open(selectedDoc.file_url!, '_blank', 'noopener,noreferrer')
                        }
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </Button>
                    )}
                  </>
                )}
                {!selectedDoc.file_url && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5 shrink-0"
                      onClick={handleDownloadMarkdown}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download .md
                    </Button>
                    <Button size="sm" variant="default" className="gap-1.5 shrink-0" onClick={handleSave} disabled={saving}>
                      <Save className="h-3.5 w-3.5" />
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteDocTarget(selectedDoc)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>

              {/* Document body */}
              {selectedDoc.file_url ? (
                <UploadedFileViewer
                  fileUrl={selectedDoc.file_url}
                  fileName={selectedDoc.file_name}
                  fileType={selectedDoc.file_type}
                />
              ) : (
                <ScrollArea className="flex-1">
                  <div className="mx-auto max-w-3xl px-8 pt-6 pb-32">
                    <textarea
                      ref={titleRef}
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Untitled"
                      className="w-full resize-none bg-transparent text-3xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40 mb-4"
                      rows={1}
                    />
                    <BlockEditor
                      key={selectedDocId}
                      content={editContent}
                      onUpdate={setEditContent}
                      placeholder="Write something, or type '/' for commands…"
                    />
                  </div>
                </ScrollArea>
              )}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Select a document to preview</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tag management */}
      {selectedDocId && (
        <TagManagementDialog
          open={tagDialogOpen}
          onOpenChange={setTagDialogOpen}
          documentId={selectedDocId}
          currentTags={documentTags[selectedDocId] || []}
          onTagsUpdated={fetchData}
        />
      )}

      {/* New folder dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
            <DialogDescription>Create a folder to organize your documents.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="folder-name">Name</Label>
            <Input id="folder-name" placeholder="Folder name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder() }} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setNewFolderOpen(false); setNewFolderName('') }}>Cancel</Button>
            <Button onClick={handleCreateFolder}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename folder dialog */}
      <Dialog open={renameFolderOpen} onOpenChange={(open) => { if (!open) { setRenameFolderOpen(false); setRenameFolderTarget(null) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Rename Folder</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-folder">Name</Label>
            <Input id="rename-folder" value={renameFolderName} onChange={(e) => setRenameFolderName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleRenameFolder() }} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRenameFolderOpen(false); setRenameFolderTarget(null) }}>Cancel</Button>
            <Button onClick={handleRenameFolder}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete folder confirmation */}
      <AlertDialog open={!!deleteFolderTarget} onOpenChange={(open) => !open && setDeleteFolderTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteFolderTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This will delete the folder and all documents and subfolders inside it. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFolder} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete document confirmation */}
      <AlertDialog open={!!deleteDocTarget} onOpenChange={(open) => !open && setDeleteDocTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteDocTarget?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDocTarget?.file_url
                ? 'This will remove the file from storage and delete the document. This cannot be undone.'
                : 'This will permanently delete this document. This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteDocument}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move to folder dialog */}
      <Dialog open={moveDocOpen} onOpenChange={(open) => { if (!open) { setMoveDocOpen(false); setMoveDocTarget(null) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move to folder</DialogTitle>
            <DialogDescription>Choose a destination for "{moveDocTarget?.title}".</DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto -mx-2">
            <button onClick={() => handleMoveDoc(null)} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left rounded-md transition-colors hover:bg-accent">
              <Folder className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Root (no folder)</span>
            </button>
            {allFolders.map((f) => (
              <button key={f.id} onClick={() => handleMoveDoc(f.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left rounded-md transition-colors hover:bg-accent">
                <Folder className="h-4 w-4 text-muted-foreground" />
                <ExplorerTruncatedLabel text={f.name} className="flex-1 min-w-0 text-left" />
                {f.id === moveDocTarget?.folder_id && <Badge variant="secondary" className="ml-auto text-xs">Current</Badge>}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
