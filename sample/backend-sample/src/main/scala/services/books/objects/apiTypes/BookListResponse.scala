package services.books.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.books.objects.BookRecord

final case class BookListResponse(books: List[BookRecord])

object BookListResponse:
  given Encoder[BookListResponse] = deriveEncoder[BookListResponse]
  given Decoder[BookListResponse] = deriveDecoder[BookListResponse]
