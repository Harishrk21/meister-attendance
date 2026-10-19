import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PLANS, platformApi, suggestSlug, type Invite, type TenantDetail } from '@/lib/platform'

const empty = {
  name: '',
  slug: '',
  status: 'trial' as 'trial' | 'active',
  plan: 'starter',
  seatLimit: '25',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
  branchName: 'Head Office',
  employeeCodePrefix: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  adminName: '',
  adminEmail: '',
}

export function OnboardClientDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (tenant: TenantDetail, invite: Invite) => void
}) {
  const [form, setForm] = useState(empty)
  const [slugTouched, setSlugTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<typeof empty>) => setForm((f) => ({ ...f, ...patch }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const { tenant, invite } = await platformApi.createTenant({
        name: form.name.trim(),
        slug: form.slug.trim(),
        status: form.status,
        plan: form.plan,
        seatLimit: form.seatLimit.trim() ? Number(form.seatLimit) : null,
        timezone: form.timezone.trim(),
        branchName: form.branchName.trim() || 'Head Office',
        employeeCodePrefix: form.employeeCodePrefix.trim() || undefined,
        contactName: form.contactName.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        admin: {
          name: form.adminName.trim() || form.contactName.trim(),
          email: form.adminEmail.trim() || form.contactEmail.trim(),
        },
      })
      setForm(empty)
      setSlugTouched(false)
      onCreated(tenant, invite)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create client')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Onboard a new client</DialogTitle>
          <DialogDescription>
            Creates their workspace with a default shift, leave types and a branch, plus an admin account. You’ll get an
            invite link to send their admin.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted sm:col-span-2">Company</h3>
            <div className="space-y-1 sm:col-span-2">
              <Label>Company name</Label>
              <Input
                required
                placeholder="Acme Industries Pvt Ltd"
                value={form.name}
                onChange={(e) => set({ name: e.target.value, ...(slugTouched ? {} : { slug: suggestSlug(e.target.value) }) })}
              />
            </div>
            <div className="space-y-1">
              <Label>Workspace ID</Label>
              <Input
                required
                pattern="[a-z0-9](?:[a-z0-9\-]{0,38}[a-z0-9])?"
                title="Lowercase letters, numbers and dashes"
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true)
                  set({ slug: e.target.value.toLowerCase() })
                }}
              />
              <p className="text-[11px] text-ink-muted">Their sign-in link: /login?workspace={form.slug || '…'}</p>
            </div>
            <div className="space-y-1">
              <Label>Timezone</Label>
              <Input required value={form.timezone} onChange={(e) => set({ timezone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>First branch</Label>
              <Input value={form.branchName} onChange={(e) => set({ branchName: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Employee code prefix</Label>
              <Input
                placeholder="EMP"
                maxLength={16}
                value={form.employeeCodePrefix}
                onChange={(e) => set({ employeeCodePrefix: e.target.value.toUpperCase() })}
              />
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted sm:col-span-3">Subscription</h3>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set({ status: v as 'trial' | 'active' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial (14 days)</SelectItem>
                  <SelectItem value="active">Active (paid)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Plan</Label>
              <Select value={form.plan} onValueChange={(v) => set({ plan: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
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
                onChange={(e) => set({ seatLimit: e.target.value })}
              />
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted sm:col-span-2">Their admin</h3>
            <div className="space-y-1">
              <Label>Admin name</Label>
              <Input required value={form.adminName} onChange={(e) => set({ adminName: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Admin email</Label>
              <Input required type="email" value={form.adminEmail} onChange={(e) => set({ adminEmail: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Billing contact (optional)</Label>
              <Input value={form.contactName} placeholder="Name" onChange={(e) => set({ contactName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={form.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input value={form.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} />
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create workspace
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
