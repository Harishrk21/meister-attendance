import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { useTheme } from '@/context/ThemeContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Label } from '@/components/ui/card'
import { Switch } from '@/components/ui/dropdown'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/dialog'
import * as settingsService from '@/lib/services/settings'
import { resetDemoData } from '@/lib/services/auth'
import { isApiMode } from '@/lib/api'
import { downloadJson } from '@/lib/utils'
import { fileSlug } from '@/lib/brand'
import { BrandMark } from '@/components/BrandMark'
import { DEFAULT_ACTIVITIES, type CompanySettings } from '@/types'

function ActivitiesCard({ activities, onChange }: { activities: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('')

  function add() {
    const name = draft.trim()
    if (!name) return
    if (activities.some((a) => a.toLowerCase() === name.toLowerCase())) {
      toast.error('Activity already exists')
      return
    }
    onChange([...activities, name])
    setDraft('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activities</CardTitle>
        <CardDescription>What people pick when they clock in — shown in timesheets and Who&apos;s In</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {activities.map((a) => (
            <span key={a} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium">
              {a}
              <button
                type="button"
                className="-mr-1 rounded-full px-1 text-ink-muted hover:text-danger"
                onClick={() => onChange(activities.filter((x) => x !== a))}
                aria-label={`Remove ${a}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={draft}
            maxLength={60}
            placeholder="e.g. Calibration"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <Button variant="outline" onClick={add}>Add</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function BrandingCard({
  settings,
  onChange,
}: {
  settings: CompanySettings
  onChange: (next: CompanySettings) => void
}) {
  const color = settings.primaryColor || '#0f766e'
  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <CardDescription>Your logo and colour on the login page, sidebar, widget and buttons</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-border bg-surface p-2">
          <BrandMark name={settings.name || 'Company'} logoUrl={settings.logoUrl} color={color} className="h-full max-h-14" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>Logo URL</Label>
            <Input
              placeholder="https://yourcompany.com/logo.png"
              value={settings.logoUrl ?? ''}
              onChange={(e) => onChange({ ...settings, logoUrl: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Brand colour</Label>
            <div className="flex gap-2">
              <input
                type="color"
                aria-label="Pick brand colour"
                value={color}
                onChange={(e) => onChange({ ...settings, primaryColor: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent p-1"
              />
              <Input
                value={settings.primaryColor ?? ''}
                placeholder="#0f766e"
                maxLength={7}
                onChange={(e) => onChange({ ...settings, primaryColor: e.target.value.trim() })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Employee code prefix</Label>
            <Input
              placeholder="EMP"
              maxLength={16}
              value={settings.employeeCodePrefix ?? ''}
              onChange={(e) => onChange({ ...settings, employeeCodePrefix: e.target.value.toUpperCase() })}
            />
            <p className="text-[11px] text-ink-muted">New people get {settings.employeeCodePrefix || 'EMP'}-0001, -0002…</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EmbedCard() {
  const origin = window.location.origin
  const snippets = {
    'Full module': `<div id="attendance" style="height:100vh"></div>
<script src="${origin}/embed.js"></script>
<script>
  MeisterAttendance.mount('#attendance', {
    src: SSO_URL_FROM_YOUR_BACKEND, // ${origin}/sso?ticket=...
    view: 'app',
  })
</script>`,
    'Clock-in widget': `<div id="clock-widget"></div>
<script src="${origin}/embed.js"></script>
<script>
  MeisterAttendance.mount('#clock-widget', {
    src: SSO_URL_FROM_YOUR_BACKEND,
    view: 'clock',
    onEvent: (e) => console.log(e.type, e), // clock-in, clock-out, break-start, break-end
  })
</script>`,
  }
  const [tab, setTab] = useState<keyof typeof snippets>('Full module')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Embed in another dashboard</CardTitle>
        <CardDescription>
          Paste into any ERP or portal. Users arrive already signed in via a one-time SSO ticket from your backend.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-1 rounded-lg bg-surface p-1">
          {(Object.keys(snippets) as (keyof typeof snippets)[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold ${tab === k ? 'bg-surface-elevated text-teal shadow-sm' : 'text-ink-muted'}`}
            >
              {k}
            </button>
          ))}
        </div>
        <pre className="overflow-x-auto rounded-lg bg-navy p-4 text-xs leading-relaxed text-teal-100">{snippets[tab]}</pre>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(snippets[tab])
              toast.success('Snippet copied')
            }}
          >
            Copy snippet
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={tab === 'Clock-in widget' ? '/widget/clock?embed=1' : '/?embed=1'} target="_blank" rel="noreferrer">
              Preview
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function SettingsPage() {
  const { session, refresh } = useAuth()
  const { bump } = useData()
  const { mode, setMode } = useTheme()
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void settingsService.getSettings().then(setSettings)
  }, [])

  if (!session || !settings) return null

  async function save() {
    if (!settings) return
    try {
      setSettings(await settingsService.updateSettings(settings))
      bump()
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save settings')
    }
  }

  return (
    <div className="animate-page mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy dark:text-white">Settings</h1>
        <p className="text-sm text-ink-muted">Company profile, branding and attendance rules</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company profile</CardTitle>
          <CardDescription>Shown on reports and printed sheets</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['name', 'Company name'],
              ['tagline', 'Tagline'],
              ['address', 'Address'],
              ['phone', 'Phone'],
              ['email', 'Email'],
              ['website', 'Website'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className={key === 'address' ? 'sm:col-span-2 space-y-1' : 'space-y-1'}>
              <Label>{label}</Label>
              <Input
                value={settings[key]}
                onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && void save()}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <BrandingCard settings={settings} onChange={setSettings} />

      <Card>
        <CardHeader>
          <CardTitle>Attendance rules</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Grace period (minutes)</Label>
            <Input
              type="number"
              value={settings.gracePeriodMinutes}
              onChange={(e) => setSettings({ ...settings, gracePeriodMinutes: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label>Half-day threshold (hours)</Label>
            <Input
              type="number"
              step="0.5"
              value={settings.halfDayThresholdHours}
              onChange={(e) => setSettings({ ...settings, halfDayThresholdHours: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label>Overtime after (hours)</Label>
            <Input
              type="number"
              step="0.5"
              value={settings.overtimeAfterHours}
              onChange={(e) => setSettings({ ...settings, overtimeAfterHours: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 sm:col-span-2">
            <div>
              <Label>Require note for early leave</Label>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                If an employee clocks out before their shift end time, they must enter a reason.
              </p>
            </div>
            <Switch
              checked={settings.requireNoteForEarlyLeave}
              onCheckedChange={(v) => setSettings({ ...settings, requireNoteForEarlyLeave: v })}
            />
          </div>
          <div className="space-y-1">
            <Label>Short break allowance (minutes)</Label>
            <Input
              type="number"
              min={5}
              max={180}
              value={settings.maxBreakMinutes ?? 20}
              onChange={(e) => setSettings({ ...settings, maxBreakMinutes: Number(e.target.value) })}
            />
            <p className="text-[11px] text-ink-muted">Shown on the time clock (e.g. 20).</p>
          </div>
          <div className="space-y-1">
            <Label>Lunch allowance (minutes)</Label>
            <Input
              type="number"
              min={10}
              max={180}
              value={settings.maxLunchMinutes ?? 30}
              onChange={(e) => setSettings({ ...settings, maxLunchMinutes: Number(e.target.value) })}
            />
            <p className="text-[11px] text-ink-muted">One lunch per day (e.g. 30).</p>
          </div>
          <p className="sm:col-span-2 text-xs text-ink-muted">
            Shift start/end times are managed under <strong>Shifts &amp; holidays</strong>. Early leave
            is measured against each employee&apos;s assigned shift.
          </p>
        </CardContent>
      </Card>

      <ActivitiesCard
        activities={settings.activities?.length ? settings.activities : DEFAULT_ACTIVITIES}
        onChange={(activities) => setSettings({ ...settings, activities })}
      />

      <EmbedCard />

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <div className="font-medium">Dark mode</div>
            <div className="text-xs text-ink-muted">Stored in sessionStorage</div>
          </div>
          <Switch checked={mode === 'dark'} onCheckedChange={(v) => setMode(v ? 'dark' : 'light')} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => void save()}>Save settings</Button>
      </div>

      {!isApiMode && <Card>
        <CardHeader>
          <CardTitle>Demo data & backup</CardTitle>
          <CardDescription>Session-only storage · easy migration later</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              const data = await settingsService.backupJson()
              downloadJson(`${fileSlug(settings.name)}-attendance-backup-${new Date().toISOString().slice(0, 10)}.json`, data)
              toast.success('JSON backup downloaded')
            }}
          >
            Export all JSON backup
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            Import JSON backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                const text = await file.text()
                await settingsService.restoreJson(JSON.parse(text))
                bump()
                await refresh()
                toast.success('Backup imported')
              } catch {
                toast.error('Invalid backup file')
              }
              e.target.value = ''
            }}
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="danger">Reset Demo Data</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset all demo data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This re-seeds employees, attendance, leaves and holidays in sessionStorage. Your login session is preserved if possible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    await resetDemoData()
                    bump()
                    await refresh()
                    const s = await settingsService.getSettings()
                    setSettings(s)
                    toast.success('Demo data reset')
                  }}
                >
                  Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>}
    </div>
  )
}
