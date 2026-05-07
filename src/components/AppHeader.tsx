import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'

type Crumb = { label: string; to?: string }

type AppHeaderProps = {
  crumbs?: Crumb[]
  actions?: ReactNode
}

export function AppHeader({ crumbs, actions }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full min-w-0 border-b bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/60">
      <div className="flex h-14 min-w-0 items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Link to="/" className="shrink-0 font-semibold tracking-tight text-foreground">
          DocHub
        </Link>

        {crumbs && crumbs.length > 0 ? (
          <>
            <Separator orientation="vertical" className="mx-0 h-4 shrink-0" />
            <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted-foreground" aria-label="Breadcrumb">
              {crumbs.map((crumb, idx) => (
                <span key={`${crumb.label}-${idx}`} className="truncate">
                  {idx > 0 ? <span className="px-1.5 text-muted-foreground/70">/</span> : null}
                  {crumb.to ? (
                    <Link to={crumb.to} className="hover:text-foreground">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-foreground">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          </>
        ) : (
          <div className="flex-1" />
        )}

        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
