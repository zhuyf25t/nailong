import { AdminDashboardHeader } from './components/AdminDashboardHeader'
import { DashboardActionGrid } from './components/DashboardActionGrid'
import { useAdminDashboard } from './hooks/useAdminDashboard'
import { dashboardActions } from './objects/DashboardAction'

export default function AdminDashboard() {
  const dashboard = useAdminDashboard()

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(185,208,255,0.36),transparent_36%),linear-gradient(180deg,#f5f7fb_0%,#eef2f7_48%,#e8edf4_100%)]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.56),transparent_42%,rgba(15,23,42,0.04)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.12),transparent_70%)] opacity-70" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl px-6 py-12 sm:px-8 lg:px-12">
        <div className="w-full space-y-8">
          <AdminDashboardHeader onLogout={() => void dashboard.logout()} />
          <DashboardActionGrid actions={dashboardActions} onActionClick={dashboard.openAction} />
        </div>
      </section>
    </main>
  )
}
