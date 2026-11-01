package services.books.api

import cats.effect.IO
import services.books.objects.BookId
import services.books.objects.apiTypes.DeleteBookResponse
import services.books.tables.book.BookTable
import services.books.tables.borrowrecord.BorrowRecordTable
import services.user.api.RequireAdminUserAPIMessage
import services.user.objects.UserId
import system.HttpError
import system.api.APIWithTokenMessage

import java.sql.Connection

final case class DeleteBookAPIMessage(
  userId: UserId,
  bookId: BookId
) extends APIWithTokenMessage[DeleteBookResponse]:

  override def plan(connection: Connection): IO[DeleteBookResponse] =
    for
      _ <- RequireAdminUserAPIMessage(userId).plan(connection)
      _ <- BookTable.lockById(connection, bookId).flatMap {
        case Some(_) => IO.unit
        case None => IO.raiseError(HttpError.NotFound("图书不存在。"))
      }
      activeBorrowCount <- BorrowRecordTable.countActiveByBook(connection, bookId)
      _ <-
        if activeBorrowCount == 0 then IO.unit
        else IO.raiseError(HttpError.Conflict("该图书存在未归还借阅记录，暂时无法删除。"))
      deleted <- BookTable.delete(connection, bookId)
      _ <- if deleted then IO.unit else IO.raiseError(HttpError.NotFound("图书不存在。"))
    yield DeleteBookResponse(ok = true)
