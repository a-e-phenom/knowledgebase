import type { LucideIcon } from 'lucide-react'
import {
  Bug,
  GitBranch,
  LayoutTemplate,
  MousePointerClick,
  PackageX,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { qaCategoryLabel, type QaCategory } from '@/lib/qaStorage'

const categoryIcons: Record<QaCategory, LucideIcon> = {
  bugs: Bug,
  UI: LayoutTemplate,
  Usability: MousePointerClick,
  Logic: GitBranch,
  'missing functionality': PackageX,
  Improvement: TrendingUp,
}

const categoryIconClass: Record<QaCategory, string> = {
  bugs: 'text-red-600 dark:text-red-400',
  UI: 'text-violet-600 dark:text-violet-400',
  Usability: 'text-sky-600 dark:text-sky-400',
  Logic: 'text-amber-600 dark:text-amber-400',
  'missing functionality': 'text-orange-600 dark:text-orange-400',
  Improvement: 'text-emerald-600 dark:text-emerald-400',
}

type IconSize = 'sm' | 'md'

const iconSizeClass: Record<IconSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
}

export function CategoryIcon({
  category,
  className,
  size = 'md',
}: {
  category: QaCategory
  className?: string
  size?: IconSize
}) {
  const Icon = categoryIcons[category]
  return (
    <Icon
      className={cn(iconSizeClass[size], categoryIconClass[category], 'shrink-0', className)}
      aria-hidden
    />
  )
}

export function CategoryRow({
  category,
  iconSize = 'md',
  className,
  labelClassName,
}: {
  category: QaCategory
  iconSize?: IconSize
  className?: string
  labelClassName?: string
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      <CategoryIcon category={category} size={iconSize} />
      <span className={cn('min-w-0 truncate', labelClassName)}>{qaCategoryLabel(category)}</span>
    </span>
  )
}
