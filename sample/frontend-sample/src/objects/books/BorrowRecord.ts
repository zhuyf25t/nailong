import type { BookId } from './BookId'
import type { BorrowRecordId } from './BorrowRecordId'
import type { BorrowRecordStatus } from './BorrowRecordStatus'
import type { LocalDateString } from './TimeCodecs'

export interface BorrowRecord {
  id: BorrowRecordId
  bookId: BookId
  bookTitle: string
  readerName: string
  borrowDate: LocalDateString
  dueDate: LocalDateString
  returnedDate?: LocalDateString | null
  status: BorrowRecordStatus
}
