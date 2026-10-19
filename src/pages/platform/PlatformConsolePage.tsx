import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { differenceInCalendarDays, formatDistanceToNow, parseISO } from 'date-fns'
import { Building2, LogOut, Plus, Search, Users, Timer, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, Card, CardContent, Skeleton } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BrandMark } from '@/components/BrandMark'
import { InviteLinkDialog, type InviteDialogValue } from '@/components/InviteLinkDialog'
import { ApiError } from '@/lib/api'
import { applyBrandColor, PRODUCT_NAME, PRODUCT_OWNER } from '@/lib/brand'
import {
  getPlatformToken,
  platformApi,
  setPlatformToken,
  type Overview,
  type PlatformAdmin,
  type TenantSummary,
} from '@/lib/platform'
import { OnboardClientDialog } from './OnboardClientDialog'
import { ClientSheet } from './ClientSheet'

function StatusBadge({ t }: { t: TenantSummary }) {
  if (t.status === 'suspended') return <Badge variant="danger">Suspended</Badge>
  if (t.status === 'active') return <Badge variant="success">Active</Badge>
  if (!t.trialEndsOn) return <Badge variant="warning">Trial</Badge>
  const left = differenceInCalendarDays(parseISO(t.trialEndsOn), new Date())
  return left < 0 ? (
    <Badge variant="danger">Trial ended</Badge>
  ) : (
    <Badge variant="warning">Trial · {left}d left</Badge>
  )
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface text-ink-muted">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="font-display text-xl font-bold text-ink">{value}</div>
          <div className="text-xs text-ink-muted">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export function PlatformConsolePage() {
  const navigate = useNavigate()
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [onboardOpen, setOnboardOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [invite, setInvite] = useState<InviteDialogValue | null>(null)

  const signOut = useCallback(() => {
    setPlatformToken(null)
    navigate('/platform/login', { replace: true })
  }, [navigate])

  const load = useCallback(async () => {
    try {
      const [o, t] = await Promise.all([platformApi.overview(), platformApi.tenants()])
      setOverview(o)
      setTenants(t)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) signOut()
      else toast.error(e instanceof Error ? e.message : 'Could not load clients')
    }
  }, [signOut])

  useEffect(() => {
    applyBrandColor(undefined)
    if (!getPlatformToken()) {
      navigate('/platform/login', { replace: true })
      return
    }
    platformApi.me().then(setAdmin).catch(signOut)
    void load()
  }, [navigate, load, signOut])

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (tenants ?? []).filter(
      (t) =>
        (status === 'all' || t.status === status) &&
        (!q || [t.name, t.displayName, t.slug, t.contactEmail].some((v) => v.toLowerCase().includes(q)))
    )
  }, [tenants, search, status])

  return (
    <div className="min-h-full bg-surface">
      <header className="sticky top-0 z-30 border-b border-border bg-surface-elevated/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy text-white">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <div className="font-display text-sm font-semibold leading-tight text-ink">{PRODUCT_OWNER}</div>
              <div className="text-[10px] text-ink-muted">{PRODUCT_NAME} · Client console</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-ink-muted sm:inline">{admin?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-navy dark:text-white">Clients</h1>
            <p className="text-sm text-ink-muted">Every company using {PRODUCT_NAME}</p>
          </div>
          <Button onClick={() => setOnboardOpen(true)}>
            <Plus className="h-4 w-4" /> Onboard client
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {overview ? (
            <>
              <Stat icon={Building2} label="Clients" value={overview.tenants.total} />
              <Stat
                icon={AlertTriangle}
                label="On trial · suspended"
                value={`${overview.tenants.trial} · ${overview.tenants.suspended}`}
              />
              <Stat icon={Users} label="Active people" value={overview.activeEmployees} />
              <Stat icon={Timer} label="Clock-ins, last 24 h" value={overview.clockInsLast24h} />
            </>
          ) : (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[74px]" />)
          )}
        </div>

        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <Input className="pl-9" placeholder="Search name, workspace, email…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs uppercase text-ink-muted">
                  <tr className="border-b border-border">
                    <th className="p-2">Company</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Plan</th>
                    <th className="p-2">Seats</th>
                    <th className="p-2">Setup</th>
                    <th className="p-2">Last active</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((t) => (
                    <tr
                      key={t.id}
                      className="cursor-pointer border-b border-border/60 transition-colors hover:bg-surface"
                      onClick={() => setSelected(t.id)}
                    >
                      <td className="p-2">
                        <div className="flex items-center gap-3">
                          <BrandMark name={t.displayName} logoUrl={t.logoUrl || undefined} color={t.primaryColor || undefined} />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-ink">{t.name}</div>
                            <div className="truncate text-[11px] text-ink-muted">{t.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-2"><StatusBadge t={t} /></td>
                      <td className="p-2 capitalize">{t.plan}</td>
                      <td className="p-2">
                        <span className={t.seatLimit && t.activeEmployees >= t.seatLimit ? 'font-semibold text-danger' : ''}>
                          {t.activeEmployees}
                          {t.seatLimit ? ` / ${t.seatLimit}` : ''}
                        </span>
                      </td>
                      <td className="p-2">
                        {t.setupCompleted ? <Badge variant="muted">Done</Badge> : <Badge variant="teal">In progress</Badge>}
                      </td>
                      <td className="p-2 text-ink-muted">
                        {t.lastActivityAt ? formatDistanceToNow(new Date(t.lastActivityAt), { addSuffix: true }) : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tenants && list.length === 0 && (
                <div className="py-12 text-center text-sm text-ink-muted">
                  {tenants.length === 0 ? 'No clients yet — onboard your first one.' : 'No clients match.'}
                </div>
              )}
              {!tenants && <Skeleton className="mt-2 h-40" />}
            </div>
          </CardContent>
        </Card>
      </main>

      <OnboardClientDialog
        open={onboardOpen}
        onOpenChange={setOnboardOpen}
        onCreated={(tenant, inv) => {
          setOnboardOpen(false)
          toast.success(`${tenant.name} is ready`)
          const a = tenant.admins[0]
          setInvite({ ...inv, name: a?.name ?? 'their admin', email: a?.email, company: tenant.displayName })
          void load()
        }}
      />
      <ClientSheet
        tenantId={selected}
        onClose={() => setSelected(null)}
        onChanged={() => void load()}
        onInvite={(inv, name, email, company) => setInvite({ ...inv, name, email, company })}
      />
      <InviteLinkDialog invite={invite} onClose={() => setInvite(null)} />
    </div>
  )
}
