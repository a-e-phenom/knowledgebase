import type { CSSProperties } from 'react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { ProtoBlock, ProtoPage } from '@/lib/createPrototypeSchema'
import { cn } from '@/lib/utils'

/** Scoped primary for AI-generated preview (Create Prototype module). */
export const CREATE_PROTOTYPE_PRIMARY = '#4D3EE0'

const previewThemeStyle = {
  '--primary': CREATE_PROTOTYPE_PRIMARY,
  '--primary-foreground': '#ffffff',
  '--ring': CREATE_PROTOTYPE_PRIMARY,
} as CSSProperties

function Heading({ text, level }: { text: string; level: 1 | 2 | 3 | 4 }) {
  const className = cn(
    'font-semibold tracking-tight text-primary',
    level === 1 && 'text-2xl',
    level === 2 && 'text-xl',
    level === 3 && 'text-lg',
    level === 4 && 'text-base',
  )
  switch (level) {
    case 1:
      return <h1 className={className}>{text}</h1>
    case 3:
      return <h3 className={className}>{text}</h3>
    case 4:
      return <h4 className={className}>{text}</h4>
    default:
      return <h2 className={className}>{text}</h2>
  }
}

function BlockView({ block }: { block: ProtoBlock }) {
  switch (block.type) {
    case 'heading':
      return <Heading text={block.text} level={block.level ?? 2} />
    case 'paragraph':
      return <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{block.text}</p>
    case 'card':
      return (
        <Card>
          <CardHeader className="space-y-1 py-4">
            {block.title ? <CardTitle className="text-base">{block.title}</CardTitle> : null}
            {block.description ? (
              <CardDescription className="text-sm">{block.description}</CardDescription>
            ) : null}
          </CardHeader>
        </Card>
      )
    case 'badge':
      return <Badge variant={block.variant ?? 'secondary'}>{block.text}</Badge>
    case 'button': {
      const v = block.variant ?? 'outline'
      return (
        <Button
          type="button"
          variant={v}
          disabled
          className={cn(
            'pointer-events-none w-fit',
            v === 'outline' && 'border-primary/40 text-primary',
            v === 'ghost' && 'text-primary',
            v === 'link' && 'text-primary',
          )}
        >
          {block.label}
        </Button>
      )
    }
    case 'separator':
      return <Separator />
    case 'alert':
      return (
        <Alert variant={block.variant ?? 'default'}>
          {block.title ? <AlertTitle>{block.title}</AlertTitle> : null}
          <AlertDescription className="whitespace-pre-wrap">{block.description}</AlertDescription>
        </Alert>
      )
    default:
      return null
  }
}

type Props = {
  page: ProtoPage | null
  emptyHint?: string
}

export function CreatePrototypePreview({ page, emptyHint }: Props) {
  if (!page || page.blocks.length === 0) {
    return (
      <div
        className="create-prototype-preview-scope"
        style={previewThemeStyle}
      >
        <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed border-primary/25 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          {emptyHint ?? 'Describe a screen in the chat. The preview will render here using shadcn-style components.'}
        </div>
      </div>
    )
  }

  return (
    <div className="create-prototype-preview-scope space-y-4 rounded-lg border bg-card p-6 shadow-sm" style={previewThemeStyle}>
      {page.blocks.map((block, i) => (
        <div key={i}>
          <BlockView block={block} />
        </div>
      ))}
    </div>
  )
}
