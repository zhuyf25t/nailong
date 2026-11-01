import { BookOpenText, KeyRound, UserRound } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { AdminLoginFormState } from '../hooks/useAdminLoginForm'

export function AdminLoginCard({ form }: { form: AdminLoginFormState }) {
  return (
    <Card className="border-white/70 bg-white/82 py-0 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
      <CardHeader className="gap-3 border-b border-slate-200/70 px-7 py-7 sm:px-8">
        <div className="flex items-center gap-3 lg:hidden">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
            <BookOpenText className="size-5" />
          </div>
          <CardTitle className="text-xl text-slate-900">图书馆管理系统 - 管理员登录</CardTitle>
        </div>
        <div className="hidden lg:block">
          <CardTitle className="text-2xl text-slate-900">管理员登录</CardTitle>
        </div>
        <CardDescription className="text-sm text-slate-500">请输入用户名和密码</CardDescription>
      </CardHeader>

      <CardContent className="px-7 py-7 sm:px-8">
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="admin-username" className="text-slate-700">
              用户名
            </Label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="admin-username"
                value={form.username}
                placeholder="请输入管理员用户名"
                autoComplete="username"
                className="h-11 rounded-xl border-slate-200 bg-white pl-10 text-slate-900 placeholder:text-slate-400 focus-visible:ring-slate-400"
                onChange={(event) => form.setUsername(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-password" className="text-slate-700">
              密码
            </Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="admin-password"
                type="password"
                value={form.password}
                placeholder="请输入管理员密码"
                autoComplete="current-password"
                className="h-11 rounded-xl border-slate-200 bg-white pl-10 text-slate-900 placeholder:text-slate-400 focus-visible:ring-slate-400"
                onChange={(event) => form.setPassword(event.target.value)}
              />
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
            size="lg"
            className="h-11 w-full rounded-xl bg-slate-900 text-base font-medium text-white hover:bg-slate-800"
            disabled={form.isSubmitting}
          >
            登录
          </Button>

          <Button
            type="button"
            variant="link"
            className="h-auto w-full px-0 text-sm text-slate-500 hover:text-slate-800"
            onClick={form.goToRegister}
          >
            没有账号？前往注册
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
