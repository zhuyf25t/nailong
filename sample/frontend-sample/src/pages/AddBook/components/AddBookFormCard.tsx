import { BookPlus, BookText, FileText, Hash, LibraryBig, ScanSearch } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { BookCategoryCode } from '@/pages/objects/BookCategory'

import type { AddBookFormState } from '../hooks/useAddBookForm'

export function AddBookFormCard({ form }: { form: AddBookFormState }) {
  return (
    <Card className="border-white/70 bg-white/82 py-0 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
      <CardHeader className="gap-3 border-b border-slate-200/70 px-7 py-7 sm:px-8">
        <div className="flex items-center gap-3 lg:hidden">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
            <BookPlus className="size-5" />
          </div>
          <CardTitle className="text-xl text-slate-900">图书馆管理系统 - 添加图书</CardTitle>
        </div>
        <div className="hidden lg:block">
          <CardTitle className="text-2xl text-slate-900">添加图书</CardTitle>
        </div>
        <CardDescription className="text-sm text-slate-500">请填写图书信息</CardDescription>
      </CardHeader>

      <CardContent className="px-7 py-7 sm:px-8">
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="book-title" className="text-slate-700">
                图书名称
              </Label>
              <div className="relative">
                <BookText className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="book-title"
                  value={form.title}
                  placeholder="请输入图书名称"
                  className="h-11 rounded-xl border-slate-200 bg-white pl-10 text-slate-900 placeholder:text-slate-400 focus-visible:ring-slate-400"
                  onChange={(event) => form.setTitle(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="book-author" className="text-slate-700">
                作者
              </Label>
              <div className="relative">
                <FileText className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="book-author"
                  value={form.author}
                  placeholder="请输入作者姓名"
                  className="h-11 rounded-xl border-slate-200 bg-white pl-10 text-slate-900 placeholder:text-slate-400 focus-visible:ring-slate-400"
                  onChange={(event) => form.setAuthor(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="book-isbn" className="text-slate-700">
                ISBN
              </Label>
              <div className="relative">
                <ScanSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="book-isbn"
                  value={form.isbn}
                  placeholder="请输入 ISBN 编号"
                  className="h-11 rounded-xl border-slate-200 bg-white pl-10 text-slate-900 placeholder:text-slate-400 focus-visible:ring-slate-400"
                  onChange={(event) => form.setIsbn(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="book-category" className="text-slate-700">
                分类
              </Label>
              <Select value={form.category} onValueChange={(value) => form.setCategory(value as BookCategoryCode)}>
                <SelectTrigger
                  id="book-category"
                  className="h-11 rounded-xl border-slate-200 bg-white text-slate-900 focus:ring-slate-400"
                >
                  <SelectValue placeholder="请选择图书分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="computer">计算机</SelectItem>
                  <SelectItem value="literature">文学</SelectItem>
                  <SelectItem value="history">历史</SelectItem>
                  <SelectItem value="management">管理</SelectItem>
                  <SelectItem value="scifi">科幻</SelectItem>
                  <SelectItem value="novel">小说</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="book-stock" className="text-slate-700">
                库存数量
              </Label>
              <div className="relative">
                <Hash className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="book-stock"
                  value={form.stock}
                  inputMode="numeric"
                  placeholder="请输入库存数量"
                  className="h-11 rounded-xl border-slate-200 bg-white pl-10 text-slate-900 placeholder:text-slate-400 focus-visible:ring-slate-400"
                  onChange={(event) => form.setStock(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="book-summary" className="text-slate-700">
                图书简介
              </Label>
              <div className="relative">
                <LibraryBig className="pointer-events-none absolute top-4 left-3 size-4 text-slate-400" />
                <Textarea
                  id="book-summary"
                  value={form.summary}
                  placeholder="请输入图书简介"
                  className="min-h-32 rounded-2xl border-slate-200 bg-white pl-10 text-slate-900 placeholder:text-slate-400 focus-visible:ring-slate-400"
                  onChange={(event) => form.setSummary(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="min-h-16">
            {form.errorMessage ? (
              <Alert variant="destructive" className="rounded-2xl border-rose-200 bg-rose-50/90">
                <AlertDescription className="text-sm text-rose-700">{form.errorMessage}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <Button
            type="submit"
            className="h-11 w-full rounded-xl bg-slate-900 text-sm font-medium text-white shadow-[0_16px_36px_rgba(15,23,42,0.18)] transition hover:bg-slate-800"
            disabled={form.isSubmitting}
          >
            {form.isSubmitting ? '提交中...' : '添加图书'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
