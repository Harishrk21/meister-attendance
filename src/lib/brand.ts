/** The product itself — shown when no client company is known yet (e.g. a bare /login). */
export const PRODUCT_NAME = 'Meister Attendance'
export const PRODUCT_OWNER = 'Meister Solutions'

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || 'A'
  )
}

/** Safe file-name stem from a company name: "HMS Enterprises" → "hms-enterprises". */
export function fileSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'attendance'
}

const HEX = /^#[0-9a-f]{6}$/i

/** Applies a client's brand colour to the whole app (buttons, links, highlights). */
export function applyBrandColor(color: string | undefined): void {
  const root = document.documentElement.style
  if (!color || !HEX.test(color)) {
    root.removeProperty('--color-teal')
    root.removeProperty('--color-teal-600')
    root.removeProperty('--color-teal-100')
    return
  }
  root.setProperty('--color-teal', color)
  root.setProperty('--color-teal-600', `color-mix(in srgb, ${color} 82%, white)`)
  root.setProperty('--color-teal-100', `color-mix(in srgb, ${color} 18%, white)`)
}
