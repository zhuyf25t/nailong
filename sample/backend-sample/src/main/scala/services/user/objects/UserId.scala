package services.user.objects

import io.circe.{Decoder, Encoder}

import java.util.UUID
import scala.util.Try

final case class UserId(value: UUID)

object UserId:
  given Encoder[UserId] = Encoder.encodeString.contramap(_.value.toString)
  given Decoder[UserId] = Decoder.decodeString.emap { value =>
    Try(UUID.fromString(value)).toEither.left.map(_.getMessage).map(UserId(_))
  }
