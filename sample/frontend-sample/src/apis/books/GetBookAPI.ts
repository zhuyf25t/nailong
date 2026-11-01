import { APIMessage } from '@/system/api/APIMessage'
import type { BookRecord } from '@/objects/books/BookRecord'

export class GetBookAPI extends APIMessage<BookRecord> {
  readonly bookId: string

  constructor(bookId: string) {
    super()
    this.bookId = bookId
  }
}
