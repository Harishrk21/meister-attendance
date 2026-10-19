import type { GeoLocation } from '@/types'

export class GeoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeoError'
  }
}

export async function captureLocation(opts?: { required?: boolean }): Promise<GeoLocation | undefined> {
  const required = !!opts?.required
  if (!navigator.geolocation) {
    if (required) throw new GeoError('This device does not support GPS. Use a phone or enable location services.')
    return undefined
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          capturedAt: new Date().toISOString(),
        }),
      (err) => {
        if (!required) {
          resolve(undefined)
          return
        }
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Allow GPS to mark attendance at the office.'
            : err.code === err.TIMEOUT
              ? 'Could not get your location in time. Try again outdoors or near a window.'
              : 'Could not read your GPS location. Try again.'
        reject(new GeoError(msg))
      },
      { enableHighAccuracy: required, timeout: required ? 15000 : 5000, maximumAge: required ? 0 : 60_000 }
    )
  })
}

export function mapsUrl(loc: { lat: number; lng: number }): string {
  return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`
}
