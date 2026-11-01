import { ShieldCheck } from 'lucide-react'

import { AdminRegisterCard } from './components/AdminRegisterCard'
import { useAdminRegisterForm } from './hooks/useAdminRegisterForm'

export default function AdminRegister() {
  const form = useAdminRegisterForm()

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(185,208,255,0.36),transparent_36%),linear-gradient(180deg,#f5f7fb_0%,#eef2f7_48%,#e8edf4_100%)]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.56),transparent_42%,rgba(15,23,42,0.04)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.12),transparent_70%)] opacity-70" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-16 sm:px-8 lg:px-12">
        <div className="grid w-full max-w-4xl items-center gap-8 lg:grid-cols-[1fr_0.95fr]">
          <div className="hidden lg:block">
            <div className="max-w-md space-y-4">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/75 px-4 py-2 text-sm text-slate-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
                <ShieldCheck className="size-4 text-slate-700" />
                管理员账号创建
              </div>
              <div className="space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
                  图书馆管理系统 - 管理员注册
                </h1>
                <p className="text-base leading-7 text-slate-600">
                  创建管理员账号后即可登录系统后台。
                </p>
              </div>
            </div>
          </div>

          <AdminRegisterCard form={form} />
        </div>
      </section>

      <footer className="relative pb-8 text-center text-sm text-slate-500">
        Copyright © 2025 图书馆管理系统
      </footer>
    </main>
  )
}
