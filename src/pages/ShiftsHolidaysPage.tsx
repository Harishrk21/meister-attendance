import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { useData } from '@/context/DataContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, Badge, Label } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import * as shiftService from '@/lib/services/shifts'
import type { Holiday, Shift } from '@/types'

export function ShiftsHolidaysPage() {
  const { data, bump } = useData()
  const [shiftOpen, setShiftOpen] = useState(false)
  const [holidayOpen, setHolidayOpen] = useState(false)
  const [shiftForm, setShiftForm] = useState<Omit<Shift, 'id'> & { id?: string }>({
    name: '',
    start: '09:30',
    end: '18:30',
    graceMinutes: 15,
    weeklyOff: [0],
  })
  const [holidayForm, setHolidayForm] = useState<Omit<Holiday, 'id'> & { id?: string }>({
    name: '',
    date: '',
    branches: 'All',
  })

  if (!data) return null

  async function saveShift() {
    try {
      await shiftService.saveShift(shiftForm)
      toast.success('Shift saved')
      setShiftOpen(false)
      bump()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  async function saveHoliday() {
    try {
      const branches = 'All' as const
      await shiftService.saveHoliday({
        id: holidayForm.id,
        name: holidayForm.name,
        date: holidayForm.date,
        branches,
      })
      toast.success('Holiday saved')
      setHolidayOpen(false)
      bump()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <div className="animate-page space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy dark:text-white">Shifts & holidays</h1>
        <p className="text-sm text-ink-muted">Company calendar and shift windows</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Shifts</CardTitle>
            <Button
              size="sm"
              onClick={() => {
                setShiftForm({ name: '', start: '09:30', end: '18:30', graceMinutes: 15, weeklyOff: [0] })
                setShiftOpen(true)
              }}
            >
              Add shift
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.shifts.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-ink-muted">
                    {s.start} – {s.end} · grace {s.graceMinutes}m · weekly off Sun
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShiftForm(s)
                    setShiftOpen(true)
                  }}
                >
                  Edit
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Holidays {new Date().getFullYear()}</CardTitle>
            <Button
              size="sm"
              onClick={() => {
                setHolidayForm({ name: '', date: '', branches: 'All' })
                setHolidayOpen(true)
              }}
            >
              Add holiday
            </Button>
          </CardHeader>
          <CardContent className="max-h-[420px] space-y-2 overflow-y-auto">
            {data.holidays.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                <div>
                  <div className="font-medium">{h.name}</div>
                  <div className="text-xs text-ink-muted">{format(parseISO(h.date), 'EEE, dd MMM yyyy')}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="muted">Company-wide</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger"
                    onClick={async () => {
                      await shiftService.deleteHoliday(h.id)
                      bump()
                      toast.success('Holiday removed')
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={shiftOpen} onOpenChange={setShiftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{shiftForm.id ? 'Edit shift' : 'New shift'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={shiftForm.name} onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Start</Label>
                <Input type="time" value={shiftForm.start} onChange={(e) => setShiftForm({ ...shiftForm, start: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>End</Label>
                <Input type="time" value={shiftForm.end} onChange={(e) => setShiftForm({ ...shiftForm, end: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Grace minutes</Label>
              <Input
                type="number"
                value={shiftForm.graceMinutes}
                onChange={(e) => setShiftForm({ ...shiftForm, graceMinutes: Number(e.target.value) })}
              />
            </div>
            <Button className="w-full" onClick={() => void saveShift()}>Save shift</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={holidayOpen} onOpenChange={setHolidayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add holiday</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={holidayForm.date} onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })} />
            </div>
            <Button className="w-full" onClick={() => void saveHoliday()}>Save holiday</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
