package services.books.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.books.objects.BorrowRecord

final case class BorrowRecordListResponse(records: List[BorrowRecord])

object BorrowRecordListResponse:
  given Encoder[BorrowRecordListResponse] = deriveEncoder[BorrowRecordListResponse]
  given Decoder[BorrowRecordListResponse] = deriveDecoder[BorrowRecordListResponse]
