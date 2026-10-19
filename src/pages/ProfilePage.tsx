import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { useBranding } from '@/hooks/useBranding'

export function ProfilePage() {
  const { session, logout } = useAuth()
  const { data } = useData()
  const navigate = useNavigate()
  const brand = useBranding()

  const emp = useMemo(
    () => data?.employees.find((e) => e.id === session?.employeeId),
    [data, session]
  )
  const shift = useMemo(() => data?.shifts.find((s) => s.id === emp?.shiftId), [data, emp])
  const balance = useMemo(
    () => data?.leaveBalances.find((b) => b.employeeId === session?.employeeId),
    [data, session]
  )

  if (!session || !emp) return null

  return (
    <div className="animate-page mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy dark:text-white">Profile</h1>
        <p className="text-sm text-ink-muted">Your account at {brand.name}</p>
      </div>

      <Card>
        <CardContent className="flex items-center gap-4 p-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy font-display text-xl font-bold text-white">
            {emp.avatarInitials}
          </div>
          <div>
            <div className="font-display text-xl font-semibold">{emp.name}</div>
            <div className="text-sm text-ink-muted">{emp.employeeCode}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="teal" className="capitalize">{emp.role}</Badge>
              <Badge variant="muted">{emp.branch}</Badge>
              <Badge variant="navy">{emp.department}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact & assignment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-ink-muted">Email</div>
            <div className="font-medium">{emp.email}</div>
          </div>
          <div>
            <div className="text-xs text-ink-muted">Phone</div>
            <div className="font-medium">{emp.phone}</div>
          </div>
          <div>
            <div className="text-xs text-ink-muted">Join date</div>
            <div className="font-medium">{format(parseISO(emp.joinDate), 'dd MMM yyyy')}</div>
          </div>
          <div>
            <div className="text-xs text-ink-muted">Shift</div>
            <div className="font-medium">
              {shift ? `${shift.name} (${shift.start}–${shift.end})` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-ink-muted">Status</div>
            <Badge variant={emp.status === 'Active' ? 'success' : 'muted'}>{emp.status}</Badge>
          </div>
          <div>
            <div className="text-xs text-ink-muted">Session since</div>
            <div className="font-medium">{format(parseISO(session.loggedInAt), 'dd MMM HH:mm')}</div>
          </div>
        </CardContent>
      </Card>

      {balance && (
        <Card>
          <CardHeader>
            <CardTitle>Leave balances</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(['Casual', 'Sick', 'Earned', 'Comp-Off', 'Unpaid'] as const).map((t) => (
              <Badge key={t} variant="muted" className="px-3 py-1.5">
                {t}: {balance[t]}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Button
        variant="outline"
        onClick={async () => {
          await logout()
          navigate('/login')
        }}
      >
        Logout
      </Button>
    </div>
  )
}
