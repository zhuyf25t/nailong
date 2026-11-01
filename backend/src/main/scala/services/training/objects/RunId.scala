package services.training.objects

import io.circe.{Decoder, Encoder}
import java.util.UUID
import scala.util.Try

final case class RunId(value: UUID)

object RunId:
  given Encoder[RunId] = Encoder.encodeString.contramap(_.value.toString)
  given Decoder[RunId] = Decoder.decodeString.emap { value =>
    Try(UUID.fromString(value)).toEither.left.map(_ => "RunId 必须是 UUID")
      .flatMap(uuid => Either.cond(uuid.toString == value, RunId(uuid), "RunId 必须是规范小写 UUID"))
  }
