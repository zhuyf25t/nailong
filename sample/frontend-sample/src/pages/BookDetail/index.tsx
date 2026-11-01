import { LibraryBig } from 'lucide-react'

import { BookDetailCard } from './components/BookDetailCard'
import { useBookDetail } from './hooks/useBookDetail'

export default function BookDetail() {
  const detail = useBookDetail()

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(185,208,255,0.34),transparent_34%),linear-gradient(180deg,#f5f7fb_0%,#eef2f7_48%,#e8edf4_100%)]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.56),transparent_42%,rgba(15,23,42,0.04)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.12),transparent_70%)] opacity-70" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-16 sm:px-8 lg:px-12">
        <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[0.88fr_1.12fr]">
          <div className="hidden lg:block">
            <div className="max-w-md space-y-4">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/75 px-4 py-2 text-sm text-slate-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
                <LibraryBig className="size-4 text-slate-700" />
                馆藏图书详情
              </div>
              <div className="space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
                  图书馆管理系统 - 图书详情
                </h1>
                <p className="text-base leading-7 text-slate-600">
                  查看图书信息，并直接处理借书、还书、编辑与删除操作。
                </p>
              </div>
            </div>
          </div>

          <BookDetailCard detail={detail} />
        </div>
      </section>

      <footer className="relative pb-8 text-center text-sm text-slate-500">
        Copyright © 2025 图书馆管理系统
      </footer>
    </main>
  )
}
