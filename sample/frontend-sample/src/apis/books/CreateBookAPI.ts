import { APIWithTokenMessage } from '@/system/api/APIWithTokenMessage'
import type { BookRecord } from '@/objects/books/BookRecord'

export class CreateBookAPI extends APIWithTokenMessage<BookRecord> {
  readonly title: string
  readonly author: string
  readonly isbn: string
  readonly category: string
  readonly stock: number
  readonly summary: string

  constructor(
    title: string,
    author: string,
    isbn: string,
    category: string,
    stock: number,
    summary: string,
  ) {
    super()
    this.title = title
    this.author = author
    this.isbn = isbn
    this.category = category
    this.stock = stock
    this.summary = summary
  }
}
