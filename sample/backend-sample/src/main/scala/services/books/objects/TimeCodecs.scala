package services.books.objects

import io.circe.{Decoder, Encoder}

import java.time.{Instant, LocalDate}
import scala.util.Try

object TimeCodecs:
  given Encoder[Instant] = Encoder.encodeString.contramap(_.toString)
  given Decoder[Instant] = Decoder.decodeString.emap { value =>
    Try(Instant.parse(value)).toEither.left.map(_.getMessage)
  }

  given Encoder[LocalDate] = Encoder.encodeString.contramap(_.toString)
  given Decoder[LocalDate] = Decoder.decodeString.emap { value =>
    Try(LocalDate.parse(value)).toEither.left.map(_.getMessage)
  }
