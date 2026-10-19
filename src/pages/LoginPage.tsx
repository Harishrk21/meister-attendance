import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Clock3, Loader2, MapPin, Plug } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { AuthCard, AuthHero, AuthShell } from '@/components/auth/AuthShell'
import { AuthField, AuthPasswordField, AuthSubmitButton } from '@/components/auth/AuthFormFields'
import { DEMO_ACCOUNTS } from '@/data/seed'
import { DEMO_PASSWORD } from '@/types'
import { ApiError, apiFetch, isApiMode } from '@/lib/api'
import { PRODUCT_NAME } from '@/lib/brand'

interface WorkspaceBrand {
  slug: string
  name: string
  logoUrl?: string
  primaryColor?: string
}

const GENERIC_FEATURES = (
  <ul className="mt-1 space-y-2">
    {[
      { icon: Clock3, text: 'Clock in, breaks and timesheets in one place' },
      { icon: MapPin, text: 'Built for office and field teams' },
      { icon: Plug, text: 'Embeds in your existing dashboard' },
    ].map(({ icon: Icon, text }) => (
      <li key={text} className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 shrink-0 text-teal-200" />
        {text}
      </li>
    ))}
  </ul>
)

export function LoginPage() {
  const { session, login, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const workspaceParam = params.get('workspace')?.trim().toLowerCase() ?? ''

  const [workspaceBrand, setWorkspaceBrand] = useState<WorkspaceBrand | null>(null)
  const [email, setEmail] = useState(isApiMode ? '' : 'admin@hmsenterprises.in')
  const [password, setPassword] = useState(isApiMode ? '' : DEMO_PASSWORD)
  const [workspace, setWorkspace] = useState(workspaceParam)
  const [needsWorkspace, setNeedsWorkspace] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isApiMode || !workspaceParam) return
    let live = true
    apiFetch<WorkspaceBrand>(`/v1/tenants/${encodeURIComponent(workspaceParam)}/branding`, { auth: false })
      .then((b) => live && setWorkspaceBrand(b))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [workspaceParam])

  if (!loading && session) return <Navigate to={from} replace />

  const client = workspaceBrand
  const accent = client?.primaryColor
  const heroName = client?.name ?? PRODUCT_NAME
  const heroSubtitle = client ? 'Sign in to your attendance workspace' : 'Time & attendance for every team'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await login(email, password, workspace.trim() || undefined)
      toast.success('Welcome back')
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TENANT_REQUIRED') {
        setNeedsWorkspace(true)
        toast.info('This email belongs to more than one company — enter your company workspace')
        return
      }
      toast.error(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      accent={accent}
      aside={
        <AuthHero
          name={heroName}
          logoUrl={client?.logoUrl}
          color={accent}
          subtitle={heroSubtitle}
          description={client ? 'Use the email and password from your invite, or what your admin gave you.' : GENERIC_FEATURES}
          poweredBy={!!client}
        />
      }
    >
      <AuthCard>
        <h2 className="font-display text-xl font-semibold text-ink">Sign in</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {isApiMode ? 'Work email and password' : 'Pick a demo account below or use your own'}
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {(needsWorkspace || (workspaceParam && !workspaceBrand)) && (
            <AuthField
              id="workspace"
              label="Company workspace"
              placeholder="e.g. hms"
              value={workspace}
              onChange={setWorkspace}
              required={needsWorkspace}
            />
          )}
          <AuthField
            id="email"
            label="Email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={setEmail}
            required
          />
          <AuthPasswordField
            id="password"
            label="Password"
            value={password}
            onChange={setPassword}
            show={showPw}
            onToggleShow={() => setShowPw((v) => !v)}
          />
          <AuthSubmitButton loading={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Sign in
          </AuthSubmitButton>
          {isApiMode && (
            <p className="text-center text-xs leading-relaxed text-ink-muted">
              First time here? Open the invite link from your admin to set a password.
            </p>
          )}
        </form>
      </AuthCard>

      {!isApiMode && (
        <div className="auth-demo-panel mt-4 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-white">Demo accounts</span>
            <span className="rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/90">
              {DEMO_PASSWORD}
            </span>
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email)
                  setPassword(DEMO_PASSWORD)
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/90 transition hover:bg-white/15"
              >
                <span className="truncate">{a.email}</span>
                <span className="shrink-0 text-white/50">{a.role}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthShell>
  )
}
