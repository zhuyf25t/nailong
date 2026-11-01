package services.books.api

import cats.effect.IO
import services.books.objects.{BookId, BorrowRecord}
import services.books.tables.book.BookTable
import services.books.tables.borrowrecord.BorrowRecordTable
import services.user.api.GetCurrentUserAPIMessage
import services.user.objects.UserId
import system.HttpError
import system.api.APIWithTokenMessage

import java.sql.Connection

final case class BorrowBookAPIMessage(
  userId: UserId,
  bookId: BookId,
  readerName: String
) extends APIWithTokenMessage[BorrowRecord]:

  override def plan(connection: Connection): IO[BorrowRecord] =
    for
      user <- GetCurrentUserAPIMessage(userId).plan(connection)
      cleanReaderName = Option(readerName).map(_.trim).filter(_.nonEmpty).getOrElse(user.username)
      book <- BookTable.lockById(connection, bookId).flatMap {
        case Some(book) => IO.pure(book)
        case None => IO.raiseError(HttpError.NotFound("图书不存在。"))
      }
      _ <-
        if book.stockAvailable > 0 then IO.unit
        else IO.raiseError(HttpError.Conflict("当前图书库存不足，无法完成借书。"))
      decremented <- BookTable.decrementAvailable(connection, bookId)
      _ <-
        if decremented then IO.unit
        else IO.raiseError(HttpError.Conflict("当前图书库存不足，无法完成借书。"))
      record <- BorrowRecordTable.insert(connection, book, cleanReaderName)
    yield record
