package services.books.api

import cats.effect.IO
import services.books.objects.{BookId, BorrowRecordStatus}
import services.books.objects.apiTypes.ReturnBookResponse
import services.books.tables.book.BookTable
import services.books.tables.borrowrecord.BorrowRecordTable
import services.user.api.GetCurrentUserAPIMessage
import services.user.objects.UserId
import system.HttpError
import system.api.APIWithTokenMessage

import java.sql.Connection
import java.time.LocalDate

final case class ReturnLatestBorrowForBookAPIMessage(
  userId: UserId,
  bookId: BookId
) extends APIWithTokenMessage[ReturnBookResponse]:

  override def plan(connection: Connection): IO[ReturnBookResponse] =
    for
      _ <- GetCurrentUserAPIMessage(userId).plan(connection)
      record <- BorrowRecordTable.findLatestActiveByBookForUpdate(connection, bookId).flatMap {
        case Some(record) => IO.pure(record)
        case None => IO.raiseError(HttpError.NotFound("当前图书没有未归还借阅记录。"))
      }
      _ <-
        if record.status == BorrowRecordStatus.Returned then
          IO.raiseError(HttpError.Conflict("该借阅记录已经归还。"))
        else IO.unit
      _ <- BookTable.lockById(connection, record.bookId).flatMap {
        case Some(_) => IO.unit
        case None => IO.raiseError(HttpError.NotFound("图书不存在。"))
      }
      returned <- BorrowRecordTable.markReturned(connection, record.id, LocalDate.now())
      _ <-
        if returned then IO.unit
        else IO.raiseError(HttpError.Conflict("该借阅记录已经归还。"))
      _ <- BookTable.incrementAvailable(connection, record.bookId)
      updated <- BorrowRecordTable.findById(connection, record.id).flatMap {
        case Some(record) => IO.pure(record)
        case None => IO.raiseError(HttpError.NotFound("借阅记录不存在。"))
      }
    yield ReturnBookResponse(updated)
