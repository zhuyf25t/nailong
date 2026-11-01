package services.books.objects

final case class BookSaveData(
  title: String,
  author: String,
  isbn: String,
  category: String,
  stock: Int,
  summary: String
)
