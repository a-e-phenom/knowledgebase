/**
 * JSON UI schema for the Create Prototype module.
 * The model must output this shape (inside a ```json fence or as raw JSON).
 */

export const CREATE_PROTOTYPE_MODULE_ID = 'create-prototype'

export type ProtoBadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

export type ProtoButtonVariant =
  | 'default'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'destructive'
  | 'link'

export type ProtoBlock =
  | { type: 'heading'; text: string; level?: 1 | 2 | 3 | 4 }
  | { type: 'paragraph'; text: string }
  | { type: 'card'; title?: string; description?: string }
  | { type: 'badge'; text: string; variant?: ProtoBadgeVariant }
  | { type: 'button'; label: string; variant?: ProtoButtonVariant }
  | { type: 'separator' }
  | { type: 'alert'; title?: string; description: string; variant?: 'default' | 'destructive' }

export type ProtoPage = { blocks: ProtoBlock[] }

const BADGE: ProtoBadgeVariant[] = ['default', 'secondary', 'destructive', 'outline']
const BUTTON: ProtoButtonVariant[] = ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link']

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function asString(x: unknown): string | null {
  return typeof x === 'string' ? x : null
}

function normalizeBlock(raw: unknown): ProtoBlock | null {
  if (!isRecord(raw)) return null
  const type = asString(raw.type)
  if (!type) return null
  switch (type) {
    case 'heading': {
      const text = asString(raw.text)?.trim()
      if (!text) return null
      const level = raw.level
      const lv =
        level === 1 || level === 2 || level === 3 || level === 4 ? level : 2
      return { type: 'heading', text, level: lv }
    }
    case 'paragraph': {
      const text = asString(raw.text) ?? ''
      return { type: 'paragraph', text }
    }
    case 'card': {
      return {
        type: 'card',
        title: asString(raw.title)?.trim() || undefined,
        description: asString(raw.description)?.trim() || undefined,
      }
    }
    case 'badge': {
      const text = asString(raw.text)?.trim()
      if (!text) return null
      const v = asString(raw.variant) as ProtoBadgeVariant | undefined
      const variant = v && BADGE.includes(v) ? v : 'secondary'
      return { type: 'badge', text, variant }
    }
    case 'button': {
      const label = asString(raw.label)?.trim()
      if (!label) return null
      const v = asString(raw.variant) as ProtoButtonVariant | undefined
      const variant = v && BUTTON.includes(v) ? v : 'outline'
      return { type: 'button', label, variant }
    }
    case 'separator':
      return { type: 'separator' }
    case 'alert': {
      const description = asString(raw.description)?.trim()
      if (!description) return null
      const variant =
        raw.variant === 'destructive' ? 'destructive' : 'default'
      return {
        type: 'alert',
        title: asString(raw.title)?.trim() || undefined,
        description,
        variant,
      }
    }
    default:
      return null
  }
}

export function parseProtoPage(raw: unknown): { ok: true; page: ProtoPage } | { ok: false; error: string } {
  if (!isRecord(raw)) {
    return { ok: false, error: 'Root value must be a JSON object.' }
  }
  const blocksRaw = raw.blocks
  if (!Array.isArray(blocksRaw)) {
    return { ok: false, error: 'Missing "blocks" array.' }
  }
  const blocks: ProtoBlock[] = []
  for (let i = 0; i < blocksRaw.length; i++) {
    const b = normalizeBlock(blocksRaw[i])
    if (!b) {
      return { ok: false, error: `Invalid block at index ${i}.` }
    }
    blocks.push(b)
  }
  if (blocks.length > 40) {
    return { ok: false, error: 'At most 40 blocks allowed.' }
  }
  return { ok: true, page: { blocks } }
}

/** Pull ```json ... ``` from assistant message; otherwise try whole string. */
export function extractProtoJsonFromAssistant(content: string): string | null {
  const idx = content.indexOf('```json')
  if (idx !== -1) {
    const start = content.indexOf('\n', idx)
    if (start === -1) return null
    const end = content.indexOf('```', start + 1)
    if (end === -1) return null
    return content.slice(start + 1, end).trim()
  }
  const t = content.trim()
  if (t.startsWith('{') && t.endsWith('}')) return t
  const brace = t.indexOf('{')
  const last = t.lastIndexOf('}')
  if (brace !== -1 && last > brace) {
    return t.slice(brace, last + 1)
  }
  return null
}

export function chatTextWithoutJsonFence(content: string): string {
  const idx = content.indexOf('```json')
  if (idx === -1) return content.trim()
  return content.slice(0, idx).trim()
}
