import { useEffect, type ReactNode } from 'react'
import { applyBrandColor, PRODUCT_NAME, PRODUCT_OWNER } from '@/lib/brand'
import { cn } from '@/lib/utils'

/** Auth routes always render in light mode so forms stay readable on the dark hero. */
export function AuthShell({
  children,
  aside,
  accent,
  footer,
  className,
}: {
  children: ReactNode
  aside?: ReactNode
  accent?: string
  footer?: ReactNode
  className?: string
}) {
  useEffect(() => {
    if (accent) applyBrandColor(accent)
    return () => applyBrandColor(undefined)
  }, [accent])

  return (
    <div
      className={cn('auth-page relative flex min-h-full flex-col overflow-hidden', className)}
      style={{ ['--auth-accent' as string]: accent || '#0f766e' }}
    >
      <div className="auth-page-bg pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 lg:flex-row lg:items-center lg:gap-14 lg:py-12">
        {aside && (
          <aside className="mb-8 lg:mb-0 lg:w-[min(440px,42%)] lg:shrink-0 lg:py-4">{aside}</aside>
        )}
        <div className={cn('flex flex-1 flex-col justify-center', !aside && 'mx-auto w-full max-w-[420px]')}>
          {children}
        </div>
      </div>
      {footer ?? (
        <p className="relative pb-6 text-center text-[11px] text-white/45">
          {PRODUCT_NAME} · {PRODUCT_OWNER}
        </p>
      )}
    </div>
  )
}

export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('auth-card animate-page rounded-2xl p-6 sm:p-8', className)} style={{ animationDelay: '60ms' }}>
      {children}
    </div>
  )
}

export function AuthHero({
  name,
  logoUrl,
  color,
  subtitle,
  description,
  poweredBy = true,
}: {
  name: string
  logoUrl?: string
  color?: string
  subtitle: string
  description?: ReactNode
  poweredBy?: boolean
}) {
  return (
    <div className="animate-page text-white">
      <div className="auth-logo-frame mb-6 inline-flex max-w-full items-center justify-center rounded-2xl bg-white px-5 py-4 shadow-lg shadow-black/20">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="max-h-14 w-auto max-w-[220px] object-contain" />
        ) : (
          <div
            className="flex h-14 w-14 items-center justify-center rounded-xl font-display text-lg font-bold text-white"
            style={{ backgroundColor: color || 'var(--auth-accent, #0f766e)' }}
            aria-hidden
          >
            {name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase())
              .join('')}
          </div>
        )}
      </div>
      <h1 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{name}</h1>
      <p className="mt-2 text-lg font-medium text-white/85">{subtitle}</p>
      {description && <div className="mt-4 max-w-md text-sm leading-relaxed text-white/65">{description}</div>}
      {poweredBy && <p className="mt-8 text-xs text-white/40">Powered by {PRODUCT_NAME}</p>}
    </div>
  )
}
