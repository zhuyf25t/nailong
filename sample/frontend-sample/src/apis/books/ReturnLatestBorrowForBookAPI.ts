import { APIWithTokenMessage } from '@/system/api/APIWithTokenMessage'
import type { ReturnBookResponse } from '@/objects/books/apiTypes/ReturnBookResponse'

export class ReturnLatestBorrowForBookAPI extends APIWithTokenMessage<ReturnBookResponse> {
  readonly bookId: string

  constructor(bookId: string) {
    super()
    this.bookId = bookId
  }
}
