package services.books.objects

import io.circe.{Decoder, Encoder}

import java.util.UUID
import scala.util.Try

final case class BookId(value: UUID)

object BookId:
  given Encoder[BookId] = Encoder.encodeString.contramap(_.value.toString)
  given Decoder[BookId] = Decoder.decodeString.emap { value =>
    Try(UUID.fromString(value)).toEither.left.map(_.getMessage).map(BookId(_))
  }
