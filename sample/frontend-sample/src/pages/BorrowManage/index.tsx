import { ArrowLeftRight, CalendarClock } from 'lucide-react'

import { BorrowManageCard } from './components/BorrowManageCard'
import { useBorrowManage } from './hooks/useBorrowManage'

export default function BorrowManage() {
  const borrow = useBorrowManage()

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(185,208,255,0.36),transparent_36%),linear-gradient(180deg,#f5f7fb_0%,#eef2f7_48%,#e8edf4_100%)]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.56),transparent_42%,rgba(15,23,42,0.04)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.12),transparent_70%)] opacity-70" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-16 sm:px-8 lg:px-12">
        <div className="grid w-full items-start gap-8 lg:grid-cols-[0.86fr_1.14fr]">
          <div className="hidden lg:block">
            <div className="max-w-md space-y-4 pt-6">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/75 px-4 py-2 text-sm text-slate-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
                <ArrowLeftRight className="size-4 text-slate-700" />
                借阅流转管理
              </div>
              <div className="space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
                  图书馆管理系统 - 借书管理
                </h1>
                <p className="text-base leading-7 text-slate-600">
                  统一处理借书登记与归还入库，并支持进入单条借阅记录详情继续核对。
                </p>
              </div>
              <div className="rounded-[28px] border border-white/70 bg-white/70 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur">
                <div className="flex items-center gap-3 text-slate-700">
                  <CalendarClock className="size-5" />
                  <span className="text-sm">当前待处理借阅记录 {borrow.activeCount} 条</span>
                </div>
              </div>
            </div>
          </div>

          <BorrowManageCard borrow={borrow} />
        </div>
      </section>
    </main>
  )
}
