package services.books.objects

import io.circe.{Decoder, Encoder}

import java.util.UUID
import scala.util.Try

final case class BorrowRecordId(value: UUID)

object BorrowRecordId:
  given Encoder[BorrowRecordId] = Encoder.encodeString.contramap(_.value.toString)
  given Decoder[BorrowRecordId] = Decoder.decodeString.emap { value =>
    Try(UUID.fromString(value)).toEither.left.map(_.getMessage).map(BorrowRecordId(_))
  }
