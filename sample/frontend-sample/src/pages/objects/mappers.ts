import { BookCatalogRecord } from './BookCatalogRecord'
import { BookInventoryStatuses } from '@/objects/books/BookInventoryStatus'
import { BorrowRecordEntity } from './BorrowRecordEntity'
import { BorrowRecordStatuses } from './BorrowRecordDisplayStatus'
import { ReturnRecordEntity } from './ReturnRecordEntity'
import { ReturnRecordStatuses } from './ReturnRecordStatus'
import type { BookRecord } from '@/objects/books/BookRecord'
import type { BorrowRecord } from '@/objects/books/BorrowRecord'

export function toBookCatalogRecord(book: BookRecord) {
  return new BookCatalogRecord(
    book.id,
    book.title,
    book.author,
    book.categoryLabel,
    book.isbn,
    book.status === 'available' ? BookInventoryStatuses.Available : BookInventoryStatuses.Borrowed,
  )
}

export function toBorrowRecordEntity(record: BorrowRecord) {
  return new BorrowRecordEntity(
    record.id,
    record.bookTitle,
    record.readerName,
    record.borrowDate,
    record.dueDate,
    toBorrowRecordStatus(record.status),
    record.returnedDate ?? undefined,
  )
}

export function toReturnRecordEntity(record: BorrowRecord) {
  return new ReturnRecordEntity(
    record.id,
    record.bookTitle,
    record.readerName,
    record.id,
    record.borrowDate,
    record.dueDate,
    toReturnRecordStatus(record.status),
    record.returnedDate ?? undefined,
  )
}

function toBorrowRecordStatus(status: BorrowRecord['status']) {
  switch (status) {
    case 'returned':
      return BorrowRecordStatuses.Returned
    case 'overdue':
      return BorrowRecordStatuses.Overdue
    default:
      return BorrowRecordStatuses.Borrowing
  }
}

function toReturnRecordStatus(status: BorrowRecord['status']) {
  switch (status) {
    case 'returned':
      return ReturnRecordStatuses.Returned
    case 'overdue':
      return ReturnRecordStatuses.Overdue
    default:
      return ReturnRecordStatuses.Pending
  }
}
