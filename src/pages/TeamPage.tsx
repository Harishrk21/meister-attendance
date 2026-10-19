import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, Badge, Label } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { formatMinutes } from '@/lib/utils'
import * as attendanceService from '@/lib/services/attendance'
import type { Employee } from '@/types'
import { useBranding } from '@/hooks/useBranding'

export function TeamPage() {
  const { session } = useAuth()
  const { data, bump } = useData()
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [selected, setSelected] = useState<Employee | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const brand = useBranding()

  const rows = useMemo(() => {
    if (!data || !session) return []
    const emps = data.employees.filter((e) => e.status === 'Active')
    return emps.map((emp) => {
      const att = data.attendance.find((a) => a.employeeId === emp.id && a.date === date)
      return { emp, att }
    })
  }, [data, session, date])

  if (!session) return null

  async function bulk(status: 'Holiday' | 'Absent') {
    if (checked.size === 0) {
      toast.error('Select employees first')
      return
    }
    await attendanceService.bulkMarkStatus({
      date,
      employeeIds: [...checked],
      status,
    })
    setChecked(new Set())
    bump()
    toast.success(`Marked ${status}`)
  }

  const history = selected
    ? (data?.attendance.filter((a) => a.employeeId === selected.id).slice(0, 14) ?? [])
    : []

  return (
    <div className="animate-page space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy dark:text-white">Team attendance</h1>
          <p className="text-sm text-ink-muted">Daily roster · {brand.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {session.role === 'admin' && (
            <>
              <Button variant="outline" size="sm" onClick={() => bulk('Holiday')}>
                Mark Holiday
              </Button>
              <Button variant="outline" size="sm" onClick={() => bulk('Absent')}>
                Mark Absent
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <CardTitle>Roster</CardTitle>
          <div className="flex flex-wrap gap-2">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 bg-surface-elevated text-xs uppercase text-ink-muted">
              <tr className="border-b border-border">
                {session.role === 'admin' && <th className="p-2 w-8" />}
                <th className="p-2 font-semibold">Name</th>
                <th className="p-2 font-semibold">Role</th>
                <th className="p-2 font-semibold">Dept</th>
                <th className="p-2 font-semibold">In</th>
                <th className="p-2 font-semibold">Out</th>
                <th className="p-2 font-semibold">Hours</th>
                <th className="p-2 font-semibold">Status</th>
                <th className="p-2 font-semibold">Mode</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ emp, att }) => (
                <tr key={emp.id} className="border-b border-border/70 hover:bg-surface/80">
                  {session.role === 'admin' && (
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={checked.has(emp.id)}
                        onChange={(e) => {
                          const next = new Set(checked)
                          if (e.target.checked) next.add(emp.id)
                          else next.delete(emp.id)
                          setChecked(next)
                        }}
                        aria-label={`Select ${emp.name}`}
                      />
                    </td>
                  )}
                  <td className="p-2">
                    <button type="button" className="font-medium text-teal hover:underline" onClick={() => setSelected(emp)}>
                      {emp.name}
                    </button>
                    <div className="text-[11px] text-ink-muted">{emp.employeeCode}</div>
                  </td>
                  <td className="p-2 capitalize">{emp.role}</td>
                  <td className="p-2">{emp.department}</td>
                  <td className="p-2 tabular-nums">{att?.clockIn ? format(parseISO(att.clockIn), 'HH:mm') : '—'}</td>
                  <td className="p-2 tabular-nums">{att?.clockOut ? format(parseISO(att.clockOut), 'HH:mm') : '—'}</td>
                  <td className="p-2 tabular-nums">{att ? formatMinutes(att.totalWorkMinutes) : '—'}</td>
                  <td className="p-2">
                    <Badge variant={att?.status === 'Absent' ? 'danger' : att?.status === 'Late' ? 'warning' : 'teal'}>
                      {att?.status ?? '—'}
                    </Badge>
                  </td>
                  <td className="p-2">{att?.workMode ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="py-8 text-center text-sm text-ink-muted">No employees found.</p>}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>
              {selected?.employeeCode} · {selected?.department} · {selected?.branch}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {history.map((a) => (
              <div key={a.id} className="flex justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span>{format(parseISO(a.date), 'dd MMM')}</span>
                <Badge variant="muted">{a.status}</Badge>
                <span className="tabular-nums text-ink-muted">{formatMinutes(a.totalWorkMinutes)}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
