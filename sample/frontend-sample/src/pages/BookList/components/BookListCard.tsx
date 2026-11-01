import { BookOpenText, LibraryBig, PencilLine, Search, Trash2 } from 'lucide-react'

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
import { BookInventoryStatuses } from '@/objects/books/BookInventoryStatus'

import type { BookListState } from '../hooks/useBookList'

export function BookListCard({ list }: { list: BookListState }) {
  return (
    <Card className="border-white/70 bg-white/82 py-0 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
      <CardHeader className="gap-4 border-b border-slate-200/70 px-7 py-7 sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-2xl text-slate-900">馆藏图书列表</CardTitle>
            <CardDescription className="text-sm text-slate-500">
              按书名、作者、分类、ISBN 或编号搜索图书
            </CardDescription>
          </div>

          <div className="relative w-full lg:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={list.keyword}
              placeholder="搜索图书"
              className="h-11 rounded-xl border-slate-200 bg-white pl-10 text-slate-900 placeholder:text-slate-400 focus-visible:ring-slate-400"
              onChange={(event) => list.setKeyword(event.target.value)}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 px-7 py-7 sm:px-8">
        {list.highlightedId ? (
          <Alert className="rounded-2xl border-sky-200 bg-sky-50/90">
            <AlertDescription className="text-sm text-sky-700">
              已为你定位新图书记录 {list.highlightedId}，可继续查看详情或编辑信息。
            </AlertDescription>
          </Alert>
        ) : null}

        {list.inlineMessage ? (
          <Alert variant="destructive" className="rounded-2xl border-rose-200 bg-rose-50/90">
            <AlertDescription className="text-sm text-rose-700">{list.inlineMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 bg-slate-50/80 hover:bg-slate-50/80">
                <TableHead className="px-4 py-3 text-slate-500">图书信息</TableHead>
                <TableHead className="px-4 py-3 text-slate-500">分类</TableHead>
                <TableHead className="px-4 py-3 text-slate-500">ISBN</TableHead>
                <TableHead className="px-4 py-3 text-slate-500">状态</TableHead>
                <TableHead className="px-4 py-3 text-right text-slate-500">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.filteredBooks.length > 0 ? (
                list.filteredBooks.map((book) => {
                  const isHighlighted = list.highlightedId === book.id
                  const isAvailable = book.status === BookInventoryStatuses.Available

                  return (
                    <TableRow
                      key={book.id}
                      className={`border-slate-200/80 hover:bg-slate-50/60 ${isHighlighted ? 'bg-sky-50/70' : ''}`}
                    >
                      <TableCell className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
                            <BookOpenText className="size-4" />
                          </div>
                          <div>
                            <button
                              type="button"
                              className="font-medium text-slate-900 transition hover:text-slate-600"
                              onClick={() => list.goToBookDetail(book.id)}
                            >
                              {book.title}
                            </button>
                            <p className="text-sm text-slate-500">
                              {book.author} · {book.id}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-4 text-slate-600">{book.categoryLabel}</TableCell>
                      <TableCell className="px-4 py-4 text-slate-600">{book.isbn}</TableCell>
                      <TableCell className="px-4 py-4">
                        <Badge
                          variant={isAvailable ? 'secondary' : 'outline'}
                          className={
                            isAvailable
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'border-amber-200 bg-amber-50 text-amber-700'
                          }
                        >
                          {isAvailable ? '可借阅' : '已借出'}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-xl"
                            onClick={() => list.goToBookEdit(book.id)}
                          >
                            <PencilLine className="mr-2 size-4" />
                            编辑
                          </Button>
                          {isAvailable ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-xl"
                              onClick={() => list.goToBorrow(book)}
                            >
                              借出
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-xl"
                              onClick={() => list.goToReturn(book)}
                            >
                              归还
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            className="rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => void list.deleteBook(book)}
                          >
                            <Trash2 className="mr-2 size-4" />
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow className="hover:bg-white">
                  <TableCell colSpan={5} className="px-4 py-16 text-center">
                    <div className="mx-auto max-w-sm space-y-3">
                      <div className="mx-auto flex size-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
                        <LibraryBig className="size-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-base font-medium text-slate-900">暂无图书数据</p>
                        <p className="text-sm text-slate-500">请调整搜索条件或重新刷新列表。</p>
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
