import { BookCopy, CalendarClock, Search, UserRoundCheck } from 'lucide-react'

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
import { ReturnRecordStatuses } from '@/pages/objects/ReturnRecordStatus'

import { resolveReturnStatusClassName } from '../functions/resolveReturnStatusClassName'
import type { ReturnManageState } from '../hooks/useReturnManage'

export function ReturnManageCard({ returns }: { returns: ReturnManageState }) {
  return (
    <Card className="border-white/70 bg-white/82 py-0 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
      <CardHeader className="gap-5 border-b border-slate-200/70 px-7 py-7 sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl text-slate-900">借阅记录检索</CardTitle>
            <CardDescription className="text-sm text-slate-500">
              支持按图书名称、读者姓名、借阅码查询待还记录。
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-xl">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={returns.keyword}
                placeholder="请输入图书名称、读者姓名或借阅码"
                className="h-11 rounded-xl border-slate-200 bg-white pl-10 text-slate-900 placeholder:text-slate-400 focus-visible:ring-slate-400"
                onChange={(event) => returns.setKeyword(event.target.value)}
              />
            </div>
            <Button
              type="button"
              className="h-11 rounded-xl bg-slate-900 px-6 text-white hover:bg-slate-800"
              onClick={returns.searchRecords}
              disabled={returns.isSearching}
            >
              查询记录
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 px-7 py-7 sm:px-8">
        {returns.pendingBookName ? (
          <Alert className="rounded-2xl border-sky-200 bg-sky-50/90">
            <AlertDescription className="text-sm text-sky-700">
              已从上一页带入《{returns.pendingBookName}》
              {returns.pendingBookId ? `（${returns.pendingBookId}）` : ''}，可直接查询并办理归还。
            </AlertDescription>
          </Alert>
        ) : null}

        {returns.inlineMessage ? (
          <Alert className="rounded-2xl border-slate-200 bg-white/90">
            <AlertDescription className="text-sm text-slate-700">{returns.inlineMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                <TableHead className="h-12 pl-5 text-slate-500">图书信息</TableHead>
                <TableHead className="text-slate-500">读者</TableHead>
                <TableHead className="text-slate-500">借阅码</TableHead>
                <TableHead className="text-slate-500">借阅日期</TableHead>
                <TableHead className="text-slate-500">应还日期</TableHead>
                <TableHead className="text-slate-500">状态</TableHead>
                <TableHead className="pr-5 text-right text-slate-500">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.filteredRecords.length ? (
                returns.filteredRecords.map((record) => (
                  <TableRow key={record.id} className="hover:bg-slate-50/70">
                    <TableCell className="pl-5">
                      <div className="space-y-1">
                        <div className="font-medium text-slate-900">{record.bookTitle}</div>
                        <div className="text-xs text-slate-500">{record.id}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-2 text-slate-700">
                        <UserRoundCheck className="size-4 text-slate-400" />
                        {record.readerName}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600">{record.borrowCode}</TableCell>
                    <TableCell className="text-slate-600">{record.borrowDate}</TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-2 text-slate-600">
                        <CalendarClock className="size-4 text-slate-400" />
                        {record.dueDate}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={resolveReturnStatusClassName(record.status)}>
                        {record.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant={record.status === ReturnRecordStatuses.Returned ? 'secondary' : 'outline'}
                        className="rounded-xl"
                        disabled={record.status === ReturnRecordStatuses.Returned}
                        onClick={() => void returns.returnRecord(record.id)}
                      >
                        {record.status === ReturnRecordStatuses.Returned ? '已办理' : '确认还书'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-56">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                        <BookCopy className="size-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-700">暂无匹配的借阅记录</p>
                        <p className="text-sm text-slate-500">请调整检索条件后重新查询。</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
