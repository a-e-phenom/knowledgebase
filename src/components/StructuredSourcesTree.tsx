import { useMemo, useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileText, Folder, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getDescendantFolderIds } from '@/lib/moduleKnowledge'

export type StructuredTreeDocument = {
  id: string
  title: string
  file_name: string | null
  folder_id: string | null
}

export type StructuredTreeFolder = {
  id: string
  parent_id: string | null
  name: string
}

type Props = {
  documents: StructuredTreeDocument[]
  folders: StructuredTreeFolder[]
  selectedSourceIds: string[]
  setSelectedSourceIds: Dispatch<SetStateAction<string[]>>
  sourceQuery: string
}

function sortFolders(a: StructuredTreeFolder, b: StructuredTreeFolder) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

function sortDocs(a: StructuredTreeDocument, b: StructuredTreeDocument) {
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
}

export function StructuredSourcesTree({
  documents,
  folders,
  selectedSourceIds,
  setSelectedSourceIds,
  sourceQuery,
}: Props) {
  const q = sourceQuery.trim().toLowerCase()

  const childrenByParent = useMemo(() => {
    const m = new Map<string | null, StructuredTreeFolder[]>()
    for (const f of folders) {
      const key = f.parent_id
      const list = m.get(key) ?? []
      list.push(f)
      m.set(key, list)
    }
    for (const list of m.values()) list.sort(sortFolders)
    return m
  }, [folders])

  const docsByFolderId = useMemo(() => {
    const m = new Map<string | null, StructuredTreeDocument[]>()
    for (const d of documents) {
      const key = d.folder_id
      const list = m.get(key) ?? []
      list.push(d)
      m.set(key, list)
    }
    for (const list of m.values()) list.sort(sortDocs)
    return m
  }, [documents])

  const docMatches = useCallback(
    (d: StructuredTreeDocument) => {
      if (!q) return true
      return (
        d.title.toLowerCase().includes(q) ||
        (d.file_name?.toLowerCase().includes(q) ?? false)
      )
    },
    [q],
  )

  const folderNameMatches = useCallback(
    (folder: StructuredTreeFolder) => {
      if (!q) return true
      return folder.name.toLowerCase().includes(q)
    },
    [q],
  )

  /** All document ids under this folder (any depth), limited to `documents` list. */
  const docIdsInSubtree = useCallback(
    (folderId: string): string[] => {
      const subtreeFolderIds = getDescendantFolderIds([folderId], folders)
      return documents
        .filter((d) => d.folder_id != null && subtreeFolderIds.has(d.folder_id))
        .map((d) => d.id)
    },
    [documents, folders],
  )

  const subtreeHasVisibleMatch = useCallback(
    (folderId: string): boolean => {
      if (!q) return true
      const folder = folders.find((f) => f.id === folderId)
      if (folder && folderNameMatches(folder)) return true
      const direct = docsByFolderId.get(folderId) ?? []
      if (direct.some(docMatches)) return true
      const kids = childrenByParent.get(folderId) ?? []
      return kids.some((c) => subtreeHasVisibleMatch(c.id))
    },
    [q, folders, folderNameMatches, docsByFolderId, docMatches, childrenByParent],
  )

  const rootDocsVisible = useMemo(() => {
    const root = docsByFolderId.get(null) ?? []
    if (!q) return root
    return root.filter(docMatches)
  }, [docsByFolderId, q, docMatches])

  const rootFoldersVisible = useMemo(() => {
    const roots = childrenByParent.get(null) ?? []
    if (!q) return roots
    return roots.filter((f) => subtreeHasVisibleMatch(f.id))
  }, [childrenByParent, q, subtreeHasVisibleMatch])

  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set())

  /** New folders default to expanded; removed folders dropped; user-collapsed ids stay collapsed. */
  useEffect(() => {
    if (folders.length === 0) return
    setExpandedFolderIds((prev) => {
      const next = new Set(prev)
      let changed = false
      for (const f of folders) {
        if (!next.has(f.id)) {
          next.add(f.id)
          changed = true
        }
      }
      for (const id of [...next]) {
        if (!folders.some((f) => f.id === id)) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [folders])

  const selectedSet = useMemo(() => new Set(selectedSourceIds), [selectedSourceIds])

  const folderCheckState = useCallback(
    (folderId: string): boolean | 'indeterminate' => {
      const ids = docIdsInSubtree(folderId)
      if (ids.length === 0) return false
      let n = 0
      for (const id of ids) {
        if (selectedSet.has(id)) n++
      }
      if (n === 0) return false
      if (n === ids.length) return true
      return 'indeterminate'
    },
    [docIdsInSubtree, selectedSet],
  )

  const toggleFolder = useCallback(
    (folderId: string) => {
      const ids = docIdsInSubtree(folderId)
      if (ids.length === 0) return
      const allOn = ids.every((id) => selectedSet.has(id))
      setSelectedSourceIds((prev) => {
        const prevSet = new Set(prev)
        if (allOn) {
          for (const id of ids) prevSet.delete(id)
        } else {
          for (const id of ids) prevSet.add(id)
        }
        return [...prevSet]
      })
    },
    [docIdsInSubtree, selectedSet, setSelectedSourceIds],
  )

  const toggleDoc = useCallback(
    (docId: string) => {
      setSelectedSourceIds((prev) =>
        prev.includes(docId) ? prev.filter((x) => x !== docId) : [...prev, docId],
      )
    },
    [setSelectedSourceIds],
  )

  const toggleExpand = useCallback((folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }, [])

  const renderFolder = (folder: StructuredTreeFolder, depth: number) => {
    if (q && !subtreeHasVisibleMatch(folder.id)) return null

    const expanded = expandedFolderIds.has(folder.id)
    const childFolders = childrenByParent.get(folder.id) ?? []
    const directDocs = (docsByFolderId.get(folder.id) ?? []).filter((d) => !q || docMatches(d))
    const hasChildren = childFolders.length > 0 || (docsByFolderId.get(folder.id) ?? []).length > 0
    const ids = docIdsInSubtree(folder.id)
    const checkState = folderCheckState(folder.id)
    const folderDisabled = ids.length === 0

    return (
      <div key={folder.id} className="select-none">
        <div
          className={cn(
            'flex items-start gap-1 rounded-md py-1 pr-2 text-sm',
            'hover:bg-accent/60',
          )}
          style={{ paddingLeft: depth * 12 + 4 }}
        >
          <button
            type="button"
            className={cn(
              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors',
              !hasChildren && 'invisible pointer-events-none',
            )}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse folder' : 'Expand folder'}
            onClick={() => toggleExpand(folder.id)}
          >
            <ChevronRight
              className={cn('h-4 w-4 transition-transform', expanded && 'rotate-90')}
            />
          </button>
          <label
            className={cn(
              'flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-md py-1',
              folderDisabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <Checkbox
              checked={
                checkState === 'indeterminate' ? 'indeterminate' : checkState
              }
              disabled={folderDisabled}
              onCheckedChange={() => !folderDisabled && toggleFolder(folder.id)}
              className="mt-0.5"
              aria-label={`Select all documents in ${folder.name}`}
            />
            <span className="flex min-w-0 flex-1 items-start gap-2">
              <Folder className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 leading-snug">
                <span className="break-words font-medium">{folder.name || 'Folder'}</span>
                {ids.length > 0 ? (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    ({ids.length})
                  </span>
                ) : (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">(empty)</span>
                )}
              </span>
            </span>
          </label>
        </div>
        {expanded && hasChildren ? (
          <div>
            {childFolders.map((c) => renderFolder(c, depth + 1))}
            {directDocs.map((doc) => {
              const checked = selectedSet.has(doc.id)
              return (
                <label
                  key={doc.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md py-1.5 pr-2 text-sm transition-colors hover:bg-accent/60"
                  style={{ paddingLeft: (depth + 1) * 12 + 36 }}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleDoc(doc.id)}
                    className="mt-0.5"
                    aria-label={`Select ${doc.title}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="leading-snug break-words">{doc.title}</span>
                    </span>
                    {doc.file_name ? (
                      <span className="mt-0.5 block truncate pl-6 text-xs text-muted-foreground">
                        {doc.file_name}
                      </span>
                    ) : null}
                  </span>
                </label>
              )
            })}
          </div>
        ) : null}
      </div>
    )
  }

  const empty =
    rootFoldersVisible.length === 0 &&
    rootDocsVisible.length === 0 &&
    (!q || documents.length === 0)

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-0.5 p-2">
        {empty ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {q ? 'No folders or documents match your search.' : 'No documents available.'}
          </p>
        ) : (
          <>
            {rootFoldersVisible.map((f) => renderFolder(f, 0))}
            {rootDocsVisible.map((doc) => {
              const checked = selectedSet.has(doc.id)
              return (
                <label
                  key={doc.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent/60"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleDoc(doc.id)}
                    className="mt-0.5"
                    aria-label={`Select ${doc.title}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="leading-snug break-words">{doc.title}</span>
                    </span>
                    {doc.file_name ? (
                      <span className="mt-0.5 block truncate pl-6 text-xs text-muted-foreground">
                        {doc.file_name}
                      </span>
                    ) : null}
                  </span>
                </label>
              )
            })}
          </>
        )}
      </div>
    </ScrollArea>
  )
}
