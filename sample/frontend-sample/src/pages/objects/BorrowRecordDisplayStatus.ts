export const BorrowRecordStatuses = {
  Borrowing: '借阅中',
  Overdue: '已逾期',
  Returned: '已归还',
} as const

export type BorrowRecordStatus =
  (typeof BorrowRecordStatuses)[keyof typeof BorrowRecordStatuses]
