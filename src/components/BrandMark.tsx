import { useState } from 'react'
import { initialsOf } from '@/lib/brand'
import { cn } from '@/lib/utils'

/** Company logo, or a coloured initials tile when there is no logo (or it fails to load). */
export function BrandMark({
  name,
  logoUrl,
  color,
  className,
}: {
  name: string
  logoUrl?: string
  color?: string
  className?: string
}) {
  const [failedUrl, setFailedUrl] = useState<string>()

  if (logoUrl && failedUrl !== logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={cn('h-8 w-auto max-w-[8rem] shrink-0 object-contain', className)}
        onError={() => setFailedUrl(logoUrl)}
      />
    )
  }
  return (
    <div
      aria-label={name}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal font-display text-xs font-bold text-white',
        className
      )}
      style={color ? { backgroundColor: color } : undefined}
    >
      {initialsOf(name)}
    </div>
  )
}
