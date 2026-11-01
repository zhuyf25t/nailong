export const BorrowRecordStatuses = {
  Borrowing: 'borrowing',
  Overdue: 'overdue',
  Returned: 'returned',
} as const

export type BorrowRecordStatus =
  (typeof BorrowRecordStatuses)[keyof typeof BorrowRecordStatuses]
