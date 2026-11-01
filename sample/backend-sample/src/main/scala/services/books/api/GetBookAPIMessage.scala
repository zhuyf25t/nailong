package services.books.api

import cats.effect.IO
import services.books.objects.{BookId, BookRecord}
import services.books.tables.book.BookTable
import system.HttpError
import system.api.APIMessage

import java.sql.Connection

final case class GetBookAPIMessage(bookId: BookId) extends APIMessage[BookRecord]:

  override def plan(connection: Connection): IO[BookRecord] =
    BookTable.findById(connection, bookId).flatMap {
      case Some(book) => IO.pure(book)
      case None => IO.raiseError(HttpError.NotFound("图书不存在。"))
    }
