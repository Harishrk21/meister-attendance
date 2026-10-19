import { Suspense, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Timer,
  CalendarDays,
  Users,
  Palmtree,
  CalendarRange,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  Moon,
  Sun,
  X,
  ClipboardList,
  Sheet as SheetIcon,
  Radio,
  UserRound,
  ArrowLeft,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/card'
import { NotificationBell } from '@/components/layout/NotificationBell'
import { TrackerButton } from '@/components/tracker/TrackerButton'
import { BrandMark } from '@/components/BrandMark'
import { useBranding } from '@/hooks/useBranding'
import { isEmbedded } from '@/lib/embed'
import { getHostReturnUrl, goHostReturn, clearHostReturnUrl } from '@/lib/hostReturn'
import { cn } from '@/lib/utils'
import type { Role } from '@/types'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  roles?: Role[]
}

interface NavSection {
  title?: string
  roles?: Role[]
  items: NavItem[]
}

const SECTIONS: NavSection[] = [
  { items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    title: 'Track',
    items: [
      { to: '/clock', label: 'Time Tracker', icon: Timer },
      { to: '/timesheets', label: 'Timesheets', icon: SheetIcon },
      { to: '/my-attendance', label: 'Attendance', icon: CalendarDays },
      { to: '/leaves', label: 'Time Off', icon: Palmtree },
    ],
  },
  {
    title: 'Manage',
    roles: ['admin'],
    items: [
      { to: '/live', label: "Who's In", icon: Radio },
      { to: '/team', label: 'Daily Roster', icon: ClipboardList },
      { to: '/employees', label: 'People', icon: Users },
      { to: '/shifts-holidays', label: 'Shifts & Holidays', icon: CalendarRange },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

const MOBILE_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/clock', label: 'Tracker', icon: Timer },
  { to: '/timesheets', label: 'Timesheets', icon: SheetIcon },
  { to: '/leaves', label: 'Time Off', icon: Palmtree },
  { to: '/profile', label: 'Profile', icon: UserRound },
]

function visibleSections(role: Role) {
  return SECTIONS.filter((s) => !s.roles || s.roles.includes(role)).map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.roles || i.roles.includes(role)),
  }))
}

function initialsOf(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

function SidebarNav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {visibleSections(role).map((section, i) => (
        <div key={section.title ?? i}>
          {section.title && (
            <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-ink-muted/70">
              {section.title}
            </div>
          )}
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink',
                    isActive && 'bg-teal-100/70 text-teal hover:bg-teal-100/70 hover:text-teal dark:bg-teal/15 dark:text-teal-100'
                  )
                }
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

function Brand({ subtitle }: { subtitle?: string }) {
  const brand = useBranding()
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <BrandMark name={brand.name} logoUrl={brand.logoUrl} color={brand.primaryColor} />
      <div className="min-w-0">
        <div className="truncate font-display text-sm font-semibold leading-tight text-ink">{brand.name}</div>
        <div className="truncate text-[10px] text-ink-muted">
          {subtitle ?? (brand.primaryBranch ? `Attendance · ${brand.primaryBranch}` : 'Attendance')}
        </div>
      </div>
    </div>
  )
}

function MobileBrand() {
  const brand = useBranding()
  return (
    <div className="flex min-w-0 items-center gap-2">
      <BrandMark name={brand.name} logoUrl={brand.logoUrl} color={brand.primaryColor} className="h-7" />
      {!brand.logoUrl && <span className="truncate font-display text-sm font-semibold text-ink">{brand.name}</span>}
    </div>
  )
}

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

function BackToDashboardButton({ className }: { className?: string }) {
  // Read once on mount — set during /sso before AppShell appears.
  const [hostReturn] = useState(() => getHostReturnUrl())
  if (!hostReturn) return null
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={goHostReturn}
      className={cn('gap-1.5 border-teal/40 text-teal hover:bg-teal/10', className)}
    >
      <ArrowLeft className="h-4 w-4" />
      Back to dashboard
    </Button>
  )
}

export function AppShell() {
  const { session, logout } = useAuth()
  const { mode, toggle } = useTheme()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  if (!session) return null

  async function handleLogout() {
    clearHostReturnUrl()
    await logout()
    navigate('/login')
  }

  const themeButton = (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme" className="h-9 w-9">
      {mode === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </Button>
  )

  if (isEmbedded) {
    const tabs = visibleSections(session.role).flatMap((s) => s.items)
    return (
      <div className="flex min-h-full flex-col bg-surface">
        <header className="no-print sticky top-0 z-40 border-b border-border bg-surface-elevated">
          <div className="flex h-12 items-center justify-between gap-2 px-3">
            <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
              {tabs.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface hover:text-ink',
                      isActive && 'bg-teal-100/70 text-teal dark:bg-teal/15 dark:text-teal-100'
                    )
                  }
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="flex shrink-0 items-center gap-1">
              <BackToDashboardButton />
              <TrackerButton />
              <NotificationBell />
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden p-3 sm:p-4">
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-full bg-surface">
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface-elevated lg:flex">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Brand />
        </div>
        <div className="px-3 pt-3">
          <BackToDashboardButton className="w-full justify-center" />
        </div>
        <SidebarNav role={session.role} />
        <div className="border-t border-border p-3">
          <Link
            to="/profile"
            className="flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-surface"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal text-xs font-bold text-white">
              {initialsOf(session.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">{session.name}</div>
              <div className="truncate text-[11px] capitalize text-ink-muted">{session.role}</div>
            </div>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface hover:text-danger"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-navy/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-surface-elevated shadow-xl animate-page">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <Brand subtitle={`${session.name} · ${session.role}`} />
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarNav role={session.role} onNavigate={() => setOpen(false)} />
            <div className="border-t border-border p-3">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface hover:text-danger"
              >
                <LogOut className="h-4 w-4" /> Log out
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-40 flex h-14 min-w-0 items-center justify-between gap-2 border-b border-border bg-surface-elevated/95 px-3 backdrop-blur-md sm:px-5 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
            <div className="min-w-0 lg:hidden">
              <MobileBrand />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <BackToDashboardButton />
            <TrackerButton />
            <NotificationBell />
            {themeButton}
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden p-4 pb-24 lg:p-6 lg:pb-6">
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>

        {/* Mobile bottom nav */}
        <nav className="no-print fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-surface-elevated/95 pb-safe backdrop-blur-md lg:hidden">
          {MOBILE_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2.5 text-[10px] font-medium text-ink-muted transition-colors',
                  isActive && 'text-teal'
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="max-w-full truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
