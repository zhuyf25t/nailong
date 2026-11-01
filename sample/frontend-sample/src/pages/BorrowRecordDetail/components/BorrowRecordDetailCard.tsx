import { ArrowLeft, BookCopy, CalendarClock, UserRound } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BorrowRecordStatuses } from '@/pages/objects/BorrowRecordDisplayStatus'

import { DetailCard } from './DetailCard'
import type { BorrowRecordDetailState } from '../hooks/useBorrowRecordDetail'

export function BorrowRecordDetailCard({ detail }: { detail: BorrowRecordDetailState }) {
  const { record } = detail

  return (
    <Card className="border-white/70 bg-white/82 py-0 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
      <CardHeader className="gap-4 border-b border-slate-200/70 px-7 py-7 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <CardTitle className="text-2xl text-slate-900">{record.id}</CardTitle>
            <CardDescription className="text-sm text-slate-500">单条借阅记录核对页</CardDescription>
          </div>
          <Badge
            variant="outline"
            className={
              record.status === BorrowRecordStatuses.Borrowing
                ? 'border-sky-200 bg-sky-50 text-sky-700'
                : record.status === BorrowRecordStatuses.Overdue
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }
          >
            {record.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 px-7 py-7 sm:px-8">
        {detail.errorMessage ? (
          <Alert variant="destructive" className="rounded-2xl border-rose-200 bg-rose-50/90">
            <AlertDescription className="text-sm text-rose-700">{detail.errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <DetailCard icon={BookCopy} label="图书名称" value={record.bookName} />
          <DetailCard icon={UserRound} label="借阅人" value={record.readerName} />
          <DetailCard icon={CalendarClock} label="借出日期" value={record.borrowDate} />
          <DetailCard icon={CalendarClock} label="应还日期" value={record.dueDate} />
        </div>

        <div className="rounded-3xl border border-slate-200/80 bg-slate-50/80 p-5">
          <p className="text-sm text-slate-500">归还日期</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{record.returnDate || '尚未归还'}</p>
        </div>

        <div className="rounded-3xl border border-slate-200/80 bg-white/80 p-5">
          <p className="text-sm text-slate-500">处理说明</p>
          <p className="mt-2 text-sm leading-7 text-slate-700">{detail.process}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            className="h-11 rounded-xl bg-slate-900 px-5 text-white hover:bg-slate-800"
            onClick={detail.goToBorrowManage}
          >
            返回借书管理
          </Button>
          {record.status === BorrowRecordStatuses.Returned || record.id.startsWith('RT-') ? (
            <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={detail.goToReturnManage}>
              前往还书管理
            </Button>
          ) : null}
          <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={detail.goToBookList}>
            <ArrowLeft className="mr-2 size-4" />
            返回图书列表
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
