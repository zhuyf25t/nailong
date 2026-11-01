import { BookCopy, FileSearch } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/components/ui/utils'
import { BorrowRecordStatuses } from '@/pages/objects/BorrowRecordDisplayStatus'

import type { BorrowManageState } from '../hooks/useBorrowManage'

export function BorrowManageCard({ borrow }: { borrow: BorrowManageState }) {
  return (
    <Card className="border-white/70 bg-white/82 py-0 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
      <CardHeader className="gap-4 border-b border-slate-200/70 px-7 py-7 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                <BookCopy className="size-5" />
              </div>
              <CardTitle className="text-xl text-slate-900">图书馆管理系统 - 借书管理</CardTitle>
            </div>
            <div className="hidden lg:block">
              <CardTitle className="text-2xl text-slate-900">借书管理</CardTitle>
            </div>
            <CardDescription className="text-sm text-slate-500">
              查看当前借阅记录并处理借书、还书
            </CardDescription>
          </div>

          <Button
            type="button"
            className="h-11 rounded-xl bg-slate-900 px-5 text-sm font-medium text-white hover:bg-slate-800"
            onClick={() => void borrow.createBorrow()}
          >
            登记借书
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 px-7 py-7 sm:px-8">
        {borrow.pendingBookName ? (
          <Alert className="rounded-2xl border-sky-200 bg-sky-50/90">
            <AlertDescription className="text-sm text-sky-700">
              已从图书列表页带入《{borrow.pendingBookName}》
              {borrow.pendingBookId ? `（${borrow.pendingBookId}）` : ''}，可直接登记借书并生成记录。
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 rounded-3xl border border-slate-200/80 bg-white/90 p-4 sm:grid-cols-[1fr_0.8fr_auto]">
          <Input
            value={borrow.bookIdInput}
            placeholder="图书编号（从图书列表或详情页复制）"
            className="h-11 rounded-xl border-slate-200"
            onChange={(event) => borrow.setBookIdInput(event.target.value)}
          />
          <Input
            value={borrow.readerName}
            placeholder="借阅人"
            className="h-11 rounded-xl border-slate-200"
            onChange={(event) => borrow.setReaderName(event.target.value)}
          />
          <Button
            type="button"
            className="h-11 rounded-xl bg-slate-900 px-5 text-white hover:bg-slate-800"
            onClick={() => void borrow.createBorrow()}
          >
            提交借书
          </Button>
        </div>

        {borrow.inlineMessage ? (
          <Alert className="rounded-2xl border-amber-200 bg-amber-50/90">
            <AlertDescription className="text-sm text-amber-700">{borrow.inlineMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                <TableHead className="h-12 pl-5 text-slate-500">借阅编号</TableHead>
                <TableHead className="text-slate-500">图书</TableHead>
                <TableHead className="text-slate-500">借阅人</TableHead>
                <TableHead className="text-slate-500">借出日期</TableHead>
                <TableHead className="text-slate-500">应还日期</TableHead>
                <TableHead className="text-slate-500">状态</TableHead>
                <TableHead className="pr-5 text-right text-slate-500">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {borrow.records.map((record) => (
                <TableRow key={record.id} className="border-slate-200/80">
                  <TableCell className="pl-5 align-middle text-sm font-medium text-slate-700">
                    {record.id}
                  </TableCell>
                  <TableCell className="align-middle text-sm text-slate-700">
                    <div className="space-y-1">
                      <div>{record.bookName}</div>
                      {record.returnDate ? (
                        <div className="text-xs text-slate-400">归还日期 {record.returnDate}</div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="align-middle text-sm text-slate-700">{record.readerName}</TableCell>
                  <TableCell className="align-middle text-sm text-slate-600">{record.borrowDate}</TableCell>
                  <TableCell className="align-middle text-sm text-slate-600">{record.dueDate}</TableCell>
                  <TableCell className="align-middle">
                    <Badge
                      variant="outline"
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium',
                        record.status === BorrowRecordStatuses.Borrowing &&
                          'border-sky-200 bg-sky-50 text-sky-700',
                        record.status === BorrowRecordStatuses.Overdue &&
                          'border-amber-200 bg-amber-50 text-amber-700',
                        record.status === BorrowRecordStatuses.Returned &&
                          'border-emerald-200 bg-emerald-50 text-emerald-700',
                      )}
                    >
                      {record.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-5 text-right align-middle">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 rounded-xl px-3 text-slate-600"
                        onClick={() => borrow.goToRecord(record.id)}
                      >
                        <FileSearch className="mr-2 size-4" />
                        详情
                      </Button>
                      {record.status === BorrowRecordStatuses.Returned ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9 rounded-xl px-3 text-slate-500"
                          onClick={() => borrow.goToRecord(record.id)}
                        >
                          查看完成
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 rounded-xl border-slate-200 px-3 text-slate-700"
                          onClick={() => void borrow.returnBook(record.id)}
                        >
                          办理归还
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
