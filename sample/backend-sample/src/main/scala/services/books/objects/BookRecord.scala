package services.books.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.books.objects.TimeCodecs.given

import java.time.Instant

final case class BookRecord(
  id: BookId,
  title: String,
  author: String,
  isbn: String,
  category: String,
  categoryLabel: String,
  stockTotal: Int,
  stockAvailable: Int,
  summary: String,
  status: BookInventoryStatus,
  createdAt: Instant,
  updatedAt: Instant
)

object BookRecord:
  given Encoder[BookRecord] = deriveEncoder[BookRecord]
  given Decoder[BookRecord] = deriveDecoder[BookRecord]
