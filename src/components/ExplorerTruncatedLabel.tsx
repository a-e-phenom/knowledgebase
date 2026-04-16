import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Explorer row label: truncates with ellipsis; when overflow is detected,
 * shows full text in a tooltip on hover. Native `title` is set when truncated as a fallback.
 */
export function ExplorerTruncatedLabel({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [isTruncated, setIsTruncated] = useState(false)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    setIsTruncated(el.scrollWidth > el.clientWidth + 1)
  }, [])

  useLayoutEffect(() => {
    measure()
    const raf = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(raf)
  }, [text, measure])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(measure)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, measure])

  return (
    <Tooltip delayDuration={200} open={isTruncated ? undefined : false}>
      <TooltipTrigger asChild>
        <span
          ref={ref}
          className={cn('min-w-0 truncate', className)}
          title={isTruncated ? text : undefined}
        >
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-xs break-words">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
