import type { ModuleStructuredLayout } from '@/lib/moduleSettings'

/** JSON shape for structured card output. */
export const STRUCTURED_OUTPUT_JSON_EXAMPLE =
  '{"cards":[{"title":"Short heading","body":"Markdown body with details, lists, etc."}]}'

/** JSON shape for a single generated markdown document. */
export const STRUCTURED_OUTPUT_SINGLE_DOCUMENT_JSON_EXAMPLE =
  '{"document":"# Title\\n\\nFull markdown body with sections, lists, etc."}'

export type ParsedStructuredCards = {
  layout: 'cards'
  cards: { title: string; body: string }[]
}

export type ParsedStructuredDocument = {
  layout: 'single_document'
  document: string
}

export type ParsedStructured = ParsedStructuredCards | ParsedStructuredDocument

/**
 * Appends instructions so the model replies with only JSON matching the chosen structured UI.
 */
export function buildStructuredOutputSystemSuffix(
  userInstructions: string,
  layout: ModuleStructuredLayout = 'cards',
): string {
  const u = userInstructions.trim()
  const header = `\n\n---\nStructured output (mandatory)\n${u ? `${u}\n\n` : ''}`

  if (layout === 'single_document') {
    return `${header}Your entire reply must be ONLY a single JSON object (no markdown fences, no text before or after) with this exact shape:\n${STRUCTURED_OUTPUT_SINGLE_DOCUMENT_JSON_EXAMPLE}\nThe "document" value must be one cohesive markdown string produced from the user’s sources and your system instructions. Use headings, lists, and emphasis as appropriate. Do not return a "cards" array.`
  }

  return `${header}Your entire reply must be ONLY a single JSON object (no markdown fences, no text before or after) with this exact shape:\n${STRUCTURED_OUTPUT_JSON_EXAMPLE}\nEach object in "cards" becomes one card in the UI. Use markdown in "body" for lists and emphasis.`
}

export function parseStructuredAssistantResponse(
  content: string,
  layout: ModuleStructuredLayout = 'cards',
): ParsedStructured | null {
  let s = content.trim()
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m.exec(s)
  if (fence) s = fence[1].trim()
  try {
    const o = JSON.parse(s) as unknown
    if (!o || typeof o !== 'object') return null

    if (layout === 'single_document') {
      const doc = (o as { document?: unknown }).document
      if (typeof doc !== 'string' || !doc.trim()) return null
      return { layout: 'single_document', document: doc.trim() }
    }

    if (!('cards' in o)) return null
    const cards = (o as { cards: unknown }).cards
    if (!Array.isArray(cards)) return null
    const out: { title: string; body: string }[] = []
    for (const c of cards) {
      if (!c || typeof c !== 'object') continue
      const item = c as { title?: unknown; body?: unknown }
      if (typeof item.title !== 'string' || typeof item.body !== 'string') continue
      out.push({ title: item.title, body: item.body })
    }
    return out.length > 0 ? { layout: 'cards', cards: out } : null
  } catch {
    return null
  }
}
