import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Building2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AuthCard, AuthHero, AuthShell } from '@/components/auth/AuthShell'
import { AuthField, AuthPasswordField, AuthSubmitButton } from '@/components/auth/AuthFormFields'
import { isApiMode } from '@/lib/api'
import { PRODUCT_NAME, PRODUCT_OWNER } from '@/lib/brand'
import { getPlatformToken, platformApi } from '@/lib/platform'

export function PlatformLoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (getPlatformToken()) return <Navigate to="/platform" replace />

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await platformApi.login(email.trim(), password)
      navigate('/platform', { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      accent="#1e3a5f"
      aside={
        <AuthHero
          name={PRODUCT_OWNER}
          subtitle="Client console"
          description={
            <>
              <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
                <Building2 className="h-3.5 w-3.5" /> Internal · not for client employees
              </span>
              <p>Onboard companies, manage plans and seats, send admin invites, and configure SSO for client dashboards.</p>
            </>
          }
          poweredBy={false}
        />
      }
    >
      <AuthCard>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{PRODUCT_NAME}</p>
        <h2 className="mt-1 font-display text-xl font-semibold text-ink">Meister staff sign in</h2>

        {!isApiMode ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Set <code className="rounded bg-amber-100/80 px-1">VITE_API_URL</code> in <code className="rounded bg-amber-100/80 px-1">.env.local</code> and restart the web app.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <AuthField
              id="p-email"
              label="Email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={setEmail}
              required
            />
            <AuthPasswordField
              id="p-pw"
              label="Password"
              value={password}
              onChange={setPassword}
              show={showPw}
              onToggleShow={() => setShowPw((v) => !v)}
            />
            <AuthSubmitButton loading={submitting} variant="navy">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign in
            </AuthSubmitButton>
            <p className="text-center text-xs text-ink-muted">
              Client admins use{' '}
              <a href="/login" className="font-medium text-teal hover:underline">
                /login
              </a>
            </p>
          </form>
        )}
      </AuthCard>
    </AuthShell>
  )
}
