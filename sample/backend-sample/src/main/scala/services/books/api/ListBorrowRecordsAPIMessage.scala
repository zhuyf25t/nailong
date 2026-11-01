package services.books.api

import cats.effect.IO
import services.books.objects.apiTypes.BorrowRecordListResponse
import services.books.tables.borrowrecord.BorrowRecordTable
import services.user.api.RequireAdminUserAPIMessage
import services.user.objects.UserId
import system.api.APIWithTokenMessage

import java.sql.Connection

final case class ListBorrowRecordsAPIMessage(
  userId: UserId,
  keyword: String
) extends APIWithTokenMessage[BorrowRecordListResponse]:

  override def plan(connection: Connection): IO[BorrowRecordListResponse] =
    for
      _ <- RequireAdminUserAPIMessage(userId).plan(connection)
      records <- BorrowRecordTable.list(connection, keyword)
    yield BorrowRecordListResponse(records)
