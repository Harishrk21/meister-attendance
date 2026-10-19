import type { GeoLocation } from '@/types'

export async function captureLocation(): Promise<GeoLocation | undefined> {
  if (!navigator.geolocation) return undefined
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, capturedAt: new Date().toISOString() }),
      () => resolve(undefined),
      { enableHighAccuracy: false, timeout: 5000 }
    )
  })
}

export function mapsUrl(loc: { lat: number; lng: number }): string {
  return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`
}
