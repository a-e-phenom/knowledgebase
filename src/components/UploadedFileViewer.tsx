import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { renderAsync } from 'docx-preview'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

type ViewerKind = 'pdf' | 'docx' | 'image' | 'legacy-word' | 'other'

function classifyFile(fileName: string | null, fileType: string | null): ViewerKind {
  const ext = fileName?.split('.').pop()?.toLowerCase() ?? ''
  const mime = (fileType || '').toLowerCase()
  if (mime.includes('pdf') || ext === 'pdf') return 'pdf'
  if (ext === 'docx' || mime.includes('wordprocessingml') || mime.includes('officedocument.wordprocessingml')) {
    return 'docx'
  }
  if (ext === 'doc' && mime.includes('msword')) return 'legacy-word'
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
    return 'image'
  }
  return 'other'
}

function PdfPages({ url }: { url: string }) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [width, setWidth] = useState(720)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setWidth(Math.min(900, Math.floor(w - 32)))
    })
    ro.observe(el)
    const w = el.getBoundingClientRect().width
    if (w > 0) setWidth(Math.min(900, Math.floor(w - 32)))
    return () => ro.disconnect()
  }, [])

  const fileOrUrl = useMemo(() => ({ url }), [url])

  return (
    <div ref={containerRef} className="w-full">
      <Document
        file={fileOrUrl}
        loading={
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading PDF…
          </div>
        }
        error={
          <p className="text-sm text-destructive py-8 text-center">
            Could not load this PDF. Try Download or open in a new tab.
          </p>
        }
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
      >
        {numPages !== null &&
          Array.from({ length: numPages }, (_, i) => (
            <div key={i + 1} className="mb-4 flex justify-center shadow-sm rounded border bg-card">
              <Page pageNumber={i + 1} width={width} renderTextLayer renderAnnotationLayer />
            </div>
          ))}
      </Document>
    </div>
  )
}

function DocxView({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  // Must keep the ref container mounted while loading — otherwise ref.current is null and fetch never runs.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const el = ref.current
      if (!el) return
      try {
        setStatus('loading')
        const res = await fetch(url)
        if (!res.ok) throw new Error(String(res.status))
        const buf = await res.arrayBuffer()
        if (cancelled) return
        const target = ref.current
        if (!target) return
        target.innerHTML = ''
        await renderAsync(buf, target, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
        })
        if (!cancelled) setStatus('ready')
      } catch {
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <div className="relative min-h-[200px] w-full">
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-md bg-background/90 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin shrink-0" />
          <span>Loading Word document…</span>
        </div>
      )}
      {status === 'error' && (
        <p className="text-sm text-destructive py-8 text-center">
          Could not render this document. Try Download.
        </p>
      )}
      <div
        ref={ref}
        className={cn(
          'docx-viewer mx-auto max-w-[900px] rounded-md border bg-card p-8 text-foreground [&_.docx-wrapper]:!bg-transparent',
          status === 'error' && 'hidden',
        )}
      />
    </div>
  )
}

export type UploadedFileViewerProps = {
  fileUrl: string
  fileName: string | null
  fileType: string | null
}

export function UploadedFileViewer({ fileUrl, fileName, fileType }: UploadedFileViewerProps) {
  const kind = classifyFile(fileName, fileType)

  const openExternal = useCallback(() => {
    window.open(fileUrl, '_blank', 'noopener,noreferrer')
  }, [fileUrl])

  return (
    <div className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden">
      {/*
        Native overflow-y-auto: Radix ScrollArea often won't get a bounded height inside nested flex,
        so the viewport grows with content and never scrolls. basis-0 + flex-1 fixes flex height.
      */}
      <div className="min-h-0 flex-1 basis-0 overflow-y-auto overflow-x-hidden overscroll-contain">
        <div className="mx-auto max-w-[960px] px-6 py-6">
          {kind === 'pdf' && <PdfPages url={fileUrl} />}
          {kind === 'docx' && <DocxView url={fileUrl} />}
          {kind === 'image' && (
            <div className="flex justify-center rounded-md border bg-muted/20 p-4">
              <img
                src={fileUrl}
                alt={fileName ?? ''}
                className="max-h-[calc(100vh-220px)] w-auto max-w-full object-contain"
              />
            </div>
          )}
          {kind === 'legacy-word' && (
            <div className="rounded-lg border bg-muted/30 px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Older <span className="font-medium text-foreground">.doc</span> files cannot be previewed in the browser.
                Open the file in Microsoft Word or use the button below.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={openExternal}>
                Open / download
              </Button>
            </div>
          )}
          {kind === 'other' && (
            <div className="rounded-lg border bg-muted/30 px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                No built-in preview for this file type.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={openExternal}>
                Download or open
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
