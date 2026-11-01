export const ReturnRecordStatuses = {
  Pending: '待归还',
  Overdue: '已逾期',
  Returned: '已归还',
} as const

export type ReturnRecordStatus =
  (typeof ReturnRecordStatuses)[keyof typeof ReturnRecordStatuses]
