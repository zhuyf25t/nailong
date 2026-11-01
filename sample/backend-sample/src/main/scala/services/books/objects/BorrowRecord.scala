package services.books.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.books.objects.TimeCodecs.given

import java.time.LocalDate

final case class BorrowRecord(
  id: BorrowRecordId,
  bookId: BookId,
  bookTitle: String,
  readerName: String,
  borrowDate: LocalDate,
  dueDate: LocalDate,
  returnedDate: Option[LocalDate],
  status: BorrowRecordStatus
)

object BorrowRecord:
  given Encoder[BorrowRecord] = deriveEncoder[BorrowRecord]
  given Decoder[BorrowRecord] = deriveDecoder[BorrowRecord]
