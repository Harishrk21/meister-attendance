import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { AuthCard, AuthShell } from '@/components/auth/AuthShell'
import { postToHost } from '@/lib/embed'
import { setHostReturnUrl } from '@/lib/hostReturn'

function safeRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/'
  return value
}

export function SsoPage() {
  const { loginWithSsoTicket } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const params = new URLSearchParams(window.location.search)
    const ticket = params.get('ticket')
    const redirect = safeRedirect(params.get('redirect'))
    const embed = params.get('embed') === '1'
    // Meister (or any host) passes where to send the user after they finish in Attendance.
    setHostReturnUrl(params.get('returnUrl'))
    window.history.replaceState(null, '', embed ? '/sso?embed=1' : '/sso')

    const exchange = ticket
      ? loginWithSsoTicket(ticket)
      : Promise.reject(new Error('This link is missing its sign-in ticket.'))
    exchange
      .then(() => {
        postToHost('navigate', { path: redirect })
        navigate(redirect, { replace: true })
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Sign-in failed'))
  }, [loginWithSsoTicket, navigate])

  return (
    <AuthShell footer={null}>
      <AuthCard className="text-center">
        {error ? (
          <>
            <AlertCircle className="mx-auto h-10 w-10 text-danger" />
            <h1 className="mt-3 font-display text-lg font-semibold text-ink">Couldn&apos;t sign you in</h1>
            <p className="mt-1 text-sm text-ink-muted">{error}</p>
            <p className="mt-3 text-xs text-ink-muted">
              Tickets work once and expire quickly. Open Attendance again from your dashboard.
            </p>
            <Link to="/login" className="mt-4 inline-block text-sm font-semibold text-teal hover:underline">
              Sign in with email instead
            </Link>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-teal" />
            <p className="mt-3 text-sm font-medium text-ink">Signing you in…</p>
          </>
        )}
      </AuthCard>
    </AuthShell>
  )
}
