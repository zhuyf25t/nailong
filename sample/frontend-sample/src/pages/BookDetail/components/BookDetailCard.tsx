import {
  ArrowLeft,
  BookCopy,
  BookOpenText,
  FileSearch,
  LibraryBig,
  MapPinned,
  NotebookText,
  PencilLine,
  ScanSearch,
  Trash2,
} from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { BookInventoryStatuses } from '@/objects/books/BookInventoryStatus'

import { DetailItem } from './DetailItem'
import { DetailText } from './DetailText'
import type { BookDetailState } from '../hooks/useBookDetail'

export function BookDetailCard({ detail }: { detail: BookDetailState }) {
  const { book, status } = detail
  const isAvailable = status === BookInventoryStatuses.Available

  return (
    <Card className="border-white/70 bg-white/82 py-0 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
      <CardHeader className="gap-4 border-b border-slate-200/70 px-7 py-7 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                <BookOpenText className="size-5" />
              </div>
              <CardTitle className="text-xl text-slate-900">图书馆管理系统 - 图书详情</CardTitle>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <CardTitle className="text-2xl text-slate-900">{book.title}</CardTitle>
                <Badge
                  variant="outline"
                  className={
                    isAvailable
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                  }
                >
                  {isAvailable ? '可借' : '借出中'}
                </Badge>
              </div>
              <CardDescription className="text-sm text-slate-500">图书编号：{book.id}</CardDescription>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            onClick={detail.goToList}
          >
            <ArrowLeft className="size-4" />
            返回列表
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 px-7 py-7 sm:px-8">
        {detail.isNewlyAdded ? (
          <Alert className="rounded-2xl border-sky-200 bg-sky-50/90">
            <AlertDescription className="flex flex-wrap items-center gap-3 text-sm text-sky-700">
              新图书已创建完成，你可以先核对详情，再返回列表定位这条新记录。
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl border-sky-200 bg-white text-sky-700 hover:bg-sky-100"
                onClick={detail.goToHighlightedList}
              >
                查看列表中的新记录
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {detail.isUpdated ? (
          <Alert className="rounded-2xl border-emerald-200 bg-emerald-50/90">
            <AlertDescription className="text-sm text-emerald-700">
              图书信息已更新，可继续核对详情或返回列表查看最新状态。
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <DetailItem icon={BookCopy} label="作者" value={book.author} />
          <DetailItem icon={ScanSearch} label="ISBN" value={book.isbn} />
          <DetailItem icon={NotebookText} label="分类" value={book.category} />
          <DetailItem icon={MapPinned} label="馆藏位置" value={book.shelf} />
          <DetailItem icon={LibraryBig} label="出版社" value={book.publisher} />
          <DetailItem icon={BookOpenText} label="库存" value={`${book.availableStock} / ${book.totalStock} 可借`} />
        </div>

        <Separator />

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-slate-700">内容简介</h2>
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4 text-sm leading-7 text-slate-600">
            {book.summary}
          </div>
        </div>

        {!isAvailable ? (
          <div className="grid gap-4 rounded-3xl border border-amber-200/80 bg-amber-50/70 p-5 sm:grid-cols-3">
            <DetailText label="借阅人" value={book.borrower} />
            <DetailText label="借出日期" value={book.borrowDate} />
            <DetailText label="应还日期" value={book.dueDate} />
          </div>
        ) : null}

        <div className="min-h-16">
          {detail.feedbackMessage ? (
            <Alert variant="destructive" className="rounded-2xl border-rose-200 bg-rose-50/90">
              <AlertDescription className="text-sm text-rose-700">{detail.feedbackMessage}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        {detail.lastAction ? (
          <Alert className="rounded-2xl border-slate-200 bg-slate-50/90">
            <AlertDescription className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
              {detail.lastAction === 'borrow' ? '借书已完成，可立即查看新生成的借阅记录。' : null}
              {detail.lastAction === 'return' ? '还书已完成，可查看归还记录继续核对结果。' : null}
              {detail.lastAction === 'overdue' ? '逾期归还已登记，可继续查看记录或进入还书管理页处理后续。' : null}
              <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={detail.goToRecord}>
                <FileSearch className="mr-2 size-4" />
                查看记录
              </Button>
              {detail.lastAction === 'overdue' ? (
                <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={detail.goToReturnManage}>
                  前往还书管理
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {isAvailable ? (
            <Button
              type="button"
              className="h-11 rounded-xl bg-slate-900 px-5 text-white hover:bg-slate-800"
              onClick={() => void detail.handleBorrow()}
            >
              借书
            </Button>
          ) : (
            <Button
              type="button"
              className="h-11 rounded-xl bg-slate-900 px-5 text-white hover:bg-slate-800"
              onClick={() => void detail.handleReturn()}
            >
              还书
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl border-slate-200 bg-white px-5 text-slate-700 hover:bg-slate-50"
            onClick={detail.goToEdit}
          >
            <PencilLine className="size-4" />
            编辑图书
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl border-slate-200 bg-white px-5 text-slate-700 hover:bg-slate-50"
            onClick={() => void detail.handleDelete()}
          >
            <Trash2 className="size-4" />
            删除图书
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
