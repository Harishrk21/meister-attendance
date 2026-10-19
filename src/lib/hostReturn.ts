const KEY = 'attendance_host_return'

/** True when the URL looks like a safe http(s) absolute link (no javascript:). */
export function isSafeHostReturnUrl(raw: string | null | undefined): raw is string {
  if (!raw?.trim()) return false
  try {
    const u = new URL(raw.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/** Persist Meister (or other host) return URL for this browser tab after SSO. */
export function setHostReturnUrl(url: string | null | undefined): void {
  if (!isSafeHostReturnUrl(url)) {
    sessionStorage.removeItem(KEY)
    return
  }
  const u = new URL(url.trim())
  sessionStorage.setItem(KEY, `${u.origin}${u.pathname}${u.search}`)
}

export function getHostReturnUrl(): string | null {
  const raw = sessionStorage.getItem(KEY)
  return isSafeHostReturnUrl(raw) ? raw : null
}

export function clearHostReturnUrl(): void {
  sessionStorage.removeItem(KEY)
}

/** Navigate back to the host dashboard page the user left. */
export function goHostReturn(): void {
  const url = getHostReturnUrl()
  if (!url) return
  window.location.assign(url)
}
