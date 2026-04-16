import {
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Music,
  Presentation,
  Video,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type FileKind =
  | 'pdf'
  | 'word'
  | 'excel'
  | 'ppt'
  | 'image'
  | 'video'
  | 'audio'
  | 'other'

function extensionFromName(name: string): string {
  const i = name.lastIndexOf('.')
  if (i < 0) return ''
  return name.slice(i).toLowerCase()
}

function detectKind(
  fileType: string | null,
  nameForExt: string
): FileKind {
  const t = (fileType || '').toLowerCase()
  const ext = extensionFromName(nameForExt)

  if (t === 'application/pdf' || ext === '.pdf') return 'pdf'
  if (t.startsWith('image/')) return 'image'
  if (
    ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.heic', '.avif'].includes(
      ext
    )
  )
    return 'image'
  if (t.startsWith('video/')) return 'video'
  if (['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)) return 'video'
  if (t.startsWith('audio/')) return 'audio'
  if (['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'].includes(ext)) return 'audio'
  if (
    t.includes('wordprocessingml') ||
    t.includes('msword') ||
    t === 'application/rtf' ||
    ext === '.doc' ||
    ext === '.docx' ||
    ext === '.rtf' ||
    ext === '.odt'
  )
    return 'word'
  if (
    t.includes('spreadsheetml') ||
    t.includes('ms-excel') ||
    t.includes('excel') ||
    ext === '.xls' ||
    ext === '.xlsx' ||
    ext === '.csv' ||
    ext === '.ods'
  )
    return 'excel'
  if (
    t.includes('presentationml') ||
    t.includes('powerpoint') ||
    ext === '.ppt' ||
    ext === '.pptx' ||
    ext === '.odp'
  )
    return 'ppt'
  return 'other'
}

/** True when the document should be treated as a PDF (MIME or extension). */
export function isPdfDocument(
  fileType: string | null,
  fileName: string | null,
  titleFallback?: string | null
): boolean {
  const nameForExt = (fileName || titleFallback || '').toLowerCase()
  return detectKind(fileType, nameForExt) === 'pdf'
}

export function DocumentFileIcon({
  fileType,
  fileName,
  titleFallback,
  className,
}: {
  fileType: string | null
  fileName?: string | null
  titleFallback?: string | null
  className?: string
}) {
  const nameForExt = (fileName || titleFallback || '').toLowerCase()
  const kind = detectKind(fileType, nameForExt)
  const base = 'h-3.5 w-3.5 shrink-0'

  switch (kind) {
    case 'pdf':
      return (
        <FileText
          className={cn(base, 'text-red-600 dark:text-red-500', className)}
          aria-hidden
        />
      )
    case 'word':
      return (
        <FileText
          className={cn(base, 'text-blue-600 dark:text-blue-500', className)}
          aria-hidden
        />
      )
    case 'excel':
      return (
        <FileSpreadsheet
          className={cn(base, 'text-green-600 dark:text-green-500', className)}
          aria-hidden
        />
      )
    case 'ppt':
      return (
        <Presentation
          className={cn(base, 'text-orange-600 dark:text-orange-500', className)}
          aria-hidden
        />
      )
    case 'image':
      return (
        <FileImage
          className={cn(base, 'text-amber-600 dark:text-amber-500', className)}
          aria-hidden
        />
      )
    case 'video':
      return (
        <Video
          className={cn(base, 'text-violet-600 dark:text-violet-500', className)}
          aria-hidden
        />
      )
    case 'audio':
      return (
        <Music
          className={cn(base, 'text-purple-600 dark:text-purple-500', className)}
          aria-hidden
        />
      )
    default:
      return (
        <File className={cn(base, 'text-muted-foreground', className)} aria-hidden />
      )
  }
}
