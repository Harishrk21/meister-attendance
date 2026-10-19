import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Search } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, Badge, Label } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/dialog'
import * as employeeService from '@/lib/services/employees'
import { SUGGESTED_DEPARTMENTS, type Branch, type Department, type Employee, type Role } from '@/types'
import { initials } from '@/lib/utils'
import { isApiMode } from '@/lib/api'
import { useBranding } from '@/hooks/useBranding'
import { InviteLinkDialog } from '@/components/InviteLinkDialog'

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  role: 'employee' as Role,
  department: '' as Department,
  branch: '' as Branch,
  shiftId: '',
  joinDate: new Date().toISOString().slice(0, 10),
  employeeCode: '',
  status: 'Active' as const,
}

export function EmployeesPage() {
  const { session } = useAuth()
  const { data, bump } = useData()
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('All')
  const [status, setStatus] = useState('Active')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [deactivateId, setDeactivateId] = useState<string | null>(null)
  const [invite, setInvite] = useState<(employeeService.InviteLink & { name: string }) | null>(null)
  const brand = useBranding()

  const list = useMemo(() => {
    if (!data) return []
    let emps = data.employees
    if (department !== 'All') emps = emps.filter((e) => e.department === department)
    if (status !== 'All') emps = emps.filter((e) => e.status === status)
    if (search) {
      const q = search.toLowerCase()
      emps = emps.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q) ||
          e.employeeCode.toLowerCase().includes(q)
      )
    }
    return emps.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode))
  }, [data, department, status, search])

  if (!session) return null
  const canEdit = session.role === 'admin'
  const branches = data?.settings.branches ?? []
  const departments = [...new Set([...(data?.employees ?? []).map((e) => e.department).filter(Boolean), ...SUGGESTED_DEPARTMENTS])]
  const usedDepartments = [...new Set((data?.employees ?? []).map((e) => e.department).filter(Boolean))].sort()

  function openCreate() {
    setEditing(null)
    const nextNum = String((data?.employees.length ?? 0) + 1).padStart(4, '0')
    setForm({
      ...emptyForm,
      // In API mode the server assigns the next code from the company's prefix.
      employeeCode: isApiMode ? '' : `${brand.codePrefix}-${nextNum}`,
      branch: branches[0] ?? '',
      shiftId: data?.shifts[0]?.id ?? '',
    })
    setOpen(true)
  }

  async function sendInvite(emp: Employee) {
    try {
      const link = await employeeService.inviteEmployee(emp.id)
      setInvite({ ...link, name: emp.name })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create invite')
    }
  }

  function openEdit(emp: Employee) {
    setEditing(emp)
    setForm({
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      role: emp.role,
      department: emp.department,
      branch: emp.branch,
      shiftId: emp.shiftId,
      joinDate: emp.joinDate,
      employeeCode: emp.employeeCode,
      status: emp.status as 'Active',
    })
    setOpen(true)
  }

  async function save() {
    try {
      if (editing) {
        await employeeService.updateEmployee(editing.id, { ...form, avatarInitials: initials(form.name) })
        toast.success('Employee updated')
      } else {
        const created = await employeeService.createEmployee(form)
        toast.success('Employee created')
        if (isApiMode) await sendInvite(created)
      }
      setOpen(false)
      bump()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    }
  }

  return (
    <div className="animate-page space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy dark:text-white">Employees</h1>
          <p className="text-sm text-ink-muted">
            {brand.name} directory
            {data?.settings.seatLimit
              ? ` · ${data.employees.filter((e) => e.status === 'Active').length} of ${data.settings.seatLimit} seats used`
              : ''}
          </p>
        </div>
        {canEdit && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add employee
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <Input className="pl-9" placeholder="Search name, email, code…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All depts</SelectItem>
                {usedDepartments.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="text-xs uppercase text-ink-muted">
              <tr className="border-b border-border">
                <th className="p-2 text-left">Employee</th>
                <th className="p-2 text-left">Department</th>
                <th className="p-2 text-left">Role</th>
                <th className="p-2 text-left">Status</th>
                {canEdit && <th className="p-2 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="border-b border-border/60">
                  <td className="p-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
                        {e.avatarInitials}
                      </div>
                      <div>
                        <div className="font-medium">{e.name}</div>
                        <div className="text-[11px] text-ink-muted">{e.employeeCode} · {e.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-2">{e.department}</td>
                  <td className="p-2 capitalize">{e.role}</td>
                  <td className="p-2">
                    <Badge variant={e.status === 'Active' ? 'success' : 'muted'}>{e.status}</Badge>
                  </td>
                  {canEdit && (
                    <td className="p-2 text-right space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(e)}>Edit</Button>
                      {isApiMode && e.status === 'Active' && e.id !== session.employeeId && (
                        <Button variant="ghost" size="sm" onClick={() => void sendInvite(e)}>Invite</Button>
                      )}
                      {e.status === 'Active' && (
                        <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDeactivateId(e.id)}>
                          Deactivate
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && (
            <div className="py-10 text-center text-sm text-ink-muted">
              No employees match filters.
              {canEdit && (
                <div className="mt-3">
                  <Button onClick={openCreate}>Add employee</Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit employee' : 'Add employee'}</DialogTitle>
            <DialogDescription>
              {isApiMode
                ? editing
                  ? 'Changes apply on their next sign-in'
                  : 'You’ll get a link to send them so they can set their own password'
                : 'Stored in this browser tab until it is closed or reset'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['name', 'Name'],
                ['email', 'Email'],
                ['phone', 'Phone'],
                ['employeeCode', 'Employee code'],
                ['joinDate', 'Join date'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label>{label}</Label>
                <Input
                  type={key === 'joinDate' ? 'date' : key === 'email' ? 'email' : 'text'}
                  placeholder={key === 'employeeCode' && isApiMode ? `Auto (${brand.codePrefix}-0001…)` : undefined}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && void save()}
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Department</Label>
              <Input
                list="department-options"
                placeholder="e.g. Sales"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
              <datalist id="department-options">
                {departments.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
            {branches.length > 1 && (
              <div className="space-y-1">
                <Label>Branch</Label>
                <Select value={form.branch} onValueChange={(v) => setForm({ ...form, branch: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Shift</Label>
              <Select value={form.shiftId} onValueChange={(v) => setForm({ ...form, shiftId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(data?.shifts ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deactivateId} onOpenChange={(o) => !o && setDeactivateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate employee?</AlertDialogTitle>
            <AlertDialogDescription>
              Historical attendance is kept. They will no longer be able to sign in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger hover:bg-danger/90"
              onClick={async () => {
                if (deactivateId) {
                  await employeeService.deactivateEmployee(deactivateId)
                  bump()
                  toast.success('Employee deactivated')
                  setDeactivateId(null)
                }
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InviteLinkDialog invite={invite ? { ...invite, company: brand.name } : null} onClose={() => setInvite(null)} />
    </div>
  )
}
