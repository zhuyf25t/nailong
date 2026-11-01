import { APIWithTokenMessage } from '@/system/api/APIWithTokenMessage'
import type { BookRecord } from '@/objects/books/BookRecord'

export class UpdateBookAPI extends APIWithTokenMessage<BookRecord> {
  readonly bookId: string
  readonly title: string
  readonly author: string
  readonly isbn: string
  readonly category: string
  readonly stock: number
  readonly summary: string

  constructor(
    bookId: string,
    title: string,
    author: string,
    isbn: string,
    category: string,
    stock: number,
    summary: string,
  ) {
    super()
    this.bookId = bookId
    this.title = title
    this.author = author
    this.isbn = isbn
    this.category = category
    this.stock = stock
    this.summary = summary
  }
}
