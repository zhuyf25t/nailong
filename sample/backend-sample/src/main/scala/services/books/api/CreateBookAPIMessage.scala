package services.books.api

import cats.effect.IO
import services.books.objects.{BookRecord, BookSaveData}
import services.books.tables.book.BookTable
import services.user.api.RequireAdminUserAPIMessage
import services.user.objects.UserId
import system.HttpError
import system.api.APIWithTokenMessage

import java.sql.Connection

final case class CreateBookAPIMessage(
  userId: UserId,
  title: String,
  author: String,
  isbn: String,
  category: String,
  stock: Int,
  summary: String
) extends APIWithTokenMessage[BookRecord]:

  override def plan(connection: Connection): IO[BookRecord] =
    for
      _ <- RequireAdminUserAPIMessage(userId).plan(connection)
      clean <- validateSaveData(toBookSaveData)
      existing <- BookTable.findByIsbn(connection, clean.isbn)
      _ <- existing match
        case Some(_) => IO.raiseError(HttpError.Conflict("ISBN 已存在，请检查后重新输入。"))
        case None => IO.unit
      book <- BookTable.insert(connection, clean)
    yield book

  private def toBookSaveData: BookSaveData =
    BookSaveData(
      title = title,
      author = author,
      isbn = isbn,
      category = category,
      stock = stock,
      summary = summary
    )

  private def validateSaveData(data: BookSaveData): IO[BookSaveData] =
    val clean = data.copy(
      title = data.title.trim,
      author = data.author.trim,
      isbn = data.isbn.trim,
      category = data.category.trim,
      summary = data.summary.trim
    )

    if clean.title.isEmpty || clean.author.isEmpty || clean.isbn.isEmpty || clean.category.isEmpty || clean.summary.isEmpty then
      IO.raiseError(HttpError.BadRequest("请完整填写图书信息。"))
    else if clean.stock <= 0 then
      IO.raiseError(HttpError.BadRequest("库存数量需为大于 0 的整数。"))
    else IO.pure(clean)
