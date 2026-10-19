const EMBED_KEY = 'attendance_embed'
const MESSAGE_SOURCE = 'meister-attendance'

function initEmbed(): { embedded: boolean; hostOrigin: string | null } {
  if (typeof window === 'undefined') return { embedded: false, hostOrigin: null }
  const params = new URLSearchParams(window.location.search)
  const framed = window.self !== window.top

  // Only the explicit ?embed=1 flag is persisted (it must survive in-app navigation);
  // framing is detected live because same-origin iframes share the tab's sessionStorage.
  if (params.get('embed') === '1' && !framed) sessionStorage.setItem(EMBED_KEY, '1')

  let hostOrigin: string | null = null
  if (framed && document.referrer) {
    try {
      hostOrigin = new URL(document.referrer).origin
    } catch {
      /* referrer withheld by the host's Referrer-Policy */
    }
  }
  return { embedded: framed || sessionStorage.getItem(EMBED_KEY) === '1', hostOrigin }
}

const state = initEmbed()

/** True when running inside a host dashboard (iframe) or opened with ?embed=1. */
export const isEmbedded = state.embedded

export type EmbedEvent =
  | 'ready'
  | 'resize'
  | 'clock-in'
  | 'clock-out'
  | 'break-start'
  | 'break-end'
  | 'navigate'

/**
 * Notifies the host page. Only posts to the origin that embedded us, so attendance
 * events never leak to an unknown parent.
 */
export function postToHost(type: EmbedEvent, payload: Record<string, unknown> = {}): void {
  if (window.parent === window || !state.hostOrigin) return
  window.parent.postMessage({ source: MESSAGE_SOURCE, type, ...payload }, state.hostOrigin)
}

/** Keeps the host iframe sized to our content (used by compact widgets). */
export function autoResize(el: HTMLElement): () => void {
  if (window.parent === window) return () => {}
  const observer = new ResizeObserver(() => postToHost('resize', { height: Math.ceil(el.scrollHeight) }))
  observer.observe(el)
  return () => observer.disconnect()
}
