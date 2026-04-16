import { Bot, FileText, Sparkles, BookOpen, Zap, MessageSquare, Search } from 'lucide-react'
import type { ModuleIcon } from '@/lib/moduleSettings'

type Props = {
  icon: ModuleIcon
  className?: string
}

export function ModuleIconComponent({ icon, className }: Props) {
  switch (icon) {
    case 'bot': return <Bot className={className} />
    case 'file-text': return <FileText className={className} />
    case 'sparkles': return <Sparkles className={className} />
    case 'book-open': return <BookOpen className={className} />
    case 'zap': return <Zap className={className} />
    case 'message-square': return <MessageSquare className={className} />
    case 'search': return <Search className={className} />
    default: return <Bot className={className} />
  }
}
