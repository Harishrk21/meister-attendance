import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { AuthCard, AuthHero, AuthShell } from '@/components/auth/AuthShell'
import { AuthPasswordField, AuthSubmitButton } from '@/components/auth/AuthFormFields'
import { getInvite, type InviteInfo } from '@/lib/services/auth'
import { PRODUCT_NAME } from '@/lib/brand'

export function InvitePage() {
  const { token = '' } = useParams()
  const { acceptInvite } = useAuth()
  const navigate = useNavigate()
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    getInvite(token)
      .then((i) => live && setInvite(i))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Invite not found'))
    return () => {
      live = false
    }
  }, [token])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      toast.error('Passwords don’t match')
      return
    }
    setSaving(true)
    try {
      await acceptInvite(token, password)
      toast.success(`Welcome to ${invite?.tenant.name ?? PRODUCT_NAME}`)
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not set password')
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <AuthShell>
        <AuthCard className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-danger" />
          <h1 className="mt-3 font-display text-lg font-semibold text-ink">This link can’t be used</h1>
          <p className="mt-1 text-sm text-ink-muted">{error}</p>
          <Link to="/login" className="mt-4 inline-block text-sm font-semibold text-teal hover:underline">
            Go to sign in
          </Link>
        </AuthCard>
      </AuthShell>
    )
  }

  if (!invite) {
    return (
      <AuthShell accent="#0f766e">
        <AuthCard className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-teal" />
        </AuthCard>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      accent={invite.tenant.primaryColor}
      aside={
        <AuthHero
          name={invite.tenant.name}
          logoUrl={invite.tenant.logoUrl}
          color={invite.tenant.primaryColor}
          subtitle="You’re almost in"
          description={`Create a password for ${invite.email}. This link works once and expires in a few days.`}
        />
      }
    >
      <AuthCard>
        <h2 className="font-display text-xl font-semibold text-ink">Hi {invite.name.split(' ')[0]}, set your password</h2>
        <p className="mt-1 text-sm text-ink-muted">You’ll use this email every time you sign in.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <AuthPasswordField
            id="pw"
            label="New password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            show={show}
            onToggleShow={() => setShow((v) => !v)}
            hint="At least 8 characters"
            minLength={8}
          />
          <AuthPasswordField
            id="pw2"
            label="Confirm password"
            autoComplete="new-password"
            value={confirm}
            onChange={setConfirm}
            show={show}
            onToggleShow={() => setShow((v) => !v)}
          />
          <AuthSubmitButton loading={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Set password and continue
          </AuthSubmitButton>
        </form>
      </AuthCard>
    </AuthShell>
  )
}
