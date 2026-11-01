import { BookOpenText, LibraryBig } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import type { DashboardAction } from '../objects/DashboardAction'

export function DashboardActionGrid({
  actions,
  onActionClick,
}: {
  actions: DashboardAction[]
  onActionClick: (action: DashboardAction) => void
}) {
  return (
    <Card className="border-white/70 bg-white/82 py-0 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
      <CardHeader className="gap-3 border-b border-slate-200/70 px-7 py-7 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
            <LibraryBig className="size-5" />
          </div>
          <div>
            <CardTitle className="text-2xl text-slate-900">功能入口</CardTitle>
            <CardDescription className="mt-1 text-sm text-slate-500">
              选择需要处理的业务操作
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-7 py-7 sm:px-8">
        <div className="grid gap-4 md:grid-cols-2">
          {actions.map((action) => {
            const Icon = action.icon

            return (
              <Card
                key={action.id}
                className="border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.98))] py-0 shadow-sm"
              >
                <CardContent className="space-y-5 px-5 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                        <Icon className="size-5" />
                      </div>
                      <div className="space-y-1">
                        <h2 className="text-lg font-semibold text-slate-900">{action.title}</h2>
                        <p className="text-sm leading-6 text-slate-500">{action.description}</p>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    className="h-11 w-full rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                    onClick={() => onActionClick(action)}
                  >
                    {action.buttonText}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
          <BookOpenText className="size-4 shrink-0 text-slate-500" />
          请根据当前业务选择相应操作入口。
        </div>
      </CardContent>
    </Card>
  )
}
