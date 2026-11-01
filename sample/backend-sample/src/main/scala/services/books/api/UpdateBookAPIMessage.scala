package services.books.api

import cats.effect.IO
import services.books.objects.{BookId, BookRecord, BookSaveData}
import services.books.tables.book.BookTable
import services.books.tables.borrowrecord.BorrowRecordTable
import services.user.api.RequireAdminUserAPIMessage
import services.user.objects.UserId
import system.HttpError
import system.api.APIWithTokenMessage

import java.sql.Connection

final case class UpdateBookAPIMessage(
  userId: UserId,
  bookId: BookId,
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
      _ <- BookTable.lockById(connection, bookId).flatMap {
        case Some(_) => IO.unit
        case None => IO.raiseError(HttpError.NotFound("图书不存在。"))
      }
      duplicate <- BookTable.findByIsbnExceptId(connection, clean.isbn, bookId)
      _ <- duplicate match
        case Some(_) => IO.raiseError(HttpError.Conflict("ISBN 与现有图书冲突，请调整后重新保存。"))
        case None => IO.unit
      activeBorrowCount <- BorrowRecordTable.countActiveByBook(connection, bookId)
      _ <-
        if clean.stock >= activeBorrowCount then IO.unit
        else IO.raiseError(HttpError.BadRequest(s"库存数量不能小于当前未归还数量 $activeBorrowCount。"))
      updated <- BookTable.update(connection, bookId, clean, availableStock = clean.stock - activeBorrowCount).flatMap {
        case Some(book) => IO.pure(book)
        case None => IO.raiseError(HttpError.NotFound("图书不存在。"))
      }
    yield updated

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
