/** JSON shape the model must return in structured output mode. */
export const STRUCTURED_OUTPUT_JSON_EXAMPLE =
  '{"cards":[{"title":"Short heading","body":"Markdown body with details, lists, etc."}]}'

/**
 * Appends instructions so the model replies with only JSON matching our card UI.
 */
export function buildStructuredOutputSystemSuffix(userInstructions: string): string {
  const u = userInstructions.trim()
  return `\n\n---\nStructured output (mandatory)\n${
    u ? `${u}\n\n` : ''
  }Your entire reply must be ONLY a single JSON object (no markdown fences, no text before or after) with this exact shape:\n${STRUCTURED_OUTPUT_JSON_EXAMPLE}\nEach object in "cards" becomes one card in the UI. Use markdown in "body" for lists and emphasis.`
}

export function parseStructuredAssistantResponse(
  content: string
): { title: string; body: string }[] | null {
  let s = content.trim()
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m.exec(s)
  if (fence) s = fence[1].trim()
  try {
    const o = JSON.parse(s) as unknown
    if (!o || typeof o !== 'object' || !('cards' in o)) return null
    const cards = (o as { cards: unknown }).cards
    if (!Array.isArray(cards)) return null
    const out: { title: string; body: string }[] = []
    for (const c of cards) {
      if (!c || typeof c !== 'object') continue
      const item = c as { title?: unknown; body?: unknown }
      if (typeof item.title !== 'string' || typeof item.body !== 'string') continue
      out.push({ title: item.title, body: item.body })
    }
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}
