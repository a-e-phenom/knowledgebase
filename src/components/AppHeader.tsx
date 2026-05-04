import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

type Crumb = { label: string; to?: string }

type AppHeaderProps = {
  crumbs?: Crumb[]
  actions?: ReactNode
}

export function AppHeader({ actions }: AppHeaderProps) {
  const location = useLocation()
  const tabs = [
    { label: 'Modules', to: '/', active: location.pathname === '/' || location.pathname.startsWith('/modules') },
    { label: 'Documents', to: '/documents', active: location.pathname.startsWith('/documents') },
    { label: 'Apps', to: '/apps', active: location.pathname.startsWith('/apps') },
    { label: 'Product', to: '/product', active: location.pathname.startsWith('/product') },
    { label: 'QA', to: '/qa', active: location.pathname.startsWith('/qa') },
  ]

  return (
    <header className="sticky top-0 z-50 w-full min-w-0 border-b bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/60">
      <div className="flex h-14 min-w-0 items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Link to="/" className="shrink-0 font-semibold tracking-tight text-foreground">
          DocHub
        </Link>

        <Separator orientation="vertical" className="mx-0 h-4 shrink-0" />
        <nav
          className="flex min-h-9 min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain rounded-lg bg-muted p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Main"
        >
          {tabs.map((tab) => (
            <Link
              key={tab.label}
              to={tab.to}
              className={cn(
                'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                tab.active && 'bg-background text-foreground shadow-sm',
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
