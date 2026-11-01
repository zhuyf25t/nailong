package services.books.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.books.objects.BorrowRecord

final case class ReturnBookResponse(record: BorrowRecord)

object ReturnBookResponse:
  given Encoder[ReturnBookResponse] = deriveEncoder[ReturnBookResponse]
  given Decoder[ReturnBookResponse] = deriveDecoder[ReturnBookResponse]
