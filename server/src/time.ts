const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(timeZone, f)
  }
  return f
}

function zonedParts(date: Date, timeZone: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of formatterFor(timeZone).formatToParts(date)) out[p.type] = p.value
  return out
}

/** Calendar date (yyyy-MM-dd) of an instant as seen in the tenant's timezone. */
export function localDate(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone)
  return `${p.year}-${p.month}-${p.day}`
}

/** Minutes since local midnight of an instant in the tenant's timezone. */
export function localMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  return Number(p.hour) * 60 + Number(p.minute)
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function minutesBetween(start: Date, end: Date): number {
  return Math.trunc((end.getTime() - start.getTime()) / 60000)
}

function utcDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`)
}

export function addDays(dateStr: string, days: number): string {
  const d = utcDate(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday for a yyyy-MM-dd date. */
export function weekday(dateStr: string): number {
  return utcDate(dateStr).getUTCDay()
}

export function calendarDaysInclusive(from: string, to: string): number {
  return Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / 86_400_000) + 1
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}
