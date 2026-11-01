import { LibraryBig, Plus, RotateCw } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { BookListCard } from './components/BookListCard'
import { useBookList } from './hooks/useBookList'

export default function BookList() {
  const list = useBookList()

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(185,208,255,0.36),transparent_36%),linear-gradient(180deg,#f5f7fb_0%,#eef2f7_48%,#e8edf4_100%)]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.56),transparent_42%,rgba(15,23,42,0.04)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.12),transparent_70%)] opacity-70" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl px-6 py-16 sm:px-8 lg:px-12">
        <div className="w-full space-y-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl space-y-4">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/75 px-4 py-2 text-sm text-slate-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
                <LibraryBig className="size-4 text-slate-700" />
                图书管理
              </div>
              <div className="space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
                  图书列表与管理
                </h1>
                <p className="text-base leading-7 text-slate-600">
                  查看馆藏图书，并通过正式页面继续完成新增、编辑、借书和还书流程。
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl border-white/70 bg-white/80 px-5 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.06)] backdrop-blur"
                onClick={() => void list.loadBooks()}
                disabled={list.isLoading}
              >
                <RotateCw className="mr-2 size-4" />
                {list.isLoading ? '加载中...' : '刷新列表'}
              </Button>
              <Button
                type="button"
                className="h-11 rounded-xl bg-slate-900 px-5 text-white shadow-[0_16px_40px_rgba(15,23,42,0.18)] hover:bg-slate-800"
                onClick={list.goToAddBook}
              >
                <Plus className="mr-2 size-4" />
                添加图书
              </Button>
            </div>
          </div>

          <BookListCard list={list} />
        </div>
      </section>
    </main>
  )
}
