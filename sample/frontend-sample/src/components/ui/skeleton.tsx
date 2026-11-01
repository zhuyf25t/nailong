import type { HTMLAttributes } from 'react'

import { cn } from '@/components/ui/utils'

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-slate-100', className)} {...props} />
}

export { Skeleton }
