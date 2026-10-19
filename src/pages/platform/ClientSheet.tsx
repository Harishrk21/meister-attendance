import { useEffect, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { Copy, KeyRound, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, Label } from '@/components/ui/card'
import { Switch } from '@/components/ui/dropdown'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BrandMark } from '@/components/BrandMark'
import { PLANS, platformApi, type Invite, type TenantDetail, type TenantStatus } from '@/lib/platform'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">{title}</h3>
      {children}
    </section>
  )
}

function copy(text: string, what = 'Copied') {
  void navigator.clipboard.writeText(text).then(() => toast.success(what))
}

type Editable = Pick<
  TenantDetail,
  'name' | 'status' | 'plan' | 'trialEndsOn' | 'contactName' | 'contactEmail' | 'contactPhone' | 'notes' | 'logoUrl' | 'primaryColor'
> & { seatLimit: string }

function toEditable(t: TenantDetail): Editable {
  return {
    name: t.name,
    status: t.status,
    plan: t.plan,
    seatLimit: t.seatLimit == null ? '' : String(t.seatLimit),
    trialEndsOn: t.trialEndsOn,
    contactName: t.contactName,
    contactEmail: t.contactEmail,
    contactPhone: t.contactPhone,
    notes: t.notes,
    logoUrl: t.logoUrl,
    primaryColor: t.primaryColor,
  }
}

