package services.books.routes

import io.circe.generic.auto.*
import services.books.api.*
import services.books.objects.{BookRecord, BorrowRecord}
import services.books.objects.apiTypes.{BookListResponse, BorrowRecordListResponse, DeleteBookResponse, ReturnBookResponse}
import system.api.RegisteredAPIMessage.{api, apiWithToken}
import system.api.RegisteredAPIMessage

object BooksRoutes:

  val apiMessages: List[RegisteredAPIMessage] = List(
    api[ListBooksAPIMessage, BookListResponse],
    api[GetBookAPIMessage, BookRecord],
    apiWithToken[CreateBookAPIMessage, BookRecord],
    apiWithToken[UpdateBookAPIMessage, BookRecord],
    apiWithToken[DeleteBookAPIMessage, DeleteBookResponse],
    apiWithToken[BorrowBookAPIMessage, BorrowRecord],
    apiWithToken[ReturnLatestBorrowForBookAPIMessage, ReturnBookResponse],
    apiWithToken[ListBorrowRecordsAPIMessage, BorrowRecordListResponse],
    apiWithToken[ReturnBorrowRecordAPIMessage, ReturnBookResponse]
  )
