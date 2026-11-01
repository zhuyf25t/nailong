package services.books.api

import cats.effect.IO
import services.books.objects.apiTypes.BookListResponse
import services.books.tables.book.BookTable
import system.api.APIMessage

import java.sql.Connection

final case class ListBooksAPIMessage(keyword: String) extends APIMessage[BookListResponse]:

  override def plan(connection: Connection): IO[BookListResponse] =
    BookTable.list(connection, keyword).map(BookListResponse(_))
