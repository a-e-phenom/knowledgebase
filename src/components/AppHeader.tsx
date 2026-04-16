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
  ]

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/60">
      <div className="flex h-14 items-center gap-4 px-6">
        <Link to="/" className="font-semibold tracking-tight text-foreground">
          DocHub
        </Link>

        <Separator orientation="vertical" className="mx-1 h-4" />
        <nav className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {tabs.map((tab) => (
            <Link
              key={tab.label}
              to={tab.to}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                tab.active && 'bg-background text-foreground shadow-sm',
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        {actions}
      </div>
    </header>
  )
}
