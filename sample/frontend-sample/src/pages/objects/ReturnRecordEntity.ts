import type { ReturnRecordStatus } from './ReturnRecordStatus'

export class ReturnRecordEntity {
  readonly id: string
  readonly bookTitle: string
  readonly readerName: string
  readonly borrowCode: string
  readonly borrowDate: string
  readonly dueDate: string
  readonly status: ReturnRecordStatus
  readonly returnedDate?: string

  constructor(
    id: string,
    bookTitle: string,
    readerName: string,
    borrowCode: string,
    borrowDate: string,
    dueDate: string,
    status: ReturnRecordStatus,
    returnedDate?: string,
  ) {
    this.id = id
    this.bookTitle = bookTitle
    this.readerName = readerName
    this.borrowCode = borrowCode
    this.borrowDate = borrowDate
    this.dueDate = dueDate
    this.status = status
    this.returnedDate = returnedDate
  }
}
