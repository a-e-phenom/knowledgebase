import * as pdfjs from 'pdfjs-dist'
import mammoth from 'mammoth'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

/** Max characters per document sent to the model (approximate context control). */
const MAX_DOC_CHARS = 100_000

function truncate(text: string): string {
  const t = text.trim()
  if (t.length <= MAX_DOC_CHARS) return t
  return `${t.slice(0, MAX_DOC_CHARS)}\n\n[Content truncated for AI context length.]`
}

async function extractPdfText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch PDF (${res.status})`)
  const buf = await res.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: buf })
  const pdf = await loadingTask.promise
  const parts: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const line = tc.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    parts.push(line)
  }
  return parts.join('\n\n')
}

async function extractDocxText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch document (${res.status})`)
  const buf = await res.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buf })
  return result.value
}

export type DocTextInput = {
  title: string
  content: string | null
  file_url: string | null
  file_type: string | null
  file_name: string | null
}

/**
 * Text to send to the AI: markdown `content` for normal docs, or extracted text for uploads (PDF, DOCX, TXT).
 */
export async function getDocumentTextForAi(doc: DocTextInput): Promise<string> {
  if (!doc.file_url) {
    return truncate((doc.content ?? '').trim() || '(empty document)')
  }

  const name = doc.file_name ?? doc.title
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : ''
  const mime = (doc.file_type || '').toLowerCase()

  try {
    if (mime.includes('pdf') || ext === 'pdf') {
      const text = await extractPdfText(doc.file_url)
      const t = text.trim()
      if (!t) {
        return '(PDF has no extractable text — it may be scanned images only. Use OCR or paste text.)'
      }
      return truncate(t)
    }
    if (
      ext === 'docx' ||
      mime.includes('wordprocessingml') ||
      mime.includes('officedocument.wordprocessingml')
    ) {
      const text = await extractDocxText(doc.file_url)
      return truncate((text ?? '').trim() || '(no text in document)')
    }
    if (ext === 'txt' || mime === 'text/plain') {
      const res = await fetch(doc.file_url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      return truncate(text)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return `(Could not read uploaded file "${name}": ${msg})`
  }

  return `(Uploaded file "${name}" — automatic text extraction is not supported for this type. Use PDF, DOCX, or TXT, or paste excerpts.)`
}
