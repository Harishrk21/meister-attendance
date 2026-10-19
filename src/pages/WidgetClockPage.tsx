import { useEffect, useRef } from 'react'
import { ExternalLink } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { TimeTrackerPanel } from '@/components/tracker/TimeTrackerPanel'
import { autoResize, postToHost } from '@/lib/embed'
import { useBranding } from '@/hooks/useBranding'

/** Minimal clock-in card meant to be iframed into any host dashboard. */
export function WidgetClockPage() {
  const { session } = useAuth()
  const ref = useRef<HTMLDivElement>(null)
  const brand = useBranding()

  useEffect(() => {
    postToHost('ready', { view: 'clock' })
    return ref.current ? autoResize(ref.current) : undefined
  }, [])

  if (!session) return null

  return (
    <div ref={ref} className="bg-transparent p-2">
      <div className="mx-auto max-w-sm rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal text-xs font-bold text-white">
              {session.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">{session.name}</div>
              <div className="truncate text-[11px] text-ink-muted">{brand.name}</div>
            </div>
          </div>
          <a
            href="/?embed=1"
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-teal hover:underline"
          >
            Open <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <TimeTrackerPanel compact />
      </div>
    </div>
  )
}
