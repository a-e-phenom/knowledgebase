import { supabase } from '@/lib/supabase'
import { SHARED_WORKSPACE_USER_ID } from '@/lib/sharedWorkspace'
import { firstOrNull } from '@/lib/supabaseQuery'
import { markdownToHtml } from '@/lib/markdown'

/**
 * BlockEditor persists `editor.getHTML()`. Plain markdown in `content` would show
 * literal `##`, `**`, etc. Convert markdown to HTML unless the string already looks like HTML.
 */
function contentForEditor(body: string): string {
  const t = body.trim()
  if (/^<[a-z]/i.test(t)) {
    return body
  }
  return markdownToHtml(body)
}

/** Turn structured cards into markdown for storage in a document. */
export function structuredCardsToMarkdown(
  cards: { title: string; body: string }[],
  heading = 'AI output',
): string {
  const lines = cards.map((c) => `## ${c.title}\n\n${c.body.trim()}\n`)
  return `# ${heading}\n\n${lines.join('\n')}`
}

export function suggestedMarkdownTitle(base: string): string {
  const short = new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${base} (${short})`
}

export async function insertMarkdownDocument(
  docTitle: string,
  markdownContent: string,
): Promise<{ id: string } | { error: string }> {
  const html = contentForEditor(markdownContent)
  const { data: rows, error } = await supabase
    .from('documents')
    .insert({
      title: docTitle.trim() || 'Untitled',
      content: html,
      user_id: SHARED_WORKSPACE_USER_ID,
    })
    .select('id')
  if (error) return { error: error.message }
  const data = firstOrNull(rows)
  if (!data?.id) return { error: 'No document returned (insert may have succeeded — check RLS SELECT on documents).' }
  return { id: data.id }
}
