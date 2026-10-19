import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, Badge, Label } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import * as leaveService from '@/lib/services/leaves'
import type { LeaveBalance, LeaveRequest, LeaveType } from '@/types'

export function LeavesPage() {
  const { session } = useAuth()
  const { data, bump } = useData()
  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('All')
  const [form, setForm] = useState({
    type: 'Casual' as LeaveType,
    from: format(new Date(), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
    halfDay: false,
    halfDayPeriod: 'AM' as 'AM' | 'PM',
    reason: '',
    attachmentNote: '',
  })
  const [reviewComment, setReviewComment] = useState('')

  useEffect(() => {
    if (!session) return
    void leaveService.getLeaveBalance(session.employeeId).then((b) => setBalance(b ?? null))
  }, [session, data])

  const requests = useMemo(() => {
    if (!data || !session) return []
    let list = data.leaveRequests
    if (session.role !== 'admin') list = list.filter((l) => l.employeeId === session.employeeId)
    if (filter !== 'All') list = list.filter((l) => l.status === filter)
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [data, session, filter])

  if (!session || !data) return null

  async function submit() {
    try {
      await leaveService.applyLeave({ employeeId: session!.employeeId, ...form })
      toast.success('Leave submitted')
      setOpen(false)
      bump()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  async function review(lr: LeaveRequest, status: 'Approved' | 'Rejected') {
    try {
      await leaveService.reviewLeave({
        leaveId: lr.id,
        approverId: session!.userId,
        status,
        comment: reviewComment || undefined,
      })
      toast.success(`Leave ${status.toLowerCase()}`)
      setReviewComment('')
      bump()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  const empName = (id: string) => data.employees.find((e) => e.id === id)?.name ?? '—'
  const canApprove = session.role === 'admin'

  return (
    <div className="animate-page space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy dark:text-white">Leave management</h1>
          <p className="text-sm text-ink-muted">Apply, approve and track leave balances</p>
        </div>
        <Button onClick={() => setOpen(true)}>Apply leave</Button>
      </div>

      {balance && (
        <div className="grid gap-3 sm:grid-cols-5">
          {(['Casual', 'Sick', 'Earned', 'Comp-Off', 'Unpaid'] as LeaveType[]).map((t) => (
            <Card key={t}>
              <CardContent className="p-4">
                <div className="text-xs text-ink-muted">{t}</div>
                <div className="font-display text-2xl font-bold tabular-nums">{balance[t]}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Leave ledger</CardTitle>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-3">
          {requests.length === 0 && <p className="py-8 text-center text-sm text-ink-muted">No leave requests.</p>}
          {requests.map((lr) => (
            <div key={lr.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">
                    {session.role === 'admin' && <span>{empName(lr.employeeId)} · </span>}
                    {lr.type} · {lr.days} day{lr.days === 1 ? '' : 's'}
                    {lr.halfDay && ' (half-day)'}
                  </div>
                  <div className="text-sm text-ink-muted">
                    {format(parseISO(lr.from), 'dd MMM yyyy')}
                    {lr.from !== lr.to && ` → ${format(parseISO(lr.to), 'dd MMM yyyy')}`}
                  </div>
                  <p className="mt-1 text-sm">{lr.reason}</p>
                  {lr.approverComment && (
                    <p className="mt-1 text-xs text-ink-muted">Comment: {lr.approverComment}</p>
                  )}
                </div>
                <Badge
                  variant={
                    lr.status === 'Approved' ? 'success' : lr.status === 'Rejected' ? 'danger' : lr.status === 'Pending' ? 'warning' : 'muted'
                  }
                >
                  {lr.status}
                </Badge>
              </div>
              {canApprove && lr.status === 'Pending' && (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
                  <div className="min-w-[180px] flex-1 space-y-1">
                    <Label className="text-xs">Approver comment</Label>
                    <Input value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Optional" />
                  </div>
                  <Button size="sm" onClick={() => void review(lr, 'Approved')}>Approve</Button>
                  <Button size="sm" variant="danger" onClick={() => void review(lr, 'Rejected')}>Reject</Button>
                </div>
              )}
                  {session.role !== 'admin' && lr.status === 'Pending' && lr.employeeId === session.employeeId && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={async () => {
                    await leaveService.cancelLeave(lr.id, session.employeeId)
                    bump()
                    toast.success('Leave cancelled')
                  }}
                >
                  Cancel request
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply for leave</DialogTitle>
            <DialogDescription>Request goes to Admin for approval</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as LeaveType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['Casual', 'Sick', 'Earned', 'Comp-Off', 'Unpaid'] as LeaveType[]).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>From</Label>
                <Input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>To</Label>
                <Input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.halfDay}
                onChange={(e) => setForm({ ...form, halfDay: e.target.checked })}
              />
              Half-day
            </label>
            {form.halfDay && (
              <Select value={form.halfDayPeriod} onValueChange={(v) => setForm({ ...form, halfDayPeriod: v as 'AM' | 'PM' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AM">AM</SelectItem>
                  <SelectItem value="PM">PM</SelectItem>
                </SelectContent>
              </Select>
            )}
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Attachment note</Label>
              <Input value={form.attachmentNote} onChange={(e) => setForm({ ...form, attachmentNote: e.target.value })} placeholder="Text only" />
            </div>
            <Button className="w-full" onClick={() => void submit()} disabled={!form.reason.trim()}>
              Submit request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
