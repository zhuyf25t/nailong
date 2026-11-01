import type { BorrowRecordStatus } from './BorrowRecordDisplayStatus'

export class BorrowRecordEntity {
  readonly id: string
  readonly bookName: string
  readonly readerName: string
  readonly borrowDate: string
  readonly dueDate: string
  readonly status: BorrowRecordStatus
  readonly returnDate?: string

  constructor(
    id: string,
    bookName: string,
    readerName: string,
    borrowDate: string,
    dueDate: string,
    status: BorrowRecordStatus,
    returnDate?: string,
  ) {
    this.id = id
    this.bookName = bookName
    this.readerName = readerName
    this.borrowDate = borrowDate
    this.dueDate = dueDate
    this.status = status
    this.returnDate = returnDate
  }
}
