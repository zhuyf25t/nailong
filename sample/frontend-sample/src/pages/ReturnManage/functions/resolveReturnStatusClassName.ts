import { ReturnRecordStatuses } from '@/pages/objects/ReturnRecordStatus'

export function resolveReturnStatusClassName(status: (typeof ReturnRecordStatuses)[keyof typeof ReturnRecordStatuses]) {
  switch (status) {
    case ReturnRecordStatuses.Pending:
      return 'border-sky-200 bg-sky-50 text-sky-700'
    case ReturnRecordStatuses.Overdue:
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case ReturnRecordStatuses.Returned:
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    default:
      return ''
  }
}
