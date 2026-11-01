import { APIMessage } from '@/system/api/APIMessage'
import type { BookListResponse } from '@/objects/books/apiTypes/BookListResponse'

export class ListBooksAPI extends APIMessage<BookListResponse> {
  readonly keyword: string

  constructor(keyword: string = '') {
    super()
    this.keyword = keyword.trim()
  }
}
