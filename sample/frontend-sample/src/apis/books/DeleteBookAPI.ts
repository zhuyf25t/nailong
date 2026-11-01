import { APIWithTokenMessage } from '@/system/api/APIWithTokenMessage'
import type { DeleteBookResponse } from '@/objects/books/apiTypes/DeleteBookResponse'

export class DeleteBookAPI extends APIWithTokenMessage<DeleteBookResponse> {
  readonly bookId: string

  constructor(bookId: string) {
    super()
    this.bookId = bookId
  }
}