export function ClientSheet({
  tenantId,
  onClose,
  onChanged,
  onInvite,
}: {
  tenantId: string | null
  onClose: () => void
  onChanged: () => void
  onInvite: (invite: Invite, name: string, email: string, company: string) => void
}) {
  const [tenant, setTenant] = useState<TenantDetail | null>(null)
  const [form, setForm] = useState<Editable | null>(null)
  const [saving, setSaving] = useState(false)
  const [newAdmin, setNewAdmin] = useState({ name: '', email: '' })
  const [newSso, setNewSso] = useState({ issuer: '', origins: '' })
  const [secret, setSecret] = useState<{ issuer: string; value: string } | null>(null)

  useEffect(() => {
    if (!tenantId) return
    let live = true
    platformApi
      .tenant(tenantId)
      .then((t) => {
        if (!live) return
        setTenant(t)
        setForm(toEditable(t))
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not load client'))
    return () => {
      live = false
      setTenant(null)
      setForm(null)
    }
  }, [tenantId])

  function apply(t: TenantDetail) {
    setTenant(t)
    setForm(toEditable(t))
    onChanged()
  }

  async function run<T>(fn: () => Promise<T>, done?: (r: T) => void) {
    setSaving(true)
    try {
      const r = await fn()
      done?.(r)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const loginUrl = tenant ? `${window.location.origin}/login?workspace=${tenant.slug}` : ''

  return (
    <Sheet open={!!tenantId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="max-w-[560px] overflow-y-auto">
        {!tenant || !form ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
          </div>
        ) : (
          <div className="space-y-5 p-5 pt-6">
            <div className="flex items-start gap-3 pr-8">
              <BrandMark name={tenant.displayName} logoUrl={tenant.logoUrl || undefined} color={tenant.primaryColor || undefined} className="h-11" />
              <div className="min-w-0">
                <SheetTitle className="truncate font-display text-lg font-semibold text-ink">{tenant.name}</SheetTitle>
                <SheetDescription className="text-xs text-ink-muted">
                  {tenant.slug} · {tenant.activeEmployees}
                  {tenant.seatLimit ? ` / ${tenant.seatLimit}` : ''} active people · since {format(new Date(tenant.createdAt), 'd MMM yyyy')}
                </SheetDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-surface p-2">
              <code className="min-w-0 flex-1 truncate text-xs">{loginUrl}</code>
              <Button size="sm" variant="ghost" onClick={() => copy(loginUrl, 'Sign-in link copied')}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>

            <Section title="Subscription">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label>Account name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TenantStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended (blocks sign-in)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Plan</Label>
                  <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[...new Set([...PLANS, form.plan])].map((p) => (
                        <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Seat limit</Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Unlimited"
                    value={form.seatLimit}
                    onChange={(e) => setForm({ ...form, seatLimit: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Trial ends</Label>
                  <Input
                    type="date"
                    value={form.trialEndsOn ?? ''}
                    onChange={(e) => setForm({ ...form, trialEndsOn: e.target.value || null })}
                  />
                </div>
              </div>
            </Section>

            <Section title="Contact & notes">
              <div className="grid gap-3 sm:grid-cols-3">
                <Input placeholder="Name" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
                <Input placeholder="Email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
                <Input placeholder="Phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
              </div>
              <textarea
                className="min-h-20 w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm"
                placeholder="Internal notes (only Meister staff see this)"
                maxLength={1000}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Section>

            <Section title="Branding">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input placeholder="Logo URL (https://…)" value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />
                <div className="flex gap-2">
                  <input
                    type="color"
                    aria-label="Brand colour"
                    value={form.primaryColor || '#0f766e'}
                    onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent p-1"
                  />
                  <Input className="w-28" placeholder="#0f766e" value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value.trim() })} />
                </div>
              </div>
              <p className="text-[11px] text-ink-muted">The client’s admin can also change these in their own Settings.</p>
            </Section>

            <div className="flex justify-end">
              <Button
                disabled={saving}
                onClick={() =>
                  void run(
                    () =>
                      platformApi.updateTenant(tenant.id, {
                        ...form,
                        seatLimit: form.seatLimit.trim() ? Number(form.seatLimit) : null,
                      }),
                    (t) => {
                      apply(t)
                      toast.success('Client updated')
                    }
                  )
                }
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </div>

            <Section title="Client admins">
              <div className="space-y-2">
                {tenant.admins.map((a) => (
                  <div key={a.userId} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{a.name}</div>
                      <div className="truncate text-xs text-ink-muted">{a.email}</div>
                      <div className="mt-1">
                        {a.lastLoginAt ? (
                          <Badge variant="success">Active · {formatDistanceToNow(new Date(a.lastLoginAt), { addSuffix: true })}</Badge>
                        ) : a.inviteExpiresAt ? (
                          <Badge variant="warning">Invite sent · expires {format(new Date(a.inviteExpiresAt), 'd MMM')}</Badge>
                        ) : a.hasPassword ? (
                          <Badge variant="muted">Never signed in</Badge>
                        ) : (
                          <Badge variant="danger">No password yet</Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() =>
                        void run(
                          () => platformApi.reinviteAdmin(tenant.id, a.userId),
                          (r) => {
                            apply(r.tenant)
                            onInvite(r.invite, a.name, a.email, tenant.displayName)
                          }
                        )
                      }
                    >
                      {a.hasPassword ? 'Reset link' : 'New invite'}
                    </Button>
                  </div>
                ))}
              </div>
              <form
                className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                onSubmit={(e) => {
                  e.preventDefault()
                  void run(
                    () => platformApi.addAdmin(tenant.id, newAdmin),
                    (r) => {
                      apply(r.tenant)
                      onInvite(r.invite, newAdmin.name, newAdmin.email, tenant.displayName)
                      setNewAdmin({ name: '', email: '' })
                    }
                  )
                }}
              >
                <Input required placeholder="Name" value={newAdmin.name} onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })} />
                <Input required type="email" placeholder="Email" value={newAdmin.email} onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })} />
                <Button type="submit" variant="outline" disabled={saving}>
                  <Plus className="h-4 w-4" /> Add admin
                </Button>
              </form>
            </Section>

            <Section title="Single sign-on from their dashboard">
              <p className="text-xs text-ink-muted">
                Lets the client’s own ERP or portal open attendance without a second login. Their developer signs a
                short-lived ticket with the secret and sends users to <code>/sso?ticket=…</code>.
              </p>
              {tenant.sso.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <KeyRound className="h-4 w-4 shrink-0 text-ink-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm text-ink">{s.issuer}</div>
                    <div className="truncate text-xs text-ink-muted">
                      {s.autoProvision ? 'Creates missing users' : 'Existing users only'} · default role {s.defaultRole}
                      {s.allowedOrigins.length ? ` · ${s.allowedOrigins.join(', ')}` : ''}
                    </div>
                  </div>
                  <Switch
                    checked={s.isEnabled}
                    aria-label="Enabled"
                    onCheckedChange={(v) => void run(() => platformApi.toggleSso(tenant.id, s.id, v), apply)}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Rotate secret"
                    disabled={saving}
                    onClick={() =>
                      void run(
                        () => platformApi.rotateSso(tenant.id, s.id),
                        (r) => {
                          apply(r.tenant)
                          setSecret({ issuer: s.issuer, value: r.sharedSecret })
                        }
                      )
                    }
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Delete"
                    className="text-danger"
                    disabled={saving}
                    onClick={() => {
                      if (window.confirm(`Delete ${s.issuer}? Their dashboard will stop signing users in.`)) {
                        void run(() => platformApi.deleteSso(tenant.id, s.id), apply)
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <form
                className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                onSubmit={(e) => {
                  e.preventDefault()
                  const issuer = newSso.issuer.trim()
                  void run(
                    () =>
                      platformApi.addSso(tenant.id, {
                        issuer,
                        allowedOrigins: newSso.origins.split(',').map((o) => o.trim()).filter(Boolean),
                        defaultRole: 'employee',
                        autoProvision: true,
                      }),
                    (r) => {
                      apply(r.tenant)
                      setSecret({ issuer, value: r.sharedSecret })
                      setNewSso({ issuer: '', origins: '' })
                    }
                  )
                }}
              >
                <Input required placeholder={`Issuer, e.g. ${tenant.slug}-erp`} value={newSso.issuer} onChange={(e) => setNewSso({ ...newSso, issuer: e.target.value })} />
                <Input placeholder="Their site, e.g. https://erp.acme.com" value={newSso.origins} onChange={(e) => setNewSso({ ...newSso, origins: e.target.value })} />
                <Button type="submit" variant="outline" disabled={saving}>
                  <Plus className="h-4 w-4" /> Connect
                </Button>
              </form>
            </Section>
          </div>
        )}

        <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Signing secret for {secret?.issuer}</DialogTitle>
              <DialogDescription>
                Shown once. Send it to the client’s developer over a secure channel — anyone with it can sign users in.
              </DialogDescription>
            </DialogHeader>
            <Input readOnly value={secret?.value ?? ''} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <div className="rounded-lg bg-surface p-3 text-xs leading-relaxed text-ink-muted">
              Ticket (HS256 JWT, valid ≤ 5 min): <code>iss</code> = {secret?.issuer}, <code>aud</code> = attendance-platform,{' '}
              <code>sub</code> = their user ID, <code>email</code>, <code>name</code>, a unique <code>jti</code>.
            </div>
            <div className="flex justify-end">
              <Button onClick={() => secret && copy(secret.value, 'Secret copied')}>
                <Copy className="h-4 w-4" /> Copy secret
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  )
}
