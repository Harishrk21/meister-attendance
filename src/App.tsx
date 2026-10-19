import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { DataProvider } from '@/context/DataContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { BrandingEffect } from '@/components/BrandingEffect'
import { isEmbedded } from '@/lib/embed'
import type { Role } from '@/types'

// Each page is its own chunk so the shell (and embedded widgets) load only what they show.
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))

const LoginPage = page(() => import('@/pages/LoginPage'), 'LoginPage')
const DashboardPage = page(() => import('@/pages/DashboardPage'), 'DashboardPage')
const ClockPage = page(() => import('@/pages/ClockPage'), 'ClockPage')
const TimesheetsPage = page(() => import('@/pages/TimesheetsPage'), 'TimesheetsPage')
const WhosInPage = page(() => import('@/pages/WhosInPage'), 'WhosInPage')
const MyAttendancePage = page(() => import('@/pages/MyAttendancePage'), 'MyAttendancePage')
const TeamPage = page(() => import('@/pages/TeamPage'), 'TeamPage')
const EmployeesPage = page(() => import('@/pages/EmployeesPage'), 'EmployeesPage')
const LeavesPage = page(() => import('@/pages/LeavesPage'), 'LeavesPage')
const ShiftsHolidaysPage = page(() => import('@/pages/ShiftsHolidaysPage'), 'ShiftsHolidaysPage')
const ReportsPage = page(() => import('@/pages/ReportsPage'), 'ReportsPage')
const SettingsPage = page(() => import('@/pages/SettingsPage'), 'SettingsPage')
const ProfilePage = page(() => import('@/pages/ProfilePage'), 'ProfilePage')
const WidgetClockPage = page(() => import('@/pages/WidgetClockPage'), 'WidgetClockPage')
const SsoPage = page(() => import('@/pages/SsoPage'), 'SsoPage')
const InvitePage = page(() => import('@/pages/InvitePage'), 'InvitePage')
const PlatformLoginPage = page(() => import('@/pages/platform/PlatformLoginPage'), 'PlatformLoginPage')
const PlatformConsolePage = page(() => import('@/pages/platform/PlatformConsolePage'), 'PlatformConsolePage')

function guarded(element: React.ReactNode, roles?: Role[]) {
  return <ProtectedRoute roles={roles}>{element}</ProtectedRoute>
}

const ADMIN: Role[] = ['admin']

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <DataProvider>
          <BrandingEffect />
          <BrowserRouter>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/sso" element={<SsoPage />} />
                <Route path="/invite/:token" element={<InvitePage />} />
                <Route path="/platform/login" element={<PlatformLoginPage />} />
                <Route path="/platform" element={<PlatformConsolePage />} />
                <Route path="/widget/clock" element={guarded(<WidgetClockPage />)} />
                <Route element={guarded(<AppShell />)}>
                  <Route index element={<DashboardPage />} />
                  <Route path="clock" element={<ClockPage />} />
                  <Route path="timesheets" element={<TimesheetsPage />} />
                  <Route path="my-attendance" element={<MyAttendancePage />} />
                  <Route path="leaves" element={<LeavesPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="live" element={guarded(<WhosInPage />, ADMIN)} />
                  <Route path="team" element={guarded(<TeamPage />, ADMIN)} />
                  <Route path="employees" element={guarded(<EmployeesPage />, ADMIN)} />
                  <Route path="shifts-holidays" element={guarded(<ShiftsHolidaysPage />, ADMIN)} />
                  <Route path="reports" element={guarded(<ReportsPage />, ADMIN)} />
                  <Route path="settings" element={guarded(<SettingsPage />, ADMIN)} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster richColors position={isEmbedded ? 'bottom-center' : 'top-right'} closeButton />
        </DataProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
