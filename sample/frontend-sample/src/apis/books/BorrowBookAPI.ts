import { APIWithTokenMessage } from '@/system/api/APIWithTokenMessage'
import type { BorrowRecord } from '@/objects/books/BorrowRecord'

export class BorrowBookAPI extends APIWithTokenMessage<BorrowRecord> {
  readonly bookId: string
  readonly readerName: string

  constructor(bookId: string, readerName: string) {
    super()
    this.bookId = bookId
    this.readerName = readerName
  }
}
