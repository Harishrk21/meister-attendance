import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, Loader2, Rocket } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { completeSetup } from '@/lib/services/settings'
import type { AppData } from '@/types'

/** Getting-started steps for a newly onboarded company's admin. */
export function SetupChecklist({ data, onDone }: { data: AppData; onDone: () => void }) {
  const [saving, setSaving] = useState(false)
  const s = data.settings
  const steps = [
    {
      title: 'Add your logo and brand colour',
      hint: 'Your team sees it on the sign-in page and every screen',
      to: '/settings',
      done: !!(s.logoUrl || s.primaryColor),
    },
    {
      title: 'Set work hours and holidays',
      hint: 'A 9:00–18:00 "General" shift is ready — adjust it and add this year’s holidays',
      to: '/shifts-holidays',
      done: data.holidays.length > 0,
    },
    {
      title: 'Add your team',
      hint: 'Each person gets an invite link to set their own password',
      to: '/employees',
      done: data.employees.length > 1,
    },
    {
      title: 'Optional: open attendance inside your own dashboard',
      hint: 'Copy the embed snippet from Settings',
      to: '/settings',
      done: false,
      optional: true,
    },
  ]
  const required = steps.filter((x) => !x.optional)
  const doneCount = required.filter((x) => x.done).length

  async function finish() {
    setSaving(true)
    try {
      await completeSetup()
      toast.success('You’re all set')
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-teal/30 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-teal" /> Get {s.name} started
          </CardTitle>
          <CardDescription>
            {doneCount} of {required.length} done
          </CardDescription>
        </div>
        <Button size="sm" variant={doneCount === required.length ? 'default' : 'outline'} onClick={() => void finish()} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {doneCount === required.length ? 'Finish setup' : 'Skip for now'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-teal transition-all" style={{ width: `${(doneCount / required.length) * 100}%` }} />
        </div>
        {steps.map((step) => (
          <Link
            key={step.title}
            to={step.to}
            className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface"
          >
            {step.done ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            ) : (
              <Circle className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted/50" />
            )}
            <div className="min-w-0">
              <div className={step.done ? 'text-sm font-medium text-ink-muted line-through' : 'text-sm font-medium text-ink'}>
                {step.title}
              </div>
              <div className="text-xs text-ink-muted">{step.hint}</div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
