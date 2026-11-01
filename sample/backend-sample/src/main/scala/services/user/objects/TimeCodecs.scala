package services.user.objects

import io.circe.{Decoder, Encoder}

import java.time.Instant
import scala.util.Try

object TimeCodecs:
  given Encoder[Instant] = Encoder.encodeString.contramap(_.toString)
  given Decoder[Instant] = Decoder.decodeString.emap { value =>
    Try(Instant.parse(value)).toEither.left.map(_.getMessage)
  }
