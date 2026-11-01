import { LogOut, ShieldCheck } from 'lucide-react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export function AdminDashboardHeader({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/75 px-4 py-2 text-sm text-slate-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
          <ShieldCheck className="size-4 text-slate-700" />
          管理员后台
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            图书馆管理系统 - 管理员后台首页
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
            在这里处理图书借还与馆藏维护。
          </p>
        </div>
      </div>

      <Card className="w-full max-w-sm border-white/70 bg-white/82 py-0 shadow-[0_24px_60px_rgba(15,23,42,0.1)] backdrop-blur-xl">
        <CardContent className="flex items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-4">
            <Avatar className="size-12 border border-slate-200">
              <AvatarFallback className="bg-slate-900 text-sm font-semibold text-white">AD</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-slate-900">管理员</p>
                <Badge variant="outline" className="border-slate-200 text-slate-600">
                  已登录
                </Badge>
              </div>
              <p className="text-sm text-slate-500">可执行图书流通与馆藏维护操作</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            onClick={onLogout}
          >
            <LogOut className="size-4" />
            退出
          </Button>
        </CardContent>
      </Card>
    </header>
  )
}
