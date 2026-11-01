import type { BookInventoryStatus } from '@/objects/books/BookInventoryStatus'

export class BookCatalogRecord {
  readonly id: string
  readonly title: string
  readonly author: string
  readonly categoryLabel: string
  readonly isbn: string
  readonly status: BookInventoryStatus

  constructor(
    id: string,
    title: string,
    author: string,
    categoryLabel: string,
    isbn: string,
    status: BookInventoryStatus,
  ) {
    this.id = id
    this.title = title
    this.author = author
    this.categoryLabel = categoryLabel
    this.isbn = isbn
    this.status = status
  }
}
