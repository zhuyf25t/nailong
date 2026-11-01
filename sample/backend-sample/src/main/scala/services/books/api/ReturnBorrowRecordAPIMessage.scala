package services.books.api

import cats.effect.IO
import services.books.objects.{BorrowRecordId, BorrowRecordStatus}
import services.books.objects.apiTypes.ReturnBookResponse
import services.books.tables.book.BookTable
import services.books.tables.borrowrecord.BorrowRecordTable
import services.user.api.GetCurrentUserAPIMessage
import services.user.objects.UserId
import system.HttpError
import system.api.APIWithTokenMessage

import java.sql.Connection
import java.time.LocalDate

final case class ReturnBorrowRecordAPIMessage(
  userId: UserId,
  recordId: BorrowRecordId
) extends APIWithTokenMessage[ReturnBookResponse]:

  override def plan(connection: Connection): IO[ReturnBookResponse] =
    for
      _ <- GetCurrentUserAPIMessage(userId).plan(connection)
      record <- BorrowRecordTable.findByIdForUpdate(connection, recordId).flatMap {
        case Some(record) => IO.pure(record)
        case None => IO.raiseError(HttpError.NotFound("借阅记录不存在。"))
      }
      _ <-
        if record.status == BorrowRecordStatus.Returned then
          IO.raiseError(HttpError.Conflict("该借阅记录已经归还。"))
        else IO.unit
      _ <- BookTable.lockById(connection, record.bookId).flatMap {
        case Some(_) => IO.unit
        case None => IO.raiseError(HttpError.NotFound("图书不存在。"))
      }
      returned <- BorrowRecordTable.markReturned(connection, recordId, LocalDate.now())
      _ <-
        if returned then IO.unit
        else IO.raiseError(HttpError.Conflict("该借阅记录已经归还。"))
      _ <- BookTable.incrementAvailable(connection, record.bookId)
      updated <- BorrowRecordTable.findById(connection, recordId).flatMap {
        case Some(record) => IO.pure(record)
        case None => IO.raiseError(HttpError.NotFound("借阅记录不存在。"))
      }
    yield ReturnBookResponse(updated)
