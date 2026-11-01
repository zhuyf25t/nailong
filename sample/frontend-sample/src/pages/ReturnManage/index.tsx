import { Undo2 } from 'lucide-react'

import { ReturnManageCard } from './components/ReturnManageCard'
import { useReturnManage } from './hooks/useReturnManage'

export default function ReturnManage() {
  const returns = useReturnManage()

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(197,225,255,0.32),transparent_34%),linear-gradient(180deg,#f4f8fb_0%,#edf3f7_48%,#e7eef4_100%)]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.55),transparent_42%,rgba(15,23,42,0.05)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.1),transparent_70%)] opacity-80" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl px-6 py-12 sm:px-8 lg:px-12">
        <div className="w-full space-y-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/75 px-4 py-2 text-sm text-slate-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
                <Undo2 className="size-4 text-slate-700" />
                还书业务办理
              </div>
              <div className="space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight text-slate-900">还书管理</h1>
                <p className="max-w-2xl text-base leading-7 text-slate-600">
                  查询借阅记录并办理图书归还。
                </p>
              </div>
            </div>
          </div>

          <ReturnManageCard returns={returns} />
        </div>
      </section>
    </main>
  )
}
