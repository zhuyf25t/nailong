import type { BookCategoryCode } from './BookCategory'

export class BookFormDraft {
  readonly title: string
  readonly author: string
  readonly isbn: string
  readonly category: BookCategoryCode | ''
  readonly stockText: string
  readonly summary: string

  constructor(
    title: string,
    author: string,
    isbn: string,
    category: BookCategoryCode | '',
    stockText: string,
    summary: string,
  ) {
    this.title = title
    this.author = author
    this.isbn = isbn
    this.category = category
    this.stockText = stockText
    this.summary = summary
  }

  static fromForm(
    title: string,
    author: string,
    isbn: string,
    category: BookCategoryCode | '',
    stockText: string,
    summary: string,
  ) {
    return new BookFormDraft(
      title.trim(),
      author.trim(),
      isbn.trim(),
      category,
      stockText.trim(),
      summary.trim(),
    )
  }

  get parsedStock() {
    return Number(this.stockText)
  }

  get isComplete() {
    return Boolean(
      this.title &&
        this.author &&
        this.isbn &&
        this.category &&
        this.stockText &&
        this.summary,
    )
  }

  get hasValidStock() {
    return Number.isInteger(this.parsedStock) && this.parsedStock > 0
  }
}
