import { marked } from 'marked'
import TurndownService from '@joplin/turndown'
import { tables, strikethrough, highlightedCodeBlock } from '@joplin/turndown-plugin-gfm'

// ── Markdown → HTML ──────────────────────────────────────────────────────────

marked.use({
  renderer: {
    list({ ordered, start, items }: any) {
      let body = ''
      for (const item of items) {
        body += (this as any).listitem(item)
      }
      if (ordered) {
        const startAttr = start !== 1 ? ` start="${start}"` : ''
        return `<ol${startAttr}>\n${body}</ol>\n`
      }
      const isTaskList = items.some((item: any) => item.task)
      const dataType = isTaskList ? ' data-type="taskList"' : ''
      return `<ul${dataType}>\n${body}</ul>\n`
    },
    listitem({ tokens, task: isTask, checked: isChecked }: any) {
      const text = (this as any).parser.parse(tokens)
      if (!isTask) return `<li>${text}</li>\n`
      const checkedAttr = isChecked ? 'data-checked="true"' : 'data-checked="false"'
      return `<li data-type="taskItem" ${checkedAttr}><label><input type="checkbox" ${isChecked ? 'checked' : ''} /><span></span></label><div>${text}</div></li>\n`
    },
  },
})

export function markdownToHtml(markdown: string): string {
  const cleaned = markdown.replace(/^\s*---[\s\S]*?---\s*/, '').trimStart()
  return marked.parse(cleaned, { breaks: true }).toString()
}

// ── HTML → Markdown ──────────────────────────────────────────────────────────

export function htmlToMarkdown(html: string): string {
  const TDS = (TurndownService as any).default ?? TurndownService
  const td = new TDS({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    hr: '---',
    bulletListMarker: '-',
  })

  td.use([tables, strikethrough, highlightedCodeBlock])

  // Task list items
  td.addRule('taskListItem', {
    filter(node: HTMLElement) {
      return (
        node.getAttribute('data-type') === 'taskItem' &&
        node.parentElement?.nodeName === 'UL'
      )
    },
    replacement(_content: string, node: HTMLElement) {
      const isChecked = node.getAttribute('data-checked') === 'true'
      const div = node.querySelector('div')
      const text = div ? div.textContent?.trim() : node.textContent?.trim()
      return `- ${isChecked ? '[x]' : '[ ]'} ${text}${node.nextSibling ? '\n' : ''}`
    },
  })

  // Paragraphs inside list items — no double newlines
  td.addRule('listParagraph', {
    filter: ['p'],
    replacement(content: string, node: HTMLElement) {
      if (node.parentElement?.nodeName === 'LI') return content
      return `\n\n${content}\n\n`
    },
  })

  return td.turndown(html)
}
