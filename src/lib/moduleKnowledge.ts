import type { ModuleKnowledge } from '@/lib/moduleSettings'

type FolderLike = {
  id: string
  parent_id: string | null
}

type DocumentLike = {
  id: string
  folder_id: string | null
}

/** Folder id set: each seed plus every descendant folder (for subtree document checks). */
export function getDescendantFolderIds(folderIds: string[], folders: FolderLike[]) {
  const byParent = new Map<string | null, FolderLike[]>()
  folders.forEach((folder) => {
    const siblings = byParent.get(folder.parent_id) ?? []
    siblings.push(folder)
    byParent.set(folder.parent_id, siblings)
  })

  const visited = new Set(folderIds)
  const queue = [...folderIds]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const children = byParent.get(currentId) ?? []
    children.forEach((child) => {
      if (!visited.has(child.id)) {
        visited.add(child.id)
        queue.push(child.id)
      }
    })
  }

  return visited
}

export function filterDocumentsByKnowledge<TDoc extends DocumentLike, TFolder extends FolderLike>(
  documents: TDoc[],
  folders: TFolder[],
  knowledge: ModuleKnowledge | undefined,
) {
  if (!knowledge || knowledge.allFiles) return documents

  const allowedDocumentIds = new Set(knowledge.documentIds)
  const allowedFolderIds = getDescendantFolderIds(knowledge.folderIds, folders)

  return documents.filter((doc) => {
    if (allowedDocumentIds.has(doc.id)) return true
    if (!doc.folder_id) return false
    return allowedFolderIds.has(doc.folder_id)
  })
}
